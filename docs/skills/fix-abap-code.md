# Fix ABAP Code

Detect and fix syntax errors, ATC findings, and lint issues in ABAP code through an iterative diagnosis-fix-verify loop.

This skill replicates SAP Joule's `/fix` command by combining ARC-1 (live SAP system access) with mcp-sap-docs (error resolution guidance).

## Input

The user provides an ABAP object with issues. Ask the user for:

- **Object name** (required) -- e.g., `ZCL_SALESORDER_HANDLER`
- **Object type** (optional -- infer from name)
- **Specific issue** (optional) -- e.g., "syntax error on line 42", "ATC finding about SQL injection"
- **Fix scope** (optional) -- `syntax` (default), `atc`, `lint`, `all`

## Step 1: Diagnose Issues

Run all applicable checks in parallel:

### 1a. Syntax check (always)

```
SAPDiagnose(action="syntax", type="<TYPE>", name="<name>")
```

Returns errors/warnings with line numbers and messages.

### 1b. ATC check (if scope includes atc or all)

```
SAPDiagnose(action="atc", type="<TYPE>", name="<name>")
```

Returns findings with priority (1=error, 2=warning, 3=info), check title, and message.

### 1c. Local lint (if scope includes lint or all)

First read the source:
```
SAPRead(type="<TYPE>", name="<name>")
```

Then lint:
```
SAPLint(source="<source_code>")
```

Returns issues with rule name, message, line/column, severity.

### 1d. Check for runtime errors (optional, if user mentions dumps)

```
SAPDiagnose(action="dumps", user="<current_user>")
```

If a relevant dump is found, get details:
```
SAPDiagnose(action="dumps", id="<dump_id>")
```

## Step 2: Analyze and Prioritize Findings

Present all findings to the user, grouped and prioritized:

```
Diagnosis for ZCL_SALESORDER_HANDLER:

SYNTAX ERRORS (must fix):
1. [Line 42] Variable 'LV_AMOUNT' is not defined
2. [Line 87] Method 'GET_CUSTOMER' has wrong number of parameters

ATC FINDINGS (should fix):
3. [P1] SQL injection risk in dynamic WHERE clause (line 120)
4. [P2] Unreachable code after RETURN (line 95)
5. [P3] Missing exception handling for CX_SY_CONVERSION_ERROR (line 55)

LINT ISSUES (nice to fix):
6. [Error] Unreachable code detected (line 95)
7. [Warning] Method length exceeds 100 statements (method PROCESS_ORDER)
```

Ask: **"Which issues should I fix? (all / syntax only / specific numbers / skip)"**

## Step 3: Read Source Code and Context

```
SAPRead(type="<TYPE>", name="<name>")
SAPContext(type="<TYPE>", name="<name>")
```

Understanding the full source and dependencies is essential for correct fixes.

For method-specific issues:
```
SAPRead(type="CLAS", name="<name>", method="<method_with_issue>")
```

## Step 4: Look Up Fix Patterns (When Needed)

For unfamiliar error types or SAP-specific patterns, consult mcp-sap-docs:

```
search("<error message or ATC check title> fix ABAP")
```

Examples:
- `search("SQL injection prevention ABAP dynamic WHERE")` for SQL injection ATC findings
- `search("CX_SY_CONVERSION_ERROR handling ABAP")` for missing exception handling
- `search("ABAP Cloud released API alternative for <deprecated_api>")` for clean core issues

## Step 5: Apply Fixes

### Fix Strategy

1. **Syntax errors first**: These block everything else. Fix in order of appearance (top to bottom).
2. **Type mismatches**: Check the expected types from dependency contracts (SAPContext output).
3. **Missing variables**: Add declarations or fix typos.
4. **Wrong parameters**: Check method signatures from dependency contracts.
5. **ATC findings**: Apply the recommended pattern from documentation.
6. **Lint issues**: Fix formatting, dead code, naming conventions.

### Applying Fixes

