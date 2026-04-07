/**
 * Integration tests for the object caching layer.
 *
 * These tests run against a live SAP system and are automatically
 * SKIPPED when TEST_SAP_URL is not configured.
 *
 * What is tested:
 * - Source cache hit/miss/invalidation (MemoryCache and SqliteCache)
 * - Dependency graph caching (second SAPContext call returns [cached])
 * - Cache stats reporting via SAPManage
 * - Warmup: TADIR enumeration produces objects on this system
 * - Warmup: indexed objects are available in cache
 * - Usages (reverse deps): correct error message when warmup not run
 * - Usages: returns results after warmup
 * - SQLite cache persistence across instances
 *
 * Run: npm run test:integration
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AdtClient } from '../../src/adt/client.js';
import { CachingLayer } from '../../src/cache/caching-layer.js';
import { MemoryCache } from '../../src/cache/memory.js';
import { SqliteCache } from '../../src/cache/sqlite.js';
import { runWarmup } from '../../src/cache/warmup.js';
import { handleToolCall } from '../../src/handlers/intent.js';
import { DEFAULT_CONFIG } from '../../src/server/types.js';
import { getTestClient, hasSapCredentials } from './helpers.js';

const describeIf = hasSapCredentials() ? describe : describe.skip;

/** Known Z class on this SAP system — small, fast to fetch */
const TEST_CLASS = 'ZCL_MCPT_26256';
/** Known Z class with dependencies — used for dep graph tests */
const TEST_CLASS_WITH_DEPS = 'ZCL_DEMO_D_CALC_AMOUNT';
/** Package that contains the test classes with deps */
const _TEST_PACKAGE = '$DEMO_SOI_DRAFT';

