/**
 * ADT Refactoring API — Change Package Assignment.
 *
 * Moves ABAP objects between packages via the ADT refactoring endpoint.
 * Two-step flow: preview (validate + discover transport) then execute.
 *
 * Endpoint: POST /sap/bc/adt/refactorings
 *   - Preview: ?step=preview&rel=http://www.sap.com/adt/relations/refactoring/changepackage
 *   - Execute: ?step=execute
 *
 * Preview uses "wrapped" XML (outer changePackageRefactoring element).
 * Execute uses "unwrapped" XML (just genericRefactoring element).
 */

import type { AdtHttpClient } from './http.js';
import { checkOperation, OperationType, type SafetyConfig } from './safety.js';

/** Parameters for a change-package refactoring operation */
export interface ChangePackageParams {
  /** ADT URI of the object (e.g., "/sap/bc/adt/ddic/ddl/sources/zarc1_test") */
  objectUri: string;
  /** ADT object type (e.g., "DDLS/DF", "CLAS/OC", "PROG/P") */
  objectType: string;
  /** Object name (e.g., "ZARC1_TEST") */
  objectName: string;
  /** Current package (e.g., "$TMP") */
  oldPackage: string;
  /** Target package (e.g., "Z_MY_PACKAGE") */
  newPackage: string;
  /** Optional transport request number */
  transport?: string;
  /** Object description (defaults to "ABAP Object") */
  description?: string;
}

/** Result of a change-package operation */
export interface ChangePackageResult {
  /** Transport used for the move (if any) */
  transport?: string;
}

const NS_CHANGEPACKAGE = 'http://www.sap.com/adt/refactoring/changepackagerefactoring';
const NS_GENERIC = 'http://www.sap.com/adt/refactoring/genericrefactoring';
const NS_ADTCORE = 'http://www.sap.com/adt/core';

/** Escape XML special characters */
function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Build the inner genericRefactoring XML fragment (shared by preview and execute) */
function buildGenericRefactoringInner(params: ChangePackageParams): string {
  const desc = escapeXml(params.description ?? 'ABAP Object');
  const transport = params.transport ?? '';
  return [
    `<generic:title>Change Package</generic:title>`,
    `<generic:adtObjectUri>${escapeXml(params.objectUri)}</generic:adtObjectUri>`,
    `<generic:affectedObjects>`,
    `<generic:affectedObject`,
    ` adtcore:description="${desc}"`,
    ` adtcore:name="${escapeXml(params.objectName)}"`,
    ` adtcore:packageName="${escapeXml(params.oldPackage)}"`,
    ` adtcore:type="${escapeXml(params.objectType)}"`,
    ` adtcore:uri="${escapeXml(params.objectUri)}">`,
    `<generic:userContent/>`,
    `<generic:changePackageDelta>`,
    `<generic:newPackage>${escapeXml(params.newPackage)}</generic:newPackage>`,
    `</generic:changePackageDelta>`,
    `</generic:affectedObject>`,
    `</generic:affectedObjects>`,
    `<generic:transport>${escapeXml(transport)}</generic:transport>`,
    `<generic:ignoreSyntaxErrorsAllowed>false</generic:ignoreSyntaxErrorsAllowed>`,
    `<generic:ignoreSyntaxErrors>false</generic:ignoreSyntaxErrors>`,
    `<generic:userContent/>`,
  ].join('');
}

/**
 * Build "wrapped" preview XML.
 * Root: <changepackage:changePackageRefactoring> with inner <generic:genericRefactoring>.
 */
export function buildPreviewXml(params: ChangePackageParams): string {
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<changepackage:changePackageRefactoring`,
    ` xmlns:adtcore="${NS_ADTCORE}"`,
    ` xmlns:generic="${NS_GENERIC}"`,
    ` xmlns:changepackage="${NS_CHANGEPACKAGE}">`,
    `<changepackage:oldPackage>${escapeXml(params.oldPackage)}</changepackage:oldPackage>`,
    `<changepackage:newPackage>${escapeXml(params.newPackage)}</changepackage:newPackage>`,
    `<generic:genericRefactoring>`,
    buildGenericRefactoringInner(params),
    `</generic:genericRefactoring>`,
    `<changepackage:userContent/>`,
    `</changepackage:changePackageRefactoring>`,
  ].join('');
}

/**
 * Build "unwrapped" execute XML.
 * Root: <generic:genericRefactoring> (no changePackageRefactoring wrapper).
 */
export function buildExecuteXml(params: ChangePackageParams): string {
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<generic:genericRefactoring`,
    ` xmlns:generic="${NS_GENERIC}"`,
    ` xmlns:adtcore="${NS_ADTCORE}">`,
    buildGenericRefactoringInner(params),
    `</generic:genericRefactoring>`,
  ].join('');
}

/** Extract transport value from preview response XML */
export function parsePreviewResponse(xml: string): { transport?: string } {
  const match = xml.match(/<generic:transport>([^<]*)<\/generic:transport>/);
  if (!match) {
    // Try without namespace prefix (SAP may strip them)
    const fallback = xml.match(/<transport>([^<]*)<\/transport>/);
    const value = fallback?.[1]?.trim();
    return { transport: value || undefined };
  }
  const value = match[1]?.trim();
  return { transport: value || undefined };
}

const PREVIEW_URL =
  '/sap/bc/adt/refactorings?step=preview&rel=http://www.sap.com/adt/relations/refactoring/changepackage';
const EXECUTE_URL = '/sap/bc/adt/refactorings?step=execute';

/**
 * Move an ABAP object to a different package via the ADT refactoring API.
 *
 * Two-step flow:
 * 1. Preview: validates the operation, returns server-assigned transport (if any)
 * 2. Execute: performs the actual TADIR change
 */
export async function changePackage(
  http: AdtHttpClient,
  safety: SafetyConfig,
  params: ChangePackageParams,
): Promise<ChangePackageResult> {
  checkOperation(safety, OperationType.Update, 'ChangePackage');

  // Step 1: Preview
  const previewXml = buildPreviewXml(params);
  const previewResp = await http.post(PREVIEW_URL, previewXml, 'application/*', { Accept: 'application/*' });
  const preview = parsePreviewResponse(previewResp.body);

  // Merge transport: explicit param > preview response > empty
  const effectiveTransport = params.transport || preview.transport || '';
  const executeParams = { ...params, transport: effectiveTransport };

  // Step 2: Execute
  const executeXml = buildExecuteXml(executeParams);
  await http.post(EXECUTE_URL, executeXml, 'application/*', { Accept: 'application/*' });

  return { transport: effectiveTransport || undefined };
}
