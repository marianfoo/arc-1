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
  const entries: DumpEntry[] = [];
  const entryRegex = /<atom:entry[\s\S]*?<\/atom:entry>/g;

  let match: RegExpExecArray | null;
  while ((match = entryRegex.exec(xml)) !== null) {
    const entry = match[0];

    const user = extractTag(entry, 'atom:name') || '';
    const error = extractAttrValue(entry, 'term', 'ABAP runtime error');
    const program = extractAttrValue(entry, 'term', 'Terminated ABAP program');
    const timestamp = extractTag(entry, 'atom:published') || '';

    // Extract dump ID from the self link (rel="self" type="text/plain")
    const selfMatch = entry.match(/href="(?:adt:\/\/[^/]+)?\/sap\/bc\/adt\/runtime\/dump\/([^"]*)"[^>]*rel="self"/);
    const id = selfMatch?.[1] || '';

    if (id) {
      entries.push({ id, timestamp, user, error, program });
    }
  }

  return entries;
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
  // Extract root attributes
  const error = extractAttrSimple(xml, 'error') || '';
  const exception = extractAttrSimple(xml, 'exception') || '';
  const program = extractAttrSimple(xml, 'terminatedProgram') || '';
  const user = extractAttrSimple(xml, 'author') || '';
  const timestamp = extractAttrSimple(xml, 'datetime') || '';

  // Extract termination source URI
  const termMatch = xml.match(
    /relation="http:\/\/www\.sap\.com\/adt\/relations\/runtime\/dump\/termination"[^>]*uri="([^"]*)"/,
  );
  const terminationUri = termMatch?.[1];

  // Extract chapters
  const chapters: DumpChapter[] = [];
  const chapterRegex = /<dump:chapter[^>]*name="([^"]*)"[^>]*title="([^"]*)"[^>]*category="([^"]*)"/g;
  let chMatch: RegExpExecArray | null;
  while ((chMatch = chapterRegex.exec(xml)) !== null) {
    chapters.push({
      name: chMatch[1]!,
      title: chMatch[2]!,
      category: chMatch[3]!,
    });
  }

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
  const entries: TraceEntry[] = [];
  const entryRegex = /<atom:entry[\s\S]*?<\/atom:entry>/g;

  let match: RegExpExecArray | null;
  while ((match = entryRegex.exec(xml)) !== null) {
    const entry = match[0];

    const title = extractTag(entry, 'atom:title') || '';
    const timestamp = extractTag(entry, 'atom:updated') || extractTag(entry, 'atom:published') || '';

    // Extract trace ID from self link
    const selfMatch = entry.match(
      /href="(?:adt:\/\/[^/]+)?\/sap\/bc\/adt\/runtime\/traces\/abaptraces\/([^"]*)"[^>]*rel="self"/,
    );
    const id = selfMatch?.[1] || '';

    // Extended trace data (namespace-prefixed attributes)
    const state = extractAttrSimple(entry, 'state');
    const objectName = extractAttrSimple(entry, 'objectName');
    const runtimeStr = extractAttrSimple(entry, 'runtime');

    if (id || title) {
      entries.push({
        id,
        title,
        timestamp,
        state: state || undefined,
        objectName: objectName || undefined,
        runtime: runtimeStr ? Number(runtimeStr) : undefined,
      });
    }
  }

  return entries;
}

/**
 * Parse trace hitlist XML.
 *
 * Hitlist entries contain procedure names and timing data.
 */
