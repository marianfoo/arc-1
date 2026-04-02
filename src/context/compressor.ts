/**
 * Context compression orchestrator for SAPContext.
 *
 * Pipeline:
 * 1. Parse source → extract dependency names (deps.ts)
 * 2. Filter (remove self-refs, SAP built-ins)
 * 3. Sort (custom objects first)
 * 4. Limit to maxDeps
 * 5. Fetch dependency sources (parallel, bounded to MAX_CONCURRENT)
 * 6. Extract contracts (public API only) (contract.ts)
 * 7. If depth > 1, recurse on each dependency's source
 * 8. Format output prologue
 */

import type { Version } from '@abaplint/core';
import type { AdtClient } from '../adt/client.js';
import { extractContract } from './contract.js';
import { extractDependencies } from './deps.js';
import type { ContextResult, Contract, Dependency } from './types.js';

const DEFAULT_MAX_DEPS = 20;
const DEFAULT_DEPTH = 1;
const MAX_DEPTH = 3;
const MAX_CONCURRENT = 5;

/**
 * Compress dependency context for an ABAP object.
 *
 * @param client - ADT client for fetching dependency sources
 * @param source - ABAP source code of the target object
 * @param objectName - Target object name
 * @param objectType - Target object type (CLAS, INTF, PROG, FUNC)
 * @param maxDeps - Maximum number of dependencies to resolve (default 20)
 * @param depth - Dependency expansion depth 1-3 (default 1)
 * @param abaplintVersion - abaplint parser version (detected from SAP system, defaults to Cloud)
 */
export async function compressContext(
  client: AdtClient,
  source: string,
  objectName: string,
  objectType: string,
  maxDeps = DEFAULT_MAX_DEPS,
  depth = DEFAULT_DEPTH,
  abaplintVersion?: Version,
): Promise<ContextResult> {
  const effectiveDepth = Math.min(Math.max(depth, 1), MAX_DEPTH);
  const seen = new Set<string>([objectName.toUpperCase()]);
  const allContracts: Contract[] = [];
  let totalFiltered = 0;

  const deps = extractDependencies(source, objectName, true, abaplintVersion);
  totalFiltered = deps.length; // extractDependencies already filters, but we track the count

  await resolveDepthLevel(client, deps, maxDeps, effectiveDepth, seen, allContracts, abaplintVersion);

  return formatResult(objectName, objectType, deps.length, allContracts, totalFiltered);
}

/**
 * Resolve one level of dependencies and recurse if needed.
 */
async function resolveDepthLevel(
  client: AdtClient,
  deps: Dependency[],
  maxDeps: number,
  depth: number,
  seen: Set<string>,
  contracts: Contract[],
  abaplintVersion?: Version,
): Promise<void> {
  // Filter already-seen and limit
  const newDeps = deps.filter((d) => !seen.has(d.name.toUpperCase()));

  // Mark as seen immediately (before fetching) to prevent duplicates in recursive calls
  for (const dep of newDeps) {
    seen.add(dep.name.toUpperCase());
  }

  // Limit to maxDeps
  const limited = newDeps.slice(0, maxDeps);

  // Fetch and extract contracts (bounded parallel)
  const fetched = await fetchContractsParallel(client, limited, abaplintVersion);
  contracts.push(...fetched);

  // Recurse if depth > 1
  if (depth > 1) {
    for (const contract of fetched) {
      if (contract.success && (contract.fullSource || contract.source)) {
        // Extract deps from the full source (not compressed contract) for accuracy
        const subDeps = extractDependencies(
          contract.fullSource || contract.source,
          contract.name,
          true,
          abaplintVersion,
        );
        const unseenSubDeps = subDeps.filter((d) => !seen.has(d.name.toUpperCase()));
        if (unseenSubDeps.length > 0) {
          await resolveDepthLevel(client, unseenSubDeps, maxDeps, depth - 1, seen, contracts, abaplintVersion);
        }
      }
    }
  }
}

/**
 * Fetch source and extract contract for each dependency.
 * Bounded to MAX_CONCURRENT parallel requests.
 */
async function fetchContractsParallel(
  client: AdtClient,
  deps: Dependency[],
  abaplintVersion?: Version,
): Promise<Contract[]> {
  const results: Contract[] = [];
  for (let i = 0; i < deps.length; i += MAX_CONCURRENT) {
    const batch = deps.slice(i, i + MAX_CONCURRENT);
    const batchResults = await Promise.all(batch.map((dep) => fetchSingleContract(client, dep, abaplintVersion)));
    results.push(...batchResults);
  }
  return results;
}

