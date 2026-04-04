# Refactor ABAP Code

Refactor ABAP code to improve structure, readability, and maintainability while preserving behavior.

This skill replicates SAP Joule's `/refactor` command by combining ARC-1 (live SAP system access) with mcp-sap-docs (ABAP best practices) and quality checks for validation.

## Input

The user provides an ABAP object to refactor. Ask the user for:

- **Object name** (required) -- e.g., `ZCL_SALESORDER_HANDLER`
- **Method name** (optional) -- to refactor a specific method
- **Refactoring goal** (optional) -- e.g., "extract method", "simplify nested IFs", "improve naming", "modernize syntax"
- **Scope** (optional) -- `method` (single method), `class` (whole class), `auto` (analyze and suggest)

If no specific goal is provided, analyze the code and suggest refactorings.

## Step 1: Read and Analyze the Code

### 1a. Read the source

```
SAPRead(type="CLAS", name="<name>")
```

Or for a specific method:
```
SAPRead(type="CLAS", name="<name>", method="*")
SAPRead(type="CLAS", name="<name>", method="<method_name>")
```

### 1b. Get dependency context

```
SAPContext(type="CLAS", name="<name>")
```

Essential for safe refactoring -- understand what other objects depend on this one.

### 1c. Check who uses this object

```
SAPNavigate(action="references", type="CLAS", name="<name>")
```

If other objects reference this class, refactoring must preserve the public API.

### 1d. Run quality checks (baseline)

```
SAPDiagnose(action="syntax", type="CLAS", name="<name>")
SAPDiagnose(action="atc", type="CLAS", name="<name>")
SAPLint(source="<source>")
```

Capture the baseline quality state -- refactoring should not introduce new issues.

### 1e. Run unit tests (baseline)

```
SAPDiagnose(action="unittest", type="CLAS", name="<name>")
```

Capture the baseline test state -- refactoring must not break existing tests.

## Step 2: Identify Refactoring Opportunities

If the user didn't specify a goal, analyze the code for common refactoring opportunities:

### Code Smells to Detect

| Smell | Indicator | Suggested Refactoring |
|---|---|---|
| **Long method** | Method > 50 statements | Extract method |
| **Deep nesting** | IF/LOOP nested > 3 levels | Early return, guard clauses |
| **Duplicate code** | Similar logic in multiple methods | Extract shared method |
| **God class** | Class with > 20 public methods | Split into focused classes |
| **Feature envy** | Method uses another class's data more than its own | Move method |
| **Primitive obsession** | Raw types instead of domain types | Introduce value objects |
| **Legacy syntax** | `CALL METHOD`, `MOVE`, `IF ... IS INITIAL` | Modernize to functional style |
| **Missing interface** | Concrete class used as dependency | Extract interface |
| **Dead code** | Unreachable statements, unused variables | Remove |
| **Magic numbers** | Hard-coded values without explanation | Extract constants |

### Present Findings

```
Refactoring analysis for ZCL_SALESORDER_HANDLER:

1. [EXTRACT METHOD] process_order (85 lines) — Extract validation logic (lines 20-45) into validate_order
2. [SIMPLIFY] calculate_total — 4 levels of nested IF, can flatten with guard clauses  
3. [MODERNIZE] get_customer — Uses CALL METHOD syntax, can convert to functional calls
4. [DEAD CODE] handle_legacy — Method is never called (0 references found)
5. [NAMING] iv_a, iv_b, lv_x — Cryptic variable names in calculate_discount
```

Ask: **"Which refactorings should I apply? (all / specific numbers / skip)"**

## Step 3: Look Up Best Practices

Use mcp-sap-docs for modern ABAP patterns:

```
search("ABAP clean code guidelines method extraction")
search("modern ABAP syntax functional style")
```

For BTP/S/4HANA Cloud:
```
search("ABAP Cloud clean code best practices")
```

## Step 4: Apply Refactorings

### Extract Method

1. Identify the code block to extract
2. Determine parameters (variables used from outer scope)
3. Create new private method with the extracted code
4. Replace original code with method call

Use method surgery for surgical precision:
```
SAPWrite(action="edit_method", type="CLAS", name="<name>", method="<original_method>", source="<refactored_source>")
```

For adding a new method, update the full class:
```
SAPWrite(action="update", type="CLAS", name="<name>", source="<full_source_with_new_method>")
```

