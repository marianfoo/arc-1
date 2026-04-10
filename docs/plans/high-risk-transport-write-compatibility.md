# High-Risk Transport and Write-Path Compatibility Hardening

## Overview
This plan resolves the four P1 upstream-derived risks in ARC-1: issue #9 (406 Accept mismatch on CTS), issue #26 (`getTransport` false-negative / wrong media type), issue #70 (`createTransport` media-type + namespace incompatibility), and issue #56 (missing `corrNr` propagation on transportable package writes).

The design keeps ARC-1 safety defaults intact while hardening protocol compatibility: endpoint-specific transport media types, one-time 406/415 negotiation fallback, and automatic reuse of lock-provided `corrNr` when the caller omits `transport`. The implementation is validated across unit, integration, and MCP e2e tiers.

The plan also includes full artifact updates required by the ralphex workflow: technical docs, end-user docs, roadmap/feature matrix, `CLAUDE.md`, and affected `.claude/commands` skills.

Implementation status tracker (update in-place as work finishes):
- Issue #9 (406 Accept mismatch on CTS): `PLANNED` -> set to `COMPLETED` when Tasks 1, 2, 5, and 6 pass.
- Issue #26 (`getTransport` not found due to media-type mismatch): `PLANNED` -> set to `COMPLETED` when Tasks 1, 2, 5, and 6 pass.
- Issue #70 (`createTransport` endpoint/media-type/payload compatibility): `PLANNED` -> set to `COMPLETED` when Tasks 1, 2, 5, and 6 pass.
- Issue #56 (missing auto-`corrNr` propagation on write path): `PLANNED` -> set to `COMPLETED` when Tasks 3, 4, 5, and 6 pass.

## Context

### Current State
- `src/adt/transport.ts` currently uses `application/vnd.sap.adt.transportorganizertree.v1+xml` for both list and get, and uses generic `application/xml` plus `http://www.sap.com/cts/transports` payload namespace for create.
- `src/adt/http.ts` retries only on CSRF 403 and broken DB session; it has no generic 406/415 content negotiation fallback.
- `src/adt/crud.ts` parses lock `corrNr` in `lockObject()` but `safeUpdateSource()` does not reuse it when `transport` is omitted.
- `src/handlers/intent.ts` delete flow (`handleSAPWrite` around `lockObject` + `deleteObject`) currently forwards only caller-provided `transport`, not lock-derived `corrNr`.
- Unit tests exist in `tests/unit/adt/transport.test.ts`, `tests/unit/adt/http.test.ts`, and `tests/unit/adt/crud.test.ts`, but they do not yet assert the specific fallback behavior needed for these P1 scenarios.
- Integration coverage in `tests/integration/adt.integration.test.ts` currently focuses on read/write smoke in `$TMP`; it does not explicitly verify transport endpoint media-type compatibility or lock-driven `corrNr` propagation in transportable packages.
- E2E coverage (`tests/e2e/rap.e2e.test.ts`) has a skipped SAPWrite lifecycle path and no dedicated SAPTransport compatibility suite.

### Target State
- `listTransports`, `getTransport`, and `createTransport` use endpoint-appropriate media types and payload namespace, with robust one-retry fallback for SAP-version variance.
- `safeUpdateSource()` and delete flows automatically reuse lock `corrNr` when no `transport` argument is supplied, while preserving explicit `transport` override precedence.
- 406/415 negotiation fallback is centrally handled in `src/adt/http.ts` (max one retry, deterministic header mutation, auditable behavior).
- Unit tests enforce all new behaviors, and live integration/e2e tests validate the exact scenarios reproduced on A4H (`Z_LLM_TEST_PACKAGE`).
- Documentation and skills no longer imply a hard transport parameter requirement for every write; they correctly describe auto-propagation behavior and remaining constraints.

### Key Files

