# Read/write enum symmetry & `FTG2` rename

## Overview

Companion plan to `audit-purge-invented-adt-types.md`. The same audit (see
`research/abap-types/`) found two non-bug structural issues that should be fixed
together with the invented-alias purge:

1. **`MSAG` is missing from `SAPREAD_TYPES_*`.** Writes via `SAPWrite(type='MSAG')` work,
   but reads must go through the `MESSAGES` pseudo-type — a read/write asymmetry that
   surfaces as inconsistent UX and broken round-trip patterns.
2. **`FTG2` is an invented short identifier.** The endpoint
   `/sap/bc/adt/sfw/featuretoggles/{name}/states` is real, but `FTG2` itself appears in
   zero SAP sources (TADIR, abap-file-formats, Eclipse plugin). It's the same bug class
   as `STRU` and `FUNC/FM` from issue #218.

This plan resolves both. It is a breaking change for anyone scripting `FTG2` directly.

## Context

### Current State

- `src/handlers/schemas.ts` — `SAPREAD_TYPES_ONPREM` has `MESSAGES` (line ~42) but not
  `MSAG`; `SAPWRITE_TYPES_ONPREM` has `MSAG` (line ~233) but not `MESSAGES`. Asymmetric.
- `src/handlers/schemas.ts` — `FTG2` is in the on-prem read enum.
- `src/handlers/intent.ts` — `FTG2` is wired through `handleSAPRead` to call the
  feature-toggle endpoint.
- `compare/00-feature-matrix.md:97,108` — ARC-1 is the only listed implementer that
  uses `FTG2` as a short type, evidence that the name is ARC-1-private (smell).

### Target State

- `MSAG` is the single canonical identifier for message classes across read and write.
- `MESSAGES` is preserved as a deprecated read alias for one minor release, with a
  warning log on use.
- The feature-toggle reader is exposed as either `FEATURE_TOGGLE` (rename) or as
  `SAPManage(action='get_feature_toggle')`. Decision: rename (cheaper migration). `FTG2`
  becomes a deprecated alias for one minor release.

### Key Files

| File | Role |
|------|------|
| `src/handlers/schemas.ts` | Read/write enums |
| `src/handlers/intent.ts` | Type routing, normalize, handlers |
| `src/handlers/tools.ts` | LLM-facing descriptions |
| `src/probe/catalog.ts` | Probe entries |
| `tests/unit/handlers/schemas.test.ts` | Enum symmetry tests |
| `tests/integration/adt.integration.test.ts` | Round-trip tests |
| `research/abap-types/types/{msag,messages,ftg2}.md` | Per-type evidence |

### Design Principles

1. Canonical names match TADIR / abap-file-formats. ARC-1-invented short forms must be
   replaced or clearly labeled "ARC-1 pseudo".
2. Read and write enums must be symmetric for any type that supports both verbs in ADT.
3. Deprecated aliases stay for exactly one minor release with a stderr warning, then
   removed in the following minor.

## Development Approach

- Schemas first (data), then handlers (wiring), then deprecation warnings, then docs.
- Keep `MESSAGES` and `FTG2` accepted at the schema layer to preserve compat for one
  release; emit a deprecation log when normalized internally.

## Validation Commands

- `npm test`
- `npm run typecheck`
- `npm run lint`
- `npm run test:integration`

### Task 1: Add `MSAG` to read enums

**Files:**
- Modify: `src/handlers/schemas.ts`
- Modify: `tests/unit/handlers/schemas.test.ts`

- [ ] Add `'MSAG'` to `SAPREAD_TYPES_ONPREM`
- [ ] (Decide whether MSAG read is BTP-relevant; if yes, add to `SAPREAD_TYPES_BTP`)
- [ ] Add a unit test that asserts read/write enum symmetry: every type in
      `SAPWRITE_TYPES_ONPREM` is in `SAPREAD_TYPES_ONPREM` (or has a documented
      exception list)
- [ ] Add unit test: `SAPRead({ type: 'MSAG', name: 'XYZ' })` passes schema validation
- [ ] Run `npm test` — all tests must pass

### Task 2: Wire MSAG read through intent.ts

**Files:**
- Modify: `src/handlers/intent.ts`
- Modify: `src/adt/client.ts` (if a getter is missing)
- Modify: `tests/unit/handlers/intent.test.ts`

- [ ] Confirm `client.getMessageClass(name)` (or equivalent) exists in `src/adt/client.ts`;
      if not, add it (URL `/sap/bc/adt/messageclass/<name>`)
- [ ] Add `case 'MSAG':` in `handleSAPRead` returning the message class source
- [ ] Confirm `objectBasePath('MSAG')` returns `/sap/bc/adt/messageclass/` (already does
      per current code at ~line 2702)
