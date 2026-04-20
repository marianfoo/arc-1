# Integration test skips — taxonomy

The integration suite is designed to **skip cleanly** (never fail) when the target SAP system lacks a feature, fixture, or policy permission required by a test. A healthy run on *any* system reports some skips — the question is whether the skips match that system's profile.

This doc is the map. When you see a `↓ [SkipReason.…]` line in a test run, look up the category here to understand (a) why it's firing, (b) whether it's expected on your system, and (c) when investigation would be warranted.

For a runtime summary that aggregates skips per category after a run, see [scripts/ci/summarize-skips.mjs](../scripts/ci/summarize-skips.mjs) (run via `npm run test:integration:skip-summary`).

> **Note on counts:** the summary tool parses per-test `↓` lines, which vitest emits for tests skipped via `ctx.skip()` / `requireOrSkip()`. **File- or describe-level skips** — like the whole BTP ABAP suite skipping when `TEST_BTP_SERVICE_KEY_FILE` isn't set, or the gCTS suite when the backend doesn't have gCTS — are rolled up in the `Test Files … skipped` summary line instead. The summary tool reads both and reports the delta; see the "Note:" line at the end of its output if your run shows more total skipped tests than per-test `↓` lines.

## How to read this

- **Typical on** — systems where this skip is routine; seeing it is healthy, not a bug.
- **Should NOT skip on** — if this skip fires on a listed system, that's a regression signal; investigate.
- **Skip message pattern** — what you grep for in test output. All skips emit `ctx.skip("<message>")` which vitest prints as `↓ <test> [<message>]`.

## Skip reason constants

The base codes live in [tests/helpers/skip-policy.ts](../tests/helpers/skip-policy.ts):

| Code | Meaning |
|---|---|
| `NO_CREDENTIALS` | `TEST_SAP_URL` / `TEST_SAP_USER` / `TEST_SAP_PASSWORD` not set |
| `NO_FIXTURE` | Object the test expects is absent from the target system |
| `NO_DDLS` | Walks the catalog looking for *any* readable DDLS, finds none |
| `NO_DUMPS` | ST22 shows no short dumps on this system |
| `NO_TRANSPORT_PACKAGE` | `TEST_TRANSPORT_PACKAGE` env var not set |
| `BACKEND_UNSUPPORTED` | Feature genuinely not available on this SAP release |

Tests typically suffix these with a specific clause explaining *which* fixture or feature, e.g. `NO_FIXTURE (/DMO/CL_FLIGHT_LEGACY) — S/4 demo content`.

## Category 1 — S/4-only demo content

**What it is:** Objects SAP ships only on S/4HANA boxes (Flight Reference Scenario `/DMO/*`, BOBF demos, S/4 CDS views). These never existed on plain NetWeaver systems and will not exist on pre-S/4 releases regardless of SP level.

| Skip message fragment | Affected tests | Typical on | Should NOT skip on |
|---|---|---|---|
| `NO_FIXTURE (/DMO/CL_FLIGHT_LEGACY)` | `context.integration.test.ts` dep-extraction, contract extraction, method surgery (~9 tests) | Plain NW ≤ 7.58, BTP ABAP | S/4HANA any release |
| `NO_FIXTURE (/DMO/IF_FLIGHT_LEGACY)` | `context.integration.test.ts` interface deps (~3 tests) | Plain NW, BTP ABAP | S/4HANA any release |
| `NO_FIXTURE (/DMO/CL_FLIGHT_AMDP)` | `adt.integration.test.ts` AMDP include variants (5 tests) | Plain NW, BTP ABAP | S/4HANA any release |
| `NO_FIXTURE (/DMO/ DDLX)` | `adt.integration.test.ts` DDLX read tests (2 tests) | Plain NW, BTP ABAP | S/4HANA any release |
| `NO_FIXTURE (/DMO/ SRVB)` | `adt.integration.test.ts` SRVB read tests (2 tests) | Plain NW, BTP ABAP | S/4HANA any release |
| `NO_FIXTURE (ZCL_DEMO_D_CALC_AMOUNT)` | `context.integration.test.ts` inheritance; `cache.integration.test.ts` dep-graph (4 tests) | Plain NW, BTP ABAP | S/4HANA with BOBF |
| `NO_FIXTURE (I_ABAPPACKAGE)` | `adt.integration.test.ts` CDS impact classifier (2 tests) | Plain NW, BTP ABAP | S/4HANA any release |

**When to investigate:** If any of these fire on an S/4HANA system, the Flight Reference Scenario package may not be deployed, or the user lacks authorization to read `/DMO/*`.

## Category 2 — Release gap (pre-7.52 / pre-RAP)

**What it is:** ADT endpoints or content types that didn't exist yet on older SAP_BASIS levels. These are the issue #162 core cases — the probe should have already classified the underlying endpoint as `unavailable-*` before the test even runs.

