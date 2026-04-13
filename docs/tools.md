# ARC-1 Tool Reference

Complete documentation for all MCP tools available in ARC-1.

ARC-1 exposes **11 intent-based tools** designed for AI agents. Instead of 200+ individual tools (one per object type per operation), ARC-1 groups by *intent* with a `type` parameter for routing. This keeps the LLM's tool selection simple and the context window small (~5K schema tokens).

---

## SAPRead

Read any SAP ABAP object.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `type` | string | Yes | Object type (see below) |
| `name` | string | No | Object name (e.g., `ZTEST_PROGRAM`, `ZCL_ORDER`, `MARA`) |
| `format` | string | No | Output format: `"text"` (default) or `"structured"` (CLAS only, see below) |
| `include` | string | No | For CLAS: `main`, `testclasses`, `definitions`, `implementations`, `macros`. For DDLS: `elements` (extract CDS view elements). |
| `method` | string | No | For CLAS: method name to read (e.g., `get_name`), or `*` to list all methods |
| `expand_includes` | boolean | No | For FUGR: expand include source inline |
| `group` | string | No | For FUNC: function group name |
| `maxRows` | number | No | For TABLE_CONTENTS: max rows (default 100) |
| `sqlFilter` | string | No | For TABLE_CONTENTS: SQL WHERE clause filter |
| `objectType` | string | No | For API_STATE: SAP object type (CLAS, INTF, PROG, FUGR, etc.) — auto-detected from name if omitted |

**Supported types:**

| Type | Description |
|------|-------------|
| `PROG` | Program source |
| `CLAS` | Class source |
| `INTF` | Interface source |
| `FUNC` | Function module source |
| `FUGR` | Function group structure |
| `INCL` | Include source |
| `DDLS` | CDS view source |
| `DDLX` | CDS metadata extension (UI annotations for Fiori Elements) |
| `BDEF` | Behavior definition |
| `SRVD` | Service definition |
| `SRVB` | Service binding (structured JSON: OData version, binding type, publish status) |
| `TABL` | Table definition (structure) |
| `VIEW` | DDIC view |
| `STRU` | Structure definition (DDIC structure source) |
| `DOMA` | Domain metadata (structured JSON: data type, length, fixed values, value table) |
| `DTEL` | Data element metadata (structured JSON: type, labels, search help) |
| `TRAN` | Transaction metadata (structured JSON: code, description, program) |
| `SOBJ` | BOR business object (list methods, or read specific method with `method` param) |
| `BSP` | BSP/UI5 filestore (list apps, browse structure, read files via `name`+`include` path) |
| `API_STATE` | API release state (clean core compliance — contract states C0-C4, successor info) |
| `TABLE_CONTENTS` | Table data (rows) |
| `DEVC` | Package contents |
| `SYSTEM` | System info (SID, release, kernel) |
| `COMPONENTS` | Installed software components |
| `MESSAGES` | Message class texts |
| `TEXT_ELEMENTS` | Program text elements |
| `VARIANTS` | Program variants |
| `INACTIVE_OBJECTS` | List all objects pending activation (no name needed). Returns 404-friendly fallback on systems where the endpoint is unavailable. |

**Structured format (CLAS only):**

When `format="structured"` is used with CLAS type, the response is a JSON object with:
- `metadata` — class metadata (description, language, category, package, fixPointArithmetic, abapLanguageVersion)
- `main` — main class source code
- `testclasses` — test class source (or null if none)
- `definitions` — local definitions (or null)
- `implementations` — local implementations (or null)
- `macros` — macros (or null)

This is useful when you need to understand class structure or separate test code from production code.

