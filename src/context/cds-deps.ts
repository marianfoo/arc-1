/**
 * CDS DDL dependency and element extraction.
 *
 * Regex-based parser for CDS Data Definition Language source code.
 * Extracts:
 * - Data sources (FROM, JOIN)
 * - Associations and compositions
 * - Projection bases
 * - Field/element listings from the SELECT projection
 *
 * Used by SAPContext (DDLS type) and SAPRead (DDLS include="elements").
 */

import type { CdsDependency } from './types.js';

/**
 * Strip comments and string literals from CDS DDL source to prevent false matches.
 */
function stripCommentsAndStrings(source: string): string {
  // Remove block comments /* ... */
  let result = source.replace(/\/\*[\s\S]*?\*\//g, ' ');
  // Remove line comments // ...
  result = result.replace(/\/\/.*$/gm, '');
  // Remove string literals 'value'
  result = result.replace(/'[^']*'/g, "''");
  return result;
}

/**
 * Extract dependencies from CDS DDL source.
 *
 * Identifies data sources, associations, compositions, and projection bases
 * referenced in the CDS entity definition.
 *
 * @param ddlSource - Raw CDS DDL source code
 * @returns Deduplicated list of CDS dependencies
 */
export function extractCdsDependencies(ddlSource: string): CdsDependency[] {
  const cleaned = stripCommentsAndStrings(ddlSource);
  const deps: CdsDependency[] = [];
  const seen = new Set<string>();

  // Pattern for entity names: word chars, forward slashes (namespaced), underscores
  // Matches: zsalesorder, ZI_ORDER, /DMO/I_TRAVEL
  const namePattern = '[\\w/]+';

  // 1. select from <source> [as <alias>]
  //    Also handles: as select from, as projection on
  const selectFromRe = new RegExp(`\\bselect\\s+from\\s+(${namePattern})`, 'gi');
  for (const match of cleaned.matchAll(selectFromRe)) {
    addDep(deps, seen, match[1]!, 'data_source');
  }

  // 2. projection on <source>
  const projectionRe = new RegExp(`\\bprojection\\s+on\\s+(${namePattern})`, 'gi');
  for (const match of cleaned.matchAll(projectionRe)) {
    addDep(deps, seen, match[1]!, 'projection_base');
  }

  // 3. join <source> — inner join, left outer join, right outer join, cross join
  const joinRe = new RegExp(`\\bjoin\\s+(${namePattern})`, 'gi');
  for (const match of cleaned.matchAll(joinRe)) {
    addDep(deps, seen, match[1]!, 'data_source');
  }

  // 4. association [...] to <source>
  const assocRe = new RegExp(`\\bassociation\\s+(?:\\[[^\\]]*\\]\\s+)?to\\s+(${namePattern})`, 'gi');
  for (const match of cleaned.matchAll(assocRe)) {
    addDep(deps, seen, match[1]!, 'association');
  }

  // 5. composition [...] of <source>
  const compRe = new RegExp(`\\bcomposition\\s+(?:\\[[^\\]]*\\]\\s+)?of\\s+(${namePattern})`, 'gi');
  for (const match of cleaned.matchAll(compRe)) {
    addDep(deps, seen, match[1]!, 'composition');
  }

  return deps;
}

/** Add a dependency if not already seen (case-insensitive dedup) */
function addDep(deps: CdsDependency[], seen: Set<string>, name: string, kind: CdsDependency['kind']): void {
  const upper = name.toUpperCase();
  if (seen.has(upper)) return;
  seen.add(upper);
  deps.push({ name, kind });
}

/**
 * Extract a structured element listing from CDS DDL source.
 *
 * Parses the SELECT projection list between { and } to produce a
 * human-readable, LLM-friendly element listing.
 *
 * @param ddlSource - Raw CDS DDL source code
 * @param entityName - Entity name for the header
 * @returns Formatted element listing text
 */
export function extractCdsElements(ddlSource: string, entityName: string): string {
  const lines: string[] = [];
  lines.push(`=== ${entityName} elements ===`);

  // Find the projection block between { and }
  // Use the original source (not stripped) to preserve field expressions
  const braceStart = ddlSource.indexOf('{');
  const braceEnd = ddlSource.lastIndexOf('}');
  if (braceStart === -1 || braceEnd === -1 || braceEnd <= braceStart) {
    return lines.join('\n');
  }

  const projectionBlock = ddlSource.slice(braceStart + 1, braceEnd);

  // Split into field expressions by comma, but respect nested parens and case blocks
  const fields = splitFieldExpressions(projectionBlock);

  for (const fieldExpr of fields) {
    const trimmed = fieldExpr.trim();
    if (!trimmed) continue;

    const element = parseFieldExpression(trimmed);
    if (element) {
      lines.push(element);
    }
  }

  return lines.join('\n');
}

/**
 * Split the projection block into individual field expressions,
 * respecting nested parentheses and case...end blocks.
 */
function splitFieldExpressions(block: string): string[] {
  const fields: string[] = [];
  let current = '';
  let parenDepth = 0;
  let caseDepth = 0;

  // Tokenize by character, tracking nesting
  const tokens = block.split('\n');
  const flatBlock = tokens.join(' ');

  for (let i = 0; i < flatBlock.length; i++) {
    const ch = flatBlock[i]!;

    if (ch === '(') parenDepth++;
    if (ch === ')') parenDepth--;

    // Track case...end blocks
    const remaining = flatBlock.slice(i).toLowerCase();
    if (remaining.startsWith('case ') || remaining.startsWith('case\n')) {
      caseDepth++;
    }
    if (remaining.startsWith('end ') || remaining.startsWith('end,') || remaining === 'end') {
      caseDepth = Math.max(0, caseDepth - 1);
    }

    if (ch === ',' && parenDepth === 0 && caseDepth === 0) {
      fields.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) {
    fields.push(current);
  }

  return fields;
}

/**
 * Parse a single field expression into a formatted element line.
 */
function parseFieldExpression(expr: string): string | null {
  // Normalize whitespace
  const normalized = expr.replace(/\s+/g, ' ').trim();
  if (!normalized) return null;

  // Check for key prefix
  const isKey = /^\s*key\b/i.test(normalized);
  const withoutKey = normalized.replace(/^\s*key\s+/i, '').trim();

  // Check if it's an association exposure (starts with _)
  if (/^_\w+/.test(withoutKey)) {
    const assocName = withoutKey.split(/[\s,]/)[0]!;
    const keyPrefix = isKey ? 'key ' : '    ';
    return `${keyPrefix}${assocName.padEnd(30)} [association]`;
  }

  // Check for "as Alias" at the end to get the field name
  const aliasMatch = withoutKey.match(/\bas\s+(\w+)\s*$/i);
  const fieldName = aliasMatch ? aliasMatch[1]! : withoutKey.split(/[\s.(]/)[0]!;

  if (!fieldName) return null;

  // Determine the kind of expression
  const kind = classifyExpression(withoutKey, aliasMatch ? withoutKey.slice(0, aliasMatch.index).trim() : '');

  const keyPrefix = isKey ? 'key ' : '    ';
  const kindLabel = kind ? ` [${kind}]` : '';
  return `${keyPrefix}${fieldName.padEnd(30)}${kindLabel}`;
}

/**
 * Classify what kind of expression produces this field.
 */
function classifyExpression(fullExpr: string, beforeAlias: string): string {
  const lower = (beforeAlias || fullExpr).toLowerCase();

  if (/\bcase\b/.test(lower)) return 'case';
  if (/\bcast\s*\(/.test(lower)) return 'cast';
  if (/\bcoalesce\s*\(/.test(lower)) return 'coalesce';
  if (/\bconcat\s*\(/.test(lower)) return 'concat';
  if (/\bcurrency_conversion\s*\(/.test(lower)) return 'currency_conversion';
  if (/\bunit_conversion\s*\(/.test(lower)) return 'unit_conversion';
  // Arithmetic: contains +, -, *, / between word chars (not in function calls)
  if (/\w\s*[-+*/]\s*\w/.test(beforeAlias || fullExpr)) return 'calculated';
  // Simple field reference: source.field or just field_name — no label needed
  return '';
}
