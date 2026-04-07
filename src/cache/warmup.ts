/**
 * Cache warmup — pre-indexes all custom objects from the SAP system.
 *
 * Pipeline:
 * 1. Query TADIR for all custom objects (CLAS, INTF, FUNC) matching package filter
 * 2. Fetch source code for each object (bounded parallel)
 * 3. Extract dependencies from each source (local AST, no ADT calls)
 * 4. Store source + deps + edges in cache
 * 5. Build reverse dependency index (edges indexed by toId)
 *
 * Delta strategy:
 * - On-premise: query REPOSRC for objects changed since last warmup (UDAT field)
 * - BTP: full re-scan (no reliable change timestamp available)
 * - Fallback: compare source hash — if unchanged, skip dep extraction
 *
 * Timing estimates (5 concurrent requests):
 * - 500 objects: ~2-3 minutes
 * - 2,000 objects: ~8-12 minutes
 * - 5,000 objects: ~20-30 minutes
 */

import type { AdtClient } from '../adt/client.js';
import { extractDependencies } from '../context/deps.js';
import { logger } from '../server/logger.js';
import { hashSource } from './cache.js';
import type { CachingLayer } from './caching-layer.js';

const WARMUP_CONCURRENT = 5;
const WARMUP_MAX_OBJECTS = 10000;

/** Result of a warmup run */
export interface WarmupResult {
  totalObjects: number;
  fetched: number;
  skipped: number;
  failed: number;
  edgesCreated: number;
  durationMs: number;
}

/** A TADIR entry for an object to index */
interface TadirEntry {
  objectType: string;
  objectName: string;
  packageName: string;
}

/**
 * Run cache warmup: enumerate + fetch + index all custom objects.
 *
 * @param client - ADT client for SAP access
 * @param cachingLayer - Caching layer to populate
 * @param packageFilter - Package name filter (supports wildcards, e.g. "Z*,Y*")
 * @param systemType - System type for choosing delta strategy
 */
export async function runWarmup(
  client: AdtClient,
  cachingLayer: CachingLayer,
  packageFilter?: string,
  _systemType?: string,
): Promise<WarmupResult> {
  const start = Date.now();
  let fetched = 0;
  let skipped = 0;
  let failed = 0;
  let edgesCreated = 0;

  // Phase 1: Enumerate objects from TADIR
  logger.info('Cache warmup: enumerating objects from TADIR...');
  const entries = await enumerateObjects(client, packageFilter);
  logger.info(`Cache warmup: found ${entries.length} objects to index`);

  // Phase 2: Fetch + index in parallel batches
  for (let i = 0; i < entries.length; i += WARMUP_CONCURRENT) {
    const batch = entries.slice(i, i + WARMUP_CONCURRENT);
    const results = await Promise.all(
      batch.map(async (entry) => {
        try {
          return await indexObject(client, cachingLayer, entry);
        } catch (err) {
          logger.debug(`Cache warmup: failed to index ${entry.objectType}:${entry.objectName}`, {
            error: err instanceof Error ? err.message : String(err),
          });
          return { status: 'failed' as const, edges: 0 };
        }
      }),
    );

    for (const r of results) {
      if (r.status === 'fetched') {
        fetched++;
        edgesCreated += r.edges;
      } else if (r.status === 'skipped') {
        skipped++;
      } else {
        failed++;
      }
    }

    // Progress logging every 50 objects
    if ((i + WARMUP_CONCURRENT) % 50 === 0 || i + WARMUP_CONCURRENT >= entries.length) {
      logger.info(
        `Cache warmup: ${fetched + skipped + failed}/${entries.length} (${fetched} fetched, ${skipped} skipped, ${failed} failed)`,
      );
    }
  }

  cachingLayer.setWarmupDone(true);

  const durationMs = Date.now() - start;
  logger.info('Cache warmup complete', {
    totalObjects: entries.length,
    fetched,
    skipped,
    failed,
    edgesCreated,
    durationMs,
  });

  return { totalObjects: entries.length, fetched, skipped, failed, edgesCreated, durationMs };
}

