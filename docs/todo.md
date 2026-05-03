## PR #196 split + ARCH-01 follow-ups (2026-04-28)

Tracks the multi-PR split of [PR #196](https://github.com/marianfoo/arc-1/pull/196) and downstream architectural work. See `docs/adr/0001..0003.md` for decisions and `docs/plans/pr-{alpha,beta,gamma}-*.md` + `docs/plans/discovery-driven-endpoint-routing.md` for execution plans.

- [ ] **Post review on PR [#196](https://github.com/marianfoo/arc-1/pull/196)** explaining the split (PR-α / PR-β / PR-γ / ARCH-01 / PR-ε), linking to the ADRs and plans. Decide author-rework vs maintainer-driven split (recommendation: maintainer-driven for the three ship-now PRs, invite samibouge to own ARCH-01 if interested).
- [ ] **Execute PR-α** (`docs/plans/pr-alpha-cookie-hot-reload.md`) — cookie hot-reload. Fully independent. Target: 1 day.
- [ ] **Execute PR-β** (`docs/plans/pr-beta-three-file-sync-and-universal-guards.md`) — three-file sync + universal write guards. Fully independent. Target: 1 day.
- [ ] **Execute PR-γ** (`docs/plans/pr-gamma-nw750-quirks-refined.md`) — NW 7.50 lock-conflict + MSAG transport guard, refined per ADR-0002. Fully independent. Target: 1-2 days.
- [ ] **Execute ARCH-01** (`docs/plans/discovery-driven-endpoint-routing.md`) — discovery-driven routing foundation. Capture A4H 758 probe fixture during Task 1. Blocks PR-ε. Target: 3-5 days.
- [ ] **Plan + execute PR-ε** — drop static release gates and `isRelease750()`, swap in `resolveSourceUrl` and `filterByDiscovery`. Write the plan as `docs/plans/release-gates-cleanup.md` once ARCH-01 has merged. Target: 1-2 days.
- [ ] **Triage** the 404 `deletion-blocked` classifier proposed in PR #196 — current recommendation: drop, because no live reproducer exists (verified against A4H + NPL on 2026-04-28; existing `isDeleteDependencyError` covers the broader case with auto-`where_used` lookup). If anyone disagrees, open *"Capture a real 404 + 'cannot be deleted…referenced' reproducer (system + object + body) before adding a classifier"* before re-adding the code.
- [ ] **Triage**: confirm `version=active|inactive` on SAPRead is deferred to FEAT-24 / etag plan per [ADR-0003](adr/0003-sapread-version-stays-internal.md). Update FEAT-24 detail section to mention `version` design.
- [ ] **Track ARCH-02 / ARCH-03**: small follow-ups already partially shipped via PR-γ. ARCH-02 is the migration of any remaining body-marker heuristics to structured-exception classification. ARCH-03 generalizes the per-batch transport cache. Both are P2/P3 — no urgency.

## Existing TODOs

- [ ] check each auth method and test manually
- [ ] change and activate a field in a CDS View that multiple other CDS Views depends on (recognize dependencies and react accordingly, may ask user for confirmation)
- [ ] use abap-file-format for better creations and in skills  /Users/marianzeis/DEV/arc-1-ralphex/compare/J4D/03-abap-file-formats-opportunity.md
- [ ] test SAPWrite and SAPActivate in a vibe coding session against a real SAP system
- [ ] test abaplint with arc-1
- [ ] test skills
- [ ] update all compare and feature matrix
- [ ] for every new features/change it should be checked:
  - [ ] internal technical documentation
  - [ ] enduser documentation (while editing, check if something is missing/outdated)
  - [ ] roadmap.md
  - [ ] feature matrix
  - [ ] tests (unit, integration, e2e)
  - [ ] Skills (check if skills are up to date and if new features are covered and can be improved with existing features in arc-1)