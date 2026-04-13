# MCP Usage Guide for AI Agents

**Target Audience:** AI assistants (Claude, GPT, etc.) using this MCP server for ABAP development.

**Purpose:** Machine-friendly reference for optimal tool usage patterns, workflows, and best practices.

---

## Critical Limitations (Read First!)

### SQL Query Limitations (SAPQuery)

The SAP ADT Data Preview API uses **ABAP SQL syntax**, NOT standard SQL:

| Feature | Status | Syntax |
|---------|--------|--------|
| `ORDER BY col` | **Works** | `ORDER BY field_name` |
| `ORDER BY col ASCENDING` | **Works** | ABAP keyword |
| `ORDER BY col DESCENDING` | **Works** | ABAP keyword |
| `ORDER BY col ASC` | **FAILS** | SQL standard - not supported |
| `ORDER BY col DESC` | **FAILS** | SQL standard - not supported |
| `LIMIT n` | **FAILS** | Use `maxRows` parameter instead |
| `GROUP BY` | **Works** | `GROUP BY field_name` |
| `COUNT(*)` | **Works** | Aggregate functions work |
| `WHERE` | **Works** | Standard conditions |

**Correct Example:**
```sql
SELECT carrid, COUNT(*) as cnt FROM sflight GROUP BY carrid ORDER BY cnt DESCENDING
```

**Wrong Example (will fail):**
```sql
SELECT carrid, COUNT(*) as cnt FROM sflight GROUP BY carrid ORDER BY cnt DESC
```

### Object Type Coverage (SAPRead)

| Object Type | Read | Notes |
|-------------|:----:|-------|
| PROG (Program) | **Y** | Full support |
| CLAS (Class) | **Y** | Includes: definitions, implementations, testclasses |
| INTF (Interface) | **Y** | Full support |
| FUNC (Function Module) | **Y** | Requires `group` (function group) |
| FUGR (Function Group) | **Y** | Returns JSON metadata |
| INCL (Include) | **Y** | Read-only |
| DDLS (CDS DDL Source) | **Y** | CDS view definitions |
| BDEF (Behavior Definition) | **Y** | RAP behavior definitions |
| SRVD (Service Definition) | **Y** | RAP service definitions |
| TABL (Table Definition) | **Y** | Table structure |
| VIEW (DDIC View) | **Y** | Dictionary views |
| TABLE_CONTENTS | **Y** | Table data with SQL filtering |
| DEVC (Package) | **Y** | Package contents |
| SYSTEM | **Y** | System info (SID, release) |
| COMPONENTS | **Y** | Installed software components |
| MESSAGES | **Y** | Message class texts |
| TEXT_ELEMENTS | **Y** | Program text elements |
| VARIANTS | **Y** | Program variants |

---

## Tool Selection Decision Tree

```mermaid
flowchart TD
    START[Need to work with ABAP?]

    START --> READ{Read or Write?}

    READ -->|Read| RTYPE{What type?}
    RTYPE -->|Source code| SR[SAPRead type,name]
    RTYPE -->|Table data| TD{Need SQL?}
    TD -->|Simple| SR2[SAPRead type=TABLE_CONTENTS]
    TD -->|Complex| SQ[SAPQuery]
    RTYPE -->|Find objects| SS[SAPSearch]
    RTYPE -->|System info| SR3[SAPRead type=SYSTEM]

    READ -->|Write| WTYPE{Local or transportable package?}
    WTYPE -->|Local $TMP| SW[SAPWrite]
    WTYPE -->|Transportable| ST[SAPTransport check → SAPWrite with transport]
    READ -->|Activate| SA[SAPActivate]
    READ -->|Navigate| SN[SAPNavigate]
    READ -->|Diagnose| SD[SAPDiagnose]
```

---

## Quick Reference

### Reading Objects

| Task | Tool | Parameters |
|------|------|------------|
| Read program | `SAPRead` | `type=PROG, name=ZTEST` |
| Read class | `SAPRead` | `type=CLAS, name=ZCL_TEST` |
| Read class definitions | `SAPRead` | `type=CLAS, name=ZCL_TEST, include=definitions` |
| Read class tests | `SAPRead` | `type=CLAS, name=ZCL_TEST, include=testclasses` |
| Read interface | `SAPRead` | `type=INTF, name=ZIF_TEST` |
| Read function module | `SAPRead` | `type=FUNC, name=Z_FM, group=ZFUGR` |
| Read function group | `SAPRead` | `type=FUGR, name=ZFUGR` |
| Read CDS view | `SAPRead` | `type=DDLS, name=ZDDL_VIEW` |
| Read message class | `SAPRead` | `type=MESSAGES, name=ZMSG` |
| Read table structure | `SAPRead` | `type=TABL, name=MARA` |
| Read table data | `SAPRead` | `type=TABLE_CONTENTS, name=MARA, maxRows=10` |
| System info | `SAPRead` | `type=SYSTEM` |
| Installed components | `SAPRead` | `type=COMPONENTS` |