**Examples:**
```
SAPRead(type="PROG", name="ZTEST_REPORT")
SAPRead(type="CLAS", name="ZCL_ORDER", include="testclasses")
SAPRead(type="CLAS", name="ZCL_ORDER", format="structured")  — JSON with metadata + decomposed source
SAPRead(type="CLAS", name="ZCL_ORDER", method="*")           — list all methods
SAPRead(type="CLAS", name="ZCL_ORDER", method="get_name")    — read a specific method
SAPRead(type="DDLS", name="ZI_TRAVEL", include="elements")   — extract CDS view elements
SAPRead(type="DDLX", name="ZC_TRAVEL")          — metadata extension with UI annotations
SAPRead(type="SRVB", name="ZUI_TRAVEL_O4")       — service binding metadata as JSON
SAPRead(type="FUGR", name="ZUTILS", expand_includes=true)    — function group with all includes expanded
SAPRead(type="STRU", name="BAPIRET2")            — structure definition
SAPRead(type="DOMA", name="BUKRS")               — domain metadata with fixed values
SAPRead(type="DTEL", name="MANDT")               — data element metadata with labels
SAPRead(type="TRAN", name="SE38")                — transaction metadata
SAPRead(type="SOBJ", name="BUS2032")             — list BOR object methods
SAPRead(type="BSP")                              — list all BSP/UI5 apps
SAPRead(type="API_STATE", name="CL_SALV_TABLE")              — check if class is released for ABAP Cloud
SAPRead(type="API_STATE", name="IF_HTTP_CLIENT")              — check interface release state
SAPRead(type="API_STATE", name="MARA", objectType="TABL")     — check table with explicit type
SAPRead(type="TABLE_CONTENTS", name="MARA", maxRows=10, sqlFilter="MATNR LIKE 'Z%'")
SAPRead(type="SYSTEM")
SAPRead(type="INACTIVE_OBJECTS")                 — list objects pending activation
```

---

## SAPSearch

Search for ABAP objects by name pattern with wildcards.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | Yes | Search pattern (e.g., `ZCL_ORDER*`, `Z*TEST*`) or text to search in source code |
| `maxResults` | number | No | Maximum results (default 100) |
| `searchType` | string | No | `object` (default, name search) or `source_code` (text search within ABAP source) |
| `objectType` | string | No | For `source_code` search: filter by object type |
| `packageName` | string | No | For `source_code` search: filter by package |

**Returns:** Object type, name, package, and description for each match. Source code search also returns line numbers and code snippets.

**Examples:**
```
SAPSearch(query="ZCL_ORDER*")
SAPSearch(query="Z*INVOICE*", maxResults=20)
SAPSearch(query="SY-SUBRC", searchType="source_code")
SAPSearch(query="SELECT * FROM mara", searchType="source_code", objectType="CLAS", packageName="ZDEV")
```

**Umlaut handling:** Object name queries containing non-ASCII characters (ä, ö, ü, ß) are automatically transliterated to ASCII equivalents (AE, OE, UE, SS). SAP object names are ASCII-only. Source code search preserves non-ASCII characters.

**Field names:** If searching for a field/column name (e.g., MATNR, BUKRS), use SAPQuery against DD03L instead — SAPSearch only searches object names.

**Source code search availability:** Not available on all SAP systems. Requires SICF service activation. If unavailable, falls back with an error suggesting SAPQuery as an alternative.

---

## SAPWrite

Create or update ABAP source code. Handles lock/modify/unlock automatically.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | Yes | `create`, `update`, `delete`, `edit_method`, or `batch_create` |
| `type` | string | No | `PROG`, `CLAS`, `INTF`, `FUNC`, `INCL`, `DDLS`, `DDLX`, `BDEF`, `SRVD`, `DOMA`, `DTEL` (for single object actions) |
| `name` | string | No | Object name (for single object actions) |
| `source` | string | No | ABAP source code (for create/update/edit_method) |
| `method` | string | No | For `edit_method`: method name to replace (e.g., `"get_name"`) |
| `description` | string | No | Object description for `create` (defaults to name if omitted, max 60 chars) |
| `package` | string | No | Package for new objects (default `$TMP`) |
| `transport` | string | No | Transport request number. For `update` and `delete`, if omitted ARC-1 auto-uses the correction number returned by the SAP lock (if any). Explicit value takes precedence. |
| `dataType` | string | No | DOMA/DTEL: ABAP data type (`CHAR`, `NUMC`, `DEC`, ...) |
| `length` | number | No | DOMA/DTEL: data type length |
| `decimals` | number | No | DOMA/DTEL: decimal places |
| `outputLength` | number | No | DOMA: output length |
| `conversionExit` | string | No | DOMA: conversion exit (e.g., `ALPHA`) |
| `signExists` | boolean | No | DOMA: whether signed values are allowed |
| `lowercase` | boolean | No | DOMA: whether lowercase characters are allowed |
| `fixedValues` | array | No | DOMA: fixed value entries (`[{low, high?, description?}]`) |
| `valueTable` | string | No | DOMA: value table reference (e.g., `T001`) |
| `typeKind` | string | No | DTEL: `domain` or `predefinedAbapType` |
| `typeName` | string | No | DTEL: referenced domain/type name (for `typeKind="domain"`) |
| `shortLabel` | string | No | DTEL: short field label |
| `mediumLabel` | string | No | DTEL: medium field label |
| `longLabel` | string | No | DTEL: long field label |
| `headingLabel` | string | No | DTEL: heading field label |
| `searchHelp` | string | No | DTEL: search help name |
| `searchHelpParameter` | string | No | DTEL: search help parameter |
| `setGetParameter` | string | No | DTEL: SET/GET parameter ID |
| `defaultComponentName` | string | No | DTEL: default component name |
| `changeDocument` | boolean | No | DTEL: change document flag |
| `objects` | array | No | For `batch_create`: ordered list of objects (see below) |