| File | Role |
|------|------|
| `src/adt/transport.ts` | CTS list/get/create/release implementation; media-type + payload compatibility |
| `src/adt/http.ts` | Central request pipeline; 403 retry and new 406/415 negotiation retry |
| `src/adt/crud.ts` | Lock/update/delete primitives and `safeUpdateSource()` orchestration |
| `src/handlers/intent.ts` | SAPWrite/SAPTransport tool handling and error hint shaping |
| `src/adt/errors.ts` | ADT error model used for retry and hint classification |
| `tests/unit/adt/transport.test.ts` | Unit coverage for transport headers/body/parsing |
| `tests/unit/adt/http.test.ts` | Unit coverage for retry logic and header mutation |
| `tests/unit/adt/crud.test.ts` | Unit coverage for lock result use and write URL construction |
| `tests/unit/handlers/intent.test.ts` | Unit coverage for SAPWrite/SAPTransport tool behavior and hints |
| `tests/integration/adt.integration.test.ts` | Live SAP integration tests (A4H) for write + transport behavior |
| `tests/integration/helpers.ts` | Integration env wiring (`TEST_SAP_*`) and client setup |
| `tests/e2e/rap.e2e.test.ts` | Existing MCP end-to-end write lifecycle suite |
| `tests/e2e/helpers.ts` | MCP client and tool-call helpers for e2e additions |
| `docs/tools.md` | Tool contract and parameter semantics for SAPWrite/SAPTransport |
| `docs/authorization.md` | Scope/safety explanation of transport-related operations |
| `docs/cli-guide.md` | User-facing CLI safety/transport behavior summary |
| `docs/index.md` | High-level capability and safety statements |
| `README.md` | Public feature positioning and transport safety claims |
| `docs/roadmap.md` | FEAT-08 status/source links and priority alignment |
| `compare/00-feature-matrix.md` | Capability matrix + “Key Gaps to Close” status |
| `CLAUDE.md` | AI-assistant reference for code patterns/tests/config |
| `.claude/commands/migrate-custom-code.md` | Skill guidance currently treating transport as always mandatory |
| `.claude/commands/generate-abap-unit-test.md` | Skill examples for create/update transport usage expectations |
| `.claude/commands/generate-rap-service.md` | Skill workflow and transport guidance for generated writes |
| `.claude/commands/generate-rap-service-researched.md` | Research-first skill transport assumptions |

### Design Principles
1. Prefer protocol-correct headers first, fallback second: deterministic primary media types plus one bounded retry for variance.
2. Keep safety model unchanged: no bypass of package restrictions, operation guards, or transport enablement gates.
3. Treat lock metadata as authoritative: if SAP returns `corrNr`, reuse it unless the caller explicitly overrides.
4. Avoid hidden retry loops: max one negotiation retry per request, with clear audit visibility.
5. Test each failure mode at the lowest practical tier first (unit), then prove on live SAP (integration), then full MCP path (e2e).
6. Keep docs and skills aligned with runtime truth to reduce operator and LLM misguidance.

## Development Approach
Implement in layers: transport module correctness, shared HTTP retry mechanism, CRUD/handler propagation, then test expansion and documentation alignment. For live tests, gate transportable-package scenarios behind explicit env configuration to keep CI-safe behavior (auto-skip when env is absent) while still supporting repeatable validation against A4H from `INFRASTRUCTURE.md` and `.env.infrastructure`.

## Validation Commands
- `npm run typecheck`
- `npm run lint`
- `npm test -- tests/unit/adt/transport.test.ts tests/unit/adt/http.test.ts tests/unit/adt/crud.test.ts tests/unit/handlers/intent.test.ts`
- `npm run test:integration -- tests/integration/adt.integration.test.ts`
- `TEST_TRANSPORT_PACKAGE=Z_LLM_TEST_PACKAGE npm run test:integration -- tests/integration/adt.integration.test.ts`
- `npm run test:e2e -- tests/e2e/rap.e2e.test.ts`
- `npm test`

### Task 1: Fix CTS Endpoint Media Types and Payload Namespace (Issues #9, #26, #70)

**Files:**
- Modify: `src/adt/transport.ts`
- Modify: `tests/unit/adt/transport.test.ts`
- (Optional fixture additions) Modify: `tests/fixtures/xml/*` if needed for realistic error/response samples

`getTransport()` currently sends tree media type (around `src/adt/transport.ts` lines 31-40), and `createTransport()` uses generic XML + legacy namespace (lines 55-62). This task makes transport calls protocol-correct per operation and preserves backward compatibility with a bounded fallback path where required.

- [ ] Define explicit constants for CTS media types and namespaces (tree vs organizer) and use them consistently in list/get/create paths.
- [ ] Keep list on organizer-tree media type, move get/create to organizer media type, and ensure create payload root namespace is `http://www.sap.com/cts/adt/tm`.
- [ ] Preserve/verify create endpoint behavior on `/sap/bc/adt/cts/transportrequests`; only add endpoint fallback if concrete status/body indicates alternate endpoint requirement.
- [ ] Ensure response parsing still handles attribute order variance (`request`/`task` attributes) without regressions.
- [ ] Add unit tests (~8 tests): exact Accept assertions for list/get, create Content-Type/Accept assertions, payload namespace assertion, and response parsing non-regression.
- [ ] Run `npm test -- tests/unit/adt/transport.test.ts`.

### Task 2: Add One-Retry 406/415 Content Negotiation in ADT HTTP Layer

**Files:**
- Modify: `src/adt/http.ts`
- Modify: `tests/unit/adt/http.test.ts`
- Modify: `src/adt/errors.ts` only if helper methods are needed for safe parsing

