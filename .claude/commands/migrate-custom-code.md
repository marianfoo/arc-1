# Migrate Custom Code

ATC-driven S/4HANA custom code migration assistant with automated fix proposals.

This skill replicates SAP Joule's "Custom Code Migration" capability by combining ARC-1 (SAP system access) with mcp-sap-docs (documentation & best practices). It runs ATC readiness checks, groups and explains findings, and generates replacement code following modern ABAP patterns.

## Input

The user provides an object or package to check for S/4HANA migration readiness. Ask the user for:
- **Object name** (required, e.g., `ZCL_SALES_HANDLER`, `Z_REPORT_POSTING`, `ZSALES_PKG`)
- **Object type** (required — PROG, CLAS, FUNC, FUGR, or DEVC for package-level checks)
- **Target release variant** (optional — e.g., `S4HANA_2023`, `S4HANA_READINESS`; default: system default ATC variant)
- **Scope** (optional — `explain` for findings explanation only, `fix` for explanation + fix proposals; default: `fix`)

If the user provides just an object name, auto-detect the type via SAPSearch and proceed with the default variant and fix scope.

## Step 1: Run ATC Readiness Check

### 1a. Run ATC on the target object

```
SAPDiagnose(action="atc", type="<type>", name="<object_name>", variant="<variant>")
```

If no variant was specified, run with the system default first:

```
SAPDiagnose(action="atc", type="<type>", name="<object_name>")
```

Then suggest a readiness variant if available (e.g., `S4HANA_READINESS`, `ABAP_CLOUD_READINESS`).

### 1b. For package-level checks — find all objects first

```
SAPRead(type="DEVC", name="<package_name>")
```

This returns all objects in the package. Then run ATC on each object individually. For large packages, prioritize PROG, CLAS, FUGR, FUNC types first as they typically contain the most migration-relevant findings.

## Step 2: Group and Prioritize Findings

Organize findings into a structured summary. Deduplicate findings with the same checkTitle across multiple locations.

### Summary Table

Present findings grouped by priority and category:

```
Migration Readiness Report for <object_name>
=============================================

Total findings: <N>
  Priority 1 (Errors):   <n>
  Priority 2 (Warnings): <n>
  Priority 3 (Info):     <n>

| # | Priority | Check | Category | Count | Affected Objects |
|---|----------|-------|----------|-------|------------------|
| 1 | 1 | Use of obsolete statement MOVE | Syntax Change | 3 | Z_REPORT_POSTING |
| 2 | 1 | Call to released API CL_GUI_ALV_GRID | Deprecated API | 1 | Z_REPORT_POSTING |
| 3 | 2 | SELECT...ENDSELECT pattern | Performance | 5 | Z_REPORT_POSTING |
| ...
```

### Categories

Group findings into these categories:
- **Deprecated API**: Calls to functions, classes, or methods that are deprecated or not released in S/4HANA
- **Syntax Change**: Obsolete ABAP statements that must be replaced
- **Semantic Change**: Behavior differences in S/4HANA (e.g., changed table structures, removed fields)
- **Performance**: Patterns that need optimization for S/4HANA
- **Simplification**: Items from the S/4HANA simplification list

Ask the user: **"Which findings should I explain and fix? (all / specific numbers / errors only)"**

## Step 3: Explain Findings

For each selected finding, provide a detailed explanation.

### 3a. Read the affected source code

```
SAPRead(type="<type>", name="<object_name>")
```

Show the code context around each finding (the line with the issue and a few lines before/after).

### 3b. Search documentation for migration guidance

```
search("<checkTitle> S/4HANA migration")
search("<deprecated_api> replacement ABAP")
```

For specific simplification items:

```
search("<simplification_item_id> simplification list")
```

### 3c. Search SAP Notes (if SAP Notes MCP is available)

```
sap_notes_search(q="<checkTitle>")
sap_notes_search(q="<deprecated_api> replacement")
```

### 3d. Present explanation for each finding

For each finding, present:
- **What**: The finding description and where it occurs (file, line)
- **Why**: Why this is a problem for S/4HANA (compatibility, removal, behavior change)
- **Replacement**: The recommended modern ABAP pattern or API to use instead
- **Impact**: Risk level of the change (low = syntax swap, medium = logic change, high = redesign needed)

## Step 4: Generate Fix Proposals

For each fixable finding, generate replacement code based on documentation and modern ABAP patterns.

### Fix Options

Present 3 options per finding (matching SAP Joule pattern):
1. **Apply** — Auto-write the fix via ARC-1
2. **Show** — Display the before/after diff without applying
3. **Skip** — Move to the next finding

Group related fixes that can be applied together (e.g., multiple deprecated statements in the same method).

### Common Migration Patterns

Use these replacement patterns when generating fixes:

