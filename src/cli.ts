/**
 * ARC-1 CLI — command-line interface for SAP ADT operations.
 *
 * Two layers:
 *   - `arc1 serve`                     Start the MCP server (default).
 *   - `arc1 call <tool> [...]`         Call any of the 12 MCP tools directly.
 *   - `arc1 tools [<tool>]`            List tools / show a tool's JSON schema.
 *   - Shortcuts: `read`, `source` (alias), `activate`, `syntax`, `sql`, `lint`,
 *     `search`, `version` — one-liners over `call` for common operations.
 *
 * The `call` command bypasses the MCP transport but reuses the same dispatch
 * path (`handleToolCall` in src/handlers/intent.ts), so Zod validation,
 * safety gates (`SAP_READ_ONLY`, `SAP_ALLOWED_PACKAGES`, ...), and audit
 * logging all apply exactly as they do under `arc1 serve` stdio mode.
 */

import { readFileSync } from 'node:fs';
import { Command, Option } from 'commander';
import { config } from 'dotenv';
import { AdtClient } from './adt/client.js';
import type { AdtClientConfig } from './adt/config.js';
import { buildArgs, type OutputMode } from './cli-args.js';
import { handleToolCall, type ToolResult } from './handlers/intent.js';
import { getToolDefinitions } from './handlers/tools.js';
import { detectFilename, lintAbapSource } from './lint/lint.js';
import { parseArgs, resolveConfig } from './server/config.js';
import { initLogger } from './server/logger.js';
import { buildAdtConfig, VERSION } from './server/server.js';
import type { ConfigSource, ServerConfig } from './server/types.js';

// Load .env without printing dotenv tips to stdout.
config({ quiet: true });

const program = new Command();

program
  .name('arc1')
  .description('ARC-1 — MCP Server for SAP ABAP Systems')
  .version(VERSION)
  .allowUnknownOption(true)
  .allowExcessArguments(true);

// Server mode (default)
program
  .command('serve', { isDefault: true })
  .description('Start MCP server (default)')
  .allowUnknownOption(true)
  .allowExcessArguments(true)
  .action(async () => {
    // Dynamic import to avoid loading MCP SDK for CLI-only usage
    const { createAndStartServer } = await import('./server/server.js');
    const serverConfig = parseArgs(process.argv.slice(2));
    await createAndStartServer(serverConfig);
  });

// ─── Direct tool invocation ────────────────────────────────────────────

const outputOption = new Option('--output <mode>', 'Output mode').choices(['text', 'json']).default('text');

function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
}

program
  .command('call <tool>')
  .description('Call any MCP tool directly (e.g. SAPRead, SAPWrite, SAPGit...)')
  .option('--arg <key=value>', 'Tool argument; repeatable. Values are coerced: true/false/number/JSON.', collect, [])
  .option('--json <source>', 'JSON args: inline object, path to a file, or "-" for stdin')
  .addOption(outputOption)
  .action(async (tool: string, opts: { arg: string[]; json?: string; output: OutputMode }) => {
    try {
      const args = buildArgs(opts);
      const code = await runToolCall(tool, args, opts.output);
      process.exit(code);
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(2);
    }
  });

program
  .command('tools [tool]')
  .description('List MCP tools, or show the JSON input schema for a specific tool')
  .action((tool: string | undefined) => {
    const { config: serverConfig } = resolveCliContext();
    const defs = getToolDefinitions(serverConfig);
    if (!tool) {
      for (const def of defs) {
        const firstLine = def.description.split('\n')[0].trim();
        console.log(`${def.name.padEnd(14)} ${firstLine}`);
      }
      return;
    }
    const match = defs.find((d) => d.name.toLowerCase() === tool.toLowerCase());
    if (!match) {
      console.error(`Unknown tool: ${tool}`);
      console.error(`Available: ${defs.map((d) => d.name).join(', ')}`);
      process.exit(2);
    }
    console.log(match.description);
    console.log('');
    console.log('Input schema:');
    console.log(JSON.stringify(match.inputSchema, null, 2));
  });

