# ADR 0004 — Layered Rate Limiting (per-instance, three layers, two operator knobs)

**Status:** Accepted
**Date:** 2026-05-12
**Related PR:** [#276](https://github.com/marianfoo/arc-1/pull/276)
**Closes:** [SEC-05](../../docs_page/roadmap.md#sec-05), CodeQL alert #12 (`js/missing-rate-limiting`)
**Supersedes:** N/A
**Superseded by:** N/A

## Context

Three independent threats were uncovered during planning ([docs/plans/layered-rate-limiting.md](../plans/layered-rate-limiting.md)):

1. **SAP backend overload.** The pre-existing `Semaphore` ([src/adt/semaphore.ts](../../src/adt/semaphore.ts)) was constructed **per `AdtClient`** at [src/adt/client.ts:183](../../src/adt/client.ts:183). With principal propagation enabled, `createPerUserClient` builds a fresh `AdtClient` per MCP request → 100 active PP users gave 100 × `ARC1_MAX_CONCURRENT` concurrent SAP requests, not the documented total. An LLM-driven developer fires tool calls every 1–3 s with batch bursts; the aggregate request rate from 100 ARC-1 users can be 10–50× that of 100 Eclipse users. The same SAP dialog-work-process pool absorbs both.

2. **OAuth abuse.** The OAuth endpoints (`/register`, `/authorize`, `/token`, `/revoke`) and `/mcp` had no rate limit. CodeQL flagged `js/missing-rate-limiting` on `/authorize` (alert #12, dismissed with rationale *"tracked in SEC-05"*). Anyone reachable on the network could spam `/register` (triggers HMAC work for stateless DCR) or replay `/token` attempts in a credential-stuffing pattern.

3. **Noisy neighbors.** No per-user fairness. A single developer's LLM in a tight retry loop could starve the shared `Semaphore` and degrade every other user's experience.

## Decision

Ship three layers, per-instance, in-memory only. Two operator-facing env vars total — per-endpoint OAuth ceilings live as constants in code.

### Layer 1 — HTTP-edge per-IP (OAuth abuse + `/mcp` probing)

- `express-rate-limit` mounted at [src/server/http.ts](../../src/server/http.ts) before any auth middleware.
- One operator knob: `ARC1_AUTH_RATE_LIMIT` (default `20/min/IP`). `0` disables.
- OAuth endpoints all use the operator-facing baseline uniformly; `/mcp` gets `max(value × 30, 600)/min/IP` to absorb legitimate batched tool-call traffic.
- Per-endpoint differentiation lives in `buildLimiter(endpoint)` in `http.ts`, NOT in env — if a constant is wrong, it's a code change. This keeps the operator surface at one knob, not five.
- On hit: HTTP `429` + `Retry-After` + RFC 9331 `RateLimit-*` headers + typed `auth_rate_limited` audit event.

### Layer 2 — Per-user MCP quota (fairness)

- `rate-limiter-flexible` (memory backend), keyed on `authInfo.userName ?? clientId ?? '__anon__'`, applied at the top of `handleToolCall` in [src/handlers/intent.ts](../../src/handlers/intent.ts).
- One operator knob: `ARC1_RATE_LIMIT` (default `60/min/user`). `0` returns a no-op stub.
- On hit: MCP **tool error** with structured `{ error: 'rate_limited', retryAfter, message }` (NOT HTTP 429). The LLM client surfaces this as a tool failure and the agent loop backs off via its own retry policy — returning HTTP 429 at the MCP-transport layer would kill the whole MCP session rather than this one tool call.
- Stdio mode (no `authInfo`) is exempt — no user identity to key on, and stdio is single-user by design.
- Cost weighting per tool is deferred to v2. Every consume call counts as one point.

### Layer 3 — SAP-bound shared semaphore (backend protection)

- Promote the existing `Semaphore` from per-client to **one server-wide instance**, constructed in `createAndStartServer` in [src/server/server.ts](../../src/server/server.ts) and threaded into every `AdtClient` (shared startup client + per-user PP clients).
- No new env var — `ARC1_MAX_CONCURRENT` (existing, default `10`) keeps its name; only its scope tightens.
- Honor `Retry-After` on both `429` and `503` via a new pure helper `parseRetryAfter` in [src/adt/http.ts](../../src/adt/http.ts). Clamped to `[0, 60_000]` ms so a misbehaving gateway can't stall us indefinitely and a too-small/past value can't degenerate into a hot retry loop. The audit event records `source: header` vs `source: fallback`.
- Single retry per request, guarded by per-request booleans (`retried429` alongside `dbRetried` / `authRetried`).

## Consequences

**Operators**:
- Must size Layer 3 against `rdisp/wp_no_dia`. The Rate Limiting Guide has worked-example math: `ARC1_MAX_CONCURRENT = floor(0.6 × wp_no_dia / N_instances)`.
- Multi-instance deployments behind a load balancer give `N × limit` effective ceilings for Layers 1 and 2. Layer 3 is per-instance and must be sized to share its `rdisp/wp_no_dia` budget across `N`.
- Layer 2 keyed on `userName ?? clientId` — anon traffic shares one bucket. Operators expecting many DCR-anonymous clients should account for that.

**Security posture**:
- CodeQL alert `js/missing-rate-limiting` on `/authorize` (alert #12) closes on the next scan.
- Multi-instance attackers cost `N × limit` for Layers 1 and 2. Acceptable trade-off — preserving the stateless-deployment property from PR #212 is more valuable than perfect distributed-attack mitigation.

**Code paths**:
- `AdtClient` retains the `maxConcurrent` fallback for stdio/tests when no `adtSemaphore` is provided. Server-mode always provides one.
- `handleToolCall` gains an optional `mcpRateLimiter` parameter. Existing tests that call it without the limiter still pass — the rate-limit branch is skipped cleanly when the limiter is absent or `authInfo` is missing.

## Alternatives considered and rejected

### Redis-backed shared state across instances
Rejected. Re-introduces exactly the shared state PR #212 removed for stateless DCR. The threat model — internal MCP server behind XSUAA, typically 1–4 instances — does not justify the operational burden. Multi-instance attackers cost `N × limit`; that's acceptable.

### Five per-endpoint OAuth env vars
Rejected. Operators would need to understand the per-endpoint cost model (HMAC on `/register` vs. credential-replay on `/token`) to tune them meaningfully. Folding them into one baseline keeps the surface tiny — if `/register` proves too tight in practice, lower the in-code constant in `auth-rate-limit.ts` and re-release. Pre-1.0 explicitly allows this.

### Cost-weighted per-tool quota (Layer 2 v2)
Deferred. Every consume call counts as one point in v1. Cost weighting (e.g. `SAPActivate` = 10, `SAPRead` = 1) requires telemetry to size. Ship the simple version, gather data from the audit log, add weights when justified.

### Monitor-mode for Layer 2 (audit-only, no enforcement)
Considered, rejected for v1. Defaults are conservative enough (`60/min/user` = 1/sec sustained with bucket-refill burst), and pre-1.0 we can iterate quickly. Adds an env var (`ARC1_RATE_LIMIT_MODE`) for no concrete win in v1.

### `p-queue` with `intervalCap` (Layer 3 RPS cap)
Rejected for v1. Layer 3 concurrency-only is enough for the headline backend-overload fix. RPS caps add a second tuning knob without observable benefit — if concurrency is right, RPS naturally bounds. Reconsider if telemetry justifies it.

### Circuit breaker on repeated 429/503
Rejected for v1. Single retry with `Retry-After` honoring already gives graceful degradation. A circuit breaker adds state, complexity, and a third tuning knob (open/closed/half-open thresholds) for marginal benefit. Reconsider if production data shows the single-retry is insufficient.

## References

- [Rate Limiting Guide](../../docs_page/rate-limiting.md) — operator-facing guide
- [docs/plans/layered-rate-limiting.md](../plans/layered-rate-limiting.md) — implementation plan
- [docs_page/roadmap.md#sec-05](../../docs_page/roadmap.md#sec-05) — original roadmap entry
- [PR #212](https://github.com/marianfoo/arc-1/pull/212) — stateless DCR (the design we preserve by going per-instance)
