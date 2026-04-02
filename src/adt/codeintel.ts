/**
 * Code intelligence for SAP ADT.
 *
 * - FindDefinition: navigate to symbol definition
 * - FindReferences: where-used analysis
 * - GetCompletion: code completion proposals
 */

import type { AdtHttpClient } from './http.js';
import { checkOperation, OperationType, type SafetyConfig } from './safety.js';

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

  // Parse navigation response
  const uriMatch = resp.body.match(/uri="([^"]*)"/);
  const typeMatch = resp.body.match(/type="([^"]*)"/);
  const nameMatch = resp.body.match(/name="([^"]*)"/);

  if (!uriMatch) return null;

  return {
    uri: uriMatch[1]!,
    type: typeMatch?.[1] ?? '',
    name: nameMatch?.[1] ?? '',
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

  // Parse reference results
  const results: ReferenceResult[] = [];
  const refRegex = /uri="([^"]*)"[^>]*type="([^"]*)"[^>]*name="([^"]*)"/g;
  let match: RegExpExecArray | null;
  while ((match = refRegex.exec(resp.body)) !== null) {
    results.push({
      uri: match[1]!,
      type: match[2]!,
      name: match[3]!,
      line: 0,
      column: 0,
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

  // Parse completion proposals
  const proposals: CompletionProposal[] = [];
  const propRegex = /<proposal[^>]*text="([^"]*)"[^>]*description="([^"]*)"[^>]*type="([^"]*)"/g;
  let match: RegExpExecArray | null;
  while ((match = propRegex.exec(resp.body)) !== null) {
    proposals.push({
      text: match[1]!,
      description: match[2]!,
      type: match[3]!,
    });
  }

  return proposals;
}
