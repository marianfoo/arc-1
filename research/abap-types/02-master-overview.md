# ABAP Type Audit — Master Overview

This document consolidates the per-type research in `types/*.md` (36 docs) and translates the
findings into a prioritized fix list. It exists so a reader doesn't need to read all 36 docs
to know what's wrong, what's right, and what we're going to do about it.

Companion documents:
- `00-methodology.md` — how we researched each type (7-step procedure, 4 type namespaces)
- `01-inventory.md` — full type inventory and research-wave plan
- `types/<short>.md` — one deep-dive per type with template + evidence

## TL;DR

Issue #218 wasn't an isolated bug. The audit found **5 invented ADT slash aliases or
canonical short types** of the same bug class as `STRU/DS`. All five share the same root
cause: `SLASH_TYPE_MAP` was authored from intuition / cargo-culted patterns
(`XXXX/<first-letter>`) rather than verified against ADT. ADT silently ignores unknown
`objectType` query filters in `informationsystem/search`, which is exactly why the bugs
hid for so long — requests "succeeded" without ever filtering.

| Bug | Real form | Currently maps to | Should map to | Severity |
|---|---|---|---|---|
| `FUNC/FM` is invented | (does not exist) | `FUNC` | (remove alias) | P0 |
| `FUGR/FF` mis-routes | `FUGR/FF` (real, function module) | `FUGR` | `FUNC` | P0 |
| `VIEW/V` is invented | `VIEW/DV` | `VIEW` | (`VIEW/DV → VIEW`) | P0 + URL |
| `VIEW` URL is missing | `/sap/bc/adt/vit/wb/object_type/viewdv/object_name/` | `/programs/programs/` (fallthrough) | VIT path | P0 |
| `CLAS/LI` is invented | `CLAS/I` | `CLAS` | (`CLAS/I → CLAS`) | P1 |
| `FTG2` short form invented | (no SAP equivalent) | `FTG2` | rename `FEATURE_TOGGLE` or move to `SAPManage` | P1 |

Plus two non-bug structural issues worth fixing while we're here:

- `MSAG` is missing from `SAPREAD_TYPES_*` (write works, read enum forgot it)
- `MESSAGES` (read) vs `MSAG` (write) asymmetry — collapse to `MSAG` everywhere, keep
  `MESSAGES` as deprecated read alias

## Verdict matrix (all 36 types)

Legend: ✅ correct · ⚠ legacy-tolerable · ❌ wrong · 🟡 architectural smell · 🧩 pseudo (legitimate)

### Source-bearing

| Type | Verdict | Notes |
|---|---|---|
| `PROG` | ✅ | `PROG/P`, `PROG/I` both real |
| `CLAS` | ❌ | `CLAS/LI` invented → use `CLAS/I` |
| `INTF` | ✅ | `INTF/OI` real |
| `INCL` | ⚠ | ARC-1-internal pseudo-canonical; safe |
| `FUGR` | ❌ | `FUGR/FF → FUGR` is wrong (FF is a function module, not a group) |
| `FUNC` | ❌ | `FUNC/FM` invented, must be removed; bare `FUNC` is a useful caller-facing alias for `LIMU FUNC` |

### DDIC

| Type | Verdict | Notes |
|---|---|---|
| `TABL` | ✅ | PR #219 audit confirms; `STRU/DS` legacy alias intentional |
| `DOMA` | ✅ | `DOMA/DD` real |
| `DTEL` | ✅ | `DTEL/DE` real |
| `VIEW` | ❌ | `VIEW/V` invented (real is `VIEW/DV`) AND URL missing — current code falls through to `/programs/programs/`. Silently broken. |
| `MSAG` | ⚠ | Type/write OK; missing from `SAPREAD_TYPES_*` |
| `ENHO` | ✅ | Slash and URL correct |
| `AUTH` | ✅ | Pseudo (no R3TR AUTH), real ADT endpoint `/sap/bc/adt/aps/iam/auth/` |

### Cloud / RAP

| Type | Verdict | Notes |
|---|---|---|
| `DDLS` | ✅ | `DDLS/DF` real, abap-file-formats released |
| `DCLS` | ✅ | `DCLS/DL` real |
| `DDLX` | ⚠ | Type real & released, but `DDLX/EX` slash not seen in Eclipse jar — confirm via live fixture |
| `BDEF` | ✅ | `BDEF/BDO` real |
| `SRVD` | ✅ | `SRVD/SRV` real |
| `SRVB` | ✅ | `SRVB/SVB` real |
| `SKTD` | ✅ | `SKTD/TYP` real, URL correct; minor: add probe entry for clean degradation on systems without it |

### Container / workbench / other

| Type | Verdict | Notes |
|---|---|---|
| `DEVC` | ✅ | `DEVC/K` real |
| `TRAN` | ⚠ | `TRAN/O` not seen in Eclipse jar — likely `TRAN/T`. Confirm via live fixture |
| `BSP` | 🟡 | Functionally fine but overloaded — ARC-1 uses it for UI5 BSP filestore, not legacy R3TR BSP. Long-term rename `UI5_APP`. |
| `BSP_DEPLOY` | 🧩 | ARC-1 pseudo (UI5 ABAP repo OData); name OK |
| `SOBJ` | 🧩 | Pseudo (BOR-via-SQL), not ADT. Name collides with TADIR `R3TR SOBJ` — long-term rename `BOR`. |
| `FTG2` | ❌ | Short form invented (zero SAP sources). Endpoint real. Rename to `FEATURE_TOGGLE` or move to `SAPManage` |

### Pseudo cross-cutting reads (action-disguised-as-type)

