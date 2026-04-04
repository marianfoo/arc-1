# Document ABAP Code

Generate ABAP Doc comments (`"!` style) for classes, interfaces, methods, and function modules.

This skill replicates SAP Joule's `/document` command by combining ARC-1 (live SAP system access) with mcp-sap-docs (ABAP Doc conventions reference).

## Input

The user provides an ABAP object to document. Ask the user for:

- **Object name** (required) -- e.g., `ZCL_SALESORDER_HANDLER`
- **Method name** (optional) -- to document a specific method only
- **Scope** (optional) -- `public` (default), `all` (includes protected/private)

## Step 1: Read the Source Code

### 1a. Read the class or interface

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

Understanding dependencies helps generate more meaningful documentation (e.g., "delegates order validation to ZIF_ORDER_VALIDATOR").

### 1c. Read existing ABAP Doc (if any)

Check the source code for existing `"!` comments. Don't overwrite good existing documentation -- only fill gaps or improve poor documentation.

## Step 2: Look Up ABAP Doc Conventions

Use mcp-sap-docs for the latest ABAP Doc syntax:

```
search("ABAP Doc comment syntax parameter return")
```

### ABAP Doc Quick Reference

```abap
"! <p class="shorttext synchronized">Short description</p>
"! Detailed description (optional, can span multiple lines).
"!
"! @parameter iv_name | <p class="shorttext synchronized">Parameter description</p>
"! @parameter rv_result | <p class="shorttext synchronized">Return value description</p>
"! @raising cx_some_exception | <p class="shorttext synchronized">When this exception is raised</p>
```

Key rules:
- `"!` prefix for all ABAP Doc lines
- `<p class="shorttext synchronized">` for translatable short texts (shown in ADT tooltips)
- `@parameter` for each IMPORTING, EXPORTING, CHANGING, RETURNING parameter
- `@raising` for each exception in the RAISING clause
- Place ABAP Doc directly before the method/class declaration

## Step 3: Generate Documentation

### For Classes

Generate class-level documentation:

```abap
"! <p class="shorttext synchronized">Sales Order Handler</p>
"! Handles creation, validation, and processing of sales orders.
"! Implements {@link ZIF_ORDER_HANDLER} for use in the order processing framework.
CLASS zcl_salesorder_handler DEFINITION ...
```

### For Methods

Generate method-level documentation for each public method:

```abap
"! <p class="shorttext synchronized">Calculate order total</p>
"! Calculates the total amount for all line items including tax and discounts.
"!
"! @parameter it_items | <p class="shorttext synchronized">Line items to calculate</p>
"! @parameter iv_currency | <p class="shorttext synchronized">Currency code (ISO 4217)</p>
"! @parameter rv_total | <p class="shorttext synchronized">Calculated total amount</p>
"! @raising zcx_invalid_currency | <p class="shorttext synchronized">If currency is not supported</p>
METHODS calculate_total
  IMPORTING it_items    TYPE ztt_order_items
            iv_currency TYPE waers
  RETURNING VALUE(rv_total) TYPE netwr
  RAISING   zcx_invalid_currency.
```

### For Interfaces

Document all methods in the interface:

```abap
"! <p class="shorttext synchronized">Order Handler Interface</p>
"! Contract for order handling implementations used in the order processing framework.
INTERFACE zif_order_handler PUBLIC.
  "! <p class="shorttext synchronized">Process a single order</p>
  "! @parameter iv_order_id | <p class="shorttext synchronized">Order ID to process</p>
  "! @parameter rv_success | <p class="shorttext synchronized">True if processing succeeded</p>
  METHODS process_order ...
ENDINTERFACE.
```

### For Function Modules

```abap
"! <p class="shorttext synchronized">Get customer details</p>
"! Retrieves customer master data by customer number.
"!
"! @parameter IV_KUNNR | <p class="shorttext synchronized">Customer number</p>
"! @parameter ES_CUSTOMER | <p class="shorttext synchronized">Customer master data</p>
"! @raising ZCX_CUSTOMER_NOT_FOUND | <p class="shorttext synchronized">If customer does not exist</p>
```

### Documentation Guidelines

1. **Short text**: Concise (under 60 chars), describes WHAT the method does
2. **Long text** (optional): Describes HOW, WHY, or important details
3. **Parameters**: Describe the purpose, not just the type (bad: "The amount", good: "Net amount after discounts")
4. **Exceptions**: Describe WHEN the exception is raised, not what it is
5. **Cross-references**: Use `{@link ZCL_OTHER}` to link related objects
6. **Don't state the obvious**: Skip documentation for self-explanatory methods like `get_id()` returning `rv_id`

## Step 4: Preview and Confirm

Show the user the documented source code (or a diff of what changed) and ask:

**"Here's the code with ABAP Doc comments. Should I update it on the SAP system? (yes / edit first / cancel)"**

## Step 5: Apply the Documentation

### 5a. Update the source

For the full class:
```
SAPWrite(action="update", type="CLAS", name="<name>", source="<documented_source>", transport="<transport>")
```

For a specific method (preserves the rest of the class):
```
SAPWrite(action="edit_method", type="CLAS", name="<name>", method="<method>", source="<documented_method>")
```

### 5b. Activate

```
SAPActivate(type="CLAS", name="<name>")
```

### 5c. Verify

```
SAPDiagnose(action="syntax", type="CLAS", name="<name>")
```

ABAP Doc comments should never cause syntax errors, but verify anyway.

## Notes

### When This Skill Goes Beyond J4D

- **Dependency-aware**: Uses SAPContext to understand what the class interacts with, generating richer descriptions
- **Preserves existing docs**: Doesn't blindly overwrite -- checks for existing ABAP Doc first
- **Method surgery**: Can document a single method without touching the rest of the class
- **Cross-references**: Generates `{@link}` references to related objects

### BTP vs On-Premise

- **BTP**: ABAP Doc is the primary documentation mechanism. Short text synchronized tags are particularly important for Fiori Elements UI generation.
- **On-Premise**: ABAP Doc coexists with classic SE80 documentation. Short texts sync to DDIC descriptions.

### Limitations

- ABAP Doc is limited to `"!` comments before declarations -- cannot document inline logic
- Short text synchronized tags have a ~60 character limit
- Generated documentation quality depends on code clarity -- cryptic variable names lead to less useful docs
