# Codex Review Brief — PR #224 (Plan B: MSAG + FEATURE_TOGGLE)

**Branch**: `feat/audit-msag-symmetry-ftg2-rename`
**Base**: `main` (post-PR #222)
**Plan**: [`docs/plans/completed/audit-symmetry-and-ftg2-rename.md`](plans/completed/audit-symmetry-and-ftg2-rename.md)

This brief gives codex enough context to review without re-deriving the audit. It complements the PR description and the in-tree research docs.

## What this PR does (and does not)

**Does**:
1. Adds `MSAG` to `SAPREAD_TYPES_ONPREM` and `SAPREAD_TYPES_BTP`. Both `MSAG` (canonical) and `MESSAGES` (legacy alias) route to the same handler — `client.getMessageClassInfo(name)` — that ARC-1 already had wired for `MESSAGES`. `MESSAGES` emits a stderr deprecation warning.
2. Renames `FTG2` → `FEATURE_TOGGLE`. Same handler `client.getFeatureToggle(name)`. `FTG2` continues to work for one minor with deprecation warning.

**Does not** (deliberately — these are Plan A's scope, not Plan B):
- Touch `SLASH_TYPE_MAP` or `objectBasePath` in `src/handlers/intent.ts`.
- Add a `SLASH_TYPE_EVIDENCE` citation guard.
- Add a VIEW round-trip integration test.
- Change DDLX/TRAN slash codes.
- Touch any probe fixture.

If you see Plan A code in the diff, that's a bug — please flag.

## Why this is needed

Three sources, all aligned:
- **Issue #218** (and the @oisee follow-up comment 4404553535) showed `FUNC/FM` is invented; the audit (PR #222) found `FTG2` is the same bug class — an ARC-1-private short identifier that mimics a TADIR R3TR type but isn't one. The endpoint is real (`/sap/bc/adt/sfw/featuretoggles/{name}/states`), only the name is invented.
- **Read/write enum drift**: writes have used `MSAG` (canonical) since the message-class write feature shipped, but reads went through the historical `MESSAGES` alias. Round-trip patterns broke.
- **Research evidence** in [`research/abap-types/types/msag.md`](../research/abap-types/types/msag.md) and [`research/abap-types/types/ftg2.md`](../research/abap-types/types/ftg2.md) cite TADIR / abap-file-formats / Eclipse apidoc 3.58.1 grep results.

## Live verification (2026-05-08)

| System | Endpoint | Result |
|---|---|---|
| a4h S/4HANA 2023 | `GET /sap/bc/adt/messageclass/SY?sap-client=001` | 200, `<mc:messageClass adtcore:type="MSAG/N" …>` |
| npl NW 7.50 SP02 (https) | `GET /sap/bc/adt/messageclass/SY?sap-client=001` | 200, `<mc:messageClass adtcore:type="MSAG/N" …>` |
| a4h | `GET /sap/bc/adt/sfw/featuretoggles/SAP_PARA_DCFK_SUPP_GENERAL/states` | 200, JSON `{ STATES: { NAME: …, CLIENT_STATE: 'off', … } }` |
| a4h integration | `npm run test:integration -t "MSAG canonical|FEATURE_TOGGLE"` | 2 passed |

NPL integration test framework hits a pre-existing 401 (CSRF/session race with the `disableSaml` toggle) that is **not** my changes — main has the same issue. I added `TEST_SAP_DISABLE_SAML` plumbing to `getTestClient()` in case it helps later, but it doesn't resolve NPL's 401. The MSAG shape on NPL is verified via curl (see table above).

## Things to look at

### 1. Switch fall-through correctness

In `src/handlers/intent.ts` I used the combined-case pattern, NOT JS fall-through:

```ts
case 'FTG2':
case 'FEATURE_TOGGLE': {
  if (type === 'FTG2') logger.warn(...);
  const toggle = await client.getFeatureToggle(name);
  return textResult(JSON.stringify(toggle, null, 2));
}
```

Both labels enter the same block; the `if (type === …)` distinguishes for the warning. No actual fall-through happens (the `return` ends both paths). Same shape for `MESSAGES`/`MSAG`. Please verify this matches the codebase's other multi-label switch patterns (there are a few in `intent.ts` already).

### 2. Read/write enum symmetry test

`tests/unit/handlers/schemas.test.ts` adds:

```ts
it('write enum has MSAG (canonical) — read/write symmetry guard', () => {
  const SAPWRITE_TYPES_ONPREM_BACKING = ['PROG', 'CLAS', …, 'MSAG'] as const;
  for (const t of SAPWRITE_TYPES_ONPREM_BACKING) {
    expect(SAPReadSchema.safeParse({ type: t, name: 'X' }).success, `read enum missing canonical write type ${t}`).toBe(true);
  }
});
```

The list is hardcoded rather than imported from `schemas.ts` because `SAPWRITE_TYPES_ONPREM` isn't exported. **Question for review**: should we export it from `schemas.ts` and import here, so the test can't drift? My judgment was no — exporting the type-list arrays bloats the module's surface for one test. The hardcoded list with a clear "must match" comment is fine. Open to changing if you disagree.

### 3. Schema enum still contains `FTG2` and `MESSAGES`

This is intentional (deprecation period) — both must stay accepted at the schema layer for the deprecation warning at the handler layer to fire. The `tools.test.ts` assertions at lines 480–489 confirm both old and new shapes are in the enum. We can remove the deprecated aliases in the next minor release.

### 4. Probe catalog rename

`src/probe/catalog.ts` entry renamed `type: 'FTG2' → 'FEATURE_TOGGLE'`. URL/template/known-objects unchanged. Per `tests/unit/probe/replay.test.ts:160`, fixture-replay iterates by `FEATURE_TOGGLE` now. The replay fixtures are keyed by URL (not by short type), so renaming is safe — no fixture update needed.

### 5. Default error message in `handleSAPRead`

The `default:` branch's error string was updated to:
- list `MSAG` and `FEATURE_TOGGLE` as canonical
- list `MESSAGES` and `FTG2` as "Deprecated aliases"
- drop `MESSAGES`/`FTG2` from the canonical list

This is the only LLM-facing prompt change — please verify the wording is consistent with `tools.ts` long descriptions.

### 6. `tests/integration/helpers.ts` `disableSaml` plumbing

I threaded `TEST_SAP_DISABLE_SAML` / `SAP_DISABLE_SAML` into `getTestClient()`. Harmless on a4h. Doesn't fix NPL's 401 (per "Known limitations" in PR description), but is the right shape for any test that needs it. Codex: please confirm this matches `src/server/server.ts`'s `buildAdtConfig` plumbing.

## Risk + blast radius

| Risk | Mitigation |
|---|---|
| Existing scripts using `SAPRead(type='FTG2')` break | Keep `FTG2` in enum, route to `FEATURE_TOGGLE` handler with deprecation warning. Removed in next minor. |
| Existing scripts using `SAPRead(type='MESSAGES')` break | Same: keep accepting, deprecation log, remove in next minor. |
| LLM clients learn the deprecated names from old docs and keep emitting them | Tool description now lists deprecated aliases explicitly so the model sees both forms. |
| MSAG read endpoint differs across releases | Verified live on a4h S/4HANA 2023 + npl NW 7.50 SP02 — both return identical XML shape with `adtcore:type="MSAG/N"`. |
| Tests don't catch read/write enum re-drift | New `read/write symmetry guard` test in schemas.test.ts. |

## What I'd appreciate codex looking at

1. **Switch-statement style consistency** — does the combined-`case` pattern with `if (type === 'OLD')` warning look right next to the other handlers?
2. **Hardcoded list in symmetry test** — keep or export-and-import?
3. **Tool description prose** — does the wording in `src/handlers/tools.ts` for `FEATURE_TOGGLE` and `MSAG` read naturally to an LLM client (Claude Desktop, Copilot Studio, Cursor)?
4. **Anything I missed** — there's no `getMessageClass` getter being added (the existing `getMessageClassInfo` already does the job). Is that the right call, or should I add a `getMessageClass` alias for symmetry with `getProgram`/`getClass`?

## Final state

- 2 commits, 15 files, +198/-60 lines
- 2 505 unit tests pass (+6 new)
- typecheck clean, lint clean
- 2 a4h integration tests pass
- Plan A (the bigger sister plan in `docs/plans/audit-purge-invented-adt-types.md`) is **not** in this PR — it has its own branch `feat/purge-invented-adt-types` (worktree `condescending-elgamal-d73cd0` locally; no PR yet).
