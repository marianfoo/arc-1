/**
 * Fixture save / replay infrastructure.
 *
 * The probe's signal classification is pure (src/probe/runner.ts), so we can
 * unit-test every branch by replaying recorded HTTP responses instead of
 * hitting a live system. That also gives users a way to contribute probe
 * results from their own SAP landscape: run `--save-fixtures <dir>`, commit
 * the directory, and CI gains a regression-proof corpus.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { HttpProbeFn, ProbeFetchResult } from './runner.js';
import type { InstalledProduct } from './types.js';

/** A single recorded HTTP request/response, stored as JSON on disk. */
export interface RecordedResponse {
  url: string;
  method: 'GET' | 'HEAD';
  statusCode?: number;
  body?: string;
  networkError?: boolean;
  errorMessage?: string;
  durationMs: number;
}

/** Top-level metadata, written once per fixture directory. */
export interface FixtureMeta {
  baseUrl: string;
  client?: string;
  abapRelease?: string;
  systemType?: 'onprem' | 'btp' | 'unknown';
  /**
   * Full installed-components list. Captured so a replay-test reader can tell
   * apart e.g. plain NW 7.58 from S/4HANA 2023 — SAP_BASIS alone isn't enough.
   * Optional for backward compatibility with earlier fixture files.
   */
  products?: InstalledProduct[];
  discoveryMapKeys: string[];
  probedAt: string;
  note?: string;
}

/** Build a filesystem-safe filename from method+URL. */
function fixtureFilename(method: string, url: string): string {
  const slug = url
    .replace(/^https?:\/\/[^/]+/, '') //  strip protocol+host
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  return `${method}__${slug || 'root'}.json`;
}

/**
 * Wrap an existing `HttpProbeFn` so that every request+response is persisted
 * to `<dir>/responses/`. Call `meta.write()` at the end of the probe run to
 * emit the top-level metadata file.
 */
export function createRecordingFetcher(
  inner: HttpProbeFn,
  dir: string,
): { fetcher: HttpProbeFn; writeMeta: (meta: FixtureMeta) => void } {
  const responsesDir = join(dir, 'responses');
  mkdirSync(responsesDir, { recursive: true });

  const fetcher: HttpProbeFn = async (url, method) => {
    const result = await inner(url, method);
    const record: RecordedResponse = {
      url,
      method,
      statusCode: result.statusCode,
      body: result.body,
      networkError: result.networkError,
      errorMessage: result.errorMessage,
      durationMs: result.durationMs,
    };
    writeFileSync(join(responsesDir, fixtureFilename(method, url)), JSON.stringify(record, null, 2));
    return result;
  };

  const writeMeta = (meta: FixtureMeta) => {
    writeFileSync(join(dir, 'meta.json'), JSON.stringify(meta, null, 2));
  };

  return { fetcher, writeMeta };
}

/** Build a replay fetcher that serves from a fixture directory. */
export function createReplayFetcher(dir: string): { fetcher: HttpProbeFn; meta: FixtureMeta } {
  const metaPath = join(dir, 'meta.json');
  if (!existsSync(metaPath)) {
    throw new Error(`Fixture directory ${dir} missing meta.json`);
  }
  const meta = JSON.parse(readFileSync(metaPath, 'utf-8')) as FixtureMeta;

  const responsesDir = join(dir, 'responses');
  const recorded = new Map<string, RecordedResponse>();
  if (existsSync(responsesDir)) {
    for (const file of readdirSync(responsesDir)) {
      if (!file.endsWith('.json')) continue;
      const data = JSON.parse(readFileSync(join(responsesDir, file), 'utf-8')) as RecordedResponse;
      recorded.set(`${data.method} ${data.url}`, data);
    }
  }

  const fetcher: HttpProbeFn = async (url, method) => {
    const hit = recorded.get(`${method} ${url}`);
    if (!hit) {
      // Returning a synthetic network error is honest: the replay corpus
      // simply doesn't know about this URL. Tests that care can assert this.
      const missing: ProbeFetchResult = {
        networkError: true,
        errorMessage: `no recorded response for ${method} ${url}`,
        durationMs: 0,
      };
      return missing;
    }
    return {
      statusCode: hit.statusCode,
      body: hit.body,
      networkError: hit.networkError,
      errorMessage: hit.errorMessage,
      durationMs: hit.durationMs,
    };
  };

  return { fetcher, meta };
}

/** Build a discovery-map equivalent from the fixture meta (for runner input). */
export function discoveryMapFromMeta(meta: FixtureMeta): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const key of meta.discoveryMapKeys) map.set(key, []); //  values not needed by runner
  return map;
}