/**
 * Enumerate all custom CLAS/INTF/FUNC objects from TADIR.
 *
 * Runs separate queries per OBJ_NAME prefix (Z%, Y%, /%) to avoid
 * parenthesized OR-LIKE clauses that some ADT systems reject.
 * Package filtering is done in-memory after fetching.
 */
async function enumerateObjects(client: AdtClient, packageFilter?: string): Promise<TadirEntry[]> {
  // TADIR uses PGMID = 'R3TR' for main repository objects
  const objectTypes = "'CLAS','INTF','FUGR'"; // FUGR not FUNC — TADIR stores function groups
  const baseWhere = `PGMID = 'R3TR' AND OBJECT IN (${objectTypes})`;

  // Custom object name prefixes: Z*, Y*, namespaced /XX/*
  // We run one query per prefix to avoid OR-in-parens which some ADT systems reject
  const namePrefixes = ['Z%', 'Y%', '/%'];

  // Compile package filter patterns into regex for in-memory filtering
  let packageRegexes: RegExp[] | null = null;
  if (packageFilter) {
    const patterns = packageFilter
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
    if (patterns.length > 0) {
      packageRegexes = patterns.map((p) => {
        // Convert glob-style wildcards to regex
        const escaped = p
          .replace(/[.+^${}()|[\]\\]/g, '\\$&')
          .replace(/\*/g, '.*')
          .replace(/\?/g, '.');
        return new RegExp(`^${escaped}$`, 'i');
      });
    }
  }

  const seen = new Set<string>();
  const entries: TadirEntry[] = [];

  for (const prefix of namePrefixes) {
    const sql = `SELECT OBJECT, OBJ_NAME, DEVCLASS FROM TADIR WHERE ${baseWhere} AND OBJ_NAME LIKE '${prefix}' ORDER BY OBJECT, OBJ_NAME`;

    try {
      const data = await client.runQuery(sql, WARMUP_MAX_OBJECTS);
      for (const row of data.rows) {
        const objectType = String(row.OBJECT ?? '').trim();
        const objectName = String(row.OBJ_NAME ?? '').trim();
        const packageName = String(row.DEVCLASS ?? '').trim();

        if (!objectType || !objectName) continue;

        // Deduplicate (shouldn't happen, but defensive)
        const key = `${objectType}:${objectName}`;
        if (seen.has(key)) continue;

        // Apply package filter in memory
        if (packageRegexes && !packageRegexes.some((r) => r.test(packageName))) continue;

        // Map TADIR types to our types
        if (objectType === 'CLAS' || objectType === 'INTF' || objectType === 'FUGR') {
          seen.add(key);
          entries.push({ objectType, objectName, packageName });
        }
      }
    } catch (err) {
      logger.warn(`Cache warmup: TADIR query failed for prefix '${prefix}'`, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (entries.length === 0) {
    logger.warn('Cache warmup: no objects found in TADIR — check package filter or system content');
  } else if (entries.length >= WARMUP_MAX_OBJECTS) {
    logger.warn(
      `Cache warmup: found ${entries.length} objects (limit: ${WARMUP_MAX_OBJECTS}). ` +
        'Results may be truncated. Consider narrowing the package filter (--cache-warmup-packages).',
    );
  }

  return entries;
}

/**
 * Index a single object: fetch source, extract deps, store in cache.
 * Returns 'skipped' if source hash matches cached version.
 */
async function indexObject(
  client: AdtClient,
  cachingLayer: CachingLayer,
  entry: TadirEntry,
): Promise<{ status: 'fetched' | 'skipped' | 'failed'; edges: number }> {
  const { objectType, objectName, packageName } = entry;

  // For FUGR: we enumerate the function modules within the group
  if (objectType === 'FUGR') {
    return indexFunctionGroup(client, cachingLayer, objectName, packageName);
  }

  // Fetch source
  let source: string;
  try {
    if (objectType === 'CLAS') {
      source = await client.getClass(objectName);
    } else if (objectType === 'INTF') {
      source = await client.getInterface(objectName);
    } else {
      return { status: 'failed', edges: 0 };
    }
  } catch {
    return { status: 'failed', edges: 0 };
  }

  // Check if source changed since last cache
  const cached = cachingLayer.getCachedSource(objectType, objectName);
  const newHash = hashSource(source);
  if (cached && cached.hash === newHash) {
    return { status: 'skipped', edges: 0 };
  }

  // Store source
  cachingLayer.cache.putSource(objectType, objectName, source);

  // Store node metadata
  cachingLayer.cache.putNode({
    id: `${objectType}:${objectName}`.toUpperCase(),
    objectType,
    objectName: objectName.toUpperCase(),
    packageName: packageName.toUpperCase(),
    sourceHash: newHash,
    cachedAt: new Date().toISOString(),
    valid: true,
  });

  // Extract and store dependencies as edges
  const deps = extractDependencies(source, objectName, true);
  let edges = 0;
  const fromId = objectName.toUpperCase();
  for (const dep of deps) {
    const edgeType = mapDepKindToEdgeType(dep.kind);
    cachingLayer.cache.putEdge({
      fromId,
      toId: dep.name.toUpperCase(),
      edgeType,
      discoveredAt: new Date().toISOString(),
      valid: true,
    });
    edges++;
  }

  return { status: 'fetched', edges };
}

/**
 * Index a function group: fetch its function modules and index each.
 */
async function indexFunctionGroup(
  client: AdtClient,
  cachingLayer: CachingLayer,
  groupName: string,
  packageName: string,
): Promise<{ status: 'fetched' | 'skipped' | 'failed'; edges: number }> {
  try {
    const fg = await client.getFunctionGroup(groupName);
    let totalEdges = 0;
    let anyFetched = false;

    // fg is a parsed object with functions list
    const fgData = typeof fg === 'string' ? JSON.parse(fg) : fg;
    const functions: string[] = fgData.functions ?? [];

    for (const funcName of functions) {
      // Cache the group mapping
      cachingLayer.cache.putFuncGroup(funcName, groupName);

      try {
        const source = await client.getFunction(groupName, funcName);
        const cached = cachingLayer.getCachedSource('FUNC', funcName);
        const newHash = hashSource(source);

        if (cached && cached.hash === newHash) continue;

        cachingLayer.cache.putSource('FUNC', funcName, source);
        cachingLayer.cache.putNode({
          id: `FUNC:${funcName}`.toUpperCase(),
          objectType: 'FUNC',
          objectName: funcName.toUpperCase(),
          packageName: packageName.toUpperCase(),
          sourceHash: newHash,
          cachedAt: new Date().toISOString(),
          valid: true,
        });

        const deps = extractDependencies(source, funcName, true);
        for (const dep of deps) {
          cachingLayer.cache.putEdge({
            fromId: funcName.toUpperCase(),
            toId: dep.name.toUpperCase(),
            edgeType: mapDepKindToEdgeType(dep.kind),
            discoveredAt: new Date().toISOString(),
            valid: true,
          });
          totalEdges++;
        }
        anyFetched = true;
      } catch {
        // Individual func fetch failure — continue with others
      }
    }

    return { status: anyFetched ? 'fetched' : 'skipped', edges: totalEdges };
  } catch {
    return { status: 'failed', edges: 0 };
  }
}

/** Map dependency kind to cache edge type */
function mapDepKindToEdgeType(kind: string): 'CALLS' | 'USES' | 'IMPLEMENTS' | 'INCLUDES' {
  switch (kind) {
    case 'function_call':
      return 'CALLS';
    case 'interface':
    case 'inheritance':
      return 'IMPLEMENTS';
    default:
      return 'USES';
  }
}
