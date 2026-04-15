/**
 * Error types for ADT API interactions.
 *
 * SAP ADT returns errors in multiple formats:
 * - HTTP status codes (401, 403, 404, 500)
 * - XML exception bodies (with structured error messages)
 * - HTML error pages (generic SAP web dispatcher errors)
 * - Plain text (rare, usually session-related)
 *
 * We normalize all of these into typed error classes so handlers
 * can make decisions without parsing strings.
 *
 * Learned from fr0ster: their extractAdtErrorMessage() parses the XML
 * exception body to get the actual SAP error message. We do the same
 * in AdtApiError.fromResponse().
 */

/** Base error for all ADT-related errors */
export class AdtError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AdtError';
  }
}

export interface DdicDiagnostic {
  messageId?: string;
  messageNumber?: string;
  variables: string[];
  lineNumber?: number;
  text: string;
}

export interface SapErrorClassification {
  category:
    | 'lock-conflict'
    | 'enqueue-error'
    | 'authorization'
    | 'activation-dependency'
    | 'transport-issue'
    | 'object-exists'
    | 'method-not-supported';
  hint: string;
  transaction?: string;
  details?: Record<string, string>;
}

/** HTTP-level API error from SAP ADT */
export class AdtApiError extends AdtError {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly path: string,
    public readonly responseBody?: string,
  ) {
    // Extract a human-readable message, stripping raw XML/HTML
    const clean = AdtApiError.extractCleanMessage(message);
    super(`ADT API error: status ${statusCode} at ${path}: ${clean}`);
    this.name = 'AdtApiError';
  }

  /**
   * Extract a human-readable error message from SAP's XML/HTML error responses.
   *
   * SAP ADT returns errors as XML like:
   *   <exc:exception ...><exc:localizedMessage lang="EN">...</exc:localizedMessage></exc:exception>
   * or HTML error pages. We extract the meaningful text and discard the markup.
   */
  static extractCleanMessage(raw: string): string {
    if (!raw || raw.length === 0) return 'Unknown error';

    // 1. Try XML: extract <localizedMessage> or <message> content
    const xmlMatch =
      raw.match(/<(?:\w+:)?localizedMessage[^>]*>([^<]+)</) ?? raw.match(/<(?:\w+:)?message[^>]*>([^<]+)</);
    if (xmlMatch?.[1]) {
      return xmlMatch[1].trim();
    }

    // 2. Try HTML: extract <title> or <h1> content
    const htmlMatch = raw.match(/<title>([^<]+)</) ?? raw.match(/<h1>([^<]+)</);
    if (htmlMatch?.[1]) {
      return htmlMatch[1].trim();
    }

    // 3. If no XML/HTML tags at all, it's plain text — use as-is (truncated)
    if (!raw.includes('<')) {
      return raw.slice(0, 300);
    }

    // 4. Fallback: strip all tags and use whatever text remains
    const stripped = raw
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return stripped.length > 0 ? stripped.slice(0, 300) : 'SAP returned an error (no readable message)';
  }

  get isNotFound(): boolean {
    return this.statusCode === 404;
  }

  get isUnauthorized(): boolean {
    return this.statusCode === 401;
  }

  get isForbidden(): boolean {
    return this.statusCode === 403;
  }

  /**
   * SAP returns 400 with specific messages when the HTTP session expires.
   * This is different from 401 (auth failure) — it means the stateful
   * session cookie is no longer valid.
   */
  get isSessionExpired(): boolean {
    if (this.statusCode !== 400) return false;
    const msg = (this.responseBody ?? '').toLowerCase();
    return (
      msg.includes('icmenosession') || msg.includes('session timed out') || msg.includes('session no longer exists')
    );
  }

  get isServerError(): boolean {
    return this.statusCode >= 500;
  }

  /**
   * Extract ALL localized messages from SAP's XML error response.
   * SAP DDL save errors often return multiple messages with line/column detail.
   * Returns only messages beyond the first (which is already in err.message).
   */
  static extractAllMessages(xml: string): string[] {
    if (!xml) return [];
    const matches = xml.matchAll(/<(?:\w+:)?localizedMessage[^>]*>([^<]+)</g);
    const messages: string[] = [];
    let first = true;
    for (const match of matches) {
      if (first) {
        first = false;
        continue; // Skip the first — it's already in extractCleanMessage
      }
      const text = match[1]?.trim();
      if (text) messages.push(text);
    }
    return messages;
  }

  /**
   * Extract key-value properties from SAP's XML error response.
   * Properties often contain line numbers, message IDs, and other diagnostic detail.
   */
  static extractProperties(xml: string): Record<string, string> {
    if (!xml) return {};
    const props: Record<string, string> = {};
    const matches = xml.matchAll(/<entry\s+key="([^"]+)">([^<]*)<\/entry>/g);
    for (const match of matches) {
      const key = match[1]?.trim();
      const value = match[2]?.trim();
      if (key && value) props[key] = value;
    }
    return props;
  }

  /**
   * Extract structured DDIC diagnostics from SAP XML error responses.
   *
   * DDIC save failures often include T100KEY entries (MSGID, MSGNO, V1-V4)
   * and line/column information in <entry> property nodes.
   */
  static extractDdicDiagnostics(xml: string): DdicDiagnostic[] {
    if (!xml) return [];

    const props = AdtApiError.extractProperties(xml);
    const localizedMessages = [...xml.matchAll(/<(?:\w+:)?localizedMessage[^>]*>([^<]+)</g)]
      .map((match) => match[1]?.trim())
      .filter((text): text is string => Boolean(text));

    const messageId = props['T100KEY-MSGID'];
    const messageNumber = props['T100KEY-MSGNO'] ?? props['T100KEY-NO'];
    const variables = [props['T100KEY-V1'], props['T100KEY-V2'], props['T100KEY-V3'], props['T100KEY-V4']].filter(
      (value): value is string => Boolean(value),
    );
    const lineNumber = parseOptionalInt(props.LINE ?? props['T100KEY-LINE']);
    const hasDdicProperties = Object.keys(props).some(
      (key) => key.startsWith('T100KEY-') || key === 'LINE' || key === 'COLUMN',
    );

    // Avoid false positives for generic API errors.
    if (!hasDdicProperties && localizedMessages.length <= 1) {
      return [];
    }

    const diagnostics: DdicDiagnostic[] = [];
    const seen = new Set<string>();

    const addDiagnostic = (diag: DdicDiagnostic): void => {
      const key = `${diag.messageId ?? ''}|${diag.messageNumber ?? ''}|${diag.lineNumber ?? ''}|${diag.text}`;
      if (seen.has(key)) return;
      seen.add(key);
      diagnostics.push(diag);
    };

    if (hasDdicProperties) {
      addDiagnostic({
        messageId,
        messageNumber,
        variables,
        lineNumber,
        text: localizedMessages[0] ?? 'DDIC save failed due to source errors.',
      });
    }

    for (const text of localizedMessages) {
      const inlineLine = extractInlineLineNumber(text);
      addDiagnostic({
        messageId,
        messageNumber,
        variables,
        lineNumber: inlineLine ?? lineNumber,
        text,
      });
    }

    return diagnostics;
  }

  /**
   * Format DDIC diagnostics in a compact, LLM-friendly multi-line block.
   * Returns empty string when no DDIC diagnostics are present.
   */
  static formatDdicDiagnostics(xml: string): string {
    const diagnostics = AdtApiError.extractDdicDiagnostics(xml);
    if (diagnostics.length === 0) return '';

    const lines = diagnostics.map((diag) => {
      const idPart =
        diag.messageId || diag.messageNumber ? `[${diag.messageId ?? '?'}/${diag.messageNumber ?? '?'}] ` : '';
      const varsPart =
        diag.variables.length > 0
          ? `${diag.variables.map((value, index) => `V${index + 1}=${value}`).join(', ')}: `
          : '';
      const linePart = diag.lineNumber ? `Line ${diag.lineNumber}: ` : '';
      return `  - ${idPart}${linePart}${varsPart}${diag.text}`;
    });

    return `DDIC diagnostics:\n${lines.join('\n')}`;
  }
}

