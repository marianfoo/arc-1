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

import { AdtApiError } from './errors.js';
import type { AdtHttpClient } from './http.js';
import { checkOperation, OperationType, type SafetyConfig } from './safety.js';
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

  let resp: Awaited<ReturnType<AdtHttpClient['post']>>;
  try {
    resp = await http.post(`${objectUrl}?_action=LOCK&accessMode=${accessMode}`, undefined, undefined, {
      // Dual Accept: vendor-specific type for structured lock result parsing,
      // plus wildcard fallback for SAP versions that don't support the vendor type.
      Accept: 'application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.lock.result, application/*;q=0.8',
    });
  } catch (err) {
    // NW 7.50 quirk: the LOCK endpoint returns 400 or 401 with an HTML login page when
    // the object is already locked by another session (Eclipse, SE80). This is not an auth
    // failure — a GET on the same object succeeds moments earlier with the same credentials.
    // Reclassify as a clear lock-conflict error so the LLM doesn't chase auth red herrings.
    // CX_ADT_RES_NO_ACCESS maps to 403 server-side, but with cookie auth (no Basic Auth
    // header) ICM transforms it to 401 "no logon data". ARC-1's 401 retry handler then
    // clears the cookie jar and retries without cookies, which returns 400. So we see
    // 400, 401, or 403 depending on timing — all with the same HTML login page body.
    //
    // The "Logon Error Message" HTML body is the de-facto NW 7.50 gate — S/4 returns
    // structured XML with <exc:exception> here (no "Logon Error Message" string), and
    // S/4's auth-failure HTML is "Anmeldung fehlgeschlagen" (also no match). So this
    // branch self-scopes without an explicit detectSystemCapabilities() check.
    if (
      err instanceof AdtApiError &&
      (err.statusCode === 400 || err.statusCode === 401 || err.statusCode === 403) &&
      err.responseBody?.includes('Logon Error Message')
    ) {
      const name = objectUrl.split('/').pop() ?? objectUrl;
      // Throw as 409 with "locked by" in the message so classifySapDomainError routes
      // to the 'lock-conflict' category (not the 423 'enqueue-error' / invalid-handle path).
      throw new AdtApiError(
        `Object ${name} is locked by another session. Close the editor (Eclipse, SE80) or release the lock in SM12, then retry.`,
        409,
        objectUrl,
      );
    }
    throw err;
  }

  // Parse lock response (asx:abap format) — simple regex extraction
  const lockHandle = extractXmlValue(resp.body, 'LOCK_HANDLE');
  const corrNr = extractXmlValue(resp.body, 'CORRNR');
  const isLocal = extractXmlValue(resp.body, 'IS_LOCAL') === 'X';
  const modificationSupport = extractXmlValue(resp.body, 'MODIFICATION_SUPPORT');
  const namespacedModificationSupportMatch = resp.body.match(/modificationSupport[^>]*>([^<]+)<\//);
  const namespacedModificationSupport = namespacedModificationSupportMatch?.[1] ?? '';

  if (modificationSupport === 'false' || namespacedModificationSupport === 'false') {
    throw new AdtApiError(
      'Object cannot be modified: it is in a released or non-modifiable transport. To edit this object, assign it to a new open correction request (use SE09 to create one), or work with your basis team to create a new transport.',
      423,
      objectUrl,
    );
  }

  return { lockHandle, corrNr, isLocal };
}

/** Unlock an ABAP object */
export async function unlockObject(http: AdtHttpClient, objectUrl: string, lockHandle: string): Promise<void> {
  await http.post(`${objectUrl}?_action=UNLOCK&lockHandle=${encodeURIComponent(lockHandle)}`);
}

/**
 * Some vendor content types are versioned, and the server-side release
 * determines which versions are accepted. DTEL is a concrete case: modern
 * systems (SAP_BASIS ≥ 7.52) accept `…dataelements.v2+xml`, NW 7.50/7.51
 * only accept `…dataelements.v1+xml` — same XML body, different MIME version
 * suffix. On HTTP 415, retry once with the fallback.
 *
 * Kept as a narrow static map so a backport never falls back into an
 * unintended retry loop for unrelated content types.
 */
const CONTENT_TYPE_FALLBACKS: Record<string, string> = {
  'application/vnd.sap.adt.dataelements.v2+xml; charset=utf-8':
    'application/vnd.sap.adt.dataelements.v1+xml; charset=utf-8',
  'application/vnd.sap.adt.dataelements.v2+xml': 'application/vnd.sap.adt.dataelements.v1+xml',
};

/** Create a new ABAP object */
export async function createObject(
  http: AdtHttpClient,
  safety: SafetyConfig,
  objectUrl: string,
  body: string,
  contentType = 'application/*',
  transport?: string,
  packageName?: string,
): Promise<string> {
  checkOperation(safety, OperationType.Create, 'CreateObject');

  const params: string[] = [];
  if (transport) {
    params.push(`corrNr=${encodeURIComponent(transport)}`);
  }
  if (packageName) {
    params.push(`_package=${encodeURIComponent(packageName)}`);
  }
  const url = params.length > 0 ? `${objectUrl}?${params.join('&')}` : objectUrl;

  try {
    const resp = await http.post(url, body, contentType);
    return resp.body;
  } catch (err) {
    const fallback = CONTENT_TYPE_FALLBACKS[contentType];
    if (fallback && isUnsupportedMediaTypeError(err)) {
      const resp = await http.post(url, body, fallback);
      return resp.body;
    }
    throw err;
  }
}

function isUnsupportedMediaTypeError(err: unknown): boolean {
  if (!(err instanceof AdtApiError)) return false;
  return err.statusCode === 415;
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

/** Update object metadata XML (requires lock) */
export async function updateObject(
  http: AdtHttpClient,
  safety: SafetyConfig,
  objectUrl: string,
  body: string,
  lockHandle: string,
  contentType: string,
  transport?: string,
): Promise<void> {
  checkOperation(safety, OperationType.Update, 'UpdateObject');

  let url = objectUrl;
  const params: string[] = [`lockHandle=${encodeURIComponent(lockHandle)}`];
  if (transport) {
    params.push(`corrNr=${encodeURIComponent(transport)}`);
  }
  if (params.length > 0) {
    url += (url.includes('?') ? '&' : '?') + params.join('&');
  }

  try {
    await http.put(url, body, contentType);
  } catch (err) {
    const fallback = CONTENT_TYPE_FALLBACKS[contentType];
    if (fallback && isUnsupportedMediaTypeError(err)) {
      await http.put(url, body, fallback);
      return;
    }
    throw err;
  }
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
    const effectiveTransport = transport ?? (lock.corrNr || undefined);
    try {
      await updateSource(session, safety, sourceUrl, source, lock.lockHandle, effectiveTransport);
    } finally {
      await unlockObject(session, objectUrl, lock.lockHandle);
    }
  });
}

/**
 * High-level: update object metadata with guaranteed unlock.
 * lock → updateObject → unlock (in try-finally)
 */
export async function safeUpdateObject(
  http: AdtHttpClient,
  safety: SafetyConfig,
  objectUrl: string,
  body: string,
  contentType: string,
  transport?: string,
): Promise<void> {
  await http.withStatefulSession(async (session) => {
    const lock = await lockObject(session, safety, objectUrl);
    const effectiveTransport = transport ?? (lock.corrNr || undefined);
    try {
      await updateObject(session, safety, objectUrl, body, lock.lockHandle, contentType, effectiveTransport);
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
