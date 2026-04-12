/**
 * Code intelligence for SAP ADT.
 *
 * - FindDefinition: navigate to symbol definition
 * - FindReferences: where-used analysis
 * - GetCompletion: code completion proposals
 */

import type { AdtHttpClient } from './http.js';
import { checkOperation, OperationType, type SafetyConfig } from './safety.js';
import { escapeXmlAttr, findDeepNodes, parseXml } from './xml-parser.js';

/** Definition navigation result */
export interface DefinitionResult {
  uri: string;
  type: string;
  name: string;
  line?: number;
  column?: number;
}

/** Reference result */
export interface ReferenceResult {
  uri: string;
  type: string;
  name: string;
  line: number;
  column: number;
}

/** Completion proposal */
export interface CompletionProposal {
  text: string;
  description: string;
  type: string;
}

/** Available object type from Where-Used scope discovery */
export interface WhereUsedScopeEntry {
  objectType: string;
  objectTypeDescription: string;
  count: number;
}

/** Where-Used scope — available object types and their counts */
export interface WhereUsedScope {
  entries: WhereUsedScopeEntry[];
}

/** Detailed Where-Used result with additional fields (line, snippet, package) */
export interface WhereUsedResult {
  uri: string;
  type: string;
  name: string;
  line: number;
  column: number;
  packageName: string;
  snippet: string;
  objectDescription: string;
}

/** Navigate to definition of a symbol */
export async function findDefinition(
  http: AdtHttpClient,
  safety: SafetyConfig,
  sourceUrl: string,
  line: number,
  column: number,
  source: string,
): Promise<DefinitionResult | null> {
  checkOperation(safety, OperationType.Intelligence, 'FindDefinition');

  const resp = await http.post(
    `/sap/bc/adt/navigation/target?uri=${encodeURIComponent(sourceUrl)}&line=${line}&column=${column}`,
    source,
    'text/plain',
    { Accept: 'application/xml' },
  );

  const parsed = parseXml(resp.body);
  const nodes = findDeepNodes(parsed, 'navigation');
  const nav = nodes[0] ?? (parsed.navigation as Record<string, unknown> | undefined);
  if (!nav?.['@_uri']) return null;

  return {
    uri: String(nav['@_uri']),
    type: String(nav['@_type'] ?? ''),
    name: String(nav['@_name'] ?? ''),
  };
}

/** Find all references to a symbol */
export async function findReferences(
  http: AdtHttpClient,
  safety: SafetyConfig,
  objectUrl: string,
): Promise<ReferenceResult[]> {
  checkOperation(safety, OperationType.Intelligence, 'FindReferences');

  const resp = await http.get(
    `/sap/bc/adt/repository/informationsystem/usageReferences?uri=${encodeURIComponent(objectUrl)}`,
    { Accept: 'application/xml' },
  );

  const parsed = parseXml(resp.body);
  const refs = findDeepNodes(parsed, 'objectReference');
  return refs.map((ref) => ({
    uri: String(ref['@_uri'] ?? ''),
    type: String(ref['@_type'] ?? ''),
    name: String(ref['@_name'] ?? ''),
    line: 0,
    column: 0,
  }));
}

/**
 * Get available object types for Where-Used analysis (scope discovery).
 *
 * Step 1 of the 2-step scope-based Where-Used API:
 * POST to .../usageReferences/scope with the object URI in the request body.
 * Returns available object types and their reference counts.
 */
