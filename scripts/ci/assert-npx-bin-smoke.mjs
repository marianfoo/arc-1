#!/usr/bin/env node

/**
 * Smoke-test npm executable resolution for the package-name invocation:
 *
 *   npx -y arc-1@latest --help
 *
 * The registry version cannot be tested before publish, so this builds a local
 * package tarball and asks npx to execute that tarball directly. This exercises
 * npm's real bin-selection logic and catches the "could not determine
 * executable to run" regression.
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const tempDir = mkdtempSync(join(tmpdir(), 'arc1-npx-smoke-'));

function fail(message, result) {
  console.error(message);
  if (result?.stdout) console.error(`\nstdout:\n${result.stdout}`);
  if (result?.stderr) console.error(`\nstderr:\n${result.stderr}`);
  process.exit(1);
}

function parsePackOutput(stdout) {
  const jsonStart = stdout.indexOf('[');
  if (jsonStart === -1) {
    fail('npm pack did not emit JSON output.', { stdout });
  }

  try {
    const metadata = JSON.parse(stdout.slice(jsonStart));
    const filename = metadata?.[0]?.filename;
    if (typeof filename !== 'string' || filename.length === 0) {
      fail('npm pack JSON output did not include a tarball filename.', { stdout });
    }
    return filename;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    fail(`Failed to parse npm pack JSON output: ${message}`, { stdout });
  }
}

try {
  const pack = spawnSync('npm', ['pack', '--json', '--pack-destination', tempDir], {
    cwd: repoRoot,
    encoding: 'utf8',
  });

  if (pack.status !== 0) {
    fail('npm pack failed.', pack);
  }

  const filename = parsePackOutput(pack.stdout);
  const tarballSpec = `./${filename}`;
  const npx = spawnSync('npx', ['-y', tarballSpec, '--help'], {
    cwd: tempDir,
    encoding: 'utf8',
    env: {
      ...process.env,
      NO_COLOR: '1',
      npm_config_loglevel: 'error',
    },
  });

  if (npx.status !== 0) {
    fail('npx could not execute the packed arc-1 tarball.', npx);
  }

  if (!npx.stdout.includes('ARC-1') || !npx.stdout.includes('Commands:')) {
    fail('npx executed, but output did not look like the ARC-1 CLI help.', npx);
  }

  console.log('npx package-name executable smoke test passed.');
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
