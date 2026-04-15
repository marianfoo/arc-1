/**
 * Development tools for SAP ADT.
 *
 * - SyntaxCheck: compile-time validation
 * - Activate: publish objects to the main repository
 * - RunUnitTests: execute ABAP unit tests
 * - RunATCCheck: ABAP Test Cockpit (code quality)
 */

import { AdtApiError } from './errors.js';
import type { AdtHttpClient } from './http.js';
import { checkOperation, OperationType, type SafetyConfig } from './safety.js';
import type { FixDelta, FixProposal, SyntaxCheckResult, SyntaxMessage, UnitTestResult } from './types.js';
import { escapeXmlAttr, findDeepNodes, parseXml } from './xml-parser.js';

/** Run syntax check on an ABAP object */
export async function syntaxCheck(
  http: AdtHttpClient,
  safety: SafetyConfig,
  objectUrl: string,
  options?: { version?: 'active' | 'inactive' },
): Promise<SyntaxCheckResult> {
  checkOperation(safety, OperationType.Read, 'SyntaxCheck');

  const version = options?.version ?? 'active';
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<chkrun:checkObjectList xmlns:chkrun="http://www.sap.com/adt/checkrun" xmlns:adtcore="http://www.sap.com/adt/core">
  <chkrun:checkObject adtcore:uri="${escapeXmlAttr(objectUrl)}" chkrun:version="${version}"/>
</chkrun:checkObjectList>`;

  const resp = await http.post('/sap/bc/adt/checkruns', body, 'application/vnd.sap.adt.checkobjects+xml', {
    Accept: 'application/vnd.sap.adt.checkmessages+xml',
  });

  return parseSyntaxCheckResult(resp.body);
}

/** Structured message from an activation response */
export interface ActivationMessage {
  severity: 'error' | 'warning' | 'info';
  text: string;
  uri?: string;
  line?: number;
}

/** Result of an activation operation */
export interface ActivationResult {
  success: boolean;
  messages: string[];
  details: ActivationMessage[];
}

/** Activate (publish) ABAP objects */
export async function activate(
  http: AdtHttpClient,
  safety: SafetyConfig,
  objectUrl: string,
  options?: { preaudit?: boolean },
): Promise<ActivationResult> {
  checkOperation(safety, OperationType.Activate, 'Activate');

  const preaudit = options?.preaudit !== false;
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">
  <adtcore:objectReference adtcore:uri="${escapeXmlAttr(objectUrl)}"/>
</adtcore:objectReferences>`;

  // Use application/* wildcard for Content-Type — matches how ADT Eclipse
  // and abap-adt-api send activation requests. More resilient across SAP versions.
  const resp = await http.post(
    `/sap/bc/adt/activation?method=activate&preauditRequested=${preaudit}`,
    body,
    'application/*',
    { Accept: 'application/xml' },
  );

  return parseActivationResult(resp.body);
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
  options?: { preaudit?: boolean },
): Promise<ActivationResult> {
  checkOperation(safety, OperationType.Activate, 'ActivateBatch');

  const preaudit = options?.preaudit !== false;
  const refs = objects
    .map(
      (o) =>
        `  <adtcore:objectReference adtcore:uri="${escapeXmlAttr(o.url)}" adtcore:name="${escapeXmlAttr(o.name)}"/>`,
    )
    .join('\n');

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">
${refs}
</adtcore:objectReferences>`;

  const resp = await http.post(
    `/sap/bc/adt/activation?method=activate&preauditRequested=${preaudit}`,
    body,
    'application/*',
    { Accept: 'application/xml' },
  );

  return parseActivationResult(resp.body);
}

/** Result of a publish/unpublish operation */
export interface PublishResult {
  severity: string;
  shortText: string;
  longText: string;
}

function findDeepValue(obj: unknown, key: string): unknown {
  if (!obj || typeof obj !== 'object') return undefined;
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const found = findDeepValue(item, key);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  const record = obj as Record<string, unknown>;
  if (key in record) return record[key];
  for (const val of Object.values(record)) {
    const found = findDeepValue(val, key);
    if (found !== undefined) return found;
  }
  return undefined;
}

function parsePublishResponse(xml: string): PublishResult {
  if (!xml.trim()) return { severity: 'OK', shortText: '', longText: '' };
  const parsed = parseXml(xml);
  const severity = findDeepValue(parsed, 'SEVERITY');
  const shortText = findDeepValue(parsed, 'SHORT_TEXT');
  const longText = findDeepValue(parsed, 'LONG_TEXT');
  return {
    severity: severity != null ? String(severity) : 'UNKNOWN',
    shortText: shortText != null ? String(shortText) : '',
    longText: longText != null ? String(longText) : '',
  };
}

function publishBody(name: string): string {
  return `<adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core"><adtcore:objectReference adtcore:name="${escapeXmlAttr(name)}"/></adtcore:objectReferences>`;
}

