/**
 * XML parser for SAP ADT responses.
 *
 * SAP ADT returns XML with multiple namespace conventions:
 * - adtcore: (http://www.sap.com/adt/core) — object references, search results
 * - asx: (http://www.sap.com/abapxml) — table contents, package structure
 * - atom: (http://www.w3.org/2005/Atom) — feed entries
 *
 * We use fast-xml-parser v5 with removeNSPrefix to strip namespaces,
 * since we know the expected structure and don't need namespace dispatch.
 *
 * Key design choice: parse to plain objects, then map to our types.
 * This decouples the XML format from our internal types, making it
 * easier to handle SAP's inconsistent XML across different endpoints.
 */

import { XMLParser } from 'fast-xml-parser';
import type { AdtSearchResult } from './types.js';

/** Shared parser instance — configured for ADT XML conventions */
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true, // Strip adtcore:, asx:, etc.
  isArray: (name) => {
    // These elements can appear 0-N times; force array even for single item
    return [
      'objectReference',
      'entry',
      'link',
      'objectStructure',
      'field',
      'functionModule',
      'COLUMN',
      'columns',
      'DATA',
      'data',
      'SEU_ADT_REPOSITORY_OBJ_NODE',
      'component',
      'objectStructureElement',
      'task',
    ].includes(name);
  },
  parseAttributeValue: false, // Keep attributes as strings
  parseTagValue: false, // Keep tag values as strings (prevents "001" → 1)
});

/** Parse raw XML string to a JS object */
export function parseXml(xml: string): Record<string, unknown> {
  return parser.parse(xml) as Record<string, unknown>;
}

/**
 * Parse ADT search results XML.
 *
 * Expected format:
 * <adtcore:objectReferences>
 *   <adtcore:objectReference uri="..." type="PROG/P" name="ZTEST" packageName="$TMP" description="..."/>
 * </adtcore:objectReferences>
 */
export function parseSearchResults(xml: string): AdtSearchResult[] {
  const parsed = parseXml(xml);
  const refs = getNestedArray(parsed, 'objectReferences', 'objectReference');
  return refs.map((ref: Record<string, unknown>) => ({
    objectType: String(ref['@_type'] ?? ''),
    objectName: String(ref['@_name'] ?? ''),
    description: String(ref['@_description'] ?? ''),
    packageName: String(ref['@_packageName'] ?? ''),
    uri: String(ref['@_uri'] ?? ''),
  }));
}

/**
 * Parse ADT package contents (nodestructure response).
 *
 * Expected format:
 * <asx:abap><asx:values><DATA><TREE_CONTENT>
 *   <SEU_ADT_REPOSITORY_OBJ_NODE>
 *     <OBJECT_TYPE>PROG/P</OBJECT_TYPE>
 *     <OBJECT_NAME>ZTEST</OBJECT_NAME>
 *     <DESCRIPTION>...</DESCRIPTION>
 *   </SEU_ADT_REPOSITORY_OBJ_NODE>
 * </TREE_CONTENT></DATA></asx:values></asx:abap>
 */
export function parsePackageContents(
  xml: string,
): Array<{ type: string; name: string; description: string; uri: string }> {
  const parsed = parseXml(xml);
  // After namespace stripping, asx:abap → abap, asx:values → values
  // fast-xml-parser structure depends on XML depth — use recursive finder as fallback
  let nodes = getDeepArray(parsed, ['abap', 'values', 'DATA', 'TREE_CONTENT', 'SEU_ADT_REPOSITORY_OBJ_NODE']);
  if (nodes.length === 0) {
    nodes = findDeepNodes(parsed, 'SEU_ADT_REPOSITORY_OBJ_NODE');
  }
  return nodes.map((node: Record<string, unknown>) => ({
    type: String(node.OBJECT_TYPE ?? ''),
    name: String(node.OBJECT_NAME ?? ''),
    description: String(node.DESCRIPTION ?? ''),
    uri: String(node.OBJECT_URI ?? ''),
  }));
}

/**
 * Parse table contents (datapreview response).
 *
 * SAP ADT returns two possible formats for data preview:
 *
 * Format 1 (older/asx): COLUMNS/COLUMN/METADATA + DATASET/DATA
 * Format 2 (newer/dataPreview namespace): columns/metadata + dataSet/data
 *
 * After namespace stripping, both converge but with different casing.
 * We try both patterns with fallback.
 */
export function parseTableContents(xml: string): { columns: string[]; rows: Record<string, string>[] } {
  const parsed = parseXml(xml);

  // Try old format first: abap > values > COLUMNS > COLUMN
  let columns = getDeepArray(parsed, ['abap', 'values', 'COLUMNS', 'COLUMN']);
  if (columns.length === 0) {
    columns = findDeepNodes(parsed, 'COLUMN');
  }

  // New format: dataPreview:columns → "columns" after NS strip
  // Each "columns" element contains "metadata" and "dataSet"
  if (columns.length === 0) {
    columns = findDeepNodes(parsed, 'columns');
  }

  const colNames: string[] = [];
  const colData: string[][] = [];

  for (const col of columns) {
    // Old format: METADATA/@_name, DATASET/DATA
    // New format: metadata/@_name, dataSet/data
    const metadata = (col.METADATA ?? col.metadata) as Record<string, unknown> | undefined;
    const name = String(metadata?.['@_name'] ?? metadata?.['@_dataPreview:name'] ?? '');
    if (!name) continue; // skip non-column entries like totalRows, name, etc.
    colNames.push(name);

    const dataset = (col.DATASET ?? col.dataSet) as Record<string, unknown> | undefined;
    const rawData = dataset?.DATA ?? dataset?.data;
    const data = Array.isArray(rawData) ? rawData.map(String) : rawData != null ? [String(rawData)] : [];
    colData.push(data as string[]);
  }

  // Pivot column-oriented to row-oriented
  const rowCount = colData.length > 0 ? colData[0]?.length : 0;
  const rows: Record<string, string>[] = [];

  for (let i = 0; i < rowCount; i++) {
    const row: Record<string, string> = {};
    for (let j = 0; j < colNames.length; j++) {
      row[colNames[j]!] = colData[j]?.[i] ?? '';
    }
    rows.push(row);
  }

  return { columns: colNames, rows };
}