For a single method:
```
SAPWrite(action="edit_method", type="CLAS", name="<name>", method="<method>", source="<fixed_method>")
```

For the full object:
```
SAPWrite(action="update", type="<TYPE>", name="<name>", source="<fixed_source>", transport="<transport>")
```

## Step 6: Verify Fixes

### 6a. Re-run syntax check

```
SAPDiagnose(action="syntax", type="<TYPE>", name="<name>")
```

### 6b. Activate

```
SAPActivate(type="<TYPE>", name="<name>")
```

### 6c. Re-run ATC and lint (if those were in scope)

```
SAPDiagnose(action="atc", type="<TYPE>", name="<name>")
SAPLint(source="<fixed_source>")
```

### 6d. Run unit tests (to catch regressions)

```
SAPDiagnose(action="unittest", type="<TYPE>", name="<name>")
```

## Step 7: Iterate if Needed

If new issues appear after fixing (common with cascading errors):

1. Repeat Steps 5-6 with the remaining issues
2. Maximum 3 iterations -- if issues persist, report to user with analysis

## Step 8: Report Results

Show the user:

```
Fix results for ZCL_SALESORDER_HANDLER:

FIXED:
- [Line 42] Added missing variable declaration for LV_AMOUNT (TYPE netwr)
- [Line 87] Fixed GET_CUSTOMER call — added missing IV_BUKRS parameter
- [Line 120] Replaced dynamic WHERE with parameterized query
- [Line 95] Removed unreachable code after RETURN

REMAINING:
- [P3] Missing exception handling on line 55 — needs design decision (catch and log? or propagate?)

VERIFICATION:
- Syntax check: PASSED
- ATC: 0 priority-1, 0 priority-2, 1 priority-3 remaining
- Unit tests: 5 passed, 0 failed
```

## Common Fix Patterns

### Syntax Errors

| Error Pattern | Common Fix |
|---|---|
| Variable not defined | Add DATA declaration or fix typo |
| Wrong number of parameters | Check method signature, add/remove parameters |
| Type mismatch | Add type conversion or fix variable type |
| Method not found | Check interface/class, fix method name |
| Missing ENDMETHOD/ENDIF | Add missing closing statement |

### ATC Findings

| ATC Check | Common Fix |
|---|---|
| SQL injection | Use parameterized queries, avoid dynamic WHERE from user input |
| Unreachable code | Remove dead code after RETURN/RAISE/EXIT |
| Missing exception handling | Add TRY/CATCH or RAISING clause |
| Hard-coded credentials | Move to configuration or Secure Store |
| Unused variables | Remove unused declarations |
| SELECT * | Replace with explicit field list |

### Lint Issues

| Lint Rule | Common Fix |
|---|---|
| Method too long | Extract into smaller methods |
| Deeply nested IF | Use early RETURN/CHECK to flatten |
| Naming convention | Rename variables to match conventions |
| Missing FINAL | Add FINAL to class definition if not inherited |

## Notes

### When This Skill Goes Beyond J4D

- **Triple diagnosis**: Combines syntax + ATC + local lint for comprehensive issue detection
- **Runtime error analysis**: Can investigate short dumps (ST22 equivalent) and trace back to source
- **Documentation-assisted**: Uses mcp-sap-docs to look up fix patterns for unfamiliar errors
- **Regression protection**: Runs unit tests after fixing to catch unintended side effects
- **Method surgery**: Can fix individual methods without touching the rest of the class

### BTP vs On-Premise

- **BTP**: ATC findings may include ABAP Cloud compliance checks (use of unreleased APIs). Use `sap_search_objects` to find released alternatives.
- **On-Premise**: Full ATC check variant catalog available. Can check custom variants.

### Limitations

- Cannot fix architectural issues (wrong design pattern, missing abstraction)
- ATC fix proposals are not available via ADT API -- fixes are LLM-inferred from error messages
- Some ATC findings may be false positives -- present these to the user for judgment
