/**
 * Runtime diagnostics for SAP ADT.
 *
 * - Short dumps (ST22): list and read ABAP runtime errors
 * - ABAP traces: list and analyze profiler trace files
 *
 * All operations are read-only (GET requests).
 * Follows the same pure-function pattern as devtools.ts.
 */

import type { AdtHttpClient } from './http.js';
import { checkOperation, OperationType, type SafetyConfig } from './safety.js';
import type {
  DumpChapter,
  DumpDetail,
  DumpEntry,
  TraceDbAccess,
  TraceEntry,
  TraceHitlistEntry,
  TraceStatement,
} from './types.js';
import { findDeepNodes, parseXml } from './xml-parser.js';

// ─── Short Dumps ────────────────────────────────────────────────────

export interface ListDumpsOptions {
  /** Filter by SAP user (uppercase) */
  user?: string;
  /** Maximum number of dumps to return (default 50) */
  maxResults?: number;
}

/**
 * List ABAP short dumps (ST22 equivalent).
 *
 * Endpoint: GET /sap/bc/adt/runtime/dumps
 * Returns an Atom feed with dump entries.
 */
export async function listDumps(
  http: AdtHttpClient,
  safety: SafetyConfig,
  options?: ListDumpsOptions,
): Promise<DumpEntry[]> {
  checkOperation(safety, OperationType.Read, 'ListDumps');

  const params: string[] = [];
  if (options?.maxResults) {
    params.push(`$top=${options.maxResults}`);
  }
  if (options?.user) {
    params.push(`$query=${encodeURIComponent(`and(equals(user,${options.user}))`)}`);
  }

  const queryString = params.length > 0 ? `?${params.join('&')}` : '';
  const resp = await http.get(`/sap/bc/adt/runtime/dumps${queryString}`, {
    Accept: 'application/atom+xml;type=feed',
  });

  return parseDumpList(resp.body);
}

/**
 * Get full dump detail including formatted text.
 *
 * Makes two requests:
 * 1. XML metadata (chapters, links, attributes)
 * 2. Formatted plain text (full dump content)
 *
 * The dump ID is the URL-encoded path segment from the listing.
 */
export async function getDump(http: AdtHttpClient, safety: SafetyConfig, dumpId: string): Promise<DumpDetail> {
  checkOperation(safety, OperationType.Read, 'GetDump');

  // Fetch XML metadata and formatted text in parallel
  const [xmlResp, textResp] = await Promise.all([
    http.get(`/sap/bc/adt/runtime/dump/${dumpId}`, {
      Accept: 'application/vnd.sap.adt.runtime.dump.v1+xml',
    }),
    http.get(`/sap/bc/adt/runtime/dump/${dumpId}/formatted`, {
      Accept: 'text/plain',
    }),
  ]);

  return parseDumpDetail(xmlResp.body, textResp.body, dumpId);
}

// ─── ABAP Traces ────────────────────────────────────────────────────

/**
 * List ABAP profiler trace files.
 *
 * Endpoint: GET /sap/bc/adt/runtime/traces/abaptraces
 * Returns an Atom feed with trace entries.
 */
export async function listTraces(http: AdtHttpClient, safety: SafetyConfig): Promise<TraceEntry[]> {
  checkOperation(safety, OperationType.Read, 'ListTraces');

  const resp = await http.get('/sap/bc/adt/runtime/traces/abaptraces', {
    Accept: 'application/atom+xml;type=feed',
  });

  return parseTraceList(resp.body);
}

/**
 * Get trace hitlist (execution hot spots).
 *
 * Returns the most expensive procedures sorted by gross time.
 */
export async function getTraceHitlist(
  http: AdtHttpClient,
  safety: SafetyConfig,
  traceId: string,
): Promise<TraceHitlistEntry[]> {
  checkOperation(safety, OperationType.Read, 'GetTraceHitlist');

  const resp = await http.get(`/sap/bc/adt/runtime/traces/abaptraces/${traceId}/hitlist`, {
    Accept: 'application/xml',
  });

  return parseTraceHitlist(resp.body);
}

/**
 * Get trace call tree (statements).
 *
 * Returns the hierarchical call tree with timing data.
 */