Transport compatibility issues recur across endpoints and SAP versions. Implement the retry in the shared request layer (`src/adt/http.ts` request flow around lines 156-339) so all callers benefit without duplicating logic.

- [ ] Add a dedicated negotiation-retry helper that activates only for status `406`/`415`, mutates headers deterministically, and retries exactly once.
- [ ] Implement Accept fallback strategy (primary configured Accept → inferred accepted type from SAP error text when available → wildcard fallback as last resort).
- [ ] Implement Content-Type fallback strategy for modifying requests (preserve existing behavior unless 415 indicates media-type rejection).
- [ ] Ensure retry logic works in both direct fetch and proxy mode without duplicating request construction.
- [ ] Emit audit/debug metadata indicating retry attempt and effective fallback headers (without leaking sensitive values).
- [ ] Add unit tests (~10 tests): 406 GET Accept fallback success, 415 POST Content-Type fallback success, no retry on non-406/415 errors, no infinite retry loop, and preservation of CSRF/cookie behavior.
- [ ] Run `npm test -- tests/unit/adt/http.test.ts`.

### Task 3: Auto-Propagate Lock `corrNr` for Update/Delete Write Paths (Issue #56)

**Files:**
- Modify: `src/adt/crud.ts`
- Modify: `src/handlers/intent.ts`
- Modify: `tests/unit/adt/crud.test.ts`
- Modify: `tests/unit/handlers/intent.test.ts`

`lockObject()` already returns `corrNr` (`src/adt/crud.ts` lines 37-43), but `safeUpdateSource()` and delete handling do not consume it when `transport` is omitted. This task closes that gap while keeping explicit transport override precedence.

- [ ] In `safeUpdateSource()`, derive `effectiveTransport = transport ?? lock.corrNr || undefined` and pass that to `updateSource()`.
- [ ] In SAPWrite delete flow (`src/handlers/intent.ts` around lines 1162-1166), pass `transport ?? lock.corrNr || undefined` to `deleteObject()`.
- [ ] Keep explicit `transport` argument authoritative when supplied by caller.
- [ ] Preserve existing lock→modify→unlock try/finally safety behavior and stateful session guarantees.
- [ ] Add unit tests (~8 tests): auto `corrNr` propagation on update, explicit transport override, no `corrNr` when lock returns empty, delete-path fallback propagation, and no regression for `$TMP` flows.
- [ ] Run `npm test -- tests/unit/adt/crud.test.ts tests/unit/handlers/intent.test.ts`.

### Task 4: Improve User-Facing Error Hints for Transport/CorrNr Failures

**Files:**
- Modify: `src/handlers/intent.ts`
- Modify: `tests/unit/handlers/intent.test.ts`

When fallback still cannot resolve a write (e.g., transport not assignable, missing authorization, package mismatch), the error should guide the operator immediately instead of returning generic ADT failures.

- [ ] Extend `formatErrorForLLM()` (`src/handlers/intent.ts` around lines 165-181) to detect common transport/corrNr failure signatures and add specific remediation hints (`SE09` transport check, package/allowlist reminder, provide explicit `transport`).
- [ ] Keep existing not-found/auth/network hints intact and non-duplicative.
- [ ] Ensure hints never leak raw XML or internal stack traces.
- [ ] Add unit tests (~4 tests): corrNr-missing hint, transport authorization hint, and non-transport errors remain unchanged.
- [ ] Run `npm test -- tests/unit/handlers/intent.test.ts`.

### Task 5: Add Live Integration Tests for CTS Compatibility and CorrNr Propagation

**Files:**
- Modify: `tests/integration/adt.integration.test.ts` (or create a focused `tests/integration/transport.integration.test.ts`)
- Modify: `tests/integration/helpers.ts` if additional env helpers are needed
- (If needed) Add: `tests/fixtures/abap/*` transient fixture sources for transport-package writes

This task validates the exact real-system scenarios reproduced on A4H: media-type-sensitive `get/create transport` and write/update on a transportable package (`Z_LLM_TEST_PACKAGE`) without explicit `transport`.

- [ ] Add env-gated integration scenario for transportable package writes (skip when `TEST_TRANSPORT_PACKAGE` is unset).
- [ ] Add integration test for `getTransport` returning expected transport details with corrected Accept behavior.
- [ ] Add integration test for `createTransport` succeeding with corrected payload namespace/media type and returning transport id.
- [ ] Add integration test for create+update in transportable package where update succeeds without caller-supplied transport due to lock `corrNr` propagation.
- [ ] Add deterministic cleanup strategy (best-effort delete with lock handling; never release created test transports automatically).
- [ ] Run `npm run test:integration -- tests/integration/adt.integration.test.ts` and the env-gated variant with `TEST_TRANSPORT_PACKAGE=Z_LLM_TEST_PACKAGE`.