**DDIC metadata writes:** `DOMA` and `DTEL` use structured XML payloads (content-type `application/vnd.sap.adt.*.v2+xml`) and do **not** use `/source/main`.

**BDEF creation:** Uses SAP's `blue:blueSource` XML format with content-type `application/vnd.sap.adt.blues.v1+xml`. BDEF objects are created with `type="BDEF"` and require a `source` parameter containing the behavior definition.

**CDS pre-write validation:**

- **Table entity version guard:** `define table entity` syntax requires ABAP Cloud (BTP) or S/4HANA on-premise with SAP_BASIS >= 757. On older systems, ARC-1 rejects the write early with an actionable message instead of letting SAP fail with a generic error.
- **Reserved keyword warnings:** CDS field names like `position`, `value`, `type`, `data` etc. may be CDS reserved keywords that cause silent DDL save failures. ARC-1 detects these and includes an advisory warning (non-blocking) suggesting renamed alternatives.
- **Empty DDLS source:** When reading a DDLS that exists but has no stored source, ARC-1 returns an explicit warning instead of silent empty content.

**Batch creation:**

`batch_create` creates and activates multiple objects in sequence via a single tool call. Objects are processed in array order — put dependencies first (e.g., domain before data element, CDS view before projection, BDEF after CDS views). Each object in the array has: `type` (string, required), `name` (string, required), `source` (string, optional), `description` (string, optional), plus optional DOMA/DTEL metadata fields.

If any object fails, processing stops and the response reports which objects succeeded and which failed. AFF metadata validation runs automatically for supported types (CLAS, INTF, PROG, DDLS, BDEF, SRVD, SRVB) — invalid metadata is rejected before hitting SAP.

```
SAPWrite(action="batch_create", package="ZDEV", transport="K900123", objects=[
  {type:"DDLS", name:"ZI_TRAVEL", source:"define root view..."},
  {type:"BDEF", name:"ZI_TRAVEL", source:"managed implementation..."},
  {type:"SRVD", name:"ZSD_TRAVEL", source:"define service..."},
  {type:"CLAS", name:"ZBP_I_TRAVEL", source:"CLASS zbp_i_travel..."}
])

SAPWrite(action="create", type="DOMA", name="ZSTATUS", package="$TMP",
  dataType="CHAR", length=1,
  fixedValues=[{low:"A",description:"Active"},{low:"I",description:"Inactive"}])

SAPWrite(action="create", type="DTEL", name="ZSTATUS", package="$TMP",
  typeKind="domain", typeName="ZSTATUS",
  shortLabel="Status", mediumLabel="Order Status")
```

**Transport behavior:**

- **`update` and `delete`**: ARC-1 automatically reuses the correction number from the SAP object lock when no explicit `transport` is provided. This means writes to transportable objects often succeed without manually specifying a transport.
- **`create` and `batch_create`**: ARC-1 performs a **transport pre-flight check** for non-`$TMP` packages when no transport is provided. This calls the SAP transport checks endpoint to determine whether a transport number is required:
  - If the object is already locked in a transport, ARC-1 auto-uses that transport.
  - If the package is local (e.g., `$TMP`), no transport is needed — creation proceeds.
  - If a transport IS required but none was provided, ARC-1 returns an actionable error message listing existing transports and guiding the caller to use `SAPTransport(action="list")` or `SAPTransport(action="create")` first.
  - If the pre-flight check fails (older system, permissions), ARC-1 proceeds and lets SAP handle the error.