export async function getTraceStatements(
  http: AdtHttpClient,
  safety: SafetyConfig,
  traceId: string,
): Promise<TraceStatement[]> {
  checkOperation(safety, OperationType.Read, 'GetTraceStatements');

  const resp = await http.get(`/sap/bc/adt/runtime/traces/abaptraces/${traceId}/statements`, {
    Accept: 'application/xml',
  });

  return parseTraceStatements(resp.body);
}

/**
 * Get trace database accesses.
 *
 * Returns table access statistics (which tables, how many times, buffered vs not).
 */
export async function getTraceDbAccesses(
  http: AdtHttpClient,
  safety: SafetyConfig,
  traceId: string,
): Promise<TraceDbAccess[]> {
  checkOperation(safety, OperationType.Read, 'GetTraceDbAccesses');

  const resp = await http.get(`/sap/bc/adt/runtime/traces/abaptraces/${traceId}/dbAccesses`, {
    Accept: 'application/xml',
  });

  return parseTraceDbAccesses(resp.body);
}

// ─── Parsers ────────────────────────────────────────────────────────

/**
 * Parse dump listing Atom feed.
 *
 * Each atom:entry contains:
 * - atom:author/atom:name → user
 * - atom:category term="..." label="ABAP runtime error" → error type
 * - atom:category term="..." label="Terminated ABAP program" → program
 * - atom:published → timestamp
 * - atom:link rel="self" href → contains dump ID path
 */