/**
 * Fetch source for a single dependency and extract its contract.
 */
async function fetchSingleContract(client: AdtClient, dep: Dependency, abaplintVersion?: Version): Promise<Contract> {
  try {
    const objectType = inferObjectType(dep);
    const source = await fetchSource(client, dep.name, objectType);
    const contract = extractContract(source, dep.name, objectType, abaplintVersion);
    // Store full source for recursive dependency extraction
    contract.fullSource = source;
    return contract;
  } catch (err) {
    return {
      name: dep.name,
      type: 'UNKNOWN',
      methodCount: 0,
      source: '',
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Infer the object type from the dependency kind and naming convention.
 */
export function inferObjectType(dep: Dependency): 'CLAS' | 'INTF' | 'FUNC' | 'UNKNOWN' {
  // Function calls are always function modules
  if (dep.kind === 'function_call') return 'FUNC';

  // Interface usage → interface
  if (dep.kind === 'interface') return 'INTF';

  const upper = dep.name.toUpperCase();

  // Naming conventions
  if (/^[ZY]?IF_/i.test(upper) || /^IF_/i.test(upper)) return 'INTF';
  if (/^\/\w+\/IF_/i.test(upper)) return 'INTF'; // Namespaced interface like /DMO/IF_*
  if (/^[ZY]?CL_/i.test(upper) || /^CL_/i.test(upper)) return 'CLAS';
  if (/^\/\w+\/CL_/i.test(upper)) return 'CLAS'; // Namespaced class
  if (/^[ZY]?CX_/i.test(upper) || /^CX_/i.test(upper)) return 'CLAS'; // Exception classes
  if (/^\/\w+\/CX_/i.test(upper)) return 'CLAS'; // Namespaced exception

  // Default: assume class
  return 'CLAS';
}

/**
 * Fetch source code for a dependency from the SAP system.
 */
async function fetchSource(
  client: AdtClient,
  name: string,
  type: 'CLAS' | 'INTF' | 'FUNC' | 'UNKNOWN',
): Promise<string> {
  switch (type) {
    case 'CLAS':
      return client.getClass(name);
    case 'INTF':
      return client.getInterface(name);
    case 'FUNC': {
      // Function modules need their group — search for it
      const results = await client.searchObject(name, 5);
      const fmResult = results.find(
        (r) => r.objectName.toUpperCase() === name.toUpperCase() && r.objectType?.includes('FUNC'),
      );
      if (fmResult) {
        // Extract function group from URI: .../groups/<group>/fmodules/<name>
        const match = fmResult.uri.match(/groups\/([^/]+)/);
        if (match) {
          return client.getFunction(match[1], name);
        }
      }
      // Fallback: try all search results for a URI match
      for (const r of results) {
        const match = r.uri.match(/groups\/([^/]+)\/fmodules/);
        if (match) {
          return client.getFunction(match[1], name);
        }
      }
      throw new Error(`Cannot determine function group for ${name}`);
    }
    default:
      // Try as class first, then interface
      try {
        return await client.getClass(name);
      } catch {
        return client.getInterface(name);
      }
  }
}

/**
 * Format the final context result with prologue.
 */
function formatResult(
  objectName: string,
  objectType: string,
  depsFound: number,
  contracts: Contract[],
  _totalFiltered: number,
): ContextResult {
  const successful = contracts.filter((c) => c.success);
  const failed = contracts.filter((c) => !c.success);

  const lines: string[] = [];
  lines.push(
    `* === Dependency context for ${objectName} (${successful.length} deps resolved${failed.length > 0 ? `, ${failed.length} failed` : ''}) ===`,
  );
  lines.push('');

  for (const contract of successful) {
    const typeLabel = contract.type.toLowerCase();
    const methodLabel = contract.methodCount > 0 ? `, ${contract.methodCount} methods` : '';
    lines.push(`* --- ${contract.name} (${typeLabel}${methodLabel}) ---`);
    lines.push(contract.source.trim());
    lines.push('');
  }

  if (failed.length > 0) {
    lines.push('* --- Failed dependencies ---');
    for (const f of failed) {
      lines.push(`* ${f.name}: ${f.error}`);
    }
    lines.push('');
  }

  const totalLines = lines.length;
  lines.push(
    `* Stats: ${depsFound} deps found, ${successful.length} resolved, ${failed.length} failed, ${totalLines} lines`,
  );

  return {
    objectName,
    objectType,
    depsFound,
    depsResolved: successful.length,
    depsFiltered: depsFound - contracts.length,
    depsFailed: failed.length,
    totalLines,
    output: lines.join('\n'),
  };
}
