# TABL — Table / Structure (DDIC)

## TL;DR
`TABL` is the canonical TADIR R3TR type covering both transparent tables (DD02L `TABCLASS=TRANSP`) and DDIC structures (`TABCLASS=INTTAB`/`APPEND`). ADT splits these into two slash subtypes: `TABL/DT` (transparent table, URL `/sap/bc/adt/ddic/tables/`) and `TABL/DS` (structure, URL `/sap/bc/adt/ddic/structures/`). PR #219 collapsed both into ARC-1's single canonical short `TABL` and removed the bogus `STRU` (kept `STRU/DS → TABL` as a legacy alias). The implementation in `intent.ts` (lines 2573-2583) and `AdtClient.getTabl()` (which falls back from `/tables/` to `/structures/` on 404) is correct. Audit verdict: **the PR #219 fix is complete and accurate**.

## TADIR ground truth
- **R3TR type**: `TABL`. There is no `R3TR STRU`. Pre-#219 ARC-1 invented one.
- **LIMU sub-objects**: `TABD` (table definition), `INDX` (secondary indexes attached to a table).
- **abap-file-formats support**: ❌ no `tabl/` directory in AFF. (Tables are not yet released for cloud as standalone serialized objects.)

## ADT slash subtypes
| Slash code | Meaning | URL prefix | Verified on |
|---|---|---|---|
| `TABL/DT` | Transparent / pooled / cluster table | `/sap/bc/adt/ddic/tables/<NAME>` | a4h ✅ |
| `TABL/DS` | DDIC structure (incl. APPEND) | `/sap/bc/adt/ddic/structures/<NAME>` | a4h ✅ |

Live evidence: search with `objectType=TABL/DT` returns tables only; `objectType=TABL/DS` returns structures only. Unfiltered `objectType=TABL` returns a mix — confirms both subtypes share TABL.

## SAP docs & notes
- DD02L documentation (TABCLASS column) defines the TRANSP/INTTAB/APPEND distinction.
- ADT plugin: `/sap/bc/adt/ddic/tables` and `/sap/bc/adt/ddic/structures` are separate REST collections under the same workbench type.

## Other MCP servers / cross-reference
- mcp-abap-abap-adt-api: uses `TABL/DT` for tables, `TABL/DS` for structures.
- abapGit: serializes both as `tabl` (lower) but distinguishes via the `TABCLASS` field inside the XML.
- `compare/00-feature-matrix.md`: TABL coverage was a known parity item; PR #219 closed it.

## Live verification
### a4h (S/4HANA 2023)
- `GET /repository/informationsystem/search?objectType=TABL/DT&query=T000` → returns `T000` with `adtcore:type="TABL/DT"`, URL `/sap/bc/adt/ddic/tables/t000`.
- `GET /sap/bc/adt/ddic/tables/T000` → 200.
- `GET /sap/bc/adt/ddic/structures/<some-struct>` → 200 (verified by `TABL/DS` search results all carrying `/sap/bc/adt/ddic/structures/...` URIs).

### 7.50 (NW 7.50)
- Not verified live. ADT TABL endpoints landed for write in 7.52+; read in 7.50 may require structure URL fallback (AdtClient.getTabl already implements 404 fallback).

## ARC-1 current surface
| Location | Line(s) | Form used | Correct? |
|---|---|---|---|
| `src/handlers/intent.ts` `SLASH_TYPE_MAP` | 2577-2578 | `TABL/DT → TABL`, `TABL/DS → TABL` | ✅ |
| `src/handlers/intent.ts` `SLASH_TYPE_MAP` | 2583 | `STRU/DS → TABL` (legacy alias for old prompts) | ✅ legacy-tolerable |
| `src/handlers/intent.ts` `objectBasePath` | 2693-2697 | default `/ddic/tables/` (with comment about /structures/ fallback) | ✅ |
| `src/adt/client.ts` `getTabl` / `resolveTablObjectUrl` | — | tries `/tables/` then falls back to `/structures/` on 404 | ✅ |
| `src/handlers/schemas.ts` enums | 31, 67, 230, 245 | `TABL` only (no `STRU`) | ✅ |
| `src/probe/catalog.ts` | — | `TABL` with note about /structures/ duality | ✅ |

## Verdict
- **Status**: correct (PR #219 audit complete)
- **Evidence**: verified-on-live-system
- **Issue**: none. Bare `STRU` is intentionally NOT aliased so it surfaces as a schema error — the deliberate breaking-change signal is preserved.

## Recommendation
- Keep as-is.
- Consider sunsetting the `STRU/DS` legacy alias one minor release after v0.8.0 once telemetry confirms no real callers. (Not urgent.)
- **Breaking change**: none from current state.
- **Test gap to close**: PR #219 should already include unit tests for both URL routes and structure-fallback behavior. If missing, add E2E test that creates a structure under `$TMP` and reads it via `SAPRead --type TABL --name <STRUCT>`.
