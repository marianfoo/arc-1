# Prettify ABAP Code

Format and beautify ABAP source code for consistent style and readability.

This skill replicates SAP Joule's `/prettify` command using LLM-based formatting validated by abaplint rules.

## Input

The user provides an ABAP object to format. Ask the user for:

- **Object name** (required) -- e.g., `ZCL_SALESORDER_HANDLER`
- **Method name** (optional) -- to format a specific method only
- **Style** (optional) -- `standard` (default SAP conventions), `modern` (clean ABAP style)

## Step 1: Read the Source Code

```
SAPRead(type="<TYPE>", name="<name>")
```

Or for a specific method:
```
SAPRead(type="CLAS", name="<name>", method="<method_name>")
```

## Step 2: Analyze Current Formatting Issues

Run lint to detect formatting issues:

```
SAPLint(source="<source_code>")
```

Look for formatting-related findings:
- Indentation inconsistencies
- Keyword casing (uppercase vs lowercase)
- Line length violations
- Spacing issues
- Empty line usage

## Step 3: Apply Formatting Rules

### Standard SAP Conventions

| Rule | Convention |
|---|---|
| **Keyword casing** | UPPERCASE for ABAP keywords (`DATA`, `METHOD`, `IF`, `LOOP`, etc.) |
| **Variable casing** | lowercase or snake_case for identifiers |
| **Indentation** | 2 spaces per level |
| **Line length** | Max 120 characters (break long lines with alignment) |
| **Empty lines** | One empty line between methods, one before ENDCLASS/ENDMETHOD |
| **Chained declarations** | Prefer individual `DATA` statements over `DATA: a, b, c.` chains |
| **Alignment** | Align `TYPE`, `VALUE`, parameter assignments in columns |

### Modern / Clean ABAP Style

Additional conventions for modern ABAP:

| Rule | Convention |
|---|---|
| **Functional calls** | `obj->method( param = value )` not `CALL METHOD` |
| **Inline declarations** | `DATA(lv_var) = ...` where appropriate |
| **Constructor expressions** | `VALUE #()`, `NEW #()`, `CONV #()` |
| **String templates** | `` \|text { variable } text\| `` not `CONCATENATE` |
| **Boolean expressions** | `xsdbool( condition )` not `IF cond. lv_bool = abap_true. ENDIF.` |
| **Table expressions** | `lt_tab[ key = val ]` not `READ TABLE` |

### Formatting Rules Applied

1. **Normalize keyword casing**: All ABAP keywords to UPPERCASE
2. **Fix indentation**: Consistent 2-space indentation, aligned with control structure depth
3. **Break long lines**: Split lines > 120 chars at logical break points
4. **Align parameters**: Align method call parameters and DATA declarations
5. **Normalize spacing**: Single space around operators, after commas, before/after parentheses
6. **Clean up empty lines**: Remove excessive blank lines, ensure consistent separation
7. **Order sections**: PUBLIC SECTION first, then PROTECTED, then PRIVATE

### Line Breaking Rules

For method calls:
```abap
" Before (too long):
lo_result = lo_handler->process_order( iv_order_id = lv_order iv_customer = lv_customer iv_amount = lv_amount iv_currency = lv_currency ).

" After (properly broken):
lo_result = lo_handler->process_order(
  iv_order_id  = lv_order
  iv_customer  = lv_customer
  iv_amount    = lv_amount
  iv_currency  = lv_currency ).
```

For SQL:
```abap
" Before:
SELECT order_id, customer_id, amount, currency FROM ztab_orders WHERE status = 'A' AND amount > 0 ORDER BY order_id INTO TABLE @DATA(lt_orders).

" After:
SELECT order_id, customer_id, amount, currency
  FROM ztab_orders
  WHERE status = 'A'
    AND amount > 0
  ORDER BY order_id
  INTO TABLE @DATA(lt_orders).
```

For VALUE constructors:
```abap
" Before:
lt_items = VALUE #( ( id = '001' name = 'Item 1' amount = '100.00' ) ( id = '002' name = 'Item 2' amount = '200.00' ) ).

" After:
lt_items = VALUE #(
  ( id = '001' name = 'Item 1' amount = '100.00' )
  ( id = '002' name = 'Item 2' amount = '200.00' ) ).
```

## Step 4: Validate Formatting

After applying formatting, validate that the code is still correct:

### 4a. Lint the formatted code

```
SAPLint(source="<formatted_source>")
```

Verify that formatting didn't introduce new issues and resolved the existing formatting findings.

### 4b. Show diff

Present the changes to the user as a before/after comparison, highlighting:
- Number of lines changed
- Types of formatting applied
- Any structural changes (e.g., unchained declarations)

## Step 5: Preview and Confirm

Show the formatted code and ask:

**"Here's the formatted code. Should I update it on the SAP system? (yes / edit first / cancel)"**

## Step 6: Apply and Verify

### 6a. Update the source

For a specific method:
```
SAPWrite(action="edit_method", type="CLAS", name="<name>", method="<method>", source="<formatted_method>")
```

For the full object:
```
SAPWrite(action="update", type="<TYPE>", name="<name>", source="<formatted_source>", transport="<transport>")
```

### 6b. Syntax check

```
SAPDiagnose(action="syntax", type="<TYPE>", name="<name>")
```

### 6c. Activate

```
SAPActivate(type="<TYPE>", name="<name>")
```

### 6d. Run unit tests (regression check)

```
SAPDiagnose(action="unittest", type="<TYPE>", name="<name>")
```

Formatting should never change behavior -- all tests must pass.

## Notes

### ADT Pretty Printer vs This Skill

SAP ADT has a built-in Pretty Printer accessible via the Eclipse IDE. The ADT Pretty Printer REST API (`/sap/bc/adt/abapsource/prettyprinter`) is **not yet implemented** in ARC-1. This skill uses LLM-based formatting as an alternative.

**Differences:**
- ADT Pretty Printer: Server-side, deterministic, respects system-wide settings
- This skill: LLM-based, more flexible (can apply modern conventions), but non-deterministic

**Future**: When the Pretty Printer ADT API is added to ARC-1, this skill can optionally use it as a first pass, then apply additional modern conventions on top.

### When This Skill Goes Beyond J4D

- **Modern syntax conversion**: Can convert legacy ABAP syntax to modern functional style (not just formatting)
- **Selective formatting**: Can format a single method without touching the rest
- **Lint validation**: Verifies formatting with abaplint rules before applying
- **Regression protection**: Runs unit tests after formatting to catch any issues

### BTP vs On-Premise

- **BTP**: Modern ABAP style is preferred. Legacy syntax may trigger ATC findings.
- **On-Premise**: Both classic and modern styles are valid. Follow the team's existing conventions.

### Limitations

- LLM-based formatting is not 100% deterministic -- running twice may produce slightly different results
- Very large classes (> 2000 lines) should be formatted method by method
- Comment formatting is preserved as-is (not reformatted)
- The SAP ADT Pretty Printer API is not yet available in ARC-1 for server-side formatting
