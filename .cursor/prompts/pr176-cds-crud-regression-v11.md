# ARC-1 PR #176 Cursor Regression Prompt v11

You are testing ARC-1 PR #176: CDS CRUD dependency guidance after scoped where-used hardening, write-session error-hint cleanup, and SAP_BASIS 758 currency-field compatibility.

Use only these MCP servers:
- `arc1-pr176-dev` for positive reads, write-smoke, DDLS CRUD, and cleanup.
- `arc1-pr176-no-update` for update-deny authorization checks.
- `arc1-pr176-no-delete` for delete-deny authorization checks.
- `arc1-pr176-readonly` only to confirm write tools/actions are hidden when `SAP_ALLOW_WRITES=false`.
- `arc1-pr176-btp-sim` only for system-type sanity if needed.

Before running tests:
- Use the latest MCP config from the static snapshot:
  `/Users/marianzeis/DEV/ARC1-RAP-VB-1/arc1-pr176-visible/.cursor/mcp.pr176.json`
  The active workspace root may not have `.cursor/mcp.pr176.json`; that is expected for this Cursor setup.
  The config contains `ARC1_RUNTIME_FINGERPRINT=pr176-cds-crud-v11-20260425T2022`.
- Restart/toggle all `arc1-pr176-*` MCP servers after applying the config. A connected-but-old server process can keep serving old `dist/index.js`.
- If delete guidance is missing `If the listed dependents were just deleted, wait briefly and retry`, classify the run as `Environment/session setup issue` with note `stale MCP runtime`, restart the MCP servers, and rerun from write-smoke. Do not classify that as a product regression.

Important paths:
- Static source snapshot to read: `/Users/marianzeis/DEV/ARC1-RAP-VB-1/arc1-pr176-visible`
- MCP runtime root encoded in the server config: `/Users/marianzeis/DEV/arc-1/.claude/worktrees/suspicious-torvalds-f801a4`

Do not fail only because the active Cursor workspace is `/Users/marianzeis/DEV/ARC1-RAP-VB-1`. That is expected for this run. The static snapshot exists so Cursor can read files even when the hidden `.claude/worktrees/...` runtime path is filtered by `.cursorignore`.
Copy `source`, `visibleRoot`, and `runtimeRoot` paths exactly as read from `.arc1-pr176-snapshot.json` or the MCP config. Do not normalize, abbreviate, or drop path segments such as `/DEV/`.

## 1. Environment Precheck

1. Record the active Cursor workspace path.
2. Confirm the static snapshot directory can be read:
   `/Users/marianzeis/DEV/ARC1-RAP-VB-1/arc1-pr176-visible`
3. Read `.arc1-pr176-snapshot.json` from the static snapshot and record source/runtime metadata if present.
4. Confirm these files can be read from the static snapshot:
   - `src/handlers/intent.ts`
   - `tests/unit/handlers/intent.test.ts`
   - `docs/research/cds-crud-dependency-guidance.md`
   - `docs_page/tools.md`
   If these reads fail, stop and report `Environment/session setup issue`.
5. Verify MCP servers are callable. If a server appears disconnected, wait 5-10 seconds and retry once.
6. On `arc1-pr176-dev`, call `SAPSearch(query="SFLIGHT", maxResults=5)` or `SAPRead(type="COMPONENTS")`.
7. When reporting the SAP system, use installed component rows exactly. For the A4H test system this is expected to look like `SAP_BASIS 758 / S4FND 108`; if `MDG_FND 808` is present, report it separately and do not call it the S4FND release.

## 2. Static Behavior Check

Read implementation/docs/tests from the static snapshot and verify:
- DDLS update/delete/failed-activate guidance uses ADT where-used impact buckets.
- Implementation supplements unfiltered where-used with scoped object-type filters from `usageReferences/scope`.
- Scoped calls are best-effort: unsupported scope/filter calls do not fail write/delete/activate.
- Combined where-used results are deduplicated, including URI case differences.
- Feature is additive guidance only: no cascade delete, no automatic cycle breaker.
- Delete dependency errors show DDIC diagnostics before remediation hints.
- Delete dependency errors do not show generic DDIC save hints.
- SAPWrite infrastructure failures around CSRF/core-discovery/unlock/service-routing are not mislabeled as DDIC source-save failures.
- Docs mention scoped where-used hardening, live-test caveats, and the no-automation boundary.

