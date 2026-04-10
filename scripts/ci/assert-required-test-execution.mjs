#!/usr/bin/env node

/**
 * Checks whether minimum test execution thresholds are met per suite.
 *
 * Usage: node scripts/ci/assert-required-test-execution.mjs [options]
 *   --results-dir <path>   Directory with JSON result files (default: test-results/)
 *   --mode <warn|enforce>  warn = exit 0 always; enforce = exit 1 on failure (default: warn)
 *   --config <json|path>   Inline JSON or file path with threshold overrides
 *
 * Default thresholds: unit >= 1000, integration >= 10, e2e >= 5 executed tests.
 * "Executed" = passed + failed (skipped tests don't count).
 */

import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const SUITES = ['unit', 'integration', 'e2e'];

const DEFAULT_THRESHOLDS = {
  unit: { minExecuted: 1000 },
  integration: { minExecuted: 10 },
  e2e: { minExecuted: 5 },
};

export function parseArgs(argv) {
  const args = argv.slice(2);
  let resultsDir = 'test-results';
  let mode = 'warn';
  let config = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--results-dir' && args[i + 1]) {
      resultsDir = args[i + 1];
      i++;
    } else if (args[i] === '--mode' && args[i + 1]) {
      mode = args[i + 1];
      i++;
    } else if (args[i] === '--config' && args[i + 1]) {
      config = args[i + 1];
      i++;
    }
  }

  return { resultsDir: resolve(resultsDir), mode, config };
}

export function loadThresholds(configArg) {
  if (!configArg) return { ...DEFAULT_THRESHOLDS };

  let parsed;
  // Try as inline JSON first
  try {
    parsed = JSON.parse(configArg);
  } catch {
    // Try as file path
    try {
      const raw = readFileSync(configArg, 'utf-8');
      parsed = JSON.parse(raw);
    } catch {
      console.error(`Warning: could not parse config "${configArg}", using defaults.`);
      return { ...DEFAULT_THRESHOLDS };
    }
  }

  return { ...DEFAULT_THRESHOLDS, ...parsed };
}

export function getExecutedCount(filePath) {
  let data;
  try {
    const raw = readFileSync(filePath, 'utf-8');
    data = JSON.parse(raw);
  } catch {
    return { executed: 0, error: 'no results found' };
  }

  if (!data || !Array.isArray(data.testResults)) {
    return { executed: 0, error: 'invalid format' };
  }

  let passed = 0;
  let failed = 0;
  for (const file of data.testResults) {
    if (!Array.isArray(file.assertionResults)) continue;
    for (const test of file.assertionResults) {
      if (test.status === 'passed') passed++;
      else if (test.status === 'failed') failed++;
    }
  }

  return { executed: passed + failed };
}

export function checkThresholds(resultsDir, thresholds) {
  const results = [];

  for (const suite of SUITES) {
    const threshold = thresholds[suite];
    if (!threshold) continue;

    const filePath = join(resultsDir, `${suite}.json`);
    const { executed, error } = getExecutedCount(filePath);
    const minExecuted = threshold.minExecuted || 0;
    const pass = executed >= minExecuted;

    results.push({
      suite,
      executed,
      minExecuted,
      pass,
      error: error || null,
    });
  }

  return results;
}

export function formatReport(results) {
  const lines = ['Test Execution Threshold Check:', ''];
  for (const r of results) {
    const status = r.pass ? 'PASS' : 'FAIL';
    const errorNote = r.error ? ` (${r.error})` : '';
    lines.push(`  [${status}] ${r.suite}: ${r.executed}/${r.minExecuted} executed${errorNote}`);
  }
  return lines.join('\n');
}

function main() {
  const { resultsDir, mode, config } = parseArgs(process.argv);
  const thresholds = loadThresholds(config);
  const results = checkThresholds(resultsDir, thresholds);
  const report = formatReport(results);
  const anyFailed = results.some(r => !r.pass);

  if (anyFailed) {
    console.error(report);
    if (mode === 'enforce') {
      console.error('\nThreshold check failed (enforce mode). Exiting with code 1.');
      process.exit(1);
    } else {
      console.error('\nThreshold check failed (warn mode). Continuing.');
    }
  } else {
    console.log(report);
  }
}

// Only run when executed directly, not when imported
import { pathToFileURL } from 'node:url';
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
