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
| `include` | string | No | For CLAS: `testclasses`, `definitions`, `implementations`, `macros` |
| `group` | string | No | For FUNC: function group name |
| `maxRows` | number | No | For TABLE_CONTENTS: max rows (default 100) |
| `sqlFilter` | string | No | For TABLE_CONTENTS: SQL WHERE clause filter |

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
| `BDEF` | Behavior definition |
| `SRVD` | Service definition |
| `TABL` | Table definition (structure) |
| `VIEW` | DDIC view |
| `TABLE_CONTENTS` | Table data (rows) |
| `DEVC` | Package contents |
| `SYSTEM` | System info (SID, release, kernel) |
| `COMPONENTS` | Installed software components |
| `MESSAGES` | Message class texts |
| `TEXT_ELEMENTS` | Program text elements |
| `VARIANTS` | Program variants |

**Examples:**
```
SAPRead(type="PROG", name="ZTEST_REPORT")
SAPRead(type="CLAS", name="ZCL_ORDER", include="testclasses")
SAPRead(type="TABLE_CONTENTS", name="MARA", maxRows=10, sqlFilter="MATNR LIKE 'Z%'")
SAPRead(type="SYSTEM")
```

---

## SAPSearch

Search for ABAP objects by name pattern with wildcards.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | Yes | Search pattern (e.g., `ZCL_ORDER*`, `Z*TEST*`) |
| `maxResults` | number | No | Maximum results (default 100) |

**Returns:** Object type, name, package, and description for each match.

**Examples:**
```
SAPSearch(query="ZCL_ORDER*")
SAPSearch(query="Z*INVOICE*", maxResults=20)
```

---

## SAPWrite

Create or update ABAP source code. Handles lock/modify/unlock automatically.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | Yes | `create`, `update`, or `delete` |
| `type` | string | Yes | `PROG`, `CLAS`, `INTF`, `FUNC`, `INCL` |
| `name` | string | Yes | Object name |
| `source` | string | No | ABAP source code (for create/update) |
| `package` | string | No | Package for new objects (default `$TMP`) |
| `transport` | string | No | Transport request number |

**Note:** Blocked when `--read-only` is active.

---

## SAPActivate

Activate (publish) ABAP objects. Reports any activation errors.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | string | Yes | Object name to activate |
| `type` | string | Yes | Object type (`PROG`, `CLAS`, etc.) |

**Note:** Blocked when `--read-only` is active.

---

## SAPNavigate

Navigate code: find definitions, references, and code completion.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | Yes | `definition`, `references`, or `completion` |
| `uri` | string | Yes | Source URI of the object |
| `line` | number | No | Line number (1-based) |
| `column` | number | No | Column number (1-based) |
| `source` | string | No | Current source code |

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

**Note:** Blocked when `--block-free-sql` is active.

---

## SAPTransport

Manage CTS transport requests.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | Yes | `list`, `get`, `create`, or `release` |
| `id` | string | No | Transport request ID (for get/release) |
| `description` | string | No | Description (for create) |
| `user` | string | No | Filter by user (for list) |

**Note:** Only available when `--enable-transports` or not in `--read-only` mode.

---

## SAPContext

Get compressed dependency context for an ABAP object. Returns only the public API contracts (method signatures, interface definitions, type declarations) of all objects that the target depends on — NOT the full source code. Typical compression: 7-30x fewer tokens.

**What gets extracted per dependency:**
- **Classes:** `CLASS DEFINITION` with `PUBLIC SECTION` only. `PROTECTED`, `PRIVATE` sections and `CLASS IMPLEMENTATION` are stripped.
- **Interfaces:** Full interface definition (interfaces are already public contracts).
- **Function modules:** `FUNCTION` signature block only (`IMPORTING`/`EXPORTING` parameters). Function body is stripped.

**Filtering:** SAP standard objects (`CL_ABAP_*`, `IF_ABAP_*`, `CX_SY_*`) are excluded by default. Custom objects (`Z*`, `Y*`) are prioritized in the output.

**Dependency detection:** Uses `@abaplint/core` AST parsing to find `TYPE REF TO`, `NEW`, `CAST`, `INHERITING FROM`, `INTERFACES`, `CALL FUNCTION`, `RAISING`, `CATCH`, and static method calls (`=>`).

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `type` | string | Yes | Object type: `CLAS`, `INTF`, `PROG`, `FUNC` |
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

---

## SAPLint

Check ABAP code quality. Runs abaplint rules locally and/or ATC checks on the SAP system.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | Yes | `lint`, `atc`, or `syntax` |
| `source` | string | No | ABAP source code (for `lint`) |
| `name` | string | No | Object name (for `atc`/`syntax`) |
| `type` | string | No | Object type (for `atc`/`syntax`) |

**Examples:**
```
SAPLint(action="lint", source="DATA lv_test TYPE string.\nlv_test = 'hello'.")
```

---

## SAPDiagnose

System diagnostics: runtime errors (short dumps), ABAP profiler traces, SQL traces.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | Yes | `dumps`, `dump_detail`, `traces`, `trace_detail`, `sql_traces`, `call_graph`, `object_structure` |
| `name` | string | No | Object or dump ID |
| `user` | string | No | Filter by user |
| `maxResults` | number | No | Maximum results |

---

## SAPManage

Probe and report SAP system capabilities. Use this before attempting operations that depend on optional features (abapGit, RAP/CDS, AMDP, HANA, UI5/Fiori, CTS transports).

**Actions:**
- `features` — Get cached feature status from last probe (fast, no SAP round-trip).
- `probe` — Re-probe the SAP system now (makes 6 parallel HEAD requests, ~1-2s).

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | Yes | `features` or `probe` |

**Probed features:** `hana`, `abapGit`, `rap`, `amdp`, `ui5`, `transport`. Each returns `available` (bool), `mode` (auto/on/off), `message`, and `probedAt` timestamp.

**Examples:**
```
SAPManage(action="probe")     → discover system capabilities
SAPManage(action="features")  → get cached results
```

**Note:** Blocked when `--read-only` is active.
