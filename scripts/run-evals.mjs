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
 * Priority: CLI flags > shell env vars > .env > defaults (matches CLAUDE.md).
 * Unknown flags are forwarded to vitest so `--reporter verbose`, `--bail`,
 * etc. still work.
 *
 * Provider switching: if `--provider X` is passed WITHOUT `--model`, we
 * drop EVAL_MODEL so the provider's default kicks in — otherwise a pinned
 * `EVAL_MODEL=claude-haiku-4-5-20251001` in your .env would leak into a
 * cursor or ollama run and fail with "Cannot use this model".
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

let explicitProvider = false;
let explicitModel = false;

const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  const arg = args[i];

  // --flag=value
  const eqIdx = arg.indexOf('=');
  if (arg.startsWith('--') && eqIdx > 0) {
    const flag = arg.slice(0, eqIdx);
    const value = arg.slice(eqIdx + 1);
    if (FLAG_TO_ENV[flag]) {
      env[FLAG_TO_ENV[flag]] = value;
      if (flag === '--provider') explicitProvider = true;
      if (flag === '--model') explicitModel = true;
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
    env[FLAG_TO_ENV[arg]] = value;
    if (arg === '--provider') explicitProvider = true;
    if (arg === '--model') explicitModel = true;
    i++;
    continue;
  }

  passthrough.push(arg);
}

// If the user switched providers via CLI but didn't pick a model, inject the
// provider's default NOW so dotenv (loaded later inside vitest) can't overwrite
// it with a stale EVAL_MODEL from .env that's pinned to a different provider.
// Keep this table in sync with the DEFAULT_*_MODEL constants in the providers.
const PROVIDER_DEFAULT_MODEL = {
  'claude-code': 'claude-haiku-4-5-20251001',
  anthropic: 'claude-haiku-4-5-20251001',
  cursor: 'claude-4.5-sonnet',
  ollama: 'qwen3.5:9b',
};
if (explicitProvider && !explicitModel && PROVIDER_DEFAULT_MODEL[env.EVAL_PROVIDER]) {
  env.EVAL_MODEL = PROVIDER_DEFAULT_MODEL[env.EVAL_PROVIDER];
}

const vitestArgs = ['vitest', 'run', '--config', 'vitest.eval.config.ts', ...passthrough];
const child = spawn('npx', vitestArgs, { stdio: 'inherit', env });
child.on('exit', (code) => process.exit(code ?? 1));
