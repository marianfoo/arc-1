/**
 * Shared helpers for asserting expected SAP error shapes in test catch blocks.
 *
 * Use these instead of empty catches or catch-and-ignore patterns.
 */

import { expect } from 'vitest';

/**
 * Classification of SAP error types by their likely cause.
 */
export type SapFailureCategory = 'not-found' | 'forbidden' | 'not-released' | 'timeout' | 'connectivity' | 'unknown';

/**
 * Type guard: checks that the value is an Error with a string message.
 */
export function isSapError(error: unknown): error is Error & { message: string } {
  return error instanceof Error && typeof error.message === 'string';
}

/**
 * Assert that an error is an Error instance whose message contains one of the
 * allowed HTTP status codes or matches one of the allowed patterns.
 *
 * @param error - The caught error
 * @param allowedStatuses - HTTP status codes considered acceptable (e.g., [404, 403])
 * @param allowedPatterns - Optional regex patterns that also indicate an expected failure
 *
 * @example
 * ```ts
 * catch (err) {
 *   expectSapFailureClass(err, [404], [/not found/i]);
 * }
 * ```
 */
export function expectSapFailureClass(error: unknown, allowedStatuses: number[], allowedPatterns: RegExp[] = []): void {
  expect(error).toBeInstanceOf(Error);
  const msg = (error as Error).message;

  const statusMatch = allowedStatuses.some((s) => msg.includes(String(s)));
  const patternMatch = allowedPatterns.some((p) => p.test(msg));

  if (!statusMatch && !patternMatch) {
    throw new Error(
      `Unexpected SAP error shape. Message: "${msg}". ` +
        `Expected one of statuses [${allowedStatuses.join(', ')}] or patterns [${allowedPatterns.map((p) => p.toString()).join(', ')}].`,
    );
  }
}

/**
 * Assert that an error is an Error whose message contains a specific substring.
 * Simpler alternative to `expectSapFailureClass` for straightforward checks.
 */
export function expectSapErrorContains(error: unknown, substring: string): void {
  expect(error).toBeInstanceOf(Error);
  const msg = (error as Error).message;
  if (!msg.includes(substring)) {
    throw new Error(`Expected SAP error message to contain "${substring}", but got: "${msg}"`);
  }
}

/**
 * Classify a caught error into a SapFailureCategory based on status codes
 * or message patterns.
 */
export function classifySapError(error: unknown): SapFailureCategory {
  if (!isSapError(error)) return 'unknown';
  const msg = error.message;

  if (msg.includes('404') || /not found/i.test(msg)) return 'not-found';
  if (msg.includes('403') || /forbidden/i.test(msg)) return 'forbidden';
  if (/not released/i.test(msg)) return 'not-released';
  if (/timeout|ETIMEDOUT/i.test(msg)) return 'timeout';
  if (/ECONNREFUSED|ECONNRESET|ENOTFOUND|connect/i.test(msg)) return 'connectivity';

  return 'unknown';
}
