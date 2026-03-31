/**
 * E2E test helpers — MCP client factory, tool call wrapper, assertion helpers.
 *
 * Usage in tests:
 *   import { connectClient, callTool, expectToolError, expectToolSuccess } from './helpers.js';
 *
 *   let client: Client;
 *   beforeAll(async () => { client = await connectClient(); });
 *   afterAll(async () => { await client.close(); });
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { expect } from 'vitest';

/** MCP tool call result shape */
export interface ToolResult {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

/**
 * Connect an MCP client to the E2E server.
 * Uses E2E_MCP_URL env var (default: http://localhost:3000/mcp).
 */
export async function connectClient(): Promise<Client> {
  const url = process.env.E2E_MCP_URL ?? 'http://localhost:3000/mcp';

  const client = new Client({ name: 'arc1-e2e-test', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL(url));

  try {
    await client.connect(transport);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Failed to connect to MCP server at ${url}\n` +
        `  Error: ${message}\n` +
        `  - Is the MCP server running? (npm run test:e2e:deploy)\n` +
        `  - Is E2E_MCP_URL correct? (current: ${url})`,
    );
  }

  return client;
}

/**
 * Call an MCP tool with rich error context on failure.
 * Logs every call for debugging (visible in vitest verbose output).
 */
export async function callTool(client: Client, name: string, args: Record<string, unknown> = {}): Promise<ToolResult> {
  const start = Date.now();
  try {
    const result = (await client.callTool({ name, arguments: args })) as ToolResult;
    const duration = Date.now() - start;

    const status = result.isError ? 'ERROR' : 'OK';
    const preview = result.content?.[0]?.text?.slice(0, 100) ?? '(empty)';
    console.log(`    -> ${name}(${JSON.stringify(args)}) [${duration}ms] ${status}: ${preview}...`);

    return result;
  } catch (err) {
    const duration = Date.now() - start;
    const message = err instanceof Error ? err.message : String(err);
    console.error(`    -> ${name}(${JSON.stringify(args)}) [${duration}ms] THREW: ${message}`);

    throw new Error(
      `Tool call failed: ${name}(${JSON.stringify(args)})\n` +
        `  Duration: ${duration}ms\n` +
        `  Error: ${message}\n` +
        `  Tip: Check $E2E_LOG_DIR/mcp-server.log for server-side details`,
    );
  }
}

/**
 * Assert a tool call returned successfully (no error).
 * Returns the text content for further assertions.
 */
export function expectToolSuccess(result: ToolResult): string {
  expect(result.isError, `Expected success but got error: ${result.content?.[0]?.text?.slice(0, 300)}`).toBeFalsy();
  expect(result.content).toHaveLength(1);
  expect(result.content[0].type).toBe('text');
  expect(result.content[0].text).toBeTruthy();
  return result.content[0].text;
}

/**
 * Assert a tool call returned an error with expected properties:
 * - isError is true
 * - No raw XML leaked
 * - No stack traces leaked
 * - Contains expected substrings (if provided)
 */
export function expectToolError(result: ToolResult, ...expectedSubstrings: string[]): string {
  expect(result.isError, `Expected error but got success: ${result.content?.[0]?.text?.slice(0, 200)}`).toBe(true);
  expect(result.content).toHaveLength(1);
  const text = result.content[0]?.text ?? '';

  // Must not leak internals
  expect(text, 'Error contains raw XML').not.toContain('<?xml');
  expect(text, 'Error contains stack trace').not.toMatch(/at \w+\.\w+ \(/);
  expect(text, 'Error contains .ts file reference').not.toMatch(/\.ts:\d+/);

  // Check expected content
  for (const sub of expectedSubstrings) {
    expect(text, `Error should contain "${sub}":\n  Actual: ${text.slice(0, 300)}`).toContain(sub);
  }

  return text;
}

/**
 * Skip test with a clear message if a feature is not available.
 */
export function skipIf(condition: boolean, reason: string): void {
  if (condition) {
    console.log(`    [SKIP] ${reason}`);
    // vitest doesn't have skip inside a test, but we can return early
    // The caller should check this return value
  }
}