// ─── Ergonomic shortcuts (thin wrappers over `call`) ───────────────────

program
  .command('read <type> <name>')
  .description('Read an ABAP object via SAPRead (PROG, CLAS, INTF, DDLS, TABL, DOMA, DTEL, ...)')
  .option('--flat', 'Return flat source for CLAS/INTF (instead of structured sections)')
  .addOption(outputOption)
  .action(async (type: string, name: string, opts: { flat?: boolean; output: OutputMode }) => {
    const args: Record<string, unknown> = { type: type.toUpperCase(), name };
    if (opts.flat) args.flat = true;
    process.exit(await runToolCall('SAPRead', args, opts.output));
  });

// `source` kept as an alias of `read` with flat=true to preserve legacy CLI behavior.
program
  .command('source <type> <name>')
  .description('Alias of `read --flat` (legacy)')
  .addOption(outputOption)
  .action(async (type: string, name: string, opts: { output: OutputMode }) => {
    process.exit(await runToolCall('SAPRead', { type: type.toUpperCase(), name, flat: true }, opts.output));
  });

program
  .command('activate <type> <name>')
  .description('Activate an ADT object (SAPActivate) — e.g. `activate CLAS ZCL_FOO`')
  .addOption(outputOption)
  .action(async (type: string, name: string, opts: { output: OutputMode }) => {
    process.exit(await runToolCall('SAPActivate', { action: 'activate', type: type.toUpperCase(), name }, opts.output));
  });

program
  .command('syntax <type> <name>')
  .description('Remote syntax check on an ABAP object (SAPDiagnose syntax)')
  .addOption(outputOption)
  .action(async (type: string, name: string, opts: { output: OutputMode }) => {
    process.exit(await runToolCall('SAPDiagnose', { action: 'syntax', type: type.toUpperCase(), name }, opts.output));
  });

program
  .command('sql <query>')
  .description('Execute an OpenSQL query (SAPQuery; requires SAP_BLOCK_FREE_SQL=false)')
  .addOption(outputOption)
  .action(async (query: string, opts: { output: OutputMode }) => {
    process.exit(await runToolCall('SAPQuery', { action: 'sql', query }, opts.output));
  });

// ─── Legacy / local-only commands ──────────────────────────────────────

program
  .command('search <query>')
  .description('Search for ABAP objects (SAPSearch)')
  .option('--max <number>', 'Maximum results', '50')
  .addOption(outputOption)
  .action(async (query: string, opts: { max: string; output: OutputMode }) => {
    process.exit(
      await runToolCall('SAPSearch', { action: 'object', query, maxResults: Number(opts.max) }, opts.output),
    );
  });

program
  .command('lint <file>')
  .description('Lint a local ABAP source file (offline; no SAP connection)')
  .action((file: string) => {
    const source = readFileSync(file, 'utf-8');
    const filename = detectFilename(source, file.replace(/\.abap$/, ''));
    const issues = lintAbapSource(source, filename);
    if (issues.length === 0) {
      console.log('No issues found.');
      return;
    }
    for (const issue of issues) {
      console.log(`${issue.line}:${issue.column} [${issue.severity}] ${issue.rule}: ${issue.message}`);
    }
    process.exit(issues.some((i) => i.severity === 'error') ? 1 : 0);
  });

program
  .command('version')
  .description('Show ARC-1 version')
  .action(() => {
    console.log(`ARC-1 v${VERSION}`);
  });