| Skip message fragment | Affected tests | Typical on | Should NOT skip on |
|---|---|---|---|
| `BACKEND_UNSUPPORTED: DOMA reads not supported on this release` | `adt.integration.test.ts` domain metadata (MANDT, BUKRS) (2 tests) | NW 7.50–7.51 | SAP_BASIS ≥ 7.52 |
| `BACKEND_UNSUPPORTED: DTEL v2 content type not supported on this release` | `crud.lifecycle.integration.test.ts` DTEL + DOMA+DTEL lifecycle (2 tests) | NW 7.50–7.51 | SAP_BASIS ≥ 7.52 |
| `BACKEND_UNSUPPORTED: /datapreview/ddic endpoint not available on this release` | `adt.integration.test.ts` table contents, POST/CSRF session (4 tests) | NW 7.50 (depends on SP/activation) | Most modern releases |
| `BACKEND_UNSUPPORTED: /ddic/domains endpoint not available on this release` | `crud.lifecycle.integration.test.ts` DOMA CRUD variants (2 tests) | NW 7.50–7.51 | SAP_BASIS ≥ 7.52 |
| `BACKEND_UNSUPPORTED: transport create not supported on this SAP release` | `transport.integration.test.ts` createTransport, deleteTransport (2 tests) | NW 7.50 trial | S/4 any release, most production NW |

**When to investigate:** If `DOMA reads not supported` fires on a ≥ 7.54 system, double-check that the ICF service `/sap/bc/adt/ddic` is active in SICF. If `transport create not supported` fires on a production NW system, this is worth a bug report — our backend-compat probing may need tightening.

## Category 3 — Backend quirk (trial systems, unstable services)

**What it is:** Individual SAP services that either behave quirkily on trial editions or have known release-specific bugs (ABAP dumps, session-correlation oddities).

| Skip message fragment | Affected tests | Typical on | Should NOT skip on |
|---|---|---|---|
| `BACKEND_UNSUPPORTED: lock-handle session correlation differs on this release` | `crud.lifecycle.integration.test.ts` full PROG lifecycle | NW 7.50 trial VM | Any other system |
| `BACKEND_UNSUPPORTED: PageChipInstances service unstable on this release` | `adt.integration.test.ts` FLP lists tiles | NW 7.50, some older S/4 | Recent S/4 |
| `BACKEND_UNSUPPORTED: scope denied` (transport test) | `transport.integration.test.ts` type-W/R (customizing, repair) | Systems where user lacks `S_TRANSPRT` for non-K types | Full-privilege users |

**When to investigate:** Lock-handle issues on a non-trial system are unusual and worth reporting (potential session/cookie handling bug). PageChipInstances 500s on a recent S/4 are an FLP content/config issue, not an ARC-1 bug.

## Category 4 — Infrastructure gap (fixture not seeded)

**What it is:** ARC-1's own persistent test fixtures haven't been materialized on this SAP box. Running `npm run test:e2e` once seeds them.

| Skip message fragment | Affected tests | Fix |
|---|---|---|
| `NO_FIXTURE (ZCL_ARC1_TEST) — run npm run test:e2e once to seed` | `cache.integration.test.ts` most source-cache tests (11 tests) | Run `npm run test:e2e` once against the target system |

**When to investigate:** Seeing this after `npm run test:e2e` succeeded is a fixture-sync bug.

## Category 5 — Policy / credentials

**What it is:** Environment variables controlling optional features aren't set, or the test user lacks authorization.

| Skip message fragment | Affected tests | Typical cause |
|---|---|---|
| `SAP credentials not configured` | Every integration test | `TEST_SAP_URL` / `TEST_SAP_USER` / `TEST_SAP_PASSWORD` not set |
| `TEST_TRANSPORT_PACKAGE not configured` | transport-scoped CRUD (~3 tests) | Opt-in: set `TEST_TRANSPORT_PACKAGE=Z_LLM_TEST_PACKAGE` to enable |
| `NO_FIXTURE (RSHOWTIM)` | search by pattern (1 test) | RSHOWTIM report not on this system |

**When to investigate:** Credentials skipping everything is the expected state on a machine without SAP access. Everything else is a deliberate opt-in.

## Category 6 — Unimplemented / uninstalled features

| Skip message fragment | Affected tests | Typical on |
|---|---|---|
| `gCTS integration` skips (whole suite) | `gcts.integration.test.ts` | Systems without gCTS configured |
| `abapGit` skips (whole suite) | `abapgit.integration.test.ts` | Systems without abapGit installed |
| `NO_DDLS — no DDLS readable on this system` | CDS-related dep/impact tests | Pre-CDS systems |
| `NO_DUMPS — no short dumps on this system` | diagnostics dump tests | Freshly booted systems |

## Typical skip profile per system

A quick sanity-check for "is my run healthy?":

| System | Typical skip count | Categories that dominate |
|---|---|---|
| **NW 7.50 trial** (e.g. `npl.marianzeis.de`) | ~120 / 207 tests | Cat 1 (S/4 demo), Cat 2 (release gap), Cat 3 (trial quirks) |
| **S/4HANA 2023** (e.g. `a4h.marianzeis.de`) | ~40 / 207 tests | Cat 5 (no transport package), Cat 6 (abapGit/gCTS not installed), some Cat 4 |
| **BTP ABAP (cloud)** | ~80 / 207 tests | Cat 1 (no /DMO), Cat 2 (DDIC changes on cloud), Cat 5 (policy) |

Large deviations from these counts on a given system are the signal. If an S/4HANA box suddenly skips 120+ tests, something broke in fixture sync or auth — the matrix helps identify which category lit up.

## Adding a new skip

When a test needs a new skip condition, keep it categorizable:

1. **Prefer an existing SkipReason constant** — extends this matrix without a doc change.
2. **Pass a specific clause** — `requireOrSkip(ctx, value, \`${SkipReason.NO_FIXTURE} (FOO_BAR) — why\`)` so the summary tool can classify it.
3. **If it's genuinely a new category** (not covered above), add a row to this doc and to the regex in `scripts/ci/summarize-skips.mjs`.

Skip messages are the public API of this taxonomy — changing them means updating both files.