**Note:** Not available by default (read-only mode). Enable with `--read-only=false` or `--profile developer`. When enabled, write access is restricted to package `$TMP` (local objects). To write to other packages, configure `--allowed-packages` (e.g., `"Z*,$TMP"`).

---

## SAPActivate

Activate (publish) ABAP objects. Supports single object or batch activation.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | string | No | Object name (for single activation) |
| `type` | string | No | Object type (`PROG`, `CLAS`, `DDLS`, `DDLX`, `BDEF`, `SRVD`, `SRVB`, etc.) |
| `preaudit` | boolean | No | Request pre-activation audit from SAP (default: `true`). Set `false` to skip pre-audit for faster activation. |
| `objects` | array | No | For batch: array of `{type, name}` objects to activate together |

Use batch activation for RAP stacks where objects depend on each other (DDLS, BDEF, SRVD, DDLX, SRVB must be activated together).

**Examples:**
```
SAPActivate(type="CLAS", name="ZCL_ORDER")
SAPActivate(objects=[{type:"DDLS",name:"ZI_TRAVEL"},{type:"BDEF",name:"ZI_TRAVEL"},{type:"SRVD",name:"ZSD_TRAVEL"}])
```

**Note:** Not available by default (read-only mode). Enable with `--read-only=false` or `--profile developer`.

---

## SAPNavigate

Navigate code: find definitions, references (where-used), code completion, and class hierarchy.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | Yes | `definition`, `references`, `completion`, or `hierarchy` |
| `uri` | string | No | Source URI of the object. Optional for `references` if `type`+`name` are provided. |
| `type` | string | No | Object type (PROG, CLAS, INTF, FUNC, etc.) — alternative to `uri` for `references`. |
| `name` | string | No | Object name — alternative to `uri` for `references`. |
| `objectType` | string | No | For `references`: filter where-used results by ADT object type in slash format (e.g., PROG/P, CLAS/OC, FUNC/FM, INTF/OI). On systems supporting the scope endpoint, only returns references from objects of the specified type. On older systems, the filter is ignored and all references are returned with a note. |
| `line` | number | No | Line number (1-based) |
| `column` | number | No | Column number (1-based) |
| `source` | string | No | Current source code |

**References action (Where-Used):** Uses the full scope-based Where-Used API, returning detailed results with line numbers, code snippets, and package info. Falls back to the simpler reference lookup on older SAP systems that don't support the scope endpoint.

**Hierarchy action:** Returns the class inheritance chain via SEOMETAREL: superclass (or null), implemented interfaces, and direct subclasses. Requires `name` parameter (class name). Uses SQL queries, so free SQL must be enabled (`--block-free-sql=false` or `--profile viewer-sql`/`developer-sql`).

**Examples:**
```
SAPNavigate(action="definition", uri="/sap/bc/adt/programs/programs/ztest", line=10, column=5)
SAPNavigate(action="references", uri="/sap/bc/adt/oo/classes/zcl_order")
SAPNavigate(action="references", type="CLAS", name="ZCL_ORDER")
SAPNavigate(action="references", type="CLAS", name="ZCL_ORDER", objectType="PROG/P")
SAPNavigate(action="completion", uri="/sap/bc/adt/programs/programs/ztest", line=10, column=15, source="...")
SAPNavigate(action="hierarchy", name="ZCL_ORDER")
```

---

## SAPQuery

Execute ABAP SQL queries against SAP tables.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `sql` | string | Yes | ABAP SQL SELECT statement |
| `maxRows` | number | No | Maximum rows (default 100) |

**Important:** Uses ABAP SQL syntax, NOT standard SQL:
- Use `ASCENDING`/`DESCENDING` (not `ASC`/`DESC`)
- Use `maxRows` parameter (not `LIMIT`)
- `GROUP BY`, `COUNT(*)`, `WHERE` all work

**Examples:**
```
SAPQuery(sql="SELECT carrid, COUNT(*) as cnt FROM sflight GROUP BY carrid ORDER BY cnt DESCENDING")
SAPQuery(sql="SELECT * FROM mara WHERE matnr LIKE 'Z%'", maxRows=50)
```