### Searching

| Task | Tool | Parameters |
|------|------|------------|
| Find objects by name | `SAPSearch` | `query=ZCL_ORDER*` |
| Find with wildcard | `SAPSearch` | `query=Z*TEST*, maxResults=20` |

### Writing

| Task | Tool | Parameters |
|------|------|------------|
| Create new object (local) | `SAPWrite` | `action=create, type=PROG, name=ZTEST, source=...` |
| Create in transport package | `SAPWrite` | `action=create, type=PROG, name=ZTEST, source=..., package=ZDEV, transport=A4HK900123` |
| Check transport requirement | `SAPTransport` | `action=check, type=CLAS, name=ZCL_TEST, package=ZDEV` |
| Update existing | `SAPWrite` | `action=update, type=CLAS, name=ZCL_TEST, source=...` |
| Delete object | `SAPWrite` | `action=delete, type=PROG, name=ZTEST` |
| Activate | `SAPActivate` | `name=ZCL_TEST, type=CLAS` |

### Querying

| Task | Tool | Parameters |
|------|------|------------|
| Simple query | `SAPQuery` | `sql="SELECT * FROM t000"` |
| Filtered query | `SAPQuery` | `sql="SELECT * FROM sflight WHERE carrid = 'LH'"` |
| Aggregation | `SAPQuery` | `sql="SELECT carrid, COUNT(*) as cnt FROM sflight GROUP BY carrid ORDER BY cnt DESCENDING"` |

---

## Common Workflows

### 1. Read and Understand a Class

```
Step 1: SAPRead(type="CLAS", name="ZCL_ORDER")
        → Returns full class source

Step 2: SAPRead(type="CLAS", name="ZCL_ORDER", include="testclasses")
        → Returns unit test source

Step 3: SAPContext(name="ZCL_ORDER", type="CLAS")
        → Returns compressed dependency context (7-30x smaller)
```

### 2. Read CDS View and Dependencies

```
Step 1: SAPRead(type="DDLS", name="ZRAY_00_I_DOC_NODE_00")
        → Returns CDS source code

Step 2: SAPRead(type="TABL", name="ZLLM_00_NODE")
        → Returns table structure
```

### 3. Understand Error Messages

```
Step 1: SAPRead(type="MESSAGES", name="ZRAY_00")
        → Returns JSON with all messages
```

### 4. Create Objects in Transportable Packages

When creating objects in non-`$TMP` packages, a transport number is required. ARC-1 detects this automatically and returns guidance, but the optimal workflow is:

```
Step 1: SAPTransport(action="check", type="CLAS", name="ZCL_ORDER", package="ZDEV")
        → Returns whether a transport is needed, existing transports, any locked transport

Step 2: (if transport needed) SAPTransport(action="list")
        → Returns modifiable transports for the current user
        OR
        SAPTransport(action="create", description="Create ZCL_ORDER class")
        → Creates a new transport and returns the transport ID

Step 3: SAPWrite(action="create", type="CLAS", name="ZCL_ORDER", source="...", package="ZDEV", transport="A4HK900123")
        → Creates the object in the transportable package with the transport number
```

**Shortcut:** If you skip the check step, ARC-1's pre-flight check will detect the missing transport and return an actionable error with existing transports listed — you can then pick one and retry.

**Batch creation:** The same flow applies to `batch_create`. Provide the `transport` parameter at the top level — all objects in the batch use the same transport.

```
SAPWrite(action="batch_create", package="ZDEV", transport="A4HK900123", objects=[
  {type:"DDLS", name:"ZI_TRAVEL", source:"..."},
  {type:"BDEF", name:"ZI_TRAVEL", source:"..."},
  {type:"CLAS", name:"ZBP_I_TRAVEL", source:"..."}
])
```

### 5. Investigate Runtime Errors

```
Step 1: SAPDiagnose(action="dumps", user="DEVELOPER")
        → Returns list of short dumps

Step 2: SAPDiagnose(action="dump_detail", name="<dump_id>")
        → Returns full dump with stack trace
```

### 6. RAP Stack Creation (CDS + BDEF + SRVD)

Create a RAP (RESTful ABAP Programming) business object stack. Order matters — dependencies first.

**Version consideration:** `define table entity` syntax requires ABAP Cloud (BTP) or SAP_BASIS >= 757. On older on-premise systems (7.50-7.56), use DDIC transparent tables + CDS view entities instead.

