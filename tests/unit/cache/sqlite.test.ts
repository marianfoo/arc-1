import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CacheNode } from '../../../ts-src/cache/cache.js';
import { SqliteCache } from '../../../ts-src/cache/sqlite.js';

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

describe('SqliteCache', () => {
  let cache: SqliteCache;

  beforeEach(() => {
    // Use in-memory SQLite for tests (no file cleanup needed)
    cache = new SqliteCache(':memory:');
  });

  afterEach(() => {
    cache.close();
  });

  it('stores and retrieves a node', () => {
    cache.putNode(makeNode('ZCL_TEST'));
    const node = cache.getNode('ZCL_TEST');
    expect(node).not.toBeNull();
    expect(node?.objectName).toBe('ZCL_TEST');
    expect(node?.valid).toBe(true);
  });

  it('returns null for missing node', () => {
    expect(cache.getNode('MISSING')).toBeNull();
  });

  it('finds nodes by package (case-insensitive)', () => {
    cache.putNode(makeNode('A', '$TMP'));
    cache.putNode(makeNode('B', '$tmp'));
    cache.putNode(makeNode('C', 'ZOTHER'));
    const nodes = cache.getNodesByPackage('$TMP');
    expect(nodes).toHaveLength(2);
  });

  it('invalidates a node', () => {
    cache.putNode(makeNode('ZCL_TEST'));
    cache.invalidateNode('ZCL_TEST');
    const node = cache.getNode('ZCL_TEST');
    expect(node?.valid).toBe(false);
  });

  it('stores and retrieves edges', () => {
    cache.putEdge({
      fromId: 'A',
      toId: 'B',
      edgeType: 'CALLS',
      discoveredAt: new Date().toISOString(),
      valid: true,
    });
    const edges = cache.getEdgesFrom('A');
    expect(edges).toHaveLength(1);
    expect(edges[0]?.toId).toBe('B');
  });

  it('stores and retrieves API objects', () => {
    cache.putApi({
      name: 'CL_ABAP_REGEX',
      type: 'CLAS',
      releaseState: 'released',
      cleanCoreLevel: 'A',
    });
    const api = cache.getApi('CL_ABAP_REGEX', 'CLAS');
    expect(api).not.toBeNull();
    expect(api?.cleanCoreLevel).toBe('A');
  });

  it('clears all data', () => {
    cache.putNode(makeNode('A'));
    cache.putApi({ name: 'X', type: 'CLAS', releaseState: 'released' });
    cache.clear();
    expect(cache.stats().nodeCount).toBe(0);
    expect(cache.stats().apiCount).toBe(0);
  });

  it('returns correct stats', () => {
    cache.putNode(makeNode('A'));
    cache.putNode(makeNode('B'));
    cache.putEdge({ fromId: 'A', toId: 'B', edgeType: 'USES', discoveredAt: '', valid: true });
    const stats = cache.stats();
    expect(stats.nodeCount).toBe(2);
    expect(stats.edgeCount).toBe(1);
  });

  it('stores metadata as JSON', () => {
    cache.putNode({ ...makeNode('A'), metadata: { foo: 'bar', count: 42 } });
    const node = cache.getNode('A');
    expect(node?.metadata).toEqual({ foo: 'bar', count: 42 });
  });
});