/** Extract SAP ADT exception type id from XML response bodies. */
export function extractExceptionType(xml: string): string | undefined {
  if (!xml?.includes('<')) return undefined;
  const match = xml.match(/<(?:\w+:)?type\s+id="([^"]+)"\s*\/>|<(?:\w+:)?type\s+id="([^"]+)">/i);
  return match?.[1] ?? match?.[2];
}

/** Extract lock owner details (user + transport/task) from SAP lock messages. */
export function extractLockOwner(text: string): { user?: string; transport?: string } | undefined {
  if (!text) return undefined;

  const userMatch =
    text.match(/\blocked by(?:\s+user)?\s+["']?([A-Z0-9_.$/-]+)["']?/i) ??
    text.match(/\bbeing edited by(?:\s+user)?\s+["']?([A-Z0-9_.$/-]+)["']?/i) ??
    text.match(/\buser\s+["']?([A-Z0-9_.$/-]+)["']?\s+is\s+currently\s+editing\b/i);
  const transportMatch =
    text.match(/\b(?:in\s+)?(?:task|transport|request)\s+([A-Z0-9]{3,}\d{4,})\b/i) ??
    text.match(/\b([A-Z]\d{2}[A-Z]\d{6})\b/i);

  const user = userMatch?.[1]?.replace(/[.,;:)]$/, '');
  const transport = transportMatch?.[1]?.replace(/[.,;:)]$/, '');
  if (!user && !transport) return undefined;

  return {
    ...(user ? { user } : {}),
    ...(transport ? { transport } : {}),
  };
}

/** Classify SAP ADT errors into actionable domain categories with remediation hints. */
export function classifySapDomainError(statusCode: number, responseBody?: string): SapErrorClassification | undefined {
  const bodyRaw = responseBody ?? '';
  const bodyLower = bodyRaw.toLowerCase();
  const typeId = extractExceptionType(bodyRaw);

  const lockPattern =
    /\blocked by\b|\bbeing edited by\b|\bcurrently editing\b|\bresource is locked\b|\balready locked\b/i.test(bodyRaw);
  if (
    typeId === 'ExceptionResourceLockedByAnotherUser' ||
    ((statusCode === 409 || statusCode === 403) && lockPattern)
  ) {
    const owner = extractLockOwner(bodyRaw);
    const lockHintParts: string[] = ['Object is locked'];
    if (owner?.user && owner?.transport) {
      lockHintParts.push(`by user ${owner.user} in transport ${owner.transport}`);
    } else if (owner?.user) {
      lockHintParts.push(`by user ${owner.user}`);
    } else if (owner?.transport) {
      lockHintParts.push(`in transport ${owner.transport}`);
    } else {
      lockHintParts.push('by another user/session');
    }

    return {
      category: 'lock-conflict',
      hint: `${lockHintParts.join(' ')}. Check SM12 in SAP GUI for lock entries, or wait for the lock to be released.`,
      transaction: 'SM12',
      details: {
        ...(typeId ? { exceptionType: typeId } : {}),
        ...(owner?.user ? { user: owner.user } : {}),
        ...(owner?.transport ? { transport: owner.transport } : {}),
      },
    };
  }

  if (typeId === 'ExceptionResourceInvalidLockHandle' || statusCode === 423) {
    return {
      category: 'enqueue-error',
      hint: 'Lock handle is invalid or expired. The lock may have timed out. Retry the operation so ARC-1 acquires a fresh lock. If the error persists, check SM12 for stale lock entries.',
      transaction: 'SM12',
      details: typeId ? { exceptionType: typeId } : undefined,
    };
  }

  const authPattern = /\bauthorization\b|not authorized|s_develop|s_adt_res|s_transprt/i.test(bodyRaw);
  if (typeId === 'ExceptionNotAuthorized' || (statusCode === 403 && authPattern)) {
    return {
      category: 'authorization',
      hint: 'The SAP user lacks required authorization. Run transaction SU53 in SAP GUI to inspect the last failed authorization check. Common objects: S_DEVELOP (development), S_ADT_RES (ADT resources), S_TRANSPRT (transports). Contact your basis admin or review PFCG role assignments.',
      transaction: 'SU53',
      details: typeId ? { exceptionType: typeId } : undefined,
    };
  }

  const objectExistsPattern = bodyLower.includes('already exists') || bodyLower.includes('does already exist');
  const resourceExistsPattern =
    /\bresource\b[^.\n]*\bdoes?\s+already\s+exist\b/i.test(bodyRaw) ||
    /\bresource\b[^.\n]*\balready exists\b/i.test(bodyRaw);
  if ((typeId === 'ExceptionResourceCreationFailure' || resourceExistsPattern) && objectExistsPattern) {
    return {
      category: 'object-exists',
      hint: 'An object with this name already exists. Use SAPRead to inspect the existing object, or choose a different name.',
      details: typeId ? { exceptionType: typeId } : undefined,
    };
  }

  if (
    /activat(e|ion)/i.test(bodyRaw) &&
    (/\bdependency\b/i.test(bodyRaw) || /\binactive\b/i.test(bodyRaw) || /\bnot active\b/i.test(bodyRaw))
  ) {
    return {
      category: 'activation-dependency',
      hint: "Activation failed due to inactive dependencies. Use SAPRead(type='INACTIVE_OBJECTS') to list inactive objects, then activate dependencies first with SAPActivate.",
      details: typeId ? { exceptionType: typeId } : undefined,
    };
  }

  if (/\badjustment\b|\bupgrade mode\b|\bspau(?:_enh)?\b/i.test(bodyRaw)) {
    return {
      category: 'transport-issue',
      hint: 'SAP is in adjustment/upgrade mode. Development changes may be blocked until upgrade activities are complete. Check SPAU/SPAU_ENH in SAP GUI.',
      transaction: 'SPAU',
      details: typeId ? { exceptionType: typeId } : undefined,
    };
  }

  if (typeId === 'ExceptionMethodNotSupported' || statusCode === 405) {
    return {
      category: 'method-not-supported',
      hint: 'The ADT endpoint rejected this HTTP method. Verify the operation is supported on this SAP release and retry with the correct tool action.',
      details: typeId ? { exceptionType: typeId } : undefined,
    };
  }

  return undefined;
}

function parseOptionalInt(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function extractInlineLineNumber(text: string): number | undefined {
  const match = text.match(/\bline\s+(\d+)\b/i);
  return match?.[1] ? parseOptionalInt(match[1]) : undefined;
}

/** Network-level error (DNS, connection refused, timeout) */
export class AdtNetworkError extends AdtError {
  constructor(
    message: string,
    public readonly cause?: Error,
  ) {
    super(`ADT network error: ${message}`);
    this.name = 'AdtNetworkError';
  }
}

/** Safety system blocked the operation */
export class AdtSafetyError extends AdtError {
  constructor(message: string) {
    super(message);
    this.name = 'AdtSafetyError';
  }
}

/** Check if an error is a specific ADT error type */
export function isNotFoundError(err: unknown): boolean {
  return err instanceof AdtApiError && err.isNotFound;
}

export function isSessionExpiredError(err: unknown): boolean {
  return err instanceof AdtApiError && err.isSessionExpired;
}
