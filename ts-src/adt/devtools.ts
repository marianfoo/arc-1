/**
 * Development tools for SAP ADT.
 *
 * - SyntaxCheck: compile-time validation
 * - Activate: publish objects to the main repository
 * - RunUnitTests: execute ABAP unit tests
 * - RunATCCheck: ABAP Test Cockpit (code quality)
 */

import type { AdtHttpClient } from './http.js';
import { checkOperation, OperationType, type SafetyConfig } from './safety.js';
import type { SyntaxCheckResult, SyntaxMessage, UnitTestResult } from './types.js';

/** Run syntax check on an ABAP object */
export async function syntaxCheck(
  http: AdtHttpClient,
  safety: SafetyConfig,
  objectUrl: string,
): Promise<SyntaxCheckResult> {
  checkOperation(safety, OperationType.Read, 'SyntaxCheck');

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<chkrun:checkObjectList xmlns:chkrun="http://www.sap.com/adt/checkrun" xmlns:adtcore="http://www.sap.com/adt/core">
  <chkrun:checkObject adtcore:uri="${objectUrl}" chkrun:version="active"/>
</chkrun:checkObjectList>`;

  const resp = await http.post('/sap/bc/adt/checkruns', body, 'application/vnd.sap.adt.checkobjects+xml', {
    Accept: 'application/vnd.sap.adt.checkmessages+xml',
  });

  return parseSyntaxCheckResult(resp.body);
}

/** Activate (publish) ABAP objects */
export async function activate(
  http: AdtHttpClient,
  safety: SafetyConfig,
  objectUrl: string,
): Promise<{ success: boolean; messages: string[] }> {
  checkOperation(safety, OperationType.Activate, 'Activate');

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">
  <adtcore:objectReference adtcore:uri="${objectUrl}"/>
</adtcore:objectReferences>`;

  const resp = await http.post('/sap/bc/adt/activation', body, 'application/xml', {
    Accept: 'application/xml',
  });

  // Check if activation succeeded (no error messages)
  const hasErrors = resp.body.includes('severity="error"') || resp.body.includes('type="E"');
  const messages: string[] = [];
  // Extract message texts
  const msgRegex = /shortText="([^"]+)"/g;
  let match: RegExpExecArray | null;
  while ((match = msgRegex.exec(resp.body)) !== null) {
    messages.push(match[1]!);
  }

  return { success: !hasErrors, messages };
}

