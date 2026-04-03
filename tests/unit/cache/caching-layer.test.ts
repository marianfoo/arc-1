import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdtClient } from '../../../src/adt/client.js';
import { CachingLayer } from '../../../src/cache/caching-layer.js';
import { MemoryCache } from '../../../src/cache/memory.js';

/** Minimal mock of AdtClient with the methods CachingLayer uses */
function makeMockClient() {
  return {
    getClass: vi.fn(),
    getInterface: vi.fn(),
    searchObject: vi.fn(),
  } as unknown as AdtClient;
}

describe('CachingLayer', () => {
  let cache: MemoryCache;
  let layer: CachingLayer;
  let client: AdtClient;

  beforeEach(() => {
    cache = new MemoryCache();
    layer = new CachingLayer(cache);
    client = makeMockClient();
  });

  // ─── Source Caching ──────────────────────────────────────────────────

  describe('source caching', () => {
    it('first call fetches via fetcher, second call returns cached', async () => {
      const fetcher = vi.fn().mockResolvedValue('CLASS zcl_test. ENDCLASS.');

      const first = await layer.getSource('CLAS', 'ZCL_TEST', fetcher);
      expect(first.source).toBe('CLASS zcl_test. ENDCLASS.');
      expect(first.hit).toBe(false);
      expect(fetcher).toHaveBeenCalledTimes(1);

      const second = await layer.getSource('CLAS', 'ZCL_TEST', fetcher);
      expect(second.source).toBe('CLASS zcl_test. ENDCLASS.');
      expect(second.hit).toBe(true);
      expect(fetcher).toHaveBeenCalledTimes(1); // not called again
    });

    it('returns cache miss after invalidation', async () => {
      const fetcher = vi.fn().mockResolvedValue('REPORT zprog.');

      await layer.getSource('PROG', 'ZPROG', fetcher);
      expect(fetcher).toHaveBeenCalledTimes(1);

      layer.invalidate('PROG', 'ZPROG');

      const fetcherV2 = vi.fn().mockResolvedValue('REPORT zprog. " updated');
      const result = await layer.getSource('PROG', 'ZPROG', fetcherV2);
      expect(result.hit).toBe(false);
      expect(result.source).toBe('REPORT zprog. " updated');
      expect(fetcherV2).toHaveBeenCalledTimes(1);
    });

    it('getCachedSource returns null on miss', () => {
      expect(layer.getCachedSource('CLAS', 'ZCL_MISSING')).toBeNull();
    });

    it('getCachedSource returns entry after getSource populates cache', async () => {
      const fetcher = vi.fn().mockResolvedValue('source code');
      await layer.getSource('CLAS', 'ZCL_HIT', fetcher);

      const cached = layer.getCachedSource('CLAS', 'ZCL_HIT');
      expect(cached).not.toBeNull();
      expect(cached?.source).toBe('source code');
    });
  });

  // ─── Dependency Graph Caching ────────────────────────────────────────

  describe('dep graph caching', () => {
    it('getCachedDepGraph returns null on miss', () => {
      expect(layer.getCachedDepGraph('some source')).toBeNull();
    });

    it('getCachedDepGraph returns graph on hit', () => {
      const source = 'CLASS zcl_foo. ENDCLASS.';
      const contracts = [{ name: 'IF_BAR', type: 'INTF', methodCount: 2, source: 'compressed', success: true }];
      layer.putDepGraph(source, 'ZCL_FOO', 'CLAS', contracts);

      const result = layer.getCachedDepGraph(source);
      expect(result).not.toBeNull();
      expect(result?.objectName).toBe('ZCL_FOO');
      expect(result?.objectType).toBe('CLAS');
      expect(result?.contracts).toHaveLength(1);
      expect(result?.contracts[0]?.name).toBe('IF_BAR');
    });

    it('putDepGraph + getCachedDepGraph round-trip preserves contracts', () => {
      const source = 'INTERFACE if_x. ENDINTERFACE.';
      const contracts = [
        { name: 'CL_A', type: 'CLAS', methodCount: 5, source: 'contract_a', success: true },
        { name: 'CL_B', type: 'CLAS', methodCount: 0, source: '', success: false, error: 'not found' },
      ];
      layer.putDepGraph(source, 'IF_X', 'INTF', contracts);

      const graph = layer.getCachedDepGraph(source);
      expect(graph).not.toBeNull();
      expect(graph?.contracts).toHaveLength(2);
      expect(graph?.contracts[0]?.success).toBe(true);
      expect(graph?.contracts[1]?.success).toBe(false);
      expect(graph?.contracts[1]?.error).toBe('not found');
    });

    it('returns null when source changes (hash mismatch)', () => {
      const sourceV1 = 'version 1';
      const sourceV2 = 'version 2';
      layer.putDepGraph(sourceV1, 'ZCL_X', 'CLAS', []);

      expect(layer.getCachedDepGraph(sourceV1)).not.toBeNull();
      expect(layer.getCachedDepGraph(sourceV2)).toBeNull();
    });
  });

  // ─── Function Group Resolution ───────────────────────────────────────

  describe('function group resolution', () => {
    it('resolves function group from search and caches it', async () => {
      (client.searchObject as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          objectType: 'FUGR/FF',
          objectName: 'Z_MY_FM',
          description: 'My Function Module',
          packageName: '$TMP',
          uri: '/sap/bc/adt/functions/groups/Z_MY_GROUP/fmodules/Z_MY_FM',
        },
      ]);

      const group = await layer.resolveFuncGroup(client, 'Z_MY_FM');
      expect(group).toBe('Z_MY_GROUP');
      expect(client.searchObject).toHaveBeenCalledTimes(1);

      // Second call should use cache, not call searchObject again
      const group2 = await layer.resolveFuncGroup(client, 'Z_MY_FM');
      expect(group2).toBe('Z_MY_GROUP');
      expect(client.searchObject).toHaveBeenCalledTimes(1);
    });

    it('returns null when search has no matching URI', async () => {
      (client.searchObject as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          objectType: 'PROG',
          objectName: 'Z_UNRELATED',
          description: 'No group match',
          packageName: '$TMP',
          uri: '/sap/bc/adt/programs/programs/Z_UNRELATED',
        },
      ]);

      const group = await layer.resolveFuncGroup(client, 'Z_MISSING_FM');
      expect(group).toBeNull();
    });

    it('returns null when search returns empty results', async () => {
      (client.searchObject as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const group = await layer.resolveFuncGroup(client, 'Z_NONEXISTENT');
      expect(group).toBeNull();
    });
  });

  // ─── Write Invalidation ──────────────────────────────────────────────

  describe('write invalidation', () => {
    it('invalidate removes source from cache', async () => {
      const fetcher = vi.fn().mockResolvedValue('old source');
      await layer.getSource('CLAS', 'ZCL_EDIT', fetcher);

      expect(layer.getCachedSource('CLAS', 'ZCL_EDIT')).not.toBeNull();

      layer.invalidate('CLAS', 'ZCL_EDIT');

      expect(layer.getCachedSource('CLAS', 'ZCL_EDIT')).toBeNull();
    });

    it('invalidate for non-existent entry does not throw', () => {
      expect(() => layer.invalidate('CLAS', 'ZCL_NONEXISTENT')).not.toThrow();
    });
  });

  // ─── Reverse Dep Lookup (Usages) ─────────────────────────────────────

  describe('reverse dep lookup (getUsages)', () => {
    it('returns null when warmup not done', () => {
      expect(layer.getUsages('ZCL_TARGET')).toBeNull();
    });

    it('returns edges when warmup is done', () => {
      // Populate edges via underlying cache
      cache.putEdge({
        fromId: 'ZCL_CALLER',
        toId: 'ZCL_TARGET',
        edgeType: 'CALLS',
        discoveredAt: new Date().toISOString(),
        valid: true,
      });
      cache.putEdge({
        fromId: 'ZCL_USER',
        toId: 'ZCL_TARGET',
        edgeType: 'USES',
        discoveredAt: new Date().toISOString(),
        valid: true,
      });

      layer.setWarmupDone(true);

      const usages = layer.getUsages('ZCL_TARGET');
      expect(usages).not.toBeNull();
      expect(usages).toHaveLength(2);
      expect(usages).toEqual(
        expect.arrayContaining([
          { fromId: 'ZCL_CALLER', edgeType: 'CALLS' },
          { fromId: 'ZCL_USER', edgeType: 'USES' },
        ]),
      );
    });

    it('returns empty array when warmup done but no edges exist', () => {
      layer.setWarmupDone(true);
      const usages = layer.getUsages('ZCL_NOBODY');
      expect(usages).toEqual([]);
    });

    it('isWarmupAvailable reflects setWarmupDone state', () => {
      expect(layer.isWarmupAvailable).toBe(false);
      layer.setWarmupDone(true);
      expect(layer.isWarmupAvailable).toBe(true);
      layer.setWarmupDone(false);
      expect(layer.isWarmupAvailable).toBe(false);
    });
  });

  // ─── Stats ───────────────────────────────────────────────────────────

  describe('stats', () => {
    it('reports empty stats on fresh cache', () => {
      const stats = layer.stats();
      expect(stats.nodeCount).toBe(0);
      expect(stats.edgeCount).toBe(0);
      expect(stats.apiCount).toBe(0);
      expect(stats.sourceCount).toBe(0);
      expect(stats.contractCount).toBe(0);
    });

    it('reports correct counts after populating cache', async () => {
      // Add a source via getSource
      const fetcher = vi.fn().mockResolvedValue('source');
      await layer.getSource('CLAS', 'ZCL_A', fetcher);
      await layer.getSource('PROG', 'ZPROG', vi.fn().mockResolvedValue('report'));

      // Add a dep graph
      layer.putDepGraph('source', 'ZCL_A', 'CLAS', []);

      // Add nodes/edges via underlying cache
      cache.putNode({
        id: 'ZCL_A',
        objectType: 'CLAS',
        objectName: 'ZCL_A',
        packageName: '$TMP',
        cachedAt: new Date().toISOString(),
        valid: true,
      });
      cache.putEdge({
        fromId: 'ZCL_A',
        toId: 'ZCL_B',
        edgeType: 'CALLS',
        discoveredAt: '',
        valid: true,
      });

      const stats = layer.stats();
      expect(stats.sourceCount).toBe(2);
      expect(stats.contractCount).toBe(1);
      expect(stats.nodeCount).toBe(1);
      expect(stats.edgeCount).toBe(1);
    });
  });
});
