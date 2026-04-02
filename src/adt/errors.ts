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
