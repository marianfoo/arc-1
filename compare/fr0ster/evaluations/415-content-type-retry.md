# 415 Content-Type Auto-Retry

> **Priority**: High (Critical #3 in feature matrix)
> **Source**: fr0ster issues #22, #23, #25 — commits 3da3311, 32ab9d4 (2026-03-26)
> **Status**: Pending implementation in ARC-1

## The problem

SAP systems (especially older ones) reject requests with wrong `Accept` or `Content-Type` headers, returning HTTP 415.

Examples from fr0ster issues:
- `ListTransports` fails with `ExceptionResourceNotAcceptable` — SAP wants `application/atom+xml` but client sends `application/xml`
- `checkruns` endpoint fails with 415 — Content-Type mismatch

## What fr0ster did

1. **Issue #25**: Enabled `enableAcceptCorrection` on all ADT client instances — this is a setting in their `adt-clients` lib that automatically retries with a corrected Accept header on 415
2. **Issue #23**: Rewrote `ListTransports` to use the ADT client with Accept negotiation instead of raw HTTP calls
3. **Issue #22**: Added Content-Type auto-detection on checkruns + guaranteed unlock (the unlock part ARC-1 already has)

## What ARC-1 needs

ARC-1 uses raw axios in `src/adt/http.ts`. Two options:

### Option A: Retry interceptor (recommended)
Add an axios response interceptor that catches 415 errors, flips `Accept` between `application/xml` and `application/atom+xml`, and retries once.

### Option B: Per-endpoint Accept header map
Maintain a map of ADT endpoints to their expected Accept headers. More precise but harder to maintain.

**Recommendation**: Option A — simple, catches all cases, max 1 retry.

**Effort estimate**: 0.5 day

## Decision

**Implement Option A** — add 415 retry interceptor to `src/adt/http.ts`. Low effort, high robustness gain.