**Note:** Not available by default (free SQL blocked). Enable with `--block-free-sql=false` or `--profile viewer-sql`/`developer-sql`.

---

## SAPTransport

Manage CTS transport requests (SE09/SE10 equivalent): list, get details, create (K/W/T types), release, delete, reassign owner, recursive release, and check transport requirements.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | Yes | `list`, `get`, `create`, `release`, `delete`, `reassign`, `release_recursive`, or `check` |
| `id` | string | No | Transport request ID, e.g. `A4HK900123` (for get/release/delete/reassign/release_recursive) |
| `description` | string | No | Transport description text (required for create) |
| `name` | string | No | Object name (for check action, e.g. `ZCL_ORDER`) |
| `package` | string | No | Package name (for check action, e.g. `ZDEV`) |
| `user` | string | No | SAP username to filter by (for list). Defaults to the current SAP user. Use `*` to list all users. |
| `status` | string | No | Transport status filter (for list). `D`=modifiable (default), `R`=released, `*`=all statuses. |
| `type` | string | No | For create: transport type `K` (Workbench, default), `W` (Customizing), `T` (Transport of Copies). For check: object type (`PROG`, `CLAS`, `DDLS`, etc.) |
| `owner` | string | No | New owner SAP username (required for reassign) |
| `recursive` | boolean | No | Apply recursively to child tasks (for delete/reassign). `release_recursive` always recurses. |

**Actions:**

- **`list`** — List transport requests. Defaults to current user, modifiable (status D), all types (Workbench, Customizing, Transport of Copies).
- **`get`** — Get transport details including tasks and objects.
- **`create`** — Create a new transport request. Requires `description`. Optional `type` (K/W/T).
- **`release`** — Release a single transport or task.
- **`delete`** — Delete a transport. Use `recursive=true` to delete tasks first.
- **`reassign`** — Change transport owner. Requires `owner`. Use `recursive=true` for tasks too.
- **`release_recursive`** — Release all unreleased tasks first, then the transport itself.
- **`check`** — Check if a transport number is required for creating an object in a specific package. Requires `type`, `name`, and `package`. Returns whether transport recording is required, whether the package is local, existing transports, and any locked transport. **Does NOT require `--enable-transports`** — this is a read-only pre-flight check.

**Check action output:**
```json
{
  "package": "ZDEV",
  "transportRequired": true,
  "isLocal": false,
  "deliveryUnit": "HOME",
  "existingTransports": [
    { "id": "A4HK900123", "description": "My transport", "owner": "DEVELOPER" }
  ],
  "summary": "Package \"ZDEV\" requires a transport for object creation."
}
```

**List defaults:** Without parameters, `list` returns modifiable transports (status D) for the current SAP user, across all transport types (Workbench, Customizing, Transport of Copies). Query params follow sapcli's `workbench_params()` pattern (`requestType=KWT`, `requestStatus`).

**Protocol compatibility:** ARC-1 uses endpoint-specific CTS media types and includes a one-retry content negotiation fallback (406/415) for SAP version variance.

**Note:** Most actions require `--enable-transports`. The `check` action works without it (read-only).

---

## SAPContext

Get compressed dependency context for an ABAP object, or look up reverse dependencies (who uses a given object).

SAPContext has two modes controlled by the `action` parameter:

### action="deps" (default) — Dependency context

Returns only the public API contracts (method signatures, interface definitions, type declarations) of all objects that the target depends on — NOT the full source code. Typical compression: 7-30x fewer tokens.

**What gets extracted per dependency:**
- **Classes:** `CLASS DEFINITION` with `PUBLIC SECTION` only. `PROTECTED`, `PRIVATE` sections and `CLASS IMPLEMENTATION` are stripped.
- **Interfaces:** Full interface definition (interfaces are already public contracts).
- **Function modules:** `FUNCTION` signature block only (`IMPORTING`/`EXPORTING` parameters). Function body is stripped.

**Filtering:** SAP standard objects (`CL_ABAP_*`, `IF_ABAP_*`, `CX_SY_*`) are excluded by default. Custom objects (`Z*`, `Y*`) are prioritized in the output.

