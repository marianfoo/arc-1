# ADR 0003 — SAPRead `version` parameter stays internal until diff feature is designed

**Status:** Re-affirmed (originally decided 2026-04-26 in [docs/plans/etag-conditional-get-and-inactive-objects-fix.md](../plans/etag-conditional-get-and-inactive-objects-fix.md))
**Date:** 2026-04-28
**Related PR:** [#196](https://github.com/marianfoo/arc-1/pull/196) (NW 7.50 compatibility fixes — proposed `version` on SAPRead)
**Supersedes:** N/A
**Superseded by:** N/A — pending FEAT-DIFF design and the etag plan

## Context

[PR #196](https://github.com/marianfoo/arc-1/pull/196) proposes adding `version: 'active' \| 'inactive'` to `SAPReadSchema` / `SAPReadSchemaBtp`, with an early-return path in [src/handlers/intent.ts](../../src/handlers/intent.ts) that appends `?version=…` to the source URL.

The pre-existing etag-and-inactive-objects plan (commit `c9ebe47`, [docs/plans/etag-conditional-get-and-inactive-objects-fix.md](../plans/etag-conditional-get-and-inactive-objects-fix.md)) explicitly excluded this surface change in Design Principle #6:

> **No breaking changes to the SAPRead schema.** This plan does not add a `version` parameter to the SAPRead Zod schema or tool description. The cache internally tracks versions for correctness; the surface stays exactly as today. A future plan can add the user-facing parameter if there's demand for reading inactive drafts directly.

Live probe of A4H 758 SP02 confirmed both halves of this plan's reasoning are accurate:

- The SAP server already supports `?version=active|inactive` on source URLs and returns different etags per version (DDLS `I_TIMEZONE` returned etag suffix `…0011` for active, `…0001` for inactive — exactly matching the etag plan's predicted cache-key shape).
- Surfacing `version` on `SAPRead` would design a public API on top of a backend feature the etag plan already plans to consume internally.

The roadmap also already lists [FEAT-24 CompareSource (Diff)](../../docs_page/roadmap.md) as the home for user-facing version-aware reads — *"Client-side diff of two revision sources — ADT has no server-side diff endpoint"*. Adding `version` on `SAPRead` now creates a near-future API churn (add now, possibly remove or restructure when FEAT-DIFF lands).

PR [#179](https://github.com/marianfoo/arc-1/pull/179) (already merged) added `version: 'active' \| 'inactive'` to `SAPDiagnose action=syntax`, scoped to the syntax-check use case where active-vs-inactive matters today (post-write diagnostics on the inactive draft).

## Decision

Defer surfacing `version` on `SAPRead` until FEAT-DIFF is designed. Concrete actions:

1. Drop the `version` field from `SAPReadSchema` and `SAPReadSchemaBtp` in [src/handlers/schemas.ts](../../src/handlers/schemas.ts).
2. Drop the early-return `version` branch in `handleSAPRead` (around line 1404 in PR #196's intent.ts) and the associated `SOURCE_TYPES` set.
3. Drop the `version` property from the SAPRead JSON schema in [src/handlers/tools.ts](../../src/handlers/tools.ts).
4. Treat the `version` axis as **cache-internal only**, exactly as the etag plan specifies. When the etag plan ships the cache key change to `(type, name, version)`, the existing `version` query parameter becomes part of the conditional-GET layer — invisible to LLMs.
5. The STRU active/inactive lifecycle e2e test added by PR #196 ([tests/e2e/ddic-write.e2e.test.ts](../../tests/e2e/ddic-write.e2e.test.ts)) is restructured: assert STRU CRUD round-trip (create → activate → update → activate → delete) without a `version` parameter. The active/inactive comparison can be re-added later via `SAPDiagnose action=syntax version=…` (already exposed) if needed for regression coverage.

## Consequences

**Positive:**

- Avoids a public-API change that conflicts with already-decided design.
- Defers a feature with no current consumer asking for it (the PR description does not cite an LLM workflow that needs `version` on SAPRead).
- Keeps the schema small — every property added to SAPRead is paid for by every LLM that loads ARC-1's tool schema.
- Preserves the etag plan's coherent design (version-aware cache key, no surface change).

**Negative:**

- Loses the active-vs-inactive read assertion currently in PR #196's STRU lifecycle e2e test. Mitigated by `SAPDiagnose action=syntax version=…` providing equivalent coverage if needed.
- The PR #196 author's expressed use case — *"my code introduces the ability to read inactive versions, this might impact your work with caching/ETag"* — is acknowledged but reframed: that capability already exists at the HTTP layer, the etag plan consumes it internally, and an LLM-facing surface needs the diff context (FEAT-DIFF) to be useful.

## When this ADR is revisited

Revisit when **either**:

- FEAT-DIFF design lands. The diff feature naturally needs to address version selection; the user-facing surface for `version` should be designed alongside it.
- A concrete consumer requests version-aware reads outside the diff context (with use case documented as a roadmap entry).

## Alternatives considered

**Accept the `version` parameter as PR #196 ships it.** Rejected — conflicts with the etag plan's Principle #6, and creates near-future API churn when FEAT-DIFF lands.

**Add a feature flag (`SAP_EXPOSE_INACTIVE_READ=true`).** Rejected — adds permanent config surface for a feature whose surface should be designed in one place (FEAT-DIFF), not scattered across opt-ins.

## References

- [docs/plans/etag-conditional-get-and-inactive-objects-fix.md](../plans/etag-conditional-get-and-inactive-objects-fix.md) — the pre-existing plan with Principle #6.
- [docs_page/roadmap.md](../../docs_page/roadmap.md) FEAT-24 CompareSource (Diff) — where user-facing version belongs.
- PR [#179](https://github.com/marianfoo/arc-1/pull/179) — SAPDiagnose `version` precedent.
- Live probe (2026-04-28): A4H DDLS `I_TIMEZONE` returns distinct etags per version, confirming the etag plan's cache-key design works on real systems.