describeIf('Cache Integration Tests', () => {
  let client: AdtClient;

  beforeAll(() => {
    client = getTestClient();
  });

  // ─── Source Cache (Memory) ─────────────────────────────────────────

  describe('MemoryCache source caching', () => {
    it('returns MISS then HIT for same object', async () => {
      const cache = new MemoryCache();
      const cl = new CachingLayer(cache);

      const { hit: hit1 } = await cl.getSource('CLAS', TEST_CLASS, () => client.getClass(TEST_CLASS));
      expect(hit1).toBe(false); // first fetch = miss

      const { source: src2, hit: hit2 } = await cl.getSource('CLAS', TEST_CLASS, () => client.getClass(TEST_CLASS));
      expect(hit2).toBe(true); // second fetch = hit
      expect(src2.length).toBeGreaterThan(0);
    }, 15000);

    it('cache hit is significantly faster than miss', async () => {
      const cache = new MemoryCache();
      const cl = new CachingLayer(cache);

      const t0 = Date.now();
      await cl.getSource('CLAS', TEST_CLASS, () => client.getClass(TEST_CLASS));
      const missMs = Date.now() - t0;

      const t1 = Date.now();
      await cl.getSource('CLAS', TEST_CLASS, () => client.getClass(TEST_CLASS));
      const hitMs = Date.now() - t1;

      // Cache hit should be at least 10x faster than network fetch
      expect(hitMs).toBeLessThan(Math.max(missMs / 10, 5));
    }, 15000);

    it('invalidation causes next fetch to go to SAP', async () => {
      const cache = new MemoryCache();
      const cl = new CachingLayer(cache);

      // Populate cache
      await cl.getSource('CLAS', TEST_CLASS, () => client.getClass(TEST_CLASS));

      // Invalidate
      cl.invalidate('CLAS', TEST_CLASS);

      // Next fetch must be a miss (fetcher called again)
      let fetcherCalled = false;
      const { hit } = await cl.getSource('CLAS', TEST_CLASS, async () => {
        fetcherCalled = true;
        return client.getClass(TEST_CLASS);
      });

      expect(hit).toBe(false);
      expect(fetcherCalled).toBe(true);
    }, 15000);

    it('does not share entries across different CachingLayer instances', async () => {
      const cl1 = new CachingLayer(new MemoryCache());
      const cl2 = new CachingLayer(new MemoryCache());

      await cl1.getSource('CLAS', TEST_CLASS, () => client.getClass(TEST_CLASS));

      // cl2 has its own cache — should be a miss
      const { hit } = await cl2.getSource('CLAS', TEST_CLASS, () => client.getClass(TEST_CLASS));
      expect(hit).toBe(false);
    }, 15000);

    it('tracks stats correctly', async () => {
      const cl = new CachingLayer(new MemoryCache());

      const stats0 = cl.stats();
      expect(stats0.sourceCount).toBe(0);

      await cl.getSource('CLAS', TEST_CLASS, () => client.getClass(TEST_CLASS));

      const stats1 = cl.stats();
      expect(stats1.sourceCount).toBe(1);
    }, 15000);
  });

  // ─── Source Cache (SQLite) ─────────────────────────────────────────

  describe('SqliteCache source caching', () => {
    let dbPath: string;

    beforeAll(() => {
      dbPath = path.join(os.tmpdir(), `arc1-cache-test-${Date.now()}.db`);
    });

    afterAll(() => {
      try {
        fs.unlinkSync(dbPath);
      } catch {
        // best-effort cleanup
      }
    });

    it('persists source across cache instances', async () => {
      // Write to first instance
      const cl1 = new CachingLayer(new SqliteCache(dbPath));
      const { hit: hit1 } = await cl1.getSource('CLAS', TEST_CLASS, () => client.getClass(TEST_CLASS));
      expect(hit1).toBe(false);

      // Second instance on same db — should be a hit without any SAP call
      const cl2 = new CachingLayer(new SqliteCache(dbPath));
      const { hit: hit2 } = await cl2.getSource('CLAS', TEST_CLASS, async () => {
        throw new Error('Should not call SAP — source should be in persistent cache');
      });
      expect(hit2).toBe(true);
    }, 15000);

    it('SqliteCache invalidation removes the entry', async () => {
      const cl = new CachingLayer(new SqliteCache(dbPath));

      // Ensure it's in cache
      await cl.getSource('CLAS', TEST_CLASS, () => client.getClass(TEST_CLASS));

      cl.invalidate('CLAS', TEST_CLASS);

      let fetcherCalled = false;
      const { hit } = await cl.getSource('CLAS', TEST_CLASS, async () => {
        fetcherCalled = true;
        return client.getClass(TEST_CLASS);
      });
      expect(hit).toBe(false);
      expect(fetcherCalled).toBe(true);
    }, 15000);
  });

  // ─── Dependency Graph Caching via handleToolCall ──────────────────

  describe('dep graph caching (via SAPContext handler)', () => {
    it('first SAPContext deps call is not cached; second is cached', async () => {
      const cl = new CachingLayer(new MemoryCache());

      const r1 = await handleToolCall(
        client,
        DEFAULT_CONFIG,
        'SAPContext',
        { action: 'deps', name: TEST_CLASS_WITH_DEPS, type: 'CLAS', depth: 1 },
        undefined,
        undefined,
        cl,
      );
      const out1 = r1.content[0]?.text ?? '';
      expect(out1).toContain('Dependency context for');
      expect(out1).not.toContain('[cached]'); // first call: not from cache

      const r2 = await handleToolCall(
        client,
        DEFAULT_CONFIG,
        'SAPContext',
        { action: 'deps', name: TEST_CLASS_WITH_DEPS, type: 'CLAS', depth: 1 },
        undefined,
        undefined,
        cl,
      );
      const out2 = r2.content[0]?.text ?? '';
      expect(out2).toContain('[cached]'); // second call: from dep graph cache
    }, 30000);

    it('cached SAPContext response is much faster than first call', async () => {
      const cl = new CachingLayer(new MemoryCache());

      const t0 = Date.now();
      await handleToolCall(
        client,
        DEFAULT_CONFIG,
        'SAPContext',
        { action: 'deps', name: TEST_CLASS_WITH_DEPS, type: 'CLAS', depth: 1 },
        undefined,
        undefined,
        cl,
      );
      const firstMs = Date.now() - t0;

      const t1 = Date.now();
      await handleToolCall(
        client,
        DEFAULT_CONFIG,
        'SAPContext',
        { action: 'deps', name: TEST_CLASS_WITH_DEPS, type: 'CLAS', depth: 1 },
        undefined,
        undefined,
        cl,
      );
      const cachedMs = Date.now() - t1;

      // Cache hit should be at least 10x faster
      expect(cachedMs).toBeLessThan(Math.max(firstMs / 10, 5));
    }, 30000);

    it('SAPRead for same object in same session returns instantly from cache', async () => {
      const cl = new CachingLayer(new MemoryCache());

      const t0 = Date.now();
      await handleToolCall(
        client,
        DEFAULT_CONFIG,
        'SAPRead',
        { action: 'source', type: 'CLAS', name: TEST_CLASS },
        undefined,
        undefined,
        cl,
      );
      const firstMs = Date.now() - t0;

      const t1 = Date.now();
      await handleToolCall(
        client,
        DEFAULT_CONFIG,
        'SAPRead',
        { action: 'source', type: 'CLAS', name: TEST_CLASS },
        undefined,
        undefined,
        cl,
      );
      const cachedMs = Date.now() - t1;

      expect(cachedMs).toBeLessThan(Math.max(firstMs / 10, 5));
    }, 15000);
  });

  // ─── SAPManage Cache Stats ────────────────────────────────────────

  describe('SAPManage cache_stats', () => {
    it('returns stats after reads', async () => {
      const cl = new CachingLayer(new MemoryCache());

      // Do a read to populate cache
      await handleToolCall(
        client,
        DEFAULT_CONFIG,
        'SAPRead',
        { action: 'source', type: 'CLAS', name: TEST_CLASS },
        undefined,
        undefined,
        cl,
      );

      const r = await handleToolCall(
        client,
        DEFAULT_CONFIG,
        'SAPManage',
        { action: 'cache_stats' },
        undefined,
        undefined,
        cl,
      );
      const text = r.content[0]?.text ?? '';
      expect(text).toContain('sourceCount');
      const parsed = JSON.parse(text);
      expect(parsed.sourceCount).toBeGreaterThanOrEqual(1);
    }, 15000);

    it('stats show warmupAvailable=false before warmup', async () => {
      const cl = new CachingLayer(new MemoryCache());
      const r = await handleToolCall(
        client,
        DEFAULT_CONFIG,
        'SAPManage',
        { action: 'cache_stats' },
        undefined,
        undefined,
        cl,
      );
      const parsed = JSON.parse(r.content[0]?.text ?? '{}');
      expect(parsed.warmupAvailable).toBe(false);
    }, 10000);
  });

  // ─── Usages: Error Message Without Warmup ─────────────────────────

  describe('SAPContext usages without warmup', () => {
    it('returns informative error when warmup not run', async () => {
      const cl = new CachingLayer(new MemoryCache()); // no warmup

      const r = await handleToolCall(
        client,
        DEFAULT_CONFIG,
        'SAPContext',
        { action: 'usages', name: TEST_CLASS_WITH_DEPS, type: 'CLAS' },
        undefined,
        undefined,
        cl,
      );
      const text = r.content[0]?.text ?? '';
      // Should explain what to do
      expect(text.toLowerCase()).toMatch(/warmup|pre-warm|cache.*not.*available|not.*available.*cache/);
    }, 10000);
  });

  // ─── Warmup ───────────────────────────────────────────────────────

  describe('warmup', () => {
    it('TADIR query returns custom CLAS/INTF objects (Z prefix)', async () => {
      // Verify enumeration works directly
      const cl = new CachingLayer(new MemoryCache());
      const result = await runWarmup(client, cl, 'Z*,Y*,$DEMO_SOI_DRAFT,$TMP');
      // At minimum the Z* object names should be found (regardless of package)
      // Note: package filter is by DEVCLASS, so $DEMO_SOI_DRAFT should match those classes
      expect(result.totalObjects).toBeGreaterThan(0);
    }, 60000);

    it('warmup indexes objects into cache (nodes + sources)', async () => {
      const cl = new CachingLayer(new MemoryCache());
      const result = await runWarmup(client, cl, '$DEMO_SOI_DRAFT,$TMP');

      const stats = cl.stats();
      // Objects should be indexed
      expect(result.fetched).toBeGreaterThan(0);
      expect(stats.sourceCount).toBeGreaterThan(0);
      expect(stats.nodeCount).toBeGreaterThan(0);
    }, 60000);

    it('warmup sets isWarmupAvailable flag', async () => {
      const cl = new CachingLayer(new MemoryCache());
      expect(cl.isWarmupAvailable).toBe(false);

      await runWarmup(client, cl, '$TMP');
      expect(cl.isWarmupAvailable).toBe(true);
    }, 60000);

    it('second warmup run skips unchanged objects (delta by hash)', async () => {
      const cl = new CachingLayer(new MemoryCache());

      const run1 = await runWarmup(client, cl, '$TMP');
      expect(run1.fetched).toBeGreaterThanOrEqual(0);

      // Second run: same objects, same source — all skipped
      const run2 = await runWarmup(client, cl, '$TMP');
      expect(run2.skipped).toBe(run1.fetched + run1.skipped); // all previously fetched are now skipped
      expect(run2.fetched).toBe(0); // nothing new to fetch
    }, 120000);

    it('usages returns reverse deps after warmup', async () => {
      const cl = new CachingLayer(new MemoryCache());
      // Use package that contains classes with known inter-dependencies
      await runWarmup(client, cl, '$DEMO_SOI_DRAFT');

      cl.setWarmupDone(true);

      // After indexing the demo package, getUsages should return edges or empty array (not null)
      // since warmup is done, we get [] for objects with no callers, never null
      const usages = cl.getUsages(TEST_CLASS_WITH_DEPS);
      expect(usages).not.toBeNull();
      expect(Array.isArray(usages)).toBe(true);
    }, 120000);

    it('SAPContext usages action returns result after warmup', async () => {
      const cl = new CachingLayer(new MemoryCache());
      await runWarmup(client, cl, '$DEMO_SOI_DRAFT');

      const r = await handleToolCall(
        client,
        DEFAULT_CONFIG,
        'SAPContext',
        { action: 'usages', name: TEST_CLASS_WITH_DEPS, type: 'CLAS' },
        undefined,
        undefined,
        cl,
      );
      const text = r.content[0]?.text ?? '';
      // Should be a real usages response, not the "warmup not available" error
      expect(text.toLowerCase()).not.toMatch(/warmup.*not.*available|cache.*not.*available/);
      // Should mention the object
      expect(text).toContain(TEST_CLASS_WITH_DEPS.toUpperCase());
    }, 120000);
  });

  // ─── Cache-Aware compressContext ─────────────────────────────────

  describe('compressContext with caching layer', () => {
    it('dep graph is stored in cache after first compressContext', async () => {
      const cl = new CachingLayer(new MemoryCache());

      const source = await client.getClass(TEST_CLASS_WITH_DEPS);
      const { compressContext } = await import('../../src/context/compressor.js');

      // First call — no cache
      await compressContext(client, source, TEST_CLASS_WITH_DEPS, 'CLAS', 10, 1, undefined, cl);

      // Dep graph should now be cached
      const cached = cl.getCachedDepGraph(source);
      expect(cached).not.toBeNull();
      expect(cached?.objectName.toUpperCase()).toBe(TEST_CLASS_WITH_DEPS.toUpperCase());
      expect(Array.isArray(cached?.contracts)).toBe(true);
    }, 30000);
  });
});
