import { beforeEach, describe, expect, it } from 'vitest';
import type { CacheApi, CacheEdge, CacheNode } from '../../../ts-src/cache/cache.js';
import { MemoryCache } from '../../../ts-src/cache/memory.js';

function makeNode(id: string, pkg = '$TMP'): CacheNode {
  return {
    id,
    objectType: 'CLAS',
    objectName: id,
    packageName: pkg,
    cachedAt: new Date().toISOString(),
    valid: true,
  };
}

describe('MemoryCache', () => {
  let cache: MemoryCache;

  beforeEach(() => {
    cache = new MemoryCache();
  });

  describe('nodes', () => {
    it('stores and retrieves a node', () => {
      cache.putNode(makeNode('ZCL_TEST'));
      const node = cache.getNode('ZCL_TEST');
      expect(node).not.toBeNull();
      expect(node?.objectName).toBe('ZCL_TEST');
    });

    it('returns null for missing node', () => {
      expect(cache.getNode('MISSING')).toBeNull();
    });

    it('overwrites existing node', () => {
      cache.putNode(makeNode('ZCL_TEST'));
      cache.putNode({ ...makeNode('ZCL_TEST'), objectType: 'PROG' });
      const node = cache.getNode('ZCL_TEST');
      expect(node?.objectType).toBe('PROG');
    });

    it('finds nodes by package', () => {
      cache.putNode(makeNode('ZCL_A', '$TMP'));
      cache.putNode(makeNode('ZCL_B', '$TMP'));
      cache.putNode(makeNode('ZCL_C', 'ZOTHER'));
      const nodes = cache.getNodesByPackage('$TMP');
      expect(nodes).toHaveLength(2);
    });

    it('invalidates a node', () => {
      cache.putNode(makeNode('ZCL_TEST'));
      cache.invalidateNode('ZCL_TEST');
      const node = cache.getNode('ZCL_TEST');
      expect(node?.valid).toBe(false);
    });
  });

  describe('edges', () => {
    it('stores and retrieves edges', () => {
      const edge: CacheEdge = {
        fromId: 'ZCL_A',
        toId: 'ZCL_B',
        edgeType: 'CALLS',
        discoveredAt: new Date().toISOString(),
        valid: true,
      };
      cache.putEdge(edge);
      const edges = cache.getEdgesFrom('ZCL_A');
      expect(edges).toHaveLength(1);
      expect(edges[0]?.toId).toBe('ZCL_B');
    });

    it('returns empty array for no edges', () => {
      expect(cache.getEdgesFrom('MISSING')).toEqual([]);
    });
  });

  describe('apis', () => {
    it('stores and retrieves API objects', () => {
      const api: CacheApi = {
        name: 'CL_ABAP_REGEX',
        type: 'CLAS',
        releaseState: 'released',
        cleanCoreLevel: 'A',
      };
      cache.putApi(api);
      const found = cache.getApi('CL_ABAP_REGEX', 'CLAS');
      expect(found).not.toBeNull();
      expect(found?.releaseState).toBe('released');
    });

    it('returns null for missing API', () => {
      expect(cache.getApi('MISSING', 'CLAS')).toBeNull();
    });
  });

  describe('management', () => {
    it('returns correct stats', () => {
      cache.putNode(makeNode('A'));
      cache.putNode(makeNode('B'));
      cache.putEdge({ fromId: 'A', toId: 'B', edgeType: 'CALLS', discoveredAt: '', valid: true });
      cache.putApi({ name: 'X', type: 'CLAS', releaseState: 'released' });

      const stats = cache.stats();
      expect(stats.nodeCount).toBe(2);
      expect(stats.edgeCount).toBe(1);
      expect(stats.apiCount).toBe(1);
    });

    it('clears all data', () => {
      cache.putNode(makeNode('A'));
      cache.putEdge({ fromId: 'A', toId: 'B', edgeType: 'CALLS', discoveredAt: '', valid: true });
      cache.clear();

      expect(cache.stats().nodeCount).toBe(0);
      expect(cache.stats().edgeCount).toBe(0);
    });
  });
});
