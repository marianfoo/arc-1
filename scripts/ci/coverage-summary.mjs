#!/usr/bin/env node

/**
 * Parses coverage-summary.json and outputs a Markdown summary table.
 * Used in CI to publish coverage data to GitHub step summaries.
 *
 * Usage: node scripts/ci/coverage-summary.mjs [--coverage-dir <path>]
 * Always exits 0 — coverage reporting must never block builds.
 */

import { readFileSync, appendFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const METRICS = ['lines', 'statements', 'functions', 'branches'];

function parseArgs(argv) {
  const args = argv.slice(2);
  let coverageDir = 'coverage';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--coverage-dir' && args[i + 1]) {
      coverageDir = args[i + 1];
      i++;
    }
  }
  return { coverageDir: resolve(coverageDir) };
}

export function generateSummary(data) {
  const total = data?.total;
  if (!total) return 'No coverage data found.';

  const rows = [];
  for (const metric of METRICS) {
    const entry = total[metric];
    if (!entry || entry.pct == null) continue;
    const pct = typeof entry.pct === 'number' ? entry.pct.toFixed(2) : String(entry.pct);
    const covered = entry.covered ?? '?';
    const count = entry.total ?? '?';
    rows.push(`| ${metric} | ${pct}% | ${covered}/${count} |`);
  }

  if (rows.length === 0) return 'No coverage data found.';

  return [
    '## Coverage Summary',
    '',
    '| Metric | Coverage | Covered/Total |',
    '|--------|----------|---------------|',
    ...rows,
  ].join('\n');
}

function main() {
  const { coverageDir } = parseArgs(process.argv);
  const summaryPath = join(coverageDir, 'coverage-summary.json');

  let data;
  try {
    const raw = readFileSync(summaryPath, 'utf-8');
    data = JSON.parse(raw);
  } catch {
    const msg = 'No coverage data found.';
    console.log(msg);
    if (process.env.GITHUB_STEP_SUMMARY) {
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, msg + '\n');
    }
    process.exit(0);
  }

  const summary = generateSummary(data);
  console.log(summary);

  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + '\n');
  }
}

// Only run when executed directly, not when imported
import { pathToFileURL } from 'node:url';
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
