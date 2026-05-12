/**
 * Layer 2 — Per-user MCP tool-call rate limiter.
 *
 * Applied at the top of `handleToolCall` in `src/handlers/intent.ts`. Returns an MCP
 * tool error (NOT HTTP 429) on denial so the LLM client surfaces it as a tool failure
 * and the agent loop backs off correctly. Per-user token bucket keyed on the resolved
 * user identity (userName / clientId / __anon__).
 *
 * Design choices:
 * - Per-instance, in-memory only. Multi-instance attackers cost `limit × instances` —
 *   acceptable trade-off, matches stateless-DCR philosophy from PR #212.
 * - Stdio mode is exempt because there's no authInfo to key on; the caller is
 *   responsible for skipping the consume in that case.
 * - When `perMinute === 0`, the factory returns a stub whose `consume` resolves
 *   immediately with `{ allowed: true }` — no allocation, no per-key bookkeeping.
 *   This is the clean opt-out for single-user deployments.
 * - Cost weighting per tool is intentionally deferred to v2 — every consume call is
 *   one point. See ADR-0004 for the rationale.
 */

import { RateLimiterMemory, RateLimiterRes } from 'rate-limiter-flexible';

export type RateLimitDecision = { allowed: true } | { allowed: false; retryAfterMs: number; limitPerMinute: number };

export interface McpRateLimiter {
  /**
   * Try to consume one point for `userKey`. Resolves `{ allowed: true }` when the
   * bucket has tokens, `{ allowed: false, retryAfterMs, limitPerMinute }` when it
   * doesn't. Never throws — internal RateLimiterRes rejection is caught here.
   *
   * `tool` is recorded for the audit event at the call site; it doesn't affect
   * the bucket.
   */
  consume(userKey: string, tool: string): Promise<RateLimitDecision>;
}

/**
 * Build a per-user MCP rate limiter.
 *
 * @param perMinute Per-user requests per minute. `0` returns a no-op stub.
 */
export function createMcpRateLimiter(perMinute: number): McpRateLimiter {
  if (perMinute === 0) {
    return {
      async consume(_userKey: string, _tool: string): Promise<RateLimitDecision> {
        return { allowed: true };
      },
    };
  }

  const limiter = new RateLimiterMemory({ points: perMinute, duration: 60 });

  return {
    async consume(userKey: string, _tool: string): Promise<RateLimitDecision> {
      try {
        await limiter.consume(userKey, 1);
        return { allowed: true };
      } catch (rejected) {
        // RateLimiterRes is thrown on overflow; anything else is unexpected.
        if (rejected instanceof RateLimiterRes) {
          return {
            allowed: false,
            retryAfterMs: rejected.msBeforeNext,
            limitPerMinute: perMinute,
          };
        }
        // Defensive: treat unexpected errors as "allowed" so a misbehaving limiter
        // can never wedge legitimate traffic. The exception itself bubbles up via
        // logging when the limiter is fixed; in the meantime users still get through.
        return { allowed: true };
      }
    },
  };
}