- [ ] Add unit tests (~3 tests): MSAG read happy path, MSAG read 404 surfaces typed
      error, MSAG read normalizes `MSAG/N → MSAG`
- [ ] Run `npm test` — all tests must pass

### Task 3: Mark `MESSAGES` as deprecated read alias

**Files:**
- Modify: `src/handlers/intent.ts`
- Modify: `src/server/logger.ts` (if a deprecation helper is missing)
- Modify: `tests/unit/handlers/intent.test.ts`

- [ ] In `handleSAPRead`, when `type === 'MESSAGES'`, log a deprecation warning to
      stderr ("`MESSAGES` is deprecated; use `MSAG`") then route to the same handler
      as `MSAG`
- [ ] Add unit test: `SAPRead({ type: 'MESSAGES', name: 'XYZ' })` produces the same
      result as `MSAG` AND emits a deprecation log line
- [ ] Run `npm test` — all tests must pass

### Task 4: Rename `FTG2` → `FEATURE_TOGGLE`

**Files:**
- Modify: `src/handlers/schemas.ts`
- Modify: `src/handlers/intent.ts`
- Modify: `src/handlers/tools.ts`
- Modify: `src/probe/catalog.ts`
- Modify: `tests/unit/handlers/intent.test.ts`
- Modify: `tests/unit/handlers/schemas.test.ts`

The endpoint `/sap/bc/adt/sfw/featuretoggles/{name}/states` is real and supported. Only
the short identifier changes. See `research/abap-types/types/ftg2.md`.

- [ ] In `SAPREAD_TYPES_ONPREM`, replace `'FTG2'` with `'FEATURE_TOGGLE'`. Keep `'FTG2'`
      in the enum during the deprecation window (so existing callers don't break).
- [ ] In `handleSAPRead`, route both `'FEATURE_TOGGLE'` and `'FTG2'` to the feature-toggle
      endpoint
- [ ] When `type === 'FTG2'`, log a deprecation warning ("`FTG2` is deprecated; use
      `FEATURE_TOGGLE`")
- [ ] Update `src/probe/catalog.ts` entry name from `FTG2` to `FEATURE_TOGGLE`
- [ ] Update `src/handlers/tools.ts` description to use `FEATURE_TOGGLE`, mention the
      deprecated `FTG2` alias once
- [ ] Add unit tests (~5 tests): `FEATURE_TOGGLE` read happy path; `FTG2` still works +
      emits deprecation log; schema accepts both; tool description has no
      undocumented `FTG2`
- [ ] Run `npm test` — all tests must pass

### Task 5: Integration round-trip tests

**Files:**
- Modify: `tests/integration/adt.integration.test.ts`

- [ ] Add integration test: `SAPRead({ type: 'MSAG', name: '<known message class>' })`
      returns source; URL contains `/sap/bc/adt/messageclass/`
- [ ] Add integration test: `SAPRead({ type: 'FEATURE_TOGGLE', name: '<known toggle>' })`
      hits `/sap/bc/adt/sfw/featuretoggles/`
- [ ] Add integration test: `SAPRead({ type: 'FTG2', name: '<known toggle>' })` returns
      same content as `FEATURE_TOGGLE` (compat) and emits deprecation log
- [ ] Use `requireOrSkip` for missing creds; never empty catch
- [ ] Run `npm run test:integration` against a4h — must pass
- [ ] Run `npm test` — all tests must pass

### Task 6: Documentation

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs_page/tools.md`
- Modify: `docs/roadmap.md`
- Modify: `compare/00-feature-matrix.md`

- [ ] CLAUDE.md — update Key Files / Code Patterns to reflect `MSAG` read,
      `FEATURE_TOGGLE`
- [ ] tools.md — `FEATURE_TOGGLE` example, deprecate `FTG2`/`MESSAGES` notes
- [ ] roadmap.md — entry under recent: "Read/write enum symmetry: MSAG read added;
      FTG2 renamed to FEATURE_TOGGLE; MESSAGES deprecated"
- [ ] compare/00-feature-matrix.md — refresh "Last Updated"; rename FTG2 row to
      FEATURE_TOGGLE
- [ ] Run `npm test` — all tests must pass

### Task 7: Final verification

- [ ] Run full test suite: `npm test` — all tests pass
- [ ] Run typecheck: `npm run typecheck` — no errors
- [ ] Run lint: `npm run lint` — no errors
- [ ] Run integration: `npm run test:integration` against a4h — passes
- [ ] Manual verify on a4h: MSAG read works, FEATURE_TOGGLE read works, FTG2 still works
      with deprecation warning
- [ ] Move this plan to `docs/plans/completed/`
