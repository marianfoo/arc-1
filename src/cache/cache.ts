/**
 * Cache interface and types for ARC-1.
 *
 * Two implementations:
 * - MemoryCache: fast, ephemeral (default for stdio)
 * - SqliteCache: persistent, cross-session (default for http-streamable / Docker)
 *
 * Cache stores five types of data:
 * - Nodes: ABAP objects (class, program, table, etc.) with metadata
 * - Edges: Dependencies between objects (calls, uses, implements)
 * - APIs: Released API objects (for clean core checks)
 * - Sources: Raw source code keyed by (type, name) with content hash
 * - Contracts: Compressed dependency contracts keyed by source hash
 */

import { createHash } from 'node:crypto';

// ─── Graph Types (existing) ──────────────────────────────────────────

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
  sourceCount: number;
  contractCount: number;
}

// ─── Source Cache Types ──────────────────────────────────────────────

/** Cached source code entry */
export interface CachedSource {
  objectType: string;
  objectName: string;
  source: string;
  hash: string;
  cachedAt: string;
}

// ─── Contract Cache Types ────────────────────────────────────────────

/** Serializable contract for cache storage (matches context/types.ts Contract) */
export interface CachedContract {
  name: string;
  type: string;
  methodCount: number;
  source: string;
  fullSource?: string;
  success: boolean;
  error?: string;
}

/** Cached dependency resolution result */
export interface CachedDepGraph {
  sourceHash: string;
  objectName: string;
  objectType: string;
  contracts: CachedContract[];
  cachedAt: string;
}

// ─── Cache Interface ────────────────────────────────────────────────

/** Cache interface — both MemoryCache and SqliteCache implement this */
export interface Cache {
  // Node operations (graph metadata)
  putNode(node: CacheNode): void;
  getNode(id: string): CacheNode | null;
  getNodesByPackage(packageName: string): CacheNode[];
  invalidateNode(id: string): void;

  // Edge operations (dependency graph)
  putEdge(edge: CacheEdge): void;
  getEdgesFrom(fromId: string): CacheEdge[];
  /** Reverse lookup: get all edges pointing TO this id */
  getEdgesTo(toId: string): CacheEdge[];

  // API operations (released APIs for clean core)
  putApi(api: CacheApi): void;
  getApi(name: string, type: string): CacheApi | null;

  // Source code cache
  putSource(objectType: string, objectName: string, source: string): void;
  getSource(objectType: string, objectName: string): CachedSource | null;
  invalidateSource(objectType: string, objectName: string): void;

  // Dependency contract cache (keyed by source hash)
  putDepGraph(graph: CachedDepGraph): void;
  getDepGraph(sourceHash: string): CachedDepGraph | null;

  // Function group resolution cache
  putFuncGroup(funcName: string, groupName: string): void;
  getFuncGroup(funcName: string): string | null;

  // Management
  clear(): void;
  stats(): CacheStats;
  close(): void;
}

// ─── Helpers ─────────────────────────────────────────────────────────

/** Compute SHA-256 hash of source code (used as dep graph cache key) */
export function hashSource(source: string): string {
  return createHash('sha256').update(source).digest('hex');
}

/** Build a source cache key from type + name */
export function sourceKey(objectType: string, objectName: string): string {
  return `${objectType.toUpperCase()}:${objectName.toUpperCase()}`;
}
