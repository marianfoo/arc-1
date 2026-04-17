#!/usr/bin/env node
/**
 * Wrapper for `vitest run --config vitest.eval.config.ts` that accepts
 * CLI flags and maps them to the EVAL_* env vars the test entry reads.
 *
 * Usage:
 *   npm run test:eval                              # all scenarios
 *   npm run test:eval -- --file context-impact     # one bucket
 *   npm run test:eval -- --file context-impact,read-basic
 *   npm run test:eval -- --scenario cds-impact-blast-radius-natural
 *   npm run test:eval -- --tag feat-33,cds-impact
 *   npm run test:eval -- --provider anthropic --model claude-haiku-4-5-20251001
 *   npm run test:eval -- --backend live --file context-impact
 *
 * Flags are equivalent to env vars — the env var wins if both are set,
 * so you can override a flag from a shell script. Unknown flags are
 * forwarded to vitest so `--reporter verbose`, `--bail`, etc. still work.
 */

import { spawn } from 'node:child_process';

const FLAG_TO_ENV = {
  '--file': 'EVAL_FILE',
  '--scenario': 'EVAL_SCENARIO',
  '--tag': 'EVAL_TAG',
  '--tags': 'EVAL_TAG',
  '--category': 'EVAL_CATEGORY',
  '--backend': 'EVAL_BACKEND',
  '--provider': 'EVAL_PROVIDER',
  '--model': 'EVAL_MODEL',
  '--mcp-url': 'EVAL_MCP_URL',
  '--ollama-url': 'OLLAMA_BASE_URL',
  '--threshold': 'EVAL_PASS_THRESHOLD',
};

const env = { ...process.env };
const passthrough = [];

const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  const arg = args[i];

  // --flag=value
  const eqIdx = arg.indexOf('=');
  if (arg.startsWith('--') && eqIdx > 0) {
    const flag = arg.slice(0, eqIdx);
    const value = arg.slice(eqIdx + 1);
    if (FLAG_TO_ENV[flag]) {
      if (!env[FLAG_TO_ENV[flag]]) env[FLAG_TO_ENV[flag]] = value;
      continue;
    }
    passthrough.push(arg);
    continue;
  }

  // --flag value
  if (FLAG_TO_ENV[arg]) {
    const value = args[i + 1];
    if (value === undefined || value.startsWith('--')) {
      console.error(`Error: ${arg} requires a value`);
      process.exit(2);
    }
    if (!env[FLAG_TO_ENV[arg]]) env[FLAG_TO_ENV[arg]] = value;
    i++;
    continue;
  }

  passthrough.push(arg);
}

const vitestArgs = ['vitest', 'run', '--config', 'vitest.eval.config.ts', ...passthrough];
const child = spawn('npx', vitestArgs, { stdio: 'inherit', env });
child.on('exit', (code) => process.exit(code ?? 1));
