/**
 * Cache interface and types for ARC-1.
 *
 * Two implementations:
 * - MemoryCache: fast, ephemeral (default)
 * - SqliteCache: persistent, cross-session (optional)
 *
 * Cache stores three types of data:
 * - Nodes: ABAP objects (class, program, table, etc.)
 * - Edges: Dependencies between objects (calls, uses, implements)
 * - APIs: Released API objects (for clean core checks)
 */

/** Cached ABAP object */
export interface CacheNode {
  id: string;
  objectType: string;
  objectName: string;
  packageName: string;
  sourceHash?: string;
  cachedAt: string;
  valid: boolean;
  metadata?: Record<string, unknown>;
}

/** Dependency edge between objects */
export interface CacheEdge {
  fromId: string;
  toId: string;
  edgeType: 'CALLS' | 'USES' | 'IMPLEMENTS' | 'INCLUDES';
  source?: string;
  discoveredAt: string;
  valid: boolean;
}

/** Released API object */
export interface CacheApi {
  name: string;
  type: string;
  releaseState: string;
  cleanCoreLevel?: string;
  applicationComponent?: string;
}

/** Cache statistics */
export interface CacheStats {
  nodeCount: number;
  edgeCount: number;
  apiCount: number;
}

/** Cache interface — both MemoryCache and SqliteCache implement this */
export interface Cache {
  // Node operations
  putNode(node: CacheNode): void;
  getNode(id: string): CacheNode | null;
  getNodesByPackage(packageName: string): CacheNode[];
  invalidateNode(id: string): void;

  // Edge operations
  putEdge(edge: CacheEdge): void;
  getEdgesFrom(fromId: string): CacheEdge[];

  // API operations
  putApi(api: CacheApi): void;
  getApi(name: string, type: string): CacheApi | null;

  // Management
  clear(): void;
  stats(): CacheStats;
  close(): void;
}