## 3. Authorization/Safety Checks

Run these even if live write-smoke later fails.

1. On `arc1-pr176-readonly`, verify `SAPWrite` and `SAPActivate` are absent/hidden. This is a PASS for read-only tool visibility.
2. On `arc1-pr176-no-update`, test update blocking using a harmless/nonexistent object name:
   `SAPWrite(action="update", type="PROG", name="ZARC1_AUTH_NOUPD", source="REPORT zarc1_auth_noupd.")`
   - Expected if callable: denial mentioning `SAP_DENY_ACTIONS` and `SAPWrite.update`.
   - Also acceptable: the `update` action is absent from the `SAPWrite` schema/action list because `SAP_DENY_ACTIONS` pruned it. Report as `hidden-action`, not a regression.
3. On `arc1-pr176-no-delete`, test delete blocking using a harmless/nonexistent object name:
   `SAPWrite(action="delete", type="PROG", name="ZARC1_AUTH_NODEL")`
   - Expected if callable: denial mentioning `SAP_DENY_ACTIONS` and `SAPWrite.delete`.
   - Also acceptable: the `delete` action is absent from the `SAPWrite` schema/action list because `SAP_DENY_ACTIONS` pruned it. Report as `hidden-action`, not a regression.

## Output Evidence Rules

- Keep `rawSnippet` blocks short: paste only the relevant 8-20 lines that prove the classification.
- `updateGuidance.rawSnippet` must come only from the `SAPWrite(action="update", type="DDLS", name=ROOT, ...)` response. Include the `CDS update follow-up` header, downstream bucket line(s), inactive-source reminder, suggested order, and batch template.
- `activationGuidance.rawSnippet` must come only from `SAPActivate(type="DDLS", name=ROOT)`, plus one short follow-up line if you ran the optional child activation. Include activation outcome/error, `CDS activation impact`, suggested order, and batch template.
- `deleteGuidance.rawSnippet` must come only from the first pre-cleanup `SAPWrite(action="delete", type="DDLS", name=ROOT)` response. Include SAP error/DDIC diagnostics, `Blocking dependents`, suggested delete order, and stale/cycle/activate-first hints.
- `cleanup` should report only cleanup calls after ROOT was restored to baseline; do not mix cleanup retry errors into `deleteGuidance.rawSnippet`.
- For static review, do not paste source excerpts unless there is a regression. Use the boolean fields and a one-sentence note instead.
- Do not paste full MCP JSON bodies unless the classification depends on a raw field that is otherwise missing.

## 4. Write-Smoke Gate

Before creating DDLS objects, verify the dev SAP write session is healthy.

Use a fresh suffix like `T<HHMMSS>`, max 7 suffix chars.

Smoke object:
- `SMOKE = ZARC1_SMK_<suffix>`

Steps:
1. On `arc1-pr176-dev`, call:
   `SAPWrite(action="create", type="PROG", name=SMOKE, package="$TMP", source="REPORT <SMOKE>. WRITE: / 'ARC1 smoke'.")`
2. If create succeeds, call:
   `SAPWrite(action="delete", type="PROG", name=SMOKE)`
3. If create/delete fails with CSRF/core-discovery/unlock/service-routing text, stop the live DDLS scenario and report `liveWriteStatus: write-session-failed`.
4. If create fails during post-save unlock but `SAPSearch` or `SAPRead` shows the smoke object exists, set `writeSmoke.createOutcome: partial-created`, record the object under `cleanup.leftovers` if delete fails, and include the write/session infrastructure hint. This confirms SAP saved the object before the session failed.
5. For write-session failures, verify the error includes a write/session infrastructure hint and does not include generic `DDIC save failed` or `@AbapCatalog annotations`.
6. Attempt at most one cleanup delete for the smoke object. If that cleanup delete fails with CSRF/core-discovery/unlock/service-routing, stop retrying and leave the object as a leftover. Do not attempt DDLS CRUD after a failed write-smoke gate.