/** Publish an OData service binding (makes the service available for consumption) */
export async function publishServiceBinding(
  http: AdtHttpClient,
  safety: SafetyConfig,
  name: string,
  version = '0001',
  serviceType: 'odatav2' | 'odatav4' = 'odatav2',
): Promise<PublishResult> {
  checkOperation(safety, OperationType.Activate, 'PublishServiceBinding');

  const resp = await http.post(
    `/sap/bc/adt/businessservices/${serviceType}/publishjobs?servicename=${encodeURIComponent(name)}&serviceversion=${encodeURIComponent(version)}`,
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
  serviceType: 'odatav2' | 'odatav4' = 'odatav2',
): Promise<PublishResult> {
  checkOperation(safety, OperationType.Activate, 'UnpublishServiceBinding');

  const resp = await http.post(
    `/sap/bc/adt/businessservices/${serviceType}/unpublishjobs?servicename=${encodeURIComponent(name)}&serviceversion=${encodeURIComponent(version)}`,
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
        <adtcore:objectReference adtcore:uri="${escapeXmlAttr(objectUrl)}"/>
      </adtcore:objectReferences>
    </objectSet>
  </adtcore:objectSets>
</aunit:runConfiguration>`;

  const resp = await http.post(
    '/sap/bc/adt/abapunit/testruns',
    body,
    'application/vnd.sap.adt.abapunit.testruns.config.v4+xml',
    {
      Accept: 'application/vnd.sap.adt.abapunit.testruns.result.v2+xml',
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
        <adtcore:objectReference adtcore:uri="${escapeXmlAttr(objectUrl)}"/>
      </adtcore:objectReferences>
    </objectSet>
  </objectSets>
</atc:run>`;

  const createResp = await http.post('/sap/bc/adt/atc/runs?worklistId=1', createBody, 'application/xml', {
    Accept: 'application/xml',
  });

  // Parse worklist ID from response via proper XML parsing
  const createParsed = parseXml(createResp.body);
  const runs = findDeepNodes(createParsed, 'run');
  const runNode = runs[0];
  const worklistId = runNode
    ? String(
        (runNode as Record<string, unknown>)['@_worklistId'] ?? (runNode as Record<string, unknown>)['@_id'] ?? '1',
      )
    : '1';

  const resultResp = await http.get(`/sap/bc/adt/atc/worklists/${worklistId}`, {
    Accept: 'application/atc.worklist.v1+xml',
  });

  return { findings: parseAtcFindings(resultResp.body) };
}

/** Get SAP quick fix proposals for a given source position */
export async function getFixProposals(
  http: AdtHttpClient,
  safety: SafetyConfig,
  sourceUri: string,
  source: string,
  line: number,
  column: number,
): Promise<FixProposal[]> {
  checkOperation(safety, OperationType.Read, 'GetFixProposals');

  const uriWithStart = `${sourceUri}#start=${line},${column}`;
  const path = `/sap/bc/adt/quickfixes/evaluation?uri=${encodeURIComponent(uriWithStart)}`;

  try {
    const resp = await http.post(path, source, 'application/*', {
      Accept: 'application/*',
    });
    return parseFixProposals(resp.body);
  } catch (err) {
    if (err instanceof AdtApiError && (err.statusCode === 404 || err.statusCode === 406)) {
      // Graceful fallback: endpoint not available on this SAP release/system.
      return [];
    }
    throw err;
  }
}

/** Apply one SAP quick fix proposal and return replacement deltas */
export async function applyFixProposal(
  http: AdtHttpClient,
  safety: SafetyConfig,
  proposal: FixProposal,
  sourceUri: string,
  source: string,
  line: number,
  column: number,
): Promise<FixDelta[]> {
  checkOperation(safety, OperationType.Read, 'ApplyFixProposal');

  const uriWithStart = `${sourceUri}#start=${line},${column}`;
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<quickfixes:proposalRequest xmlns:quickfixes="http://www.sap.com/adt/quickfixes" xmlns:adtcore="http://www.sap.com/adt/core">
  <input>
    <content>${escapeXmlText(source)}</content>
    <adtcore:objectReference adtcore:uri="${escapeXmlAttr(uriWithStart)}"/>
  </input>
  <userContent>${escapeXmlText(proposal.userContent)}</userContent>
</quickfixes:proposalRequest>`;

  const resp = await http.post(proposal.uri, body, 'application/*', {
    Accept: 'application/*',
  });

  return parseFixDeltas(resp.body);
}

// ─── Parsers ────────────────────────────────────────────────────────

export interface AtcFinding {
  priority: number;
  checkTitle: string;
  messageTitle: string;
  uri: string;
  line: number;
  quickfixInfo?: string;
  hasQuickfix?: boolean;
}

/** Parse activation response XML to detect errors via proper XML parsing */
export function parseActivationResult(xml: string): ActivationResult {
  if (!xml.trim()) return { success: true, messages: [], details: [] };

  const parsed = parseXml(xml);
  const msgs = findDeepNodes(parsed, 'msg');
  const messages: string[] = [];
  const details: ActivationMessage[] = [];
  let hasErrors = false;

  for (const m of msgs) {
    const rawSeverity = String(m['@_severity'] ?? '');
    const type = String(m['@_type'] ?? '');
    const isError = rawSeverity === 'error' || rawSeverity === 'fatal' || type === 'E' || type === 'A';
    if (isError) hasErrors = true;

    const shortText = extractShortText(m);
    if (shortText) messages.push(shortText);

    const severity: ActivationMessage['severity'] = isError
      ? 'error'
      : type === 'W' || rawSeverity === 'warning'
        ? 'warning'
        : 'info';

    const rawUri = m['@_uri'];
    const rawLine = m['@_line'];
    const detail: ActivationMessage = { severity, text: shortText };
    if (rawUri) detail.uri = String(rawUri);
    if (rawLine != null) {
      const parsed = Number.parseInt(String(rawLine), 10);
      if (!Number.isNaN(parsed) && parsed > 0) detail.line = parsed;
    }
    details.push(detail);
  }

  return { success: !hasErrors, messages, details };
}

/** Extract shortText from an activation message node.
 *  Format 1 (attribute): <msg shortText="..."/>
 *  Format 2 (element):   <msg><shortText><txt>line1</txt><txt>line2</txt></shortText></msg>
 */
function extractShortText(m: Record<string, unknown>): string {
  // Try attribute first (older SAP systems / some message types)
  const attr = m['@_shortText'];
  if (attr) return String(attr);

  // Try child element with <txt> sub-elements
  const shortTextNode = m.shortText;
  if (!shortTextNode || typeof shortTextNode !== 'object') return '';

  const record = shortTextNode as Record<string, unknown>;
  const txt = record.txt ?? record['#text'];
  if (typeof txt === 'string') return txt;
  if (Array.isArray(txt)) return txt.map((t) => String(t)).join(' — ');
  if (txt != null) return String(txt);
  return '';
}

function parseSyntaxCheckResult(xml: string): SyntaxCheckResult {
  const parsed = parseXml(xml);
  const msgs = findDeepNodes(parsed, 'msg');
  const messages: SyntaxMessage[] = msgs.map((m) => {
    const type = String(m['@_type'] ?? '');
    return {
      severity: type === 'E' ? 'error' : type === 'W' ? 'warning' : 'info',
      text: String(m['@_shortText'] ?? ''),
      line: Number.parseInt(String(m['@_line'] ?? '0'), 10),
      column: Number.parseInt(String(m['@_col'] ?? '0'), 10),
    };
  });

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
    // Extract program name from URI:
    //   classes: /sap/bc/adt/oo/classes/ZCL_TEST/...
    //   programs: /sap/bc/adt/programs/programs/ZTEST/...  (note: "programs" appears twice)
    const uriParts = uri.split('/');
    let program = '';
    for (let i = 0; i < uriParts.length - 1; i++) {
      if (uriParts[i] === 'classes') {
        program = uriParts[i + 1] ?? '';
        break;
      }
      if (uriParts[i] === 'programs' && uriParts[i + 1] === 'programs' && i + 2 < uriParts.length) {
        program = uriParts[i + 2] ?? '';
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
        if (titleVal != null) {
          if (typeof titleVal === 'string') {
            message = titleVal;
          } else if (typeof titleVal === 'object' && !Array.isArray(titleVal)) {
            message = String((titleVal as Record<string, unknown>)['#text'] ?? '');
          } else {
            message = String(titleVal);
          }
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

function escapeXmlText(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function toNodeRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value) return undefined;
  if (Array.isArray(value)) {
    const first = value[0];
    return first && typeof first === 'object' ? (first as Record<string, unknown>) : undefined;
  }
  return typeof value === 'object' ? (value as Record<string, unknown>) : undefined;
}

function readNodeText(node: unknown): string {
  if (node == null) return '';
  if (typeof node === 'string' || typeof node === 'number' || typeof node === 'boolean') return String(node);
  if (Array.isArray(node)) return node.map((n) => readNodeText(n)).join('');
  if (typeof node !== 'object') return '';
  const rec = node as Record<string, unknown>;
  if ('#text' in rec) return readNodeText(rec['#text']);
  return Object.entries(rec)
    .filter(([k]) => !k.startsWith('@_'))
    .map(([, v]) => readNodeText(v))
    .join('');
}

function parseFixProposals(xml: string): FixProposal[] {
  const parsed = parseXml(xml);
  const results = findDeepNodes(parsed, 'evaluationResult');
  if (results.length === 0) return [];

  return results
    .map((result) => {
      const objectRef = toNodeRecord(result.objectReference);
      return {
        uri: String(objectRef?.['@_uri'] ?? ''),
        type: String(objectRef?.['@_type'] ?? ''),
        name: String(objectRef?.['@_name'] ?? ''),
        description: String(objectRef?.['@_description'] ?? ''),
        userContent: readNodeText(result.userContent),
      } satisfies FixProposal;
    })
    .filter((proposal) => proposal.uri.length > 0);
}

function parseIntOrUndefined(value: unknown): number | undefined {
  if (value == null) return undefined;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function parsePositionFragment(uri: string, key: 'start' | 'end'): { line: number; column: number } | undefined {
  const re = key === 'start' ? /#start=(\d+),(\d+)/ : /#end=(\d+),(\d+)/;
  const match = uri.match(re);
  if (!match?.[1] || !match[2]) return undefined;
  return {
    line: Number.parseInt(match[1], 10),
    column: Number.parseInt(match[2], 10),
  };
}

function parseFixDeltas(xml: string): FixDelta[] {
  const parsed = parseXml(xml);
  const candidateKeys = ['delta', 'edit', 'textEdit', 'replacement', 'replace'] as const;
  let nodes: Array<Record<string, unknown>> = [];

  for (const key of candidateKeys) {
    nodes = findDeepNodes(parsed, key);
    if (nodes.length > 0) break;
  }

  if (nodes.length === 0) return [];

  return nodes.map((node) => {
    const objectRef = toNodeRecord(node.objectReference);
    const startNode = toNodeRecord(node.start ?? node.from ?? node.sourceStart);
    const endNode = toNodeRecord(node.end ?? node.to ?? node.sourceEnd);

    const uri = String(node['@_uri'] ?? objectRef?.['@_uri'] ?? '');

    const startFromUri = parsePositionFragment(uri, 'start');
    const endFromUri = parsePositionFragment(uri, 'end');

    const startLine =
      parseIntOrUndefined(node['@_startLine']) ??
      parseIntOrUndefined(node['@_startline']) ??
      parseIntOrUndefined(startNode?.['@_line']) ??
      startFromUri?.line ??
      0;
    const startColumn =
      parseIntOrUndefined(node['@_startColumn']) ??
      parseIntOrUndefined(node['@_startCol']) ??
      parseIntOrUndefined(node['@_startcolumn']) ??
      parseIntOrUndefined(startNode?.['@_column']) ??
      parseIntOrUndefined(startNode?.['@_col']) ??
      startFromUri?.column ??
      0;
    const endLine =
      parseIntOrUndefined(node['@_endLine']) ??
      parseIntOrUndefined(node['@_endline']) ??
      parseIntOrUndefined(endNode?.['@_line']) ??
      endFromUri?.line ??
      startLine;
    const endColumn =
      parseIntOrUndefined(node['@_endColumn']) ??
      parseIntOrUndefined(node['@_endCol']) ??
      parseIntOrUndefined(node['@_endcolumn']) ??
      parseIntOrUndefined(endNode?.['@_column']) ??
      parseIntOrUndefined(endNode?.['@_col']) ??
      endFromUri?.column ??
      startColumn;

    const content = readNodeText(node.content ?? node.replacement ?? node.newText ?? node.text ?? node['#text']);

    return {
      uri,
      range: {
        start: { line: startLine, column: startColumn },
        end: { line: endLine, column: endColumn },
      },
      content,
    };
  });
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

    const quickfixInfoRaw = f['@_quickfixInfo'];
    const quickfixInfo = quickfixInfoRaw == null ? undefined : String(quickfixInfoRaw);
    const quickfixNode = toNodeRecord(f.quickfixes);
    const manual = String(quickfixNode?.['@_manual'] ?? 'false').toLowerCase() === 'true';
    const automatic = String(quickfixNode?.['@_automatic'] ?? 'false').toLowerCase() === 'true';
    const pseudo = String(quickfixNode?.['@_pseudo'] ?? 'false').toLowerCase() === 'true';

    return {
      priority: Number.parseInt(String(f['@_priority'] ?? '0'), 10),
      checkTitle: String(f['@_checkTitle'] ?? ''),
      messageTitle: String(f['@_messageTitle'] ?? ''),
      uri: rawUri,
      line,
      quickfixInfo,
      hasQuickfix: manual || automatic || pseudo,
    };
  });
}