These are real ADT endpoints but **mis-modeled as siblings of `CLAS`/`PROG`**. Tell-tale:
they require a second `objectType` parameter, or no `name`, or both. Architectural
recommendation: introduce a `view`/`action` parameter on `SAPRead`, e.g.
`SAPRead(type='CLAS', name='ZCL_FOO', view='api_state' | 'versions')`. Soft-deprecate the
type-enum entries over the next major.

| Type | Verdict | Action |
|---|---|---|
| `TABLE_CONTENTS` | 🧩→🟡 | Ok-as-is short-term; long-term move to `SAPRead(type=TABL, view=contents)` |
| `API_STATE` | 🟡 | Move to `view=api_state` long-term |
| `INACTIVE_OBJECTS` | 🟡 | Move to a dedicated workflow on `SAPManage` |
| `VERSIONS` | 🟡 | Move to `view=versions` long-term |
| `VERSION_SOURCE` | 🟡 | Move to `view=version_source` long-term |
| `MESSAGES` | 🟡 | Collapse with `MSAG` |
| `TEXT_ELEMENTS` | 🧩 | Keep — sub-resource of PROG |
| `VARIANTS` | 🧩 | Keep — sub-resource of PROG |
| `SYSTEM` | 🧩 | Keep — discovery aggregate |
| `COMPONENTS` | 🧩 | Keep — software component list |

## Cross-cutting findings (apply to future audits too)

1. **ADT silently ignores unknown `objectType` filters** in
   `/sap/bc/adt/repository/informationsystem/search`. Status 200 ≠ filter applied. Any
   future probe MUST inspect `<adtcore:type>` in the response, never assume the request
   succeeding means the alias is real.
2. **Cargo-culted slash patterns are a recurring smell.** `XXXX/<first-letter>` does NOT
   generalize. Real ADT subtypes are documented in Eclipse `com.sap.adt.core.apidoc-*` and
   in the `WBOBJTYPE` table — the source of truth, not the developer's intuition.
3. **Type vs URL coupling is implicit.** `objectBasePath` is a switch with a default that
   silently falls through to `/programs/programs/`. The `VIEW` bug existed entirely
   because the switch had no `case 'VIEW'` and nobody noticed. Fix: add a default-throws
   sentinel for known-listed types, OR exhaustive-switch via TypeScript.
4. **Read/write enum drift is easy to miss.** `MSAG` was in write but not read. We need
   a unit test that asserts symmetry where the ADT endpoint supports both verbs.
5. **Pseudo types and real types share an enum.** Mixing `TABL` (a real R3TR type) with
   `TABLE_CONTENTS` (an ADT view) in the same `type` enum is the architectural smell. The
   long-term shape is `type` = TADIR-truth + an explicit `view`/`action` parameter for the
   cross-cutting reads.

## Recommended fix waves

The audit splits into three plans, listed in dependency order:

### Plan A — Invented-alias purge (P0, breaking change like PR #219)

`docs/plans/audit-purge-invented-adt-types.md`

- Remove `FUNC/FM` from `SLASH_TYPE_MAP`
- Repoint `FUGR/FF → FUNC` (currently `→ FUGR`)
- Replace `CLAS/LI → CLAS` with `CLAS/I → CLAS`
- Replace `VIEW/V → VIEW` with `VIEW/DV → VIEW`
- Add `case 'VIEW'` to `objectBasePath` with VIT URL
- Probe-fixture confirm `DDLX/EX` and `TRAN/O` (or correct to `TRAN/T`)
- Add unit assertion that every `SLASH_TYPE_MAP` key is documented (anti-cargo-cult guard)
- Add integration tests that **inspect the returned `<adtcore:type>`**, not just status
- Add VIEW round-trip integration test (the missing test that hid the bug)

### Plan B — Read/write enum symmetry & `FTG2` rename (P1)

`docs/plans/audit-symmetry-and-ftg2-rename.md`

- Add `MSAG` to `SAPREAD_TYPES_*`
- Mark `MESSAGES` as deprecated alias of `MSAG` for read
- Rename `FTG2 → FEATURE_TOGGLE` (or move endpoint to
  `SAPManage(action='get_feature_toggle')`)
- Update probe catalog, tools description, schemas, intent handlers, docs
- Backwards-compat alias for one minor release

### Plan C — Pseudo-type architectural cleanup (P2, defer to a future major)

`docs/plans/audit-pseudo-type-view-parameter.md`

- Introduce `view` parameter on `SAPRead`
- Migrate `API_STATE`, `VERSIONS`, `VERSION_SOURCE`, `INACTIVE_OBJECTS`,
  `TABLE_CONTENTS` to the new shape
- Keep type-enum spelling as deprecated input for one major release
- Long-term: `BSP → UI5_APP`, `SOBJ → BOR` follow the same shape

Plan A and B are bundled into the same PR (this one). Plan C is a separate PR / next major
since it's much larger and not a bug, just a smell.

## Test gaps the audit identified

If any of these had existed, the bugs would not have:

- **Unit**: `normalizeObjectType('VIEW/DV') === 'VIEW'` — currently fails
- **Unit**: `objectBasePath('VIEW')` returns the VIT URL, not the program fallback
- **Integration**: `SAPRead(type='VIEW', name='V_USR_NAME')` returns DDIC view source on a4h
- **Integration**: SAPSearch with each `objectType` slash must verify the **returned**
  `adtcore:type`, not assume request status is enough
- **Unit**: every key in `SLASH_TYPE_MAP` has a citation comment pointing to either
  Eclipse apidoc, abap-file-formats, or a verified live fixture
- **Unit**: read enum and write enum are symmetric for every type that supports both verbs
  in ADT (allowlist approach)

These are folded into Plans A and B.