**Dependency detection:** Uses `@abaplint/core` AST parsing to find `TYPE REF TO`, `NEW`, `CAST`, `INHERITING FROM`, `INTERFACES`, `CALL FUNCTION`, `RAISING`, `CATCH`, and static method calls (`=>`).

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | No | `"deps"` (default) or `"usages"` |
| `type` | string | Yes (for deps) | Object type: `CLAS`, `INTF`, `PROG`, `FUNC` |
| `name` | string | Yes | Object name (e.g., `ZCL_ORDER`) |
| `source` | string | No | Provide source directly instead of fetching from SAP |
| `group` | string | No | Required for `FUNC` type. The function group name. |
| `maxDeps` | number | No | Maximum dependencies to resolve (default 20) |
| `depth` | number | No | Dependency depth: 1 = direct only (default), 2 = deps of deps, 3 = max |

**Examples:**
```
SAPContext(type="CLAS", name="ZCL_ORDER")
SAPContext(type="CLAS", name="ZCL_ORDER", depth=2, maxDeps=10)
SAPContext(type="INTF", name="ZIF_ORDER", source="<already fetched source>")
SAPContext(action="deps", type="CLAS", name="ZCL_ORDER")
```

**Output format:**
```
* === Dependency context for ZCL_ORDER (3 deps resolved) ===

* --- ZIF_ORDER (intf, 4 methods) ---
INTERFACE zif_order PUBLIC.
  METHODS create IMPORTING order TYPE t_order.
  ...
ENDINTERFACE.

* --- ZCL_ITEM (clas, 3 methods) ---
CLASS zcl_item DEFINITION PUBLIC.
  PUBLIC SECTION.
    METHODS get_price RETURNING VALUE(result) TYPE p.
    ...
ENDCLASS.

* Stats: 5 deps found, 3 resolved, 0 failed, 25 lines
```

**Cache indicator:** When the dependency graph is served from the object cache (no ADT calls needed), the header changes to:
```
* === Dependency context for ZCL_ORDER (3 deps resolved) [cached] ===
```

### action="usages" — Reverse dependency lookup

Returns all objects in the cached index that depend on the given object (i.e., "who calls/uses this?"). This is the inverse of `deps`.

**Requires cache warmup** (`ARC1_CACHE_WARMUP=true`). Without warmup, the edge index is empty and the tool returns an error with setup instructions. As a live alternative, use `SAPNavigate(action="references")`.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | Yes | `"usages"` |
| `name` | string | Yes | Object name to look up (e.g., `ZCL_ORDER`, `ZIF_ORDER`) |

**Example:**
```
SAPContext(action="usages", name="ZIF_ORDER")
```

**Output:**
```json
{
  "name": "ZIF_ORDER",
  "usageCount": 3,
  "usages": [
    { "fromId": "ZCL_ORDER", "type": "CLAS", "relation": "IMPLEMENTS" },
    { "fromId": "ZCL_ORDER_EXTENDED", "type": "CLAS", "relation": "IMPLEMENTS" },
    { "fromId": "ZCL_ORDER_FACTORY", "type": "CLAS", "relation": "USES" }
  ]
}
```

**When warmup is not available:** Returns `isError: true` with step-by-step instructions to enable warmup, and suggests `SAPNavigate(action="references")` as a live fallback.

---

## SAPLint

Run local abaplint rules on ABAP source code. System-aware: auto-selects cloud or on-prem rules based on detected system type. For server-side checks (ATC, syntax check, unit tests), use SAPDiagnose instead.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | Yes | `lint`, `lint_and_fix`, or `list_rules` |
| `source` | string | No | ABAP source code (for `lint` and `lint_and_fix`) |
| `name` | string | No | Object name (used for filename detection) |
| `rules` | object | No | Rule overrides: `{ "rule_name": false }` to disable, `{ "rule_name": { "severity": "Warning" } }` to configure |

**Actions:**

- **`lint`** — Check ABAP source for issues. Returns errors and warnings with line/column positions.
- **`lint_and_fix`** — Lint + auto-fix all fixable issues (keyword case, obsolete statements, etc.). Returns the fixed source code alongside remaining unfixable issues.
- **`list_rules`** — List all available rules with current config (preset, enabled/disabled status, severity). No source needed.