## 5. Live DDLS Scenario

Only run this section if the write-smoke gate passes.

Names:
- `ROOT = ZI_A1_R_<suffix>`
- `CHILD1 = ZI_A1_C1_<suffix>`
- `CHILD2 = ZI_A1_C2_<suffix>`
- `CHILD3 = ZI_A1_C3_<suffix>`

Failure handling:
- If any create call fails after SAP may have created an empty shell, do not retry update on the same suffix. Record the suffix as abandoned and choose a fresh suffix only if the write-smoke still passes.
- Cleanup abandoned objects only if delete works without lock/CSRF errors.
- If SAP reports same-user edit lock, record object name, SAP error code, and owner.
- Currency semantics: on SAP_BASIS 758, `sflight-price` is an amount field. Any child that projects `Price` should also project `CurrencyCode`; otherwise activation can fail with amount/currency metadata errors that are unrelated to PR #176.

Baseline root:
```abap
@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'ARC1 PR176 root'
define view entity <ROOT>
  as select from sflight
{
  key carrid   as CarrierId,
  key connid   as ConnectionId,
  key fldate   as FlightDate,
      price    as Price,
      currency as CurrencyCode,
      planetype as PlaneType
}
```

Child 1:
```abap
@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'ARC1 PR176 child 1'
define view entity <CHILD1>
  as select from <ROOT>
{
  key CarrierId,
  key ConnectionId,
  key FlightDate,
      Price,
      CurrencyCode
}
```

Child 2:
```abap
@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'ARC1 PR176 child 2'
define view entity <CHILD2>
  as select from <ROOT>
{
  key CarrierId,
  key ConnectionId,
  key FlightDate,
      Price,
      CurrencyCode,
      PlaneType
}
```

Child 3:
```abap
@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'ARC1 PR176 child 3'
define view entity <CHILD3>
  as select from <ROOT>
{
  key CarrierId,
  key ConnectionId,
  key FlightDate,
      Price,
      CurrencyCode
}
```

Steps:
1. Create root, child1, child2, child3 in `$TMP` with `SAPWrite(action="create", type="DDLS", ...)`.
2. Activate all four with `SAPActivate(objects=[...])`.
   - If batch activation reports mixed messages such as "Batch activation failed" while individual objects are active, follow up with single-object activation for ROOT, CHILD1, CHILD2, CHILD3 and record the mixed batch note. Do not classify this alone as a PR regression.
3. Call both where-used forms before the breaking update:
   - `SAPNavigate(action="references", type="DDLS", name=ROOT)`
   - `SAPNavigate(action="references", type="DDLS", name=ROOT, objectType="DDLS/DF")`
   - Raw where-used responses may include package/container rows such as `$TMP` with type `DEVC/*`. Put those in `containerResultNames`; do not count them as CRUD impact dependents.
   - Only put entries with DDLS object types such as `DDLS/DF` in `unfilteredResultNames` or `scopedDdlsResultNames`; do not include `$TMP` there unless the raw type is actually DDLS.
   - Judge `includesAllChildren` from classified DDLS impact buckets and guidance text, not from raw unfiltered result rows alone.
4. Update only ROOT by changing `price as Price` to `price as TicketPrice`.
5. Verify update response includes:
   - `CDS update follow-up for <ROOT>`
   - downstream impact buckets
   - inactive-source reminder
   - suggested re-activation order
   - `SAPActivate(objects=[...])` batch template
   - ideally all three child DDLS names after scoped where-used hardening
6. Run `SAPActivate(type="DDLS", name=ROOT)`.
   - If it fails, verify it includes `CDS activation impact`, dependents, and a batch template.
   - If it succeeds, activate a child that still references `Price` and capture SAP's reaction.
   - Optional diagnostic: after a failed ROOT activation, activating a child can still succeed on some SAP systems because the child may validate against the last active ROOT version while the broken ROOT source remains inactive. Record this under `childActivationAfterRootFailure`; do not classify it as a regression unless the ARC-1 activation guidance is missing or misleading.