export async function getWhereUsedScope(
  http: AdtHttpClient,
  safety: SafetyConfig,
  objectUrl: string,
): Promise<WhereUsedScope> {
  checkOperation(safety, OperationType.Intelligence, 'FindWhereUsed');

  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<usageReferences:scopeRequest xmlns:usageReferences="http://www.sap.com/adt/ris/usageReferences">',
    `  <usageReferences:objectReference uri="${escapeXmlAttr(objectUrl)}"/>`,
    '</usageReferences:scopeRequest>',
  ].join('\n');

  const resp = await http.post(
    '/sap/bc/adt/repository/informationsystem/usageReferences/scope',
    body,
    'application/xml',
    { Accept: 'application/xml' },
  );

  const parsed = parseXml(resp.body);
  const entries: WhereUsedScopeEntry[] = [];

  // Scope response has objectType entries with type, description, and count
  const scopeNodes = findDeepNodes(parsed, 'objectType');
  for (const node of scopeNodes) {
    entries.push({
      objectType: String(node['@_type'] ?? node['@_name'] ?? ''),
      objectTypeDescription: String(node['@_description'] ?? ''),
      count: Number(node['@_count'] ?? node['@_numberOfResults'] ?? 0),
    });
  }

  return { entries };
}

/**
 * Find Where-Used references via the ADT usageReferences endpoint.
 *
 * POST to .../usageReferences with the object URI as both a query parameter
 * and in the XML request body. SAP requires the SAP-specific content types:
 * - Content-Type: application/vnd.sap.adt.repository.usagereferences.request.v1+xml
 * - Accept: application/vnd.sap.adt.repository.usagereferences.result.v1+xml
 *
 * The response uses a tree structure with `referencedObject` > `adtObject` elements.
 * If objectType is provided, it's included in the request body as a filter.
 */
export async function findWhereUsed(
  http: AdtHttpClient,
  safety: SafetyConfig,
  objectUrl: string,
  objectType?: string,
): Promise<WhereUsedResult[]> {
  checkOperation(safety, OperationType.Intelligence, 'FindWhereUsed');

  const typeFilter = objectType ? `\n  <usageReferences:objectTypeFilter value="${escapeXmlAttr(objectType)}"/>` : '';

  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<usageReferences:usageReferenceRequest xmlns:usageReferences="http://www.sap.com/adt/ris/usageReferences">',
    `  <usageReferences:objectReference uri="${escapeXmlAttr(objectUrl)}"/>${typeFilter}`,
    '</usageReferences:usageReferenceRequest>',
  ].join('\n');

  const url = `/sap/bc/adt/repository/informationsystem/usageReferences?uri=${encodeURIComponent(objectUrl)}`;
  const resp = await http.post(url, body, 'application/vnd.sap.adt.repository.usagereferences.request.v1+xml', {
    Accept: 'application/vnd.sap.adt.repository.usagereferences.result.v1+xml',
  });

  const parsed = parseXml(resp.body);
  const results: WhereUsedResult[] = [];

  // Response uses referencedObject > adtObject tree structure
  const refs = findDeepNodes(parsed, 'referencedObject');
  for (const ref of refs) {
    const adtObj = (ref.adtObject ?? {}) as Record<string, unknown>;
    const pkgRef = (adtObj.packageRef ?? {}) as Record<string, unknown>;
    results.push({
      uri: String(ref['@_uri'] ?? ''),
      type: String(adtObj['@_type'] ?? ''),
      name: String(adtObj['@_name'] ?? ''),
      line: 0,
      column: 0,
      packageName: String(pkgRef['@_name'] ?? ''),
      snippet: '',
      objectDescription: String(adtObj['@_description'] ?? ''),
    });
  }

  return results;
}

/** Get code completion proposals */
export async function getCompletion(
  http: AdtHttpClient,
  safety: SafetyConfig,
  sourceUrl: string,
  line: number,
  column: number,
  source: string,
): Promise<CompletionProposal[]> {
  checkOperation(safety, OperationType.Intelligence, 'GetCompletion');

  const resp = await http.post(
    `/sap/bc/adt/abapsource/codecompletion/proposals?uri=${encodeURIComponent(sourceUrl)}&line=${line}&column=${column}`,
    source,
    'text/plain',
    { Accept: 'application/xml' },
  );

  const parsed = parseXml(resp.body);
  const nodes = findDeepNodes(parsed, 'proposal');
  return nodes.map((node) => ({
    text: String(node['@_text'] ?? ''),
    description: String(node['@_description'] ?? ''),
    type: String(node['@_type'] ?? ''),
  }));
}
