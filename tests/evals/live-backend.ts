/**
 * Live backend for the eval harness.
 *
 * When EVAL_BACKEND=live, the harness routes each LLM-generated tool call to
 * a real running MCP server instead of `scenario.mockResponses`. This catches
 * schema/handler drift that mocked evals cannot — e.g. the missing-`type`
 * bug in SAPContext(action="impact") that Sonnet 4.6 hit on PR #143.
 *
 * Prerequisites:
 *   - A running ARC-1 MCP server, same as E2E tests.
 *   - `EVAL_MCP_URL` (default: http://localhost:3000/mcp).
 *   - Tool calls that require real SAP objects must use names that exist on
 *     the target system. For the FEAT-33 impact bucket we lean on SAP-shipped
 *     views (I_COUNTRY, I_CURRENCY, I_ABAPPACKAGE) that are deterministic.
 *
 * Trade-offs:
 *   - Slow: each tool call is a real HTTP round-trip + SAP call.
 *   - Non-deterministic on writes — prefer read-only scenarios for live mode,
 *     or make sure the scenario cleans up after itself.
 *   - Surfaces real ADT errors back to the LLM so the loop exercises the same
 *     retry behaviour you'd see in production.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

/** Executor signature — runScenario() calls this per tool invocation. */
export type LiveExecutor = (toolName: string, args: Record<string, unknown>) => Promise<string>;

export interface LiveBackend {
  execute: LiveExecutor;
  close(): Promise<void>;
  url: string;
}

/**
 * Connect an MCP client to the configured live server and return an
 * LiveExecutor that the harness can plug in instead of mockResponses.
 *
 * Throws if the server is unreachable — the caller should gate the suite
 * behind `checkLiveBackendAvailable()` so unit-style evals still run.
 */
export async function connectLiveBackend(): Promise<LiveBackend> {
  const url = process.env.EVAL_MCP_URL ?? 'http://localhost:3000/mcp';

  const client = new Client({ name: 'arc1-eval-live', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL(url));

  try {
    await client.connect(transport);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Eval live backend: cannot connect to MCP server at ${url}\n` +
        `  Error: ${message}\n` +
        '  Start the server with `npm run test:e2e:deploy` (or point EVAL_MCP_URL at an existing one).',
    );
  }

  const execute: LiveExecutor = async (toolName, args) => {
    const result = (await client.callTool({
      name: toolName,
      arguments: args,
    })) as { content?: Array<{ type?: string; text?: string }>; isError?: boolean };

    const text = (result.content ?? [])
      .map((c) => c.text ?? '')
      .join('\n')
      .trim();

    // Prepend an error marker so the LLM sees the failure in its next turn
    // (the mock backend behaves the same way — it just returns plain strings).
    if (result.isError) {
      return `[tool error] ${text || 'unknown error'}`;
    }
    return text;
  };

  return {
    execute,
    url,
    async close() {
      await client.close();
    },
  };
}

/**
 * Probe the configured live endpoint without opening an MCP session. Returns
 * `{ available: true }` if `<url>/../health` answers 200, otherwise the
 * reason the harness should use to skip the live bucket.
 */
export async function checkLiveBackendAvailable(): Promise<{ available: boolean; reason?: string }> {
  const url = process.env.EVAL_MCP_URL ?? 'http://localhost:3000/mcp';
  const healthUrl = url.replace(/\/mcp$/, '/health');
  try {
    const resp = await fetch(healthUrl, { signal: AbortSignal.timeout(5000) });
    if (!resp.ok) {
      return { available: false, reason: `health check ${resp.status} from ${healthUrl}` };
    }
    return { available: true };
  } catch (err) {
    return {
      available: false,
      reason: `cannot reach ${healthUrl}: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
