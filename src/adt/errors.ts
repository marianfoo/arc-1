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

/** HTTP-level API error from SAP ADT */
export class AdtApiError extends AdtError {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly path: string,
    public readonly responseBody?: string,
  ) {
    // Extract a human-readable message, stripping raw XML/HTML.
    // Try the truncated message first; if that only yields a generic title (e.g., "Application Server Error"),
    // retry with the full responseBody which may contain deeper error details (e.g., <span id="msgText">).
    let clean = AdtApiError.extractCleanMessage(message);
    if (responseBody && responseBody.length > message.length && /^Application Server Error/.test(clean)) {
      const deepClean = AdtApiError.extractCleanMessage(responseBody);
      if (deepClean !== clean) clean = deepClean;
    }
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

    // 2. Try HTML: extract SAP's error detail from <span id="msgText"> or <p class="detailText">
    //    SAP 500 pages embed the actual error (e.g., "Syntax error in program ...") in these elements.
    const msgTextMatch =
      raw.match(/<span\s+id="msgText"[^>]*>([^<]+)</) ?? raw.match(/<p\s+class="detailText"[^>]*>([^<]+)</);
    if (msgTextMatch?.[1]) {
      const detail = msgTextMatch[1].trim();
      // Also grab the title for context (e.g., "Application Server Error")
      const titleMatch = raw.match(/<title>([^<]+)</);
      const title = titleMatch?.[1]?.trim();
      return title && title !== detail ? `${title}: ${detail}` : detail;
    }

    // 3. Try HTML: extract <title> or <h1> content
    const htmlMatch = raw.match(/<title>([^<]+)</) ?? raw.match(/<h1>([^<]+)</);
    if (htmlMatch?.[1]) {
      return htmlMatch[1].trim();
    }

    // 4. If no XML/HTML tags at all, it's plain text — use as-is (truncated)
    if (!raw.includes('<')) {
      return raw.slice(0, 300);
    }

    // 5. Fallback: strip all tags and use whatever text remains
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
