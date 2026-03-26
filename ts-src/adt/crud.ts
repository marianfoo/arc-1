/**
 * CRUD operations for SAP ADT objects.
 *
 * All write operations follow the pattern: lock → modify → unlock
 * The lock/unlock must happen on the same stateful HTTP session.
 * We use AdtHttpClient.withStatefulSession() to guarantee this.
 *
 * Critical: unlock MUST happen even if modify fails (try-finally pattern).
 * This was a hard-won lesson in the fr0ster codebase — earlier versions
 * leaked locks on error, blocking the object for other developers.
 */

import type { AdtHttpClient } from './http.js';
import { checkOperation, checkTransportableEdit, OperationType, type SafetyConfig } from './safety.js';
/** Lock result from SAP */
export interface LockResult {
  lockHandle: string;
  corrNr: string;
  isLocal: boolean;
}

/** Lock an ABAP object for editing */
export async function lockObject(
  http: AdtHttpClient,
  safety: SafetyConfig,
  objectUrl: string,
  accessMode = 'MODIFY',
): Promise<LockResult> {
  if (accessMode === 'MODIFY') {
    checkOperation(safety, OperationType.Lock, 'LockObject');
  }

  const resp = await http.post(`${objectUrl}?_action=LOCK&accessMode=${accessMode}`, undefined, undefined, {
    Accept: 'application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.lock.result',
  });

  // Parse lock response (asx:abap format) — simple regex extraction
  const lockHandle = extractXmlValue(resp.body, 'LOCK_HANDLE');
  const corrNr = extractXmlValue(resp.body, 'CORRNR');
  const isLocal = extractXmlValue(resp.body, 'IS_LOCAL') === 'X';

  return { lockHandle, corrNr, isLocal };
}

/** Unlock an ABAP object */
export async function unlockObject(http: AdtHttpClient, objectUrl: string, lockHandle: string): Promise<void> {
  await http.post(`${objectUrl}?_action=UNLOCK&lockHandle=${encodeURIComponent(lockHandle)}`);
}

/** Create a new ABAP object */
export async function createObject(
  http: AdtHttpClient,
  safety: SafetyConfig,
  objectUrl: string,
  body: string,
  contentType = 'application/xml',
  transport?: string,
): Promise<string> {
  checkOperation(safety, OperationType.Create, 'CreateObject');
  if (transport) {
    checkTransportableEdit(safety, transport, 'CreateObject');
  }

  const url = transport ? `${objectUrl}?corrNr=${encodeURIComponent(transport)}` : objectUrl;

  const resp = await http.post(url, body, contentType);
  return resp.body;
}

/** Update source code of an ABAP object (requires lock) */
export async function updateSource(
  http: AdtHttpClient,
  safety: SafetyConfig,
  sourceUrl: string,
  source: string,
  lockHandle: string,
  transport?: string,
): Promise<void> {
  checkOperation(safety, OperationType.Update, 'UpdateSource');
  if (transport) {
    checkTransportableEdit(safety, transport, 'UpdateSource');
  }

  let url = sourceUrl;
  const params: string[] = [`lockHandle=${encodeURIComponent(lockHandle)}`];
  if (transport) {
    params.push(`corrNr=${encodeURIComponent(transport)}`);
  }
  if (params.length > 0) {
    url += (url.includes('?') ? '&' : '?') + params.join('&');
  }

  await http.put(url, source, 'text/plain');
}

/** Delete an ABAP object (requires lock) */
export async function deleteObject(
  http: AdtHttpClient,
  safety: SafetyConfig,
  objectUrl: string,
  lockHandle: string,
  transport?: string,
): Promise<void> {
  checkOperation(safety, OperationType.Delete, 'DeleteObject');

  let url = `${objectUrl}?lockHandle=${encodeURIComponent(lockHandle)}`;
  if (transport) {
    url += `&corrNr=${encodeURIComponent(transport)}`;
  }

  await http.delete(url);
}

/**
 * High-level: update source with guaranteed unlock.
 * lock → updateSource → unlock (in try-finally)
 */
export async function safeUpdateSource(
  http: AdtHttpClient,
  safety: SafetyConfig,
  objectUrl: string,
  sourceUrl: string,
  source: string,
  transport?: string,
): Promise<void> {
  await http.withStatefulSession(async (session) => {
    const lock = await lockObject(session, safety, objectUrl);
    try {
      await updateSource(session, safety, sourceUrl, source, lock.lockHandle, transport);
    } finally {
      await unlockObject(session, objectUrl, lock.lockHandle);
    }
  });
}

/** Simple XML value extractor (for lock responses) */
function extractXmlValue(xml: string, tag: string): string {
  const regex = new RegExp(`<${tag}>([^<]*)</${tag}>`);
  const match = xml.match(regex);
  return match?.[1] ?? '';
}