// Config show command — dumps resolved effective policy + source attribution
const configCmd = program.command('config').description('Configuration inspection');
configCmd
  .command('show')
  .description('Show the resolved effective safety config with per-field source attribution')
  .option('--format <fmt>', 'Output format: table or json', 'table')
  .allowUnknownOption(true)
  .allowExcessArguments(true)
  .action((opts: { format: string }) => {
    try {
      const { config: serverConfig, sources } = resolveConfig(process.argv.slice(3));
      const fmt = opts.format === 'json' ? 'json' : 'table';
      if (fmt === 'json') {
        const out = {
          effectivePolicy: {
            allowWrites: serverConfig.allowWrites,
            allowDataPreview: serverConfig.allowDataPreview,
            allowFreeSQL: serverConfig.allowFreeSQL,
            allowTransportWrites: serverConfig.allowTransportWrites,
            allowGitWrites: serverConfig.allowGitWrites,
            allowedPackages: serverConfig.allowedPackages,
            allowedTransports: serverConfig.allowedTransports,
            denyActions: serverConfig.denyActions,
          },
          sources,
        };
        console.log(JSON.stringify(out, null, 2));
      } else {
        console.log('ARC-1 effective authorization policy');
        console.log('────────────────────────────────────');
        const fields = [
          ['allowWrites', serverConfig.allowWrites],
          ['allowDataPreview', serverConfig.allowDataPreview],
          ['allowFreeSQL', serverConfig.allowFreeSQL],
          ['allowTransportWrites', serverConfig.allowTransportWrites],
          ['allowGitWrites', serverConfig.allowGitWrites],
          ['allowedPackages', JSON.stringify(serverConfig.allowedPackages)],
          ['allowedTransports', JSON.stringify(serverConfig.allowedTransports)],
        ] as const;
        for (const [name, value] of fields) {
          const src = formatConfigSource(sources[name]);
          console.log(`  ${name.padEnd(22)} = ${String(value).padEnd(30)} [${src}]`);
        }
        console.log('\nDeny actions:');
        if (serverConfig.denyActions.length === 0) {
          console.log(`  (none) [${formatConfigSource(sources.denyActions)}]`);
        } else {
          const src = formatConfigSource(sources.denyActions);
          for (const pattern of serverConfig.denyActions) {
            console.log(`  ${pattern} [${src}]`);
          }
        }
      }
      process.exit(0);
    } catch (err) {
      console.error(`Error: ${(err as Error).message}`);
      process.exit(1);
    }
  });

function formatConfigSource(s: ConfigSource | undefined): string {
  if (s === undefined) return 'default';
  if (s === 'default') return 'default';
  if (typeof s === 'object') {
    if ('env' in s) return `env ${s.env}`;
    if ('flag' in s) return `flag ${s.flag}`;
    if ('file' in s) return `file ${s.file}`;
  }
  return 'unknown';
}

// ─── Helpers ───────────────────────────────────────────────────────────

function renderToolResult(result: ToolResult, mode: OutputMode): number {
  if (mode === 'json') {
    console.log(JSON.stringify(result, null, 2));
  } else {
    const stream = result.isError ? console.error : console.log;
    for (const block of result.content) {
      if (block.type === 'text') stream(block.text);
    }
  }
  return result.isError ? 1 : 0;
}

function resolveCliContext(): { client: AdtClient; config: ServerConfig } {
  const serverConfig = parseArgs([]);
  initLogger(serverConfig.logFormat, serverConfig.verbose);
  const adtConfig = buildAdtConfig(serverConfig) as AdtClientConfig;
  const client = new AdtClient(adtConfig);
  return { client, config: serverConfig };
}

async function runToolCall(toolName: string, args: Record<string, unknown>, outputMode: OutputMode): Promise<number> {
  const { client, config: serverConfig } = resolveCliContext();
  const available = new Set(getToolDefinitions(serverConfig).map((t) => t.name));
  if (!available.has(toolName)) {
    console.error(`Unknown tool: ${toolName}`);
    console.error(`Available tools: ${[...available].join(', ')}`);
    return 2;
  }
  try {
    const result = await handleToolCall(client, serverConfig, toolName, args);
    return renderToolResult(result, outputMode);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    return 1;
  }
}

program.parse();
