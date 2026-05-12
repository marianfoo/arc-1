import { describe, expect, it } from 'vitest';
import { createMcpRateLimiter } from '../../../src/server/mcp-rate-limit.js';

/**
 * Task 4 (Layer 2): Per-user MCP tool-call rate limiter.
 *
 * Pure unit tests of the limiter wrapper. The handler-integration tests
 * (handleToolCall returns MCP tool error on denial) live in
 * tests/unit/handlers/intent-rate-limit.test.ts.
 */
describe('createMcpRateLimiter (Layer 2)', () => {
  it('allows requests under the per-minute cap', async () => {
    const limiter = createMcpRateLimiter(5);
    const decisions = await Promise.all(Array.from({ length: 5 }, () => limiter.consume('userA', 'SAPRead')));
    expect(decisions.every((d) => d.allowed === true)).toBe(true);
  });

  it('denies the (N+1)-th request with retryAfterMs > 0 and the configured limit', async () => {
    const limiter = createMcpRateLimiter(3);
    await limiter.consume('userA', 'SAPRead');
    await limiter.consume('userA', 'SAPRead');
    await limiter.consume('userA', 'SAPRead');
    const denied = await limiter.consume('userA', 'SAPRead');
    expect(denied.allowed).toBe(false);
    if (denied.allowed) throw new Error('type guard'); // narrow for TS
    expect(denied.retryAfterMs).toBeGreaterThan(0);
    expect(denied.retryAfterMs).toBeLessThanOrEqual(60_000);
    expect(denied.limitPerMinute).toBe(3);
  });

  it('tracks two distinct user keys independently', async () => {
    const limiter = createMcpRateLimiter(2);
    // User A: 2 succeed
    expect((await limiter.consume('userA', 'SAPRead')).allowed).toBe(true);
    expect((await limiter.consume('userA', 'SAPRead')).allowed).toBe(true);
    // User A's 3rd should fail
    expect((await limiter.consume('userA', 'SAPRead')).allowed).toBe(false);
    // User B starts fresh — first two should succeed
    expect((await limiter.consume('userB', 'SAPRead')).allowed).toBe(true);
    expect((await limiter.consume('userB', 'SAPRead')).allowed).toBe(true);
  });

  it('perMinute=0 returns a no-op stub that always allows', async () => {
    const limiter = createMcpRateLimiter(0);
    const decisions = await Promise.all(Array.from({ length: 1000 }, () => limiter.consume('userA', 'SAPRead')));
    expect(decisions.every((d) => d.allowed === true)).toBe(true);
  });

  it('tool parameter does not affect the bucket — it is only an audit label', async () => {
    const limiter = createMcpRateLimiter(2);
    // Both calls (different tools, same user) consume from the same bucket
    expect((await limiter.consume('userA', 'SAPRead')).allowed).toBe(true);
    expect((await limiter.consume('userA', 'SAPWrite')).allowed).toBe(true);
    // The third hits the limit
    expect((await limiter.consume('userA', 'SAPSearch')).allowed).toBe(false);
  });
});
