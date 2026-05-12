import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseRetryAfter } from '../../../src/adt/http.js';

/**
 * Task 2 (Layer 3): Retry-After header parsing.
 *
 * Tests the pure helper. The full 429/503 retry flow against a mocked fetch lives in
 * tests/unit/adt/http.test.ts; here we test only the parser semantics.
 */
describe('parseRetryAfter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-12T14:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('parses delta-seconds form', () => {
    expect(parseRetryAfter('5', 9999)).toEqual({ delayMs: 5000, source: 'header' });
    expect(parseRetryAfter('30', 9999)).toEqual({ delayMs: 30_000, source: 'header' });
  });

  it('parses HTTP-date form', () => {
    // 10 s in the future from the frozen system time
    const future = new Date('2026-05-12T14:00:10.000Z').toUTCString();
    expect(parseRetryAfter(future, 9999)).toEqual({ delayMs: 10_000, source: 'header' });
  });

  it('falls back when header is missing', () => {
    expect(parseRetryAfter(null, 1500)).toEqual({ delayMs: 1500, source: 'fallback' });
    expect(parseRetryAfter(undefined, 1500)).toEqual({ delayMs: 1500, source: 'fallback' });
    expect(parseRetryAfter('', 1500)).toEqual({ delayMs: 1500, source: 'fallback' });
  });

  it('falls back on unparseable input', () => {
    expect(parseRetryAfter('not-a-number', 1500)).toEqual({ delayMs: 1500, source: 'fallback' });
    expect(parseRetryAfter('abc123', 1500)).toEqual({ delayMs: 1500, source: 'fallback' });
  });

  it('clamps oversized delta-seconds to 60 s', () => {
    expect(parseRetryAfter('99999', 1500)).toEqual({ delayMs: 60_000, source: 'header' });
    expect(parseRetryAfter('120', 1500)).toEqual({ delayMs: 60_000, source: 'header' });
  });

  it('clamps negative delta-seconds to 0', () => {
    expect(parseRetryAfter('-5', 1500)).toEqual({ delayMs: 0, source: 'header' });
  });

  it('clamps past HTTP-date to 0', () => {
    const past = new Date('2026-05-12T13:59:50.000Z').toUTCString();
    expect(parseRetryAfter(past, 1500)).toEqual({ delayMs: 0, source: 'header' });
  });

  it('also clamps oversized fallback values', () => {
    expect(parseRetryAfter(null, 999_999)).toEqual({ delayMs: 60_000, source: 'fallback' });
  });

  it('treats whitespace-padded input as the underlying form', () => {
    expect(parseRetryAfter('  5  ', 1500)).toEqual({ delayMs: 5000, source: 'header' });
  });
});
