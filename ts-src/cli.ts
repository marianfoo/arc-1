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
import { detectFilename, lintAbapSource } from './lint/lint.js';
import { parseArgs } from './server/config.js';
import { VERSION } from './server/server.js';

// Load .env
config();

const program = new Command();

program.name('arc1').description('ARC-1 — MCP Server for SAP ABAP Systems').version(VERSION);

// Server mode (default)
program
  .command('serve', { isDefault: true })
  .description('Start MCP server (default)')
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
        console.log(await client.getProgram(name));
        break;
      case 'CLAS':
        console.log(await client.getClass(name));
        break;
      case 'INTF':
        console.log(await client.getInterface(name));
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

function createClientFromEnv(): AdtClient {
  const serverConfig = parseArgs([]);
  return new AdtClient({
    baseUrl: serverConfig.url,
    username: serverConfig.username,
    password: serverConfig.password,
    client: serverConfig.client,
    language: serverConfig.language,
    insecure: serverConfig.insecure,
  });
}

program.parse();