### Simplify Nested Logic

Transform:
```abap
IF iv_order IS NOT INITIAL.
  IF iv_customer IS NOT INITIAL.
    IF iv_amount > 0.
      " actual logic
    ENDIF.
  ENDIF.
ENDIF.
```

Into:
```abap
IF iv_order IS INITIAL.
  RETURN.
ENDIF.
IF iv_customer IS INITIAL.
  RETURN.
ENDIF.
IF iv_amount <= 0.
  RETURN.
ENDIF.
" actual logic
```

### Modernize Syntax

| Legacy | Modern |
|---|---|
| `CALL METHOD obj->method EXPORTING a = b.` | `obj->method( a = b ).` |
| `MOVE a TO b.` | `b = a.` |
| `CREATE OBJECT lo_obj TYPE zcl_class.` | `lo_obj = NEW zcl_class( ).` |
| `IF lv_var IS INITIAL. ... ENDIF.` | `IF lv_var IS INITIAL. RETURN. ENDIF.` (guard) |
| `READ TABLE lt_tab WITH KEY f = v INTO ls_line.` | `ls_line = VALUE #( lt_tab[ f = v ] OPTIONAL ).` |
| `LOOP AT lt_tab INTO ls_line. APPEND ls_line-f TO lt_result. ENDLOOP.` | `lt_result = VALUE #( FOR ls IN lt_tab ( ls-f ) ).` |

### Remove Dead Code

Verify with references check first:
```
SAPNavigate(action="references", type="CLAS", name="<name>", method="<possibly_dead_method>")
```

If zero references, remove the method.

## Step 5: Verify Refactoring

### 5a. Syntax check

```
SAPDiagnose(action="syntax", type="CLAS", name="<name>")
```

### 5b. Activate

```
SAPActivate(type="CLAS", name="<name>")
```

### 5c. Run unit tests (regression check)

```
SAPDiagnose(action="unittest", type="CLAS", name="<name>")
```

**Critical**: All tests that passed before must still pass. If any test breaks, revert the specific refactoring that caused it.

### 5d. Re-run quality checks

```
SAPDiagnose(action="atc", type="CLAS", name="<name>")
SAPLint(source="<refactored_source>")
```

Refactoring should maintain or improve the quality baseline -- never introduce new findings.

## Step 6: Report Results

```
Refactoring results for ZCL_SALESORDER_HANDLER:

APPLIED:
- Extracted validate_order (25 lines) from process_order — process_order now 60 lines
- Flattened calculate_total — reduced from 4 nesting levels to 1
- Modernized get_customer — replaced 3 CALL METHOD with functional calls
- Removed dead method handle_legacy

QUALITY:
- Syntax: PASSED
- Unit tests: 8 passed, 0 failed (same as before)
- ATC findings: 5 → 3 (removed 2 unreachable code findings)
- Lint issues: 12 → 7 (fixed method length, nesting depth)

SKIPPED:
- Variable renaming in calculate_discount — would change public API, needs discussion
```

## Notes

### Safety Rules

1. **Never change public method signatures** without explicit user approval -- other objects may depend on them
2. **Always run tests before and after** -- refactoring must preserve behavior
3. **One refactoring at a time** for large changes -- easier to isolate issues
4. **Check references** before removing anything -- ensure nothing else uses it

### When This Skill Goes Beyond J4D

- **Reference-aware**: Checks who uses the object before making changes that could break callers
- **Baseline comparison**: Captures quality and test state before/after to prove no regressions
- **Method surgery**: Can refactor individual methods without full class rewrite
- **Multi-check validation**: Syntax + ATC + lint + unit tests for comprehensive verification

### BTP vs On-Premise

- **BTP**: Refactoring may include migrating from classic to ABAP Cloud syntax. Use `sap_search_objects` to find released API replacements.
- **On-Premise**: Full refactoring flexibility. Classic syntax modernization is recommended but not required.

### Limitations

- **No cross-object refactoring**: Cannot rename a method and update all callers in one operation (ADT refactoring API not available via REST)
- **No automatic extract interface**: Can suggest it but creating a new interface + updating all callers requires user coordination
- **Test coverage**: If the object has no unit tests, refactoring is riskier -- suggest creating tests first (see [Generate ABAP Unit Test](generate-abap-unit-test.md))