export function parseTraceHitlist(xml: string): TraceHitlistEntry[] {
  const entries: TraceHitlistEntry[] = [];
  const entryRegex =
    /<hitListEntry[^>]*callingProgram="([^"]*)"[^>]*calledProgram="([^"]*)"[^>]*hitCount="(\d+)"[^>]*grossTime="(\d+)"[^>]*(?:traceEventNetTime|netTime)="(\d+)"/g;

  let match: RegExpExecArray | null;
  while ((match = entryRegex.exec(xml)) !== null) {
    entries.push({
      callingProgram: match[1]!,
      calledProgram: match[2]!,
      hitCount: Number(match[3]),
      grossTime: Number(match[4]),
      netTime: Number(match[5]),
    });
  }

  // Fallback: try generic attribute extraction if regex didn't match
  if (entries.length === 0) {
    const genericRegex = /<(?:hitListEntry|entry)[^>]+>/g;
    let gMatch: RegExpExecArray | null;
    while ((gMatch = genericRegex.exec(xml)) !== null) {
      const tag = gMatch[0];
      const callingProgram = extractAttrSimple(tag, 'callingProgram') || '';
      const calledProgram = extractAttrSimple(tag, 'calledProgram') || '';
      const hitCount = extractAttrSimple(tag, 'hitCount');
      if (callingProgram || calledProgram) {
        entries.push({
          callingProgram,
          calledProgram,
          hitCount: hitCount ? Number(hitCount) : 0,
          grossTime: Number(extractAttrSimple(tag, 'grossTime') || '0'),
          netTime: Number(extractAttrSimple(tag, 'traceEventNetTime') || extractAttrSimple(tag, 'netTime') || '0'),
        });
      }
    }
  }

  return entries;
}

/**
 * Parse trace statements (call tree) XML.
 */
export function parseTraceStatements(xml: string): TraceStatement[] {
  const entries: TraceStatement[] = [];

  // Extract self-closing tags, handling > inside attribute values
  for (const tag of extractSelfClosingTags(xml, 'traceStatement', 'statement')) {
    const callLevel = extractAttrSimple(tag, 'callLevel');
    if (callLevel === null) continue;

    entries.push({
      callLevel: Number(callLevel),
      hitCount: Number(extractAttrSimple(tag, 'hitCount') || '0'),
      isProceduralUnit: extractAttrSimple(tag, 'isProceduralUnit') === 'true',
      grossTime: Number(extractAttrSimple(tag, 'grossTime') || '0'),
      description: extractAttrSimple(tag, 'description') || extractAttrSimple(tag, 'name') || '',
    });
  }

  return entries;
}

/**
 * Parse trace database accesses XML.
 */
export function parseTraceDbAccesses(xml: string): TraceDbAccess[] {
  const entries: TraceDbAccess[] = [];
  const entryRegex = /<(?:dbAccess|access)[^>]*tableName="([^"]*)"[^>]*/g;

  let match: RegExpExecArray | null;
  while ((match = entryRegex.exec(xml)) !== null) {
    const tag = xml.slice(match.index, xml.indexOf('>', match.index + match[0].length) + 1);
    entries.push({
      tableName: match[1]!,
      statement: extractAttrSimple(tag, 'statement') || '',
      type: extractAttrSimple(tag, 'type') || '',
      totalCount: Number(extractAttrSimple(tag, 'totalCount') || '0'),
      bufferedCount: Number(extractAttrSimple(tag, 'bufferedCount') || '0'),
      accessTime: Number(extractAttrSimple(tag, 'accessTime') || '0'),
    });
  }

  return entries;
}

// ─── Helpers ────────────────────────────────────────────────────────

/**
 * Extract self-closing XML tags by name, handling > inside attribute values.
 * Standard regex [^>]* breaks on attributes like description="CL_TEST=>MAIN".
 */
function extractSelfClosingTags(xml: string, ...tagNames: string[]): string[] {
  const tags: string[] = [];
  for (const tagName of tagNames) {
    let searchFrom = 0;
    while (true) {
      const startIdx = xml.indexOf(`<${tagName} `, searchFrom);
      if (startIdx === -1) break;

      // Find the closing /> by scanning past attribute values
      let i = startIdx + tagName.length + 2;
      while (i < xml.length) {
        if (xml[i] === '"') {
          // Skip quoted attribute value (may contain >)
          i++;
          while (i < xml.length && xml[i] !== '"') i++;
          i++; // skip closing quote
        } else if (xml[i] === '/' && xml[i + 1] === '>') {
          tags.push(xml.slice(startIdx, i + 2));
          i += 2;
          break;
        } else if (xml[i] === '>' && xml[i - 1] !== '/') {
          // Opening tag without self-close; skip
          i++;
          break;
        } else {
          i++;
        }
      }
      searchFrom = i;
    }
  }
  return tags;
}

/** Extract text content between opening and closing XML tags */
function extractTag(xml: string, tagName: string): string | null {
  const regex = new RegExp(`<${tagName}[^>]*>([^<]*)</${tagName}>`);
  const match = xml.match(regex);
  return match?.[1] ?? null;
}

/** Extract attribute value from an element where another attribute has a specific value */
function extractAttrValue(xml: string, attrName: string, labelValue: string): string {
  // Match: attrName="VALUE" ... label="labelValue" or label="labelValue" ... attrName="VALUE"
  const regex = new RegExp(`${attrName}="([^"]*)"[^>]*label="${labelValue}"`);
  const match = xml.match(regex);
  return match?.[1] || '';
}

/** Extract a simple attribute value by name */
function extractAttrSimple(xml: string, attr: string): string | null {
  const regex = new RegExp(`(?:^|\\s|:)${attr}="([^"]*)"`);
  const match = xml.match(regex);
  return match?.[1] ?? null;
}