7. Try deleting ROOT before children.
   - Expected: dependency-style failure.
   - Verify DDIC diagnostics come before `Blocking dependents`.
   - Verify suggested delete order is present.
   - Verify no generic `DDIC save failed` hint appears.
   - Verify the delete hint includes stale-cleanup guidance for listed dependents that may already have been deleted.

## 6. Cleanup

Use `arc1-pr176-dev`:
1. Restore ROOT to baseline if needed and activate all four.
2. Delete CHILD3, CHILD2, CHILD1, then ROOT.
3. If a delete fails due active/inactive mismatch, activate baseline first and retry.
4. If the first ROOT delete after CHILD cleanup still returns `[?/039]` and either lists an already-deleted child or no current blockers, retry ROOT once after a short wait. If that retry succeeds, classify it as `stale-cleanup-dependency`, not a regression.
5. If a lock/CSRF/session error remains, stop retrying and report object name, SAP error code/message, and owner if known.

## 7. Required Feedback Format

Return exactly this YAML shape so Codex can analyze it quickly:

If `liveWriteStatus` is `write-session-failed`, keep skipped DDLS sections compact: use empty arrays and one-line raw snippets such as `(skipped — write-smoke gate failed)`. Do not paste static source excerpts unless there is a regression.

```yaml
status: Implemented fixes confirmed | Regression found | Environment/session setup issue
staticStatus: passed | failed | blocked
liveWriteStatus: passed | write-session-failed | skipped
liveCdsStatus: passed | failed | skipped
authorizationStatus: passed | failed | skipped
workspace:
  active: <path>
  staticRoot: /Users/marianzeis/DEV/ARC1-RAP-VB-1/arc1-pr176-visible
  runtimeRoot: /Users/marianzeis/DEV/arc-1/.claude/worktrees/suspicious-torvalds-f801a4
  fileReadsBlocked: true | false
snapshot:
  source: <from .arc1-pr176-snapshot.json or unknown>
  head: <from .arc1-pr176-snapshot.json or unknown>
  createdAt: <from .arc1-pr176-snapshot.json or unknown>
servers:
  dev: connected | failed
  noUpdate: connected | failed
  noDelete: connected | failed
  readonly: connected | failed
  btpSim: connected | failed | not-used
sap:
  system: <SAP_BASIS/S4FND if known>
staticChecks:
  scopedWhereUsedSupplement: true | false
  bestEffortScopeFallback: true | false
  dedupesWhereUsedResults: true | false
  additiveGuidanceOnly: true | false
  deleteDdicBeforeHints: true | false
  noGenericSaveHintOnDelete: true | false
  noDdicSaveHintOnWriteSessionFailure: true | false
authorization:
  readonlyWriteToolHidden: true | false
  noUpdateMode: in-band-denial | hidden-action | failed | skipped
  noUpdateDenied: true | false
  noDeleteMode: in-band-denial | hidden-action | failed | skipped
  noDeleteDenied: true | false
writeSmoke:
  suffix: <suffix>
  object: <name>
  createOutcome: succeeded | failed | partial-created | skipped
  deleteOutcome: succeeded | failed | skipped
  rawSnippet: |
    <paste exact relevant lines, especially infrastructure hints>
objects:
  suffix: <suffix>
  root: <name>
  children: [<name>, <name>, <name>]
whereUsedEvidence:
  unfilteredResultNames: [ ... ]
  scopedDdlsResultNames: [ ... ]
  containerResultNames: [ ... ]
updateGuidance:
  includesAllChildren: true | false | skipped
  rawSnippet: |
    <paste exact relevant lines>
activationGuidance:
  outcome: failed | succeeded | skipped
  batchNotes: <mixed batch activation messages, or none>
  childActivationAfterRootFailure: succeeded | failed | not-run | not-applicable
  rawSnippet: |
    <paste exact relevant lines>
deleteGuidance:
  ddicBeforeBlockingHint: true | false | skipped
  noGenericSaveHint: true | false | skipped
  rawSnippet: |
    <paste exact relevant lines>
cleanup:
  deleted: [ ... ]
  leftovers: [ ... ]
  staleCleanupDependency: true | false | skipped
questionsForCodex:
  - <What was confusing in this prompt?>
  - <Which output was too verbose or hard to classify?>
  - <Any unexpected SAP backend behavior?>
```