```
Step 1: Check system capabilities
        SAPRead(type="SYSTEM")
        → Check SAP_BASIS release for syntax support

Step 2: Create database tables (on-prem < 757) OR use define table entity (BTP / >= 757)
        SAPWrite(action="create", type="DDLS", name="ZI_TRAVEL",
          source="define root view entity ZI_Travel as select from ztravel { ... }")

Step 3: Create behavior definition
        SAPWrite(action="create", type="BDEF", name="ZI_TRAVEL",
          source="managed implementation in class ZBP_I_TRAVEL unique;\ndefine behavior for ZI_TRAVEL\n{ ... }")

Step 4: Create service definition
        SAPWrite(action="create", type="SRVD", name="ZSD_TRAVEL",
          source="define service ZSD_Travel { expose ZI_Travel; }")

Step 5: Create behavior implementation class
        SAPWrite(action="create", type="CLAS", name="ZBP_I_TRAVEL",
          source="CLASS zbp_i_travel DEFINITION PUBLIC ABSTRACT FINAL...")

Step 6: Activate all objects
        SAPActivate(objects=[{type:"DDLS",name:"ZI_TRAVEL"},{type:"BDEF",name:"ZI_TRAVEL"},{type:"SRVD",name:"ZSD_TRAVEL"},{type:"CLAS",name:"ZBP_I_TRAVEL"}])
```

**Or use batch creation for simpler workflow:**
```
SAPWrite(action="batch_create", package="$TMP", objects=[
  {type:"DDLS", name:"ZI_TRAVEL", source:"define root view entity..."},
  {type:"BDEF", name:"ZI_TRAVEL", source:"managed implementation..."},
  {type:"SRVD", name:"ZSD_TRAVEL", source:"define service..."},
  {type:"CLAS", name:"ZBP_I_TRAVEL", source:"CLASS zbp_i_travel..."}
])
```

---

## Error Handling

### SAPQuery Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `"DESC" is not allowed` | Used SQL `DESC` | Use `DESCENDING` instead |
| `"ASC" is not allowed` | Used SQL `ASC` | Use `ASCENDING` instead |
| `LIMIT not recognized` | Used SQL `LIMIT` | Use `maxRows` parameter |

### SAPWrite Errors

| Error | Cause | Solution |
|-------|-------|----------|
| Package requires transport | Non-`$TMP` package, no transport provided | Use `SAPTransport(action="list")` or `SAPTransport(action="create")` to get a transport ID, then pass it via `transport` parameter |
| Package not in allowed list | Package not in `--allowed-packages` | Admin must add the package to the allow list |
| "define table entity" rejected | Syntax requires SAP_BASIS >= 757 | Use DDIC tables + CDS view entities on older systems |
| CDS reserved keyword | Field name like `position`, `value`, `type` | Rename field (e.g., `playing_position`, `field_value`) |

### SAPRead Errors

| Error | Cause | Solution |
|-------|-------|----------|
| 404 Not Found | Object doesn't exist | Check name with SAPSearch first |
| Missing `group` | FUNC without function group | Provide `group` parameter |
| Empty DDLS source | DDLS exists but has no source | Write source via SAPWrite |

### Server Errors (5xx)

| Error | Cause | Solution |
|-------|-------|----------|
| 500 Internal Server Error | SAP application error | Wait 10-30 seconds and retry. Check `SAPDiagnose(action="dumps")` for short dumps |
| 502 Bad Gateway | Proxy/gateway issue | Check SAP system availability via `SAPRead(type="SYSTEM")` |
| 503 Service Unavailable | Server overloaded or restarting | Wait and retry. Common after heavy write/delete cycles |

---

## Performance Tips

### Token Optimization

| Operation | Tokens | Better Alternative |
|-----------|--------|-------------------|
| SAPRead full class (500 lines) | ~2,500 | SAPContext (compressed) ~500 |
| SAPRead then SAPRead deps | ~5,000 | SAPContext with depth=2 ~800 |

### Search Strategy

1. **Start with SAPSearch:** Find objects by name pattern
2. **Use SAPRead selectively:** Read only the objects you need
3. **Use SAPContext for deps:** One call = source + dependency context
4. **Limit SAPQuery results:** Use `maxRows` to prevent overwhelming responses

---

## Summary: When to Use What

```mermaid
flowchart TD
    Q1{What do you need?}

    Q1 -->|Read source| SAPRead
    Q1 -->|Find objects| SAPSearch
    Q1 -->|Make changes| SAPWrite
    Q1 -->|Activate| SAPActivate
    Q1 -->|Query data| SAPQuery
    Q1 -->|Code quality| SAPLint
    Q1 -->|Go to def| SAPNavigate
    Q1 -->|Debug/dumps| SAPDiagnose
    Q1 -->|Transports| SAPTransport
    Q1 -->|Dependency context| SAPContext
    Q1 -->|System features| SAPManage
```

---

**Maintained by:** ARC-1 project