/** Run ABAP unit tests for an object */
export async function runUnitTests(
  http: AdtHttpClient,
  safety: SafetyConfig,
  objectUrl: string,
): Promise<UnitTestResult[]> {
  checkOperation(safety, OperationType.Test, 'RunUnitTests');

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<aunit:runConfiguration xmlns:aunit="http://www.sap.com/adt/aunit">
  <external>
    <coverage active="false"/>
  </external>
  <options>
    <uriType value="semantic"/>
    <testDeterminationStrategy sameProgram="true" assignedTests="false" publicApi="false"/>
    <testRiskLevels harmless="true" dangerous="true" critical="true"/>
    <testDurations short="true" medium="true" long="true"/>
  </options>
  <adtcore:objectSets xmlns:adtcore="http://www.sap.com/adt/core">
    <objectSet kind="inclusive">
      <adtcore:objectReferences>
        <adtcore:objectReference adtcore:uri="${objectUrl}"/>
      </adtcore:objectReferences>
    </objectSet>
  </adtcore:objectSets>
</aunit:runConfiguration>`;

  const resp = await http.post(
    '/sap/bc/adt/abapunit/testruns',
    body,
    'application/vnd.sap.adt.abapunit.testruns.config.v4+xml',
    {
      Accept: 'application/xml',
    },
  );

  return parseUnitTestResults(resp.body);
}

/** Run ATC check on an object */
export async function runAtcCheck(
  http: AdtHttpClient,
  safety: SafetyConfig,
  objectUrl: string,
  variant?: string,
): Promise<{ findings: AtcFinding[] }> {
  checkOperation(safety, OperationType.Read, 'RunATCCheck');

  // Create ATC run
  const createBody = `<?xml version="1.0" encoding="UTF-8"?>
<atc:run xmlns:atc="http://www.sap.com/adt/atc"${variant ? ` maximumVerdicts="100"` : ''}>
  <objectSets xmlns:adtcore="http://www.sap.com/adt/core">
    <objectSet kind="inclusive">
      <adtcore:objectReferences>
        <adtcore:objectReference adtcore:uri="${objectUrl}"/>
      </adtcore:objectReferences>
    </objectSet>
  </objectSets>
</atc:run>`;

  const createResp = await http.post('/sap/bc/adt/atc/runs?worklistId=1', createBody, 'application/xml', {
    Accept: 'application/xml',
  });

  // Parse worklist ID from response and fetch results
  const worklistId = extractAttr(createResp.body, 'id') || '1';

  const resultResp = await http.get(`/sap/bc/adt/atc/worklists/${worklistId}`, {
    Accept: 'application/atc.worklist.v1+xml',
  });

  return { findings: parseAtcFindings(resultResp.body) };
}

// ─── Parsers ────────────────────────────────────────────────────────

export interface AtcFinding {
  priority: number;
  checkTitle: string;
  messageTitle: string;
  uri: string;
  line: number;
}

function parseSyntaxCheckResult(xml: string): SyntaxCheckResult {
  const messages: SyntaxMessage[] = [];
  // Parse check messages from XML
  const msgRegex = /<msg[^>]*type="([^"]*)"[^>]*line="(\d+)"[^>]*col="(\d+)"[^>]*>/g;
  const textRegex = /shortText="([^"]*)"/;

  let match: RegExpExecArray | null;
  while ((match = msgRegex.exec(xml)) !== null) {
    const fullTag = xml.slice(match.index, xml.indexOf('>', match.index + match[0].length) + 1);
    const textMatch = textRegex.exec(fullTag);
    messages.push({
      severity: match[1] === 'E' ? 'error' : match[1] === 'W' ? 'warning' : 'info',
      text: textMatch?.[1] ?? '',
      line: Number.parseInt(match[2]!, 10),
      column: Number.parseInt(match[3]!, 10),
    });
  }

  return {
    hasErrors: messages.some((m) => m.severity === 'error'),
    messages,
  };
}

function parseUnitTestResults(xml: string): UnitTestResult[] {
  const results: UnitTestResult[] = [];
  // Extract test results from ABAP Unit XML response
  const testMethodRegex = /<testMethod[^>]*name="([^"]*)"[^>]*>/g;

  let match: RegExpExecArray | null;
  while ((match = testMethodRegex.exec(xml)) !== null) {
    const methodName = match[1]!;
    // Check for alerts after this method
    const afterMatch = xml.slice(match.index);
    const hasAlert = afterMatch.includes('<alert') && afterMatch.indexOf('<alert') < afterMatch.indexOf('</testMethod');

    results.push({
      program: '',
      testClass: '',
      testMethod: methodName,
      status: hasAlert ? 'failed' : 'passed',
    });
  }

  return results;
}

function parseAtcFindings(xml: string): AtcFinding[] {
  const findings: AtcFinding[] = [];
  const findingRegex = /<finding[^>]*priority="(\d)"[^>]*checkTitle="([^"]*)"[^>]*messageTitle="([^"]*)"[^>]*/g;

  let match: RegExpExecArray | null;
  while ((match = findingRegex.exec(xml)) !== null) {
    findings.push({
      priority: Number.parseInt(match[1]!, 10),
      checkTitle: match[2]!,
      messageTitle: match[3]!,
      uri: '',
      line: 0,
    });
  }

  return findings;
}

function extractAttr(xml: string, attr: string): string {
  const regex = new RegExp(`${attr}="([^"]*)"`);
  const match = xml.match(regex);
  return match?.[1] ?? '';
}
