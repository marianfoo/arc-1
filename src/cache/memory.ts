/**
 * In-memory cache implementation.
 *
 * Default cache backend — fast, ephemeral.
 * Data is lost when the process exits.
 * Thread-safe by default in Node.js (single-threaded event loop).
 */

import type { Cache, CacheApi, CacheEdge, CacheNode, CacheStats } from './cache.js';

export class MemoryCache implements Cache {
  private nodes = new Map<string, CacheNode>();
  private edges = new Map<string, CacheEdge[]>();
  private apis = new Map<string, CacheApi>();

  putNode(node: CacheNode): void {
    this.nodes.set(node.id, { ...node });
  }

  getNode(id: string): CacheNode | null {
    return this.nodes.get(id) ?? null;
  }

  getNodesByPackage(packageName: string): CacheNode[] {
    const upper = packageName.toUpperCase();
    const result: CacheNode[] = [];
    for (const node of this.nodes.values()) {
      if (node.packageName.toUpperCase() === upper) {
        result.push(node);
      }
    }
    return result;
  }

  invalidateNode(id: string): void {
    const node = this.nodes.get(id);
    if (node) {
      node.valid = false;
    }
  }

  putEdge(edge: CacheEdge): void {
    const key = edge.fromId;
    const existing = this.edges.get(key) ?? [];
    existing.push({ ...edge });
    this.edges.set(key, existing);
  }

  getEdgesFrom(fromId: string): CacheEdge[] {
    return this.edges.get(fromId) ?? [];
  }

  putApi(api: CacheApi): void {
    this.apis.set(`${api.type}:${api.name}`, { ...api });
  }

  getApi(name: string, type: string): CacheApi | null {
    return this.apis.get(`${type}:${name}`) ?? null;
  }

  clear(): void {
    this.nodes.clear();
    this.edges.clear();
    this.apis.clear();
  }

  stats(): CacheStats {
    let edgeCount = 0;
    for (const edges of this.edges.values()) {
      edgeCount += edges.length;
    }
    return {
      nodeCount: this.nodes.size,
      edgeCount,
      apiCount: this.apis.size,
    };
  }

  close(): void {
    this.clear();
  }
}
