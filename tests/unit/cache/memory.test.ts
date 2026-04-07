import { beforeEach, describe, expect, it } from 'vitest';
import type { CacheApi, CachedDepGraph, CacheEdge, CacheNode } from '../../../src/cache/cache.js';
import { hashSource } from '../../../src/cache/cache.js';
import { MemoryCache } from '../../../src/cache/memory.js';

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

  describe('sources', () => {
    it('stores and retrieves source code', () => {
      cache.putSource('CLAS', 'ZCL_TEST', 'CLASS zcl_test DEFINITION.');
      const src = cache.getSource('CLAS', 'ZCL_TEST');
      expect(src).not.toBeNull();
      expect(src?.source).toBe('CLASS zcl_test DEFINITION.');
      expect(src?.objectType).toBe('CLAS');
      expect(src?.objectName).toBe('ZCL_TEST');
      expect(src?.hash).toBe(hashSource('CLASS zcl_test DEFINITION.'));
    });

    it('returns null for missing source', () => {
      expect(cache.getSource('CLAS', 'MISSING')).toBeNull();
    });

    it('invalidates a source entry', () => {
      cache.putSource('PROG', 'ZTEST', 'REPORT ztest.');
      cache.invalidateSource('PROG', 'ZTEST');
      expect(cache.getSource('PROG', 'ZTEST')).toBeNull();
    });
  });

  describe('dep graphs', () => {
    it('stores and retrieves a dependency graph', () => {
      const graph: CachedDepGraph = {
        sourceHash: 'abc123',
        objectName: 'ZCL_TEST',
        objectType: 'CLAS',
        contracts: [{ name: 'ZCL_DEP', type: 'CLAS', methodCount: 3, source: 'compressed', success: true }],
        cachedAt: new Date().toISOString(),
      };
      cache.putDepGraph(graph);
      const found = cache.getDepGraph('abc123');
      expect(found).not.toBeNull();
      expect(found?.objectName).toBe('ZCL_TEST');
      expect(found?.contracts).toHaveLength(1);
      expect(found?.contracts[0]?.name).toBe('ZCL_DEP');
    });

    it('returns null for missing dep graph', () => {
      expect(cache.getDepGraph('missing_hash')).toBeNull();
    });
  });

  describe('function groups', () => {
    it('stores and retrieves function group mapping', () => {
      cache.putFuncGroup('Z_MY_FUNC', 'Z_MY_GROUP');
      expect(cache.getFuncGroup('Z_MY_FUNC')).toBe('Z_MY_GROUP');
    });

    it('returns null for missing function', () => {
      expect(cache.getFuncGroup('MISSING_FUNC')).toBeNull();
    });

    it('is case-insensitive', () => {
      cache.putFuncGroup('z_my_func', 'z_my_group');
      expect(cache.getFuncGroup('Z_MY_FUNC')).toBe('Z_MY_GROUP');
    });
  });

  describe('reverse edges', () => {
    it('retrieves edges by target id', () => {
      cache.putEdge({ fromId: 'A', toId: 'C', edgeType: 'CALLS', discoveredAt: '', valid: true });
      cache.putEdge({ fromId: 'B', toId: 'C', edgeType: 'USES', discoveredAt: '', valid: true });
      cache.putEdge({ fromId: 'A', toId: 'D', edgeType: 'CALLS', discoveredAt: '', valid: true });

      const edges = cache.getEdgesTo('C');
      expect(edges).toHaveLength(2);
      expect(edges.map((e) => e.fromId).sort()).toEqual(['A', 'B']);
    });

    it('returns empty array for no reverse edges', () => {
      expect(cache.getEdgesTo('MISSING')).toEqual([]);
    });
  });

  describe('management', () => {
    it('returns correct stats including sourceCount and contractCount', () => {
      cache.putNode(makeNode('A'));
      cache.putNode(makeNode('B'));
      cache.putEdge({ fromId: 'A', toId: 'B', edgeType: 'CALLS', discoveredAt: '', valid: true });
      cache.putApi({ name: 'X', type: 'CLAS', releaseState: 'released' });
      cache.putSource('CLAS', 'ZCL_A', 'source a');
      cache.putSource('PROG', 'ZTEST', 'source b');
      cache.putDepGraph({
        sourceHash: 'h1',
        objectName: 'ZCL_A',
        objectType: 'CLAS',
        contracts: [],
        cachedAt: '',
      });

      const stats = cache.stats();
      expect(stats.nodeCount).toBe(2);
      expect(stats.edgeCount).toBe(1);
      expect(stats.apiCount).toBe(1);
      expect(stats.sourceCount).toBe(2);
      expect(stats.contractCount).toBe(1);
    });

    it('clears all data including sources, dep graphs, and func groups', () => {
      cache.putNode(makeNode('A'));
      cache.putEdge({ fromId: 'A', toId: 'B', edgeType: 'CALLS', discoveredAt: '', valid: true });
      cache.putSource('CLAS', 'ZCL_A', 'source');
      cache.putDepGraph({
        sourceHash: 'h1',
        objectName: 'ZCL_A',
        objectType: 'CLAS',
        contracts: [],
        cachedAt: '',
      });
      cache.putFuncGroup('Z_FUNC', 'Z_GROUP');
      cache.clear();

      expect(cache.stats().nodeCount).toBe(0);
      expect(cache.stats().edgeCount).toBe(0);
      expect(cache.stats().sourceCount).toBe(0);
      expect(cache.stats().contractCount).toBe(0);
      expect(cache.getSource('CLAS', 'ZCL_A')).toBeNull();
      expect(cache.getFuncGroup('Z_FUNC')).toBeNull();
    });
  });
});
