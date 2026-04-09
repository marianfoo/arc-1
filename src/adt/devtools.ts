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
import { findDeepNodes, parseXml } from './xml-parser.js';

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

  const resp = await http.post(
    '/sap/bc/adt/activation?method=activate&preauditRequested=true',
    body,
    'application/xml',
    { Accept: 'application/xml' },
  );

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

/**
 * Activate (publish) multiple ABAP objects in a single batch call.
 *
 * The ADT activation endpoint natively supports multiple objectReference elements.
 * This is essential for RAP stacks where objects depend on each other
 * (DDLS → BDEF → SRVD → SRVB) and must be activated together.
 */
export async function activateBatch(
  http: AdtHttpClient,
  safety: SafetyConfig,
  objects: Array<{ url: string; name: string }>,
): Promise<{ success: boolean; messages: string[] }> {
  checkOperation(safety, OperationType.Activate, 'ActivateBatch');

  const refs = objects
    .map((o) => `  <adtcore:objectReference adtcore:uri="${o.url}" adtcore:name="${o.name}"/>`)
    .join('\n');

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">
${refs}
</adtcore:objectReferences>`;

  const resp = await http.post(
    '/sap/bc/adt/activation?method=activate&preauditRequested=true',
    body,
    'application/xml',
    { Accept: 'application/xml' },
  );

  // Check if activation succeeded (no error messages)
  const hasErrors = resp.body.includes('severity="error"') || resp.body.includes('type="E"');
  const messages: string[] = [];
  const msgRegex = /shortText="([^"]+)"/g;
  let match: RegExpExecArray | null;
  while ((match = msgRegex.exec(resp.body)) !== null) {
    messages.push(match[1]!);
  }

  return { success: !hasErrors, messages };
}

/** Result of a publish/unpublish operation */
export interface PublishResult {
  severity: string;
  shortText: string;
  longText: string;
}

function parsePublishResponse(xml: string): PublishResult {
  const severity = xml.match(/<SEVERITY>([^<]*)<\/SEVERITY>/)?.[1] ?? 'UNKNOWN';
  const shortText = xml.match(/<SHORT_TEXT>([^<]*)<\/SHORT_TEXT>/)?.[1] ?? '';
  const longText = xml.match(/<LONG_TEXT>([^<]*)<\/LONG_TEXT>/)?.[1] ?? '';
  return { severity, shortText, longText };
}

function publishBody(name: string): string {
  return `<adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core"><adtcore:objectReference adtcore:name="${name}"/></adtcore:objectReferences>`;
}

/** Publish an OData service binding (makes the service available for consumption) */
export async function publishServiceBinding(
  http: AdtHttpClient,
  safety: SafetyConfig,
  name: string,
  version = '0001',
): Promise<PublishResult> {
  checkOperation(safety, OperationType.Activate, 'PublishServiceBinding');

  const resp = await http.post(
    `/sap/bc/adt/businessservices/odatav2/publishjobs?servicename=${encodeURIComponent(name)}&serviceversion=${encodeURIComponent(version)}`,
    publishBody(name),
    'application/xml',
    { Accept: 'application/*' },
  );

  return parsePublishResponse(resp.body);
}

/** Unpublish an OData service binding (removes the service from consumption) */
export async function unpublishServiceBinding(
  http: AdtHttpClient,
  safety: SafetyConfig,
  name: string,
  version = '0001',
): Promise<PublishResult> {
  checkOperation(safety, OperationType.Activate, 'UnpublishServiceBinding');

  const resp = await http.post(
    `/sap/bc/adt/businessservices/odatav2/unpublishjobs?servicename=${encodeURIComponent(name)}&serviceversion=${encodeURIComponent(version)}`,
    publishBody(name),
    'application/xml',
    { Accept: 'application/*' },
  );

  return parsePublishResponse(resp.body);
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
  const parsed = parseXml(xml);
  const testClasses = findDeepNodes(parsed, 'testClass');

  for (const tc of testClasses) {
    const className = String(tc['@_name'] ?? '');
    const uri = String(tc['@_uri'] ?? '');
    // Extract program name from URI: .../classes/ZCL_TEST/... or .../programs/ZTEST/...
    const uriParts = uri.split('/');
    let program = '';
    for (let i = 0; i < uriParts.length - 1; i++) {
      if (uriParts[i] === 'classes' || uriParts[i] === 'programs') {
        program = uriParts[i + 1] ?? '';
        break;
      }
    }

    const methods = findDeepNodes(tc, 'testMethod');
    for (const method of methods) {
      const methodName = String(method['@_name'] ?? '');
      const alerts = findDeepNodes(method, 'alert');
      const hasAlert = alerts.length > 0;
      // Extract message from first alert's title element
      let message: string | undefined;
      if (hasAlert) {
        const titleVal = (alerts[0] as Record<string, unknown>).title;
        if (Array.isArray(titleVal) && titleVal.length > 0) {
          message = String(titleVal[0]);
        } else if (typeof titleVal === 'string') {
          message = titleVal;
        }
      }
      // Extract duration from executionTime attribute (in seconds)
      const execTime = method['@_executionTime'];
      const duration = execTime ? Number(execTime) : undefined;

      results.push({
        program,
        testClass: className,
        testMethod: methodName,
        status: hasAlert ? 'failed' : 'passed',
        ...(message ? { message } : {}),
        ...(duration !== undefined && !Number.isNaN(duration) ? { duration } : {}),
      });
    }
  }

  return results;
}

function parseAtcFindings(xml: string): AtcFinding[] {
  const parsed = parseXml(xml);
  const nodes = findDeepNodes(parsed, 'finding');

  return nodes.map((f) => {
    const rawUri = String(f['@_uri'] ?? f['@_location'] ?? '');
    let line = 0;
    const startIdx = rawUri.indexOf('#start=');
    if (startIdx !== -1) {
      const fragment = rawUri.slice(startIdx + '#start='.length);
      const firstNum = Number.parseInt(fragment.split(',')[0]!, 10);
      if (!Number.isNaN(firstNum)) line = firstNum;
    }

    return {
      priority: Number.parseInt(String(f['@_priority'] ?? '0'), 10),
      checkTitle: String(f['@_checkTitle'] ?? ''),
      messageTitle: String(f['@_messageTitle'] ?? ''),
      uri: rawUri,
      line,
    };
  });
}

function extractAttr(xml: string, attr: string): string {
  const regex = new RegExp(`${attr}="([^"]*)"`);
  const match = xml.match(regex);
  return match?.[1] ?? '';
}
