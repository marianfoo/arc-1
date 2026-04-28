/**
 * ARC-1 CLI — command-line interface for SAP ADT operations.
 *
 * Minimal CLI for direct SAP interaction without an MCP client.
 * For the full MCP server, use `arc1` (runs index.ts).
 *
 * Commands:
 *   arc1 search <query>       - Search for ABAP objects
 *   arc1 source <type> <name> - Get source code
 *   arc1 lint <source-file>   - Lint ABAP source code
 *   arc1 version              - Show version
 */

import { readFileSync } from 'node:fs';
import { Command } from 'commander';
import { config } from 'dotenv';
import { AdtClient } from './adt/client.js';
import { resolveCookies } from './adt/cookies.js';
import { detectFilename, lintAbapSource } from './lint/lint.js';
import { parseArgs, resolveConfig } from './server/config.js';
import { initLogger } from './server/logger.js';
import { VERSION } from './server/server.js';
import type { ConfigSource } from './server/types.js';

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

// Search command
program
  .command('search <query>')
  .description('Search for ABAP objects')
  .option('--max <number>', 'Maximum results', '50')
  .action(async (query: string, opts: { max: string }) => {
    const client = createClientFromEnv();
    const results = await client.searchObject(query, Number(opts.max));
    console.log(JSON.stringify(results, null, 2));
  });

// Source command
program
  .command('source <type> <name>')
  .description('Get source code of an ABAP object')
  .action(async (type: string, name: string) => {
    const client = createClientFromEnv();
    switch (type.toUpperCase()) {
      case 'PROG':
        console.log((await client.getProgram(name)).source);
        break;
      case 'CLAS':
        console.log((await client.getClass(name)).source);
        break;
      case 'INTF':
        console.log((await client.getInterface(name)).source);
        break;
      default:
        console.error(`Unsupported type: ${type}`);
        process.exit(1);
    }
  });

// Lint command
program
  .command('lint <file>')
  .description('Lint an ABAP source file')
  .action((file: string) => {
    const source = readFileSync(file, 'utf-8');
    const filename = detectFilename(source, file.replace(/\.abap$/, ''));
    const issues = lintAbapSource(source, filename);
    if (issues.length === 0) {
      console.log('No issues found.');
    } else {
      for (const issue of issues) {
        console.log(`${issue.line}:${issue.column} [${issue.severity}] ${issue.rule}: ${issue.message}`);
      }
    }
  });

// Version command (explicit)
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

function createClientFromEnv(): AdtClient {
  const serverConfig = parseArgs([]);
  initLogger(serverConfig.logFormat, serverConfig.verbose);
  const cookies = resolveCookies(serverConfig.cookieFile, serverConfig.cookieString);
  return new AdtClient({
    baseUrl: serverConfig.url,
    username: serverConfig.username,
    password: serverConfig.password,
    client: serverConfig.client,
    language: serverConfig.language,
    insecure: serverConfig.insecure,
    ...(cookies ? { cookies } : {}),
  });
}

program.parse();