/**
 * Parse installed components response.
 *
 * SAP returns an Atom feed for /sap/bc/adt/system/components:
 *   <atom:feed>
 *     <atom:entry>
 *       <atom:id>SAP_BASIS</atom:id>
 *       <atom:title>753;SAPKB75308;0008;SAP Basis Component</atom:title>
 *     </atom:entry>
 *   </atom:feed>
 *
 * The title field is semicolon-separated: release;sp_name;sp_level;description
 */
export function parseInstalledComponents(xml: string): Array<{ name: string; release: string; description: string }> {
  const parsed = parseXml(xml);

  // After removeNSPrefix: atom:feed → feed, atom:entry → entry
  const entries = getNestedArray(parsed, 'feed', 'entry');
  return entries.map((entry: Record<string, unknown>) => {
    const name = String(entry.id ?? '');
    const title = String(entry.title ?? '');
    // Title format: "release;sp_name;sp_level;description"
    const parts = title.split(';');
    return {
      name,
      release: parts[0]?.trim() ?? '',
      description: parts[3]?.trim() ?? title,
    };
  });
}

/**
 * Parse function group structure.
 *
 * <group name="ZGROUP" type="FUGR/F">
 *   <functionModule name="ZFUNC" type="FUNC/FM"/>
 * </group>
 */
export function parseFunctionGroup(xml: string): { name: string; functions: string[] } {
  const parsed = parseXml(xml);
  const group = (parsed.group ?? {}) as Record<string, unknown>;
  const fmods = Array.isArray(group.functionModule) ? group.functionModule : [];
  return {
    name: String(group['@_name'] ?? ''),
    functions: fmods.map((fm: Record<string, unknown>) => String(fm['@_name'] ?? '')),
  };
}

/**
 * Parse ADT system discovery XML into structured info.
 *
 * The discovery response is an Atom service document that lists available
 * ADT workspaces/collections. We extract collection titles and hrefs
 * to determine what capabilities the SAP system has.
 *
 * The authenticated username is passed in from the client config since
 * the discovery XML doesn't directly contain "you are logged in as X".
 */
export function parseSystemInfo(
  xml: string,
  username: string,
): { user: string; collections: Array<{ title: string; href: string }> } {
  const parsed = parseXml(xml);

  // Atom service document: service > workspace > collection
  const collections: Array<{ title: string; href: string }> = [];

  // After namespace stripping: app:service → service, app:workspace → workspace, app:collection → collection
  const service = (parsed.service ?? parsed['service'] ?? {}) as Record<string, unknown>;
  const workspaces = Array.isArray(service.workspace)
    ? service.workspace
    : service.workspace
      ? [service.workspace]
      : [];

  for (const ws of workspaces as Array<Record<string, unknown>>) {
    const cols = Array.isArray(ws.collection) ? ws.collection : ws.collection ? [ws.collection] : [];
    for (const col of cols as Array<Record<string, unknown>>) {
      const title = String(col.title ?? col['@_title'] ?? '');
      const href = String(col['@_href'] ?? '');
      if (title || href) {
        collections.push({ title, href });
      }
    }
  }

  return { user: username ?? '', collections };
}

// ─── Helpers ────────────────────────────────────────────────────────

/** Safely get a nested array from parsed XML */
function getNestedArray(obj: Record<string, unknown>, parent: string, child: string): Array<Record<string, unknown>> {
  const parentObj = obj[parent] as Record<string, unknown> | undefined;
  if (!parentObj) return [];
  const arr = parentObj[child];
  if (Array.isArray(arr)) return arr as Array<Record<string, unknown>>;
  if (arr && typeof arr === 'object') return [arr as Record<string, unknown>];
  return [];
}

/** Recursively find an array by key name, anywhere in the object tree */
export function findDeepNodes(obj: unknown, key: string): Array<Record<string, unknown>> {
  if (!obj || typeof obj !== 'object') return [];
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const found = findDeepNodes(item, key);
      if (found.length > 0) return found;
    }
    return [];
  }
  const record = obj as Record<string, unknown>;
  if (key in record) {
    const val = record[key];
    if (Array.isArray(val)) return val as Array<Record<string, unknown>>;
    if (val && typeof val === 'object') return [val as Record<string, unknown>];
  }
  for (const val of Object.values(record)) {
    const found = findDeepNodes(val, key);
    if (found.length > 0) return found;
  }
  return [];
}

/** Safely traverse a deep path and return an array at the end */
function getDeepArray(obj: Record<string, unknown>, path: string[]): Array<Record<string, unknown>> {
  let current: unknown = obj;
  for (const key of path.slice(0, -1)) {
    if (current && typeof current === 'object' && !Array.isArray(current)) {
      current = (current as Record<string, unknown>)[key];
    } else {
      return [];
    }
  }
  const lastKey = path[path.length - 1]!;
  if (current && typeof current === 'object' && !Array.isArray(current)) {
    const arr = (current as Record<string, unknown>)[lastKey];
    if (Array.isArray(arr)) return arr as Array<Record<string, unknown>>;
    if (arr && typeof arr === 'object') return [arr as Record<string, unknown>];
  }
  return [];
}