export function parseDumpList(xml: string): DumpEntry[] {
  const parsed = parseXml(xml);
  const entryNodes = findDeepNodes(parsed, 'entry');

  return entryNodes
    .map((entry) => {
      // Author name
      const author = entry.author as Record<string, unknown> | undefined;
      const user = String(author?.name ?? '');

      // Categories: may be single object or array
      const rawCat = entry.category;
      const categories = Array.isArray(rawCat) ? rawCat : rawCat ? [rawCat] : [];
      let error = '';
      let program = '';
      for (const cat of categories as Array<Record<string, unknown>>) {
        const label = String(cat['@_label'] ?? '');
        if (label === 'ABAP runtime error') error = String(cat['@_term'] ?? '');
        if (label === 'Terminated ABAP program') program = String(cat['@_term'] ?? '');
      }

      const timestamp = String(entry.published ?? '');

      // Extract dump ID from self link href
      const links = Array.isArray(entry.link) ? entry.link : entry.link ? [entry.link] : [];
      const selfLink = (links as Array<Record<string, unknown>>).find((l) => String(l['@_rel'] ?? '') === 'self');
      const href = String(selfLink?.['@_href'] ?? '');
      const dumpMatch = href.match(/\/sap\/bc\/adt\/runtime\/dump\/([^"]*)/);
      const id = dumpMatch?.[1] || '';

      return { id, timestamp, user, error, program };
    })
    .filter((e) => e.id);
}

/**
 * Parse dump detail XML metadata + formatted text.
 *
 * The XML response has attributes on the root dump:dump element:
 * - error, author, exception, terminatedProgram, datetime
 *
 * And dump:chapter elements with name, title, category attributes.
 */
export function parseDumpDetail(xml: string, formattedText: string, dumpId: string): DumpDetail {
  const parsed = parseXml(xml);
  const dumps = findDeepNodes(parsed, 'dump');
  const root = dumps[0] ?? {};

  const error = String(root['@_error'] ?? '');
  const exception = String(root['@_exception'] ?? '');
  const program = String(root['@_terminatedProgram'] ?? '');
  const user = String(root['@_author'] ?? '');
  const timestamp = String(root['@_datetime'] ?? '');

  // Find termination link by relation attribute (scope to dump root, not full document)
  const links = findDeepNodes(root, 'link');
  const termLink = links.find(
    (l) => String(l['@_relation'] ?? '') === 'http://www.sap.com/adt/relations/runtime/dump/termination',
  );
  const terminationUri = termLink ? String(termLink['@_uri'] ?? '') || undefined : undefined;

  // Extract chapters (scope to dump root, not full document)
  const chapterNodes = findDeepNodes(root, 'chapter');
  const chapters: DumpChapter[] = chapterNodes.map((ch) => ({
    name: String(ch['@_name'] ?? ''),
    title: String(ch['@_title'] ?? ''),
    category: String(ch['@_category'] ?? ''),
  }));

  return {
    id: dumpId,
    error,
    exception,
    program,
    user,
    timestamp,
    chapters,
    formattedText,
    terminationUri,
  };
}

/**
 * Parse trace listing Atom feed.
 *
 * Trace entries may contain extended attributes in a trc: namespace.
 */
export function parseTraceList(xml: string): TraceEntry[] {
  const parsed = parseXml(xml);
  const entryNodes = findDeepNodes(parsed, 'entry');

  return entryNodes
    .map((entry) => {
      const title = String(entry.title ?? '');
      const timestamp = String(entry.updated ?? entry.published ?? '');

      // Extract trace ID from self link href
      const links = Array.isArray(entry.link) ? entry.link : entry.link ? [entry.link] : [];
      const selfLink = (links as Array<Record<string, unknown>>).find((l) => String(l['@_rel'] ?? '') === 'self');
      const href = String(selfLink?.['@_href'] ?? '');
      const traceMatch = href.match(/\/sap\/bc\/adt\/runtime\/traces\/abaptraces\/([^"]*)/);
      const id = traceMatch?.[1] || '';

      // Extended trace data (namespace-prefixed attributes are stripped by removeNSPrefix)
      const state = entry['@_state'] != null ? String(entry['@_state']) : undefined;
      const objectName = entry['@_objectName'] != null ? String(entry['@_objectName']) : undefined;
      const runtimeStr = entry['@_runtime'] != null ? String(entry['@_runtime']) : undefined;

      return { id, title, timestamp, state, objectName, runtime: runtimeStr ? Number(runtimeStr) : undefined };
    })
    .filter((e) => e.id || e.title);
}

/**
 * Parse trace hitlist XML.
 *
 * Hitlist entries contain procedure names and timing data.
 */
export function parseTraceHitlist(xml: string): TraceHitlistEntry[] {
  const parsed = parseXml(xml);
  const nodes = findDeepNodes(parsed, 'hitListEntry');

  return nodes.map((node) => ({
    callingProgram: String(node['@_callingProgram'] ?? ''),
    calledProgram: String(node['@_calledProgram'] ?? ''),
    hitCount: Number(node['@_hitCount'] ?? 0),
    grossTime: Number(node['@_grossTime'] ?? 0),
    netTime: Number(node['@_traceEventNetTime'] ?? node['@_netTime'] ?? 0),
  }));
}

/**
 * Parse trace statements (call tree) XML.
 */
export function parseTraceStatements(xml: string): TraceStatement[] {
  const parsed = parseXml(xml);
  // Try both tag names: traceStatement and statement
  let nodes = findDeepNodes(parsed, 'traceStatement');
  if (nodes.length === 0) {
    nodes = findDeepNodes(parsed, 'statement');
  }

  return nodes
    .filter((node) => node['@_callLevel'] != null)
    .map((node) => ({
      callLevel: Number(node['@_callLevel'] ?? 0),
      hitCount: Number(node['@_hitCount'] ?? 0),
      isProceduralUnit: String(node['@_isProceduralUnit'] ?? '') === 'true',
      grossTime: Number(node['@_grossTime'] ?? 0),
      description: String(node['@_description'] ?? node['@_name'] ?? ''),
    }));
}

/**
 * Parse trace database accesses XML.
 */
export function parseTraceDbAccesses(xml: string): TraceDbAccess[] {
  const parsed = parseXml(xml);
  // Try both tag names: dbAccess and access
  let nodes = findDeepNodes(parsed, 'dbAccess');
  if (nodes.length === 0) {
    nodes = findDeepNodes(parsed, 'access');
  }

  return nodes
    .filter((node) => node['@_tableName'] != null)
    .map((node) => ({
      tableName: String(node['@_tableName'] ?? ''),
      statement: String(node['@_statement'] ?? ''),
      type: String(node['@_type'] ?? ''),
      totalCount: Number(node['@_totalCount'] ?? 0),
      bufferedCount: Number(node['@_bufferedCount'] ?? 0),
      accessTime: Number(node['@_accessTime'] ?? 0),
    }));
}