| Old Pattern | New Pattern | Notes |
|---|---|---|
| `CALL FUNCTION '<fm>'` | Class method call | Find replacement class in documentation |
| `SELECT...ENDSELECT` | `SELECT INTO TABLE` + loop | Avoid row-by-row processing |
| `MOVE-CORRESPONDING src TO dst` | `dst = CORRESPONDING #( src )` | New ABAP syntax |
| `READ TABLE itab WITH KEY k = v` | `line_exists( itab[ k = v ] )` or `VALUE #( itab[ k = v ] OPTIONAL )` | Use table expressions |
| `FORM/PERFORM` | Method call | Extract to class method |
| `DESCRIBE TABLE itab LINES lv_cnt` | `lv_cnt = lines( itab )` | Built-in function |
| `CALL METHOD obj->method` | `obj->method( )` | Functional call syntax |
| `CREATE OBJECT obj TYPE cls` | `obj = NEW cls( )` | NEW operator |
| `TRANSLATE str TO UPPER CASE` | `str = to_upper( str )` | Built-in function |
| Classic DB view | CDS view entity | Redesign required |
| `WRITE:` / ALV list | Fiori / RAP service | Major redesign |

## Step 5: Apply Selected Fixes

### 5a. Apply fixes

For method-level fixes in classes:

```
SAPWrite(action="edit_method", type="CLAS", name="<class>", method="<method>", source="<fixed_source>", transport="<transport>")
```

For full-source updates (programs, functions):

```
SAPWrite(action="update", type="<type>", name="<object_name>", source="<fixed_source>", transport="<transport>")
```

**Note on transport parameter:** For update and edit_method actions, the `transport` parameter is recommended but not always required. ARC-1 automatically propagates the lock-provided correction number (`corrNr`) when no explicit transport is supplied. If the object is in a transportable package and the system assigns a `corrNr` during lock, the update will succeed without a manual transport. Provide an explicit `transport` when you need to target a specific transport request. For **create** actions, transport may still be required depending on the package — `$TMP` objects never need a transport, but transportable packages typically do.

### 5b. Validate after each batch of fixes

```
SAPDiagnose(action="syntax", type="<type>", name="<object_name>")
```

If syntax errors are introduced: revert by writing back the original source and report the issue.

### 5c. Activate

```
SAPActivate(type="<type>", name="<object_name>")
```

## Step 6: Re-validate

Run ATC again to confirm findings are resolved:

```
SAPDiagnose(action="atc", type="<type>", name="<object_name>", variant="<variant>")
```

### Report results

Present a final summary:

```
Migration Fix Summary for <object_name>
========================================

Findings fixed:             <n>
Findings remaining:         <n>
Findings needing manual fix: <n>

Fixed:
  - [FIXED] Use of obsolete statement MOVE (3 occurrences)
  - [FIXED] SELECT...ENDSELECT replaced with SELECT INTO TABLE

Remaining:
  - [MANUAL] CL_GUI_ALV_GRID replacement requires UI redesign
  - [SKIPPED] User skipped FORM/PERFORM migration

Next steps:
  - Address remaining manual findings
  - Run full regression tests
  - Consider running ATC on dependent objects
```

## Error Handling

### Common Issues and Fixes

| Error | Cause | Fix |
|---|---|---|
| ATC variant not found | Variant doesn't exist on this system | Run default ATC, list available variants with `SAPDiagnose(action="atc")` |
| Object locked by another user | Object is being edited elsewhere | Inform user, suggest trying later or contacting the lock holder |
| Fix causes new syntax error | Generated replacement code is incorrect | Revert to original source, show the diff, suggest manual correction |
| No mcp-sap-docs available | Documentation MCP not configured | Explain findings using ATC finding text only, recommend user check SAP Help Portal |
| Package has too many objects | Large package with 100+ objects | Suggest breaking into smaller batches by sub-package or object type |
| ATC returns no findings | Object is already S/4HANA ready | Inform user — no findings is good news, suggest checking with a stricter variant |
| Transport required but not provided | Object is in a transportable package and lock did not return a correction number | ARC-1 auto-propagates lock `corrNr` for updates/deletes; if that fails, ask user for transport request number |

## Notes

### BTP vs On-Premise Differences

- **BTP**: Limited ATC variants — primarily cloud readiness checks. BTP objects already use ABAP Cloud syntax, so migration focus is different: deprecated released APIs, not classic ABAP constructs. Fewer findings expected since ABAP Cloud enforces modern patterns.
- **On-Premise**: Full range of S/4HANA readiness variants available (2020, 2021, 2022, 2023+). Classic ABAP objects may have many findings. FORM/PERFORM, function modules, classic reports, and DB views are common migration targets. Custom Code Migration Worklist (SCMA) may provide additional context.

### What This Skill Does NOT Do

- **Limited transport management**: ARC-1 auto-propagates lock-provided `corrNr` for updates/deletes, but users are responsible for creating and releasing transport requests
- **No mass migration**: Handles one object or one package at a time — not a full system migration tool
- **No custom ATC variant creation**: Uses existing ATC variants on the system
- **No table structure migration**: Cannot modify DDIC table structures (e.g., field length changes for S/4HANA)
- **No test execution**: Does not run regression tests after fixes — user should validate manually or use generate-abap-unit-test skill

### When to Use This Skill

- When preparing custom code for S/4HANA migration
- When checking if code meets ABAP Cloud readiness standards
- When investigating ATC findings and needing explanation + fix proposals
- When modernizing legacy ABAP code patterns (FORM, obsolete statements)
- NOT for greenfield development — use generate-rap-service for new objects
