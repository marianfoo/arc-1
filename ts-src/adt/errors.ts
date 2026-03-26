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
    super(`ADT API error: status ${statusCode} at ${path}: ${message}`);
    this.name = 'AdtApiError';
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