### Task 6: Add MCP E2E Coverage for SAPTransport + Transportable SAPWrite

**Files:**
- Modify: `tests/e2e/rap.e2e.test.ts` and/or add `tests/e2e/saptransport.e2e.test.ts`
- Modify: `tests/e2e/helpers.ts` (only if additional helpers are needed)
- Modify: `tests/e2e/README.md` for new env prerequisites

Integration tests prove ADT behavior; this task proves full MCP JSON-RPC behavior via ARC-1 tool handlers.

- [ ] Add e2e test for SAPTransport `create` + `get` with assertions on returned IDs/details and no raw XML leakage.
- [ ] Add env-gated e2e test for SAPWrite update in a transportable package without explicit transport, asserting successful completion (or clear skip message when env missing).
- [ ] Keep existing skipped lifecycle tests untouched unless this work directly unblocks them; avoid introducing flaky cleanup dependencies.
- [ ] Document required env variables (`E2E_MCP_URL`, `TEST_TRANSPORT_PACKAGE`, credentials) for local execution.
- [ ] Run `npm run test:e2e -- tests/e2e/rap.e2e.test.ts` (plus new e2e file if created).

### Task 7: Update Technical and User Documentation, Roadmap, and Feature Matrix

**Files:**
- Modify: `docs/tools.md`
- Modify: `docs/authorization.md`
- Modify: `docs/cli-guide.md`
- Modify: `docs/index.md`
- Modify: `docs/architecture.md` (if request/flow narrative changes)
- Modify: `README.md`
- Modify: `docs/roadmap.md`
- Modify: `compare/00-feature-matrix.md`
- Modify: `CLAUDE.md`

Docs must reflect the new runtime truth: transport parameters remain supported, but update/delete on transportable objects can auto-use lock-provided `corrNr` when available.

- [ ] Update tool docs to clarify transport parameter semantics (optional vs recommended, auto-propagation behavior, failure cases requiring explicit transport).
- [ ] Update user-facing safety language so it no longer implies a mandatory manual transport parameter for every write.
- [ ] Update roadmap entries for FEAT-08 and linked VSP high-risk items to reflect implemented status/scope.
- [ ] Update feature matrix “Last updated” date and gap/status statements for 415/406 retry hardening.
- [ ] Update `CLAUDE.md` sections affected by new behavior (key files, CRUD pattern notes, test counts/coverage references if changed).
- [ ] Include bonus stale-doc correction spotted during research: resolve any scope/tool mapping inconsistency in roadmap text versus `docs/authorization.md`.
- [ ] Run `npm run lint` to verify markdown style consistency where applicable.

### Task 8: Align `.claude/commands` Skills with New Transport Behavior

**Files:**
- Modify: `.claude/commands/migrate-custom-code.md`
- Modify: `.claude/commands/generate-abap-unit-test.md`
- Modify: `.claude/commands/generate-rap-service.md`
- Modify: `.claude/commands/generate-rap-service-researched.md`
- Review: other `.claude/commands/*.md` for transport requirement phrasing

Skill instructions currently assume transport must always be manually supplied for transportable writes. After implementing lock-based auto-propagation, these instructions must be accurate to avoid over-constraining user flows.

- [ ] Update skill guidance from “transport always required” to “explicit transport recommended; ARC-1 may auto-propagate lock `corrNr` for update/delete when available.”
- [ ] Keep create-flow guidance explicit: transport may still be required depending on package/system behavior.
- [ ] Ensure examples remain valid and do not claim unsupported transport management automation.
- [ ] Run `npm run lint` to catch formatting issues in edited markdown/docs files.

### Task 9: Final Verification and Plan Closure

**Files:**
- Modify: `docs/plans/high-risk-transport-write-compatibility.md` (mark notes if needed before archival)
- Move: `docs/plans/high-risk-transport-write-compatibility.md` → `docs/plans/completed/high-risk-transport-write-compatibility.md`

This task confirms all code/tests/docs/skills updates are complete and reproducible before closing the plan.

- [ ] Run full unit suite: `npm test`.
- [ ] Run integration suite: `npm run test:integration` (with and without `TEST_TRANSPORT_PACKAGE` where applicable).
- [ ] Run e2e suite for affected scenarios: `npm run test:e2e`.
- [ ] Run typecheck: `npm run typecheck`.
- [ ] Run lint: `npm run lint`.
- [ ] Perform one live smoke check against A4H using documented infrastructure config (transport get/create + transportable update flow).
- [ ] Move this plan to `docs/plans/completed/`.
