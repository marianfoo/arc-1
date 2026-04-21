# CDS CRUD Dependency Handling (Root + 3 Dependents)

This note scopes a practical PR extension for CDS CRUD operations where one DDLS change can impact many dependent artifacts.

## Why this PR scope matters

The deletion workflow (`[?/039] could not be deleted`) is only one symptom. The same dependency graph also breaks **update + activate** flows when fields, aliases, or element signatures change in a base DDLS.

Current PR changes add dependency-aware guidance for:

1. `SAPWrite(action="update", type="DDLS")`
2. `SAPActivate(type="DDLS")` on failed activation
3. `SAPWrite(action="delete")` when SAP rejects delete due to references

All three use existing primitives (`findWhereUsed` + `classifyCdsImpact`) and do not require new SAP endpoints.

## Quick sample topology (3+ CDS views)

Use a minimal chain in a test package (`$TMP` or sandbox package):

1. `ZI_ARC1_TRAVEL` (interface/root DDLS)
2. `ZC_ARC1_TRAVEL` (projection DDLS on root)
3. `ZC_ARC1_TRAVEL_ITEM` (projection DDLS, association to root)
4. `ZC_ARC1_TRAVEL_NOTE` (projection DDLS, association to root)
5. Optional: `ZBP_C_ARC1_TRAVEL` (BDEF projection)
6. Optional: `ZUI_ARC1_TRAVEL` (SRVD)

This is sufficient to simulate fan-out impact and typical RAP dependency ordering.

## Repro script (manual sequence)

1. Create/activate root + dependents.
2. Run `SAPWrite(update, DDLS ZI_ARC1_TRAVEL)` and change a field used by downstream projections (rename, remove, or type change).
3. Observe response now includes:
   - downstream where-used summary by bucket
   - explicit reminder that `SAPWrite(update)` only writes inactive source
   - `SAPActivate` follow-up
4. Run `SAPActivate(type="DDLS", name="ZI_ARC1_TRAVEL")`.
   - If SAP reports dependent element errors, activation failure now includes dependency-aware re-activation guidance.
5. Attempt `SAPWrite(delete, DDLS ZI_ARC1_TRAVEL)` before deleting dependents.
   - If SAP returns dependency-style delete error (`[?/039]` etc.), message now includes blocker buckets and cycle-break guidance.

### Concrete sample sources (minimal)

Use one root + two dependent DDLS to reproduce field-change fallout quickly:

`ZI_ARC1_ROOT_<suffix>`:

```abap
@EndUserText.label: 'ARC1 root'
define view entity ZI_ARC1_ROOT_<suffix>
  as select from sflight
{
  key carrid,
  key connid,
  key fldate,
      price    as Price,
      currency as Currency
}
```

`ZI_ARC1_CHILD1_<suffix>`:

```abap
@EndUserText.label: 'ARC1 child 1'
define view entity ZI_ARC1_CHILD1_<suffix>
  as select from ZI_ARC1_ROOT_<suffix>
{
  key carrid,
  key connid,
  key fldate,
      Price,
      Currency
}
```

`ZI_ARC1_CHILD2_<suffix>`:

```abap
@EndUserText.label: 'ARC1 child 2'
define view entity ZI_ARC1_CHILD2_<suffix>
  as select from ZI_ARC1_ROOT_<suffix>
{
  key carrid,
  key connid,
  key fldate,
      Price
}
```

Then update root alias `Price` -> `TicketPrice` via `SAPWrite(update)` and activate/delete as in the sequence above.

### Live test-system probe status (2026-04-21)

- A4H direct basic-auth probe against known endpoints (`http://65.109.59.210:50000` and `http://a4h.marianzeis.de:50000`) returned `401 Anmeldung fehlgeschlagen` with `DEVELOPER/Appl1ance`.
- BTP smoke run remains browser-interactive OAuth (`Authorization Code` callback), so unattended execution cannot complete without an interactive login.
- Result: this PR validates behavior via deterministic unit tests and provides a ready-to-run manual SAP script for environments with working credentials.

## Expected system reaction

- **Update only**: source stored inactive; active runtime contract unchanged until activation.
- **Activate after contract change**: dependent DDLS/BDEF/SRVD/DDLX may fail until re-activated in order.
- **Delete base DDLS too early**: SAP rejects with DDIC dependency diagnostics; enriched output now lists likely blockers from where-used index.

## What this still does not automate

- No automatic cascade delete execution plan yet.
- No automatic source rewrite for cyclic projection graphs (strip + activate + delete).
- No automatic topological activation ordering yet.

Those are follow-up enhancements (e.g., `delete_cascade`, `force=true` or a cycle-break helper) and can be layered on top of the current PR safely.
