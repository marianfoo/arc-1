/**
 * Shared helpers for asserting expected SAP error shapes in test catch blocks.
 *
 * Use these instead of empty catches or catch-and-ignore patterns.
 */

import { expect } from 'vitest';

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