**System-Aware Presets:**

The lint rules auto-configure based on the detected SAP system:
- **BTP/Cloud**: `cloud_types` (Error), `strict_sql` (Error), `obsolete_statement` (Error) — enforces ABAP Cloud constraints
- **On-premise**: `cloud_types` (disabled), `obsolete_statement` (Warning) — more relaxed, allows classic ABAP

**Pre-Write Validation:**

When `--lint-before-write` is enabled (default: true), SAPWrite automatically runs a strict subset of lint rules before writing to SAP. Parser errors and cloud violations block the write. Style issues (keyword case, indentation) never block writes.

**Custom Configuration:**

Use `--abaplint-config /path/to/abaplint.jsonc` to load custom rules. The file uses the [abaplint config format](https://abaplint.org):

```jsonc
{
  // Override specific rules
  "rules": {
    "line_length": { "severity": "Error", "length": 80 },
    "abapdoc": true,           // re-enable a disabled rule
    "obsolete_statement": false // disable a rule
  },
  // Optional: override syntax version
  "syntax": { "version": "v757" }
}
```

Rules from the config file are merged on top of the auto-detected preset (cloud/on-prem). Per-call overrides via the `rules` parameter take precedence over the config file.

**Response shapes:**

- **`lint`** returns: `[{ rule, message, line, column, endLine, endColumn, severity }]`
- **`lint_and_fix`** returns: `{ fixedSource, appliedFixes, fixedRules, remainingIssues }` — use `fixedSource` as the corrected code
- **`list_rules`** returns: `{ preset, abapVersion, enabledRules, disabledRules, rules }` — shows active config

**Examples:**
```
SAPLint(action="lint", source="DATA lv_test TYPE string.\nlv_test = 'hello'.")
SAPLint(action="lint_and_fix", source="data lv_x type i.\nadd 1 to lv_x.", name="ZCL_TEST")
SAPLint(action="list_rules")
SAPLint(action="lint", source="...", rules={"line_length": {"severity": "Error", "length": 80}})
```

---

## SAPDiagnose

Server-side code analysis: syntax check, ABAP unit tests, ATC checks, short dumps (ST22), and ABAP profiler traces.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | Yes | `syntax`, `unittest`, `atc`, `dumps`, or `traces` |
| `name` | string | No | Object name (required for syntax/unittest/atc) |
| `type` | string | No | Object type: `PROG`, `CLAS`, `INTF`, `FUNC` (required for syntax/unittest/atc) |
| `id` | string | No | Dump ID (for dump detail) or Trace ID (for trace analysis) |
| `user` | string | No | Filter dumps by user |
| `maxResults` | number | No | Max dumps to return |
| `variant` | string | No | ATC check variant name |
| `analysis` | string | No | For trace detail: `hitlist`, `statements`, or `dbAccesses` |

**Actions:**

- **`syntax`** — Run SAP syntax check on an object. Returns errors/warnings with line, column, and message. **Important:** Syntax check runs against the *active* (on-system) source, not proposed new source. After writing/updating an object, activate it first, then run syntax check.
- **`unittest`** — Run ABAP unit tests. Returns results per test class/method with status, alert messages, and execution time.
- **`atc`** — Run ATC (ABAP Test Cockpit) checks. Returns findings with priority, check title, message, URI, and line number. Optional `variant` parameter for custom check variants.
- **`dumps`** — List short dumps (ST22). Without `id`: returns recent dumps (filterable by `user`, `maxResults`). With `id`: returns full dump detail including error type, exception, program, stack trace, and formatted output.
- **`traces`** — List ABAP profiler traces. Without `id`: returns trace list. With `id` + `analysis`: returns trace analysis (`hitlist` = call hierarchy with hit counts and timings, `statements` = executed statements, `dbAccesses` = database access details).

**Examples:**
```
SAPDiagnose(action="syntax", type="CLAS", name="ZCL_ORDER")
SAPDiagnose(action="unittest", type="CLAS", name="ZCL_ORDER")
SAPDiagnose(action="atc", type="PROG", name="ZTEST_REPORT", variant="DEFAULT")
SAPDiagnose(action="dumps")
SAPDiagnose(action="dumps", user="DEVELOPER", maxResults=10)
SAPDiagnose(action="dumps", id="20260409_123456_DUMP_ID")
SAPDiagnose(action="traces")
SAPDiagnose(action="traces", id="TRACE123", analysis="hitlist")
SAPDiagnose(action="traces", id="TRACE123", analysis="dbAccesses")
```

---

## SAPManage

Probe and report SAP system capabilities, and inspect the object cache state.

**Actions:**
- `probe` — Re-probe the SAP system now (makes 8 parallel HEAD requests, ~1-2s). Detects optional features.
- `features` — Get cached feature status from last probe (fast, no SAP round-trip).
- `cache_stats` — Return object cache statistics: number of cached sources, dep graphs, edges, and whether warmup has run.
- `flp_list_catalogs` — List FLP business catalogs.
- `flp_list_groups` — List FLP groups (`Pages`) from `/UI2/FLPD_CATALOG`.
- `flp_list_tiles` — List tiles/target mappings in a catalog.
- `flp_create_catalog` — Create an FLP business catalog.
- `flp_create_group` — Create an FLP group.
- `flp_create_tile` — Create a tile in an FLP catalog.
- `flp_add_tile_to_group` — Assign a catalog tile instance into a group.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | Yes | `probe`, `features`, `cache_stats`, `flp_list_catalogs`, `flp_list_groups`, `flp_list_tiles`, `flp_create_catalog`, `flp_create_group`, `flp_create_tile`, `flp_add_tile_to_group` |
| `catalogId` | string | No | Required for `flp_list_tiles`, `flp_create_tile`, `flp_add_tile_to_group` |
| `groupId` | string | No | Required for `flp_create_group`, `flp_add_tile_to_group` |
| `domainId` | string | No | Required for `flp_create_catalog` |
| `title` | string | No | Required for `flp_create_catalog`, `flp_create_group` |
| `tileInstanceId` | string | No | Required for `flp_add_tile_to_group` |
| `tile` | object | No | Required for `flp_create_tile`. Fields: `id`, `title`, `semanticObject`, `semanticAction`, optional `icon`, `url`, `subtitle`, `info` |

**Probed features:** `hana`, `abapGit`, `rap`, `amdp`, `ui5`, `transport`, `ui5repo`, `flp`. Each returns `available` (bool), `mode` (auto/on/off), `message`, and `probedAt` timestamp.

**cache_stats output:**
```json
{
  "enabled": true,
  "warmupAvailable": false,
  "sourceCount": 42,
  "contractCount": 38,
  "edgeCount": 0,
  "nodeCount": 42,
  "apiCount": 0
}
```

| Field | Description |
|-------|-------------|
| `enabled` | Whether caching is active (`false` if `ARC1_CACHE=none`) |
| `warmupAvailable` | Whether warmup has completed — required for `SAPContext(action="usages")` |
| `sourceCount` | Cached source code entries (grows as objects are read) |
| `contractCount` | Cached dependency graphs (grows as `SAPContext(deps)` is called) |
| `edgeCount` | Dependency edges — non-zero only after warmup |
| `nodeCount` | Object metadata entries — non-zero only after warmup |

**Examples:**
```
SAPManage(action="probe")       → discover system capabilities
SAPManage(action="features")    → get cached results (no SAP call)
SAPManage(action="cache_stats") → check cache state and warmup status
SAPManage(action="flp_list_catalogs")
SAPManage(action="flp_list_groups")
SAPManage(action="flp_list_tiles", catalogId="ZARC1_SALES")
SAPManage(action="flp_create_catalog", domainId="ZARC1_SALES", title="Sales Catalog")
SAPManage(action="flp_create_group", groupId="ZARC1_SALES_GRP", title="Sales Group")
SAPManage(action="flp_create_tile", catalogId="ZARC1_SALES", tile={"id":"tile_sales","title":"Sales","semanticObject":"SalesOrder","semanticAction":"display"})
SAPManage(action="flp_add_tile_to_group", groupId="ZARC1_SALES_GRP", catalogId="ZARC1_SALES", tileInstanceId="00O2TO3741QLWH4GV74AHMWQE")
```

**Note:** The `probe`, `features`, and `cache_stats` actions are read-only operations that work regardless of `--read-only` mode. In HTTP auth mode, SAPManage requires `write` scope.
