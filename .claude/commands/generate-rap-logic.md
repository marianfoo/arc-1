# Generate RAP Business Logic

Generate RAP determination and validation implementations for an existing behavior definition. Reads the RAP stack, identifies empty method stubs in the behavior pool, and generates ABAP Cloud implementation code.

This skill replicates SAP Joule's "RAP Logic Prediction" capability by combining ARC-1 (SAP system access) with mcp-sap-docs (documentation & best practices).

## Input

The user provides a behavior definition name (e.g., `ZI_TRAVEL`). Ask the user for:

- **Behavior definition name** (required) — the interface BDEF name (e.g., `ZI_TRAVEL`)
- **Specific determination/validation** (optional — if omitted, list all and let user choose)
- **Behavior description** (optional) — natural language description of desired logic (e.g., "calculate total price from line items", "validate status transitions")

If the user provides just a BDEF name, proceed to read the stack and present available methods.

## Step 1: Read the RAP Stack

Read the behavior definition, CDS view, and behavior pool to understand the complete RAP context.

### 1a. Read the behavior definition

```
SAPRead(type="BDEF", name="<bdef_name>")
```

Parse the BDEF source to identify:
- **Scenario**: managed / unmanaged / abstract
- **Determinations**: `determination <Name> on (modify|save) { ... }`
- **Validations**: `validation <Name> on save { ... }`
- **Actions**: `action <Name> ...`
- **Draft status**: `with draft` present or not
- **Entity aliases**: `alias <Alias>`
- **Persistent table**: `persistent table <table_name>`
- **Behavior pool class**: `implementation in class <class_name> unique`

### 1b. Read the interface CDS view

```
SAPRead(type="DDLS", name="<interface_view>")
```

Understand the data model: field names, types, aliases, associations. This is needed to generate correct `READ ENTITIES` and `MODIFY ENTITIES` statements.

### 1c. Get dependency context

```
SAPContext(type="DDLS", name="<interface_view>")
```

Understand underlying tables, associations, and related entities. Useful for cross-entity validations or determinations that read associated data.

### 1d. Read the behavior pool class

Find the behavior pool class name from the BDEF source (`implementation in class <name>`), then:

```
SAPRead(type="CLAS", name="<bp_class>", method="*")
```

List all methods with their signatures. Identify which methods are empty stubs (body is just comments, `RETURN`, or blank).

## Step 2: Identify Target Methods

Parse the BDEF for determination and validation declarations. Present a summary table:

```
Methods in behavior pool ZBP_I_TRAVEL:

| # | Type          | Name                  | Trigger            | Fields          | Status      |
|---|---------------|-----------------------|--------------------|-----------------|-------------|
| 1 | Determination | calculateTotalPrice   | on modify          | Price, Quantity | empty       |
| 2 | Determination | setDefaultStatus      | on modify          | %create         | empty       |
| 3 | Validation    | validateStatus        | on save            | Status          | implemented |
| 4 | Validation    | validateDates         | on save            | BeginDate       | empty       |
| 5 | Validation    | validateCustomer      | on save            | CustomerID      | empty       |
```

Ask the user: **"Which methods should I implement? (all empty / specific numbers / skip any?)"**

If the user provided a natural language description, map it to the appropriate method(s).

## Step 3: Research RAP Patterns

Use mcp-sap-docs to fetch current RAP implementation patterns:

```
search("RAP validation implementation ABAP example")
```

```
search("RAP determination on save trigger")
```

For specific logic patterns:
```
search("RAP calculate total price determination")
```

```
search("RAP status validation transition")
```

Use documentation to inform correct ABAP Cloud patterns:
- `READ ENTITIES OF <entity> IN LOCAL MODE` for reading entity data
- `MODIFY ENTITIES OF <entity> IN LOCAL MODE` for updating entity data
- Proper `FAILED` / `REPORTED` structure handling
- Correct method signatures for determinations vs validations

## Step 4: Generate Method Implementation

For each selected method, generate ABAP Cloud implementation code.

### Determination Template

```abap
METHOD <determination_name>.
  " Read relevant fields of all affected entities
  READ ENTITIES OF <interface_view> IN LOCAL MODE
    ENTITY <alias>
      FIELDS ( <trigger_fields> )
      WITH CORRESPONDING #( keys )
    RESULT DATA(lt_entities).

  " Calculate derived values
  LOOP AT lt_entities ASSIGNING FIELD-SYMBOL(<entity>).
    " --- Business logic here ---
    " Example: <entity>-TotalPrice = <entity>-Price * <entity>-Quantity.
  ENDLOOP.

  " Write back modified fields
  MODIFY ENTITIES OF <interface_view> IN LOCAL MODE
    ENTITY <alias>
      UPDATE FIELDS ( <modified_fields> )
      WITH VALUE #( FOR entity IN lt_entities
        ( %tky = entity-%tky
          <field> = entity-<field> ) )
    REPORTED DATA(lt_update_reported).

  reported = CORRESPONDING #( DEEP lt_update_reported ).
ENDMETHOD.
```

### Validation Template

```abap
METHOD <validation_name>.
  " Read relevant fields of all affected entities
  READ ENTITIES OF <interface_view> IN LOCAL MODE
    ENTITY <alias>
      FIELDS ( <validated_fields> )
      WITH CORRESPONDING #( keys )
    RESULT DATA(lt_entities).

  LOOP AT lt_entities ASSIGNING FIELD-SYMBOL(<entity>).
    " --- Validation logic here ---
    " Example: check field is not initial
    IF <entity>-<Field> IS INITIAL.
      APPEND VALUE #( %tky = <entity>-%tky ) TO failed-<alias>.
      APPEND VALUE #(
        %tky     = <entity>-%tky
        %msg     = new_message_with_text(
                     severity = if_abap_behv_message=>severity-error
                     text     = '<Error message>' )
        %element-<Field> = if_abap_behv=>mk-on
      ) TO reported-<alias>.
    ENDIF.
  ENDLOOP.
ENDMETHOD.
```

### Output to User

Show the generated code for each method and ask:

**"Here's the generated implementation. Should I write it to the SAP system? (yes / edit first / cancel)"**

If the user wants edits, incorporate them before proceeding.

## Step 5: Write and Validate

Write each method implementation using method-level surgery:

```
SAPWrite(action="edit_method", type="CLAS", name="<bp_class>", method="<method_name>", source="<generated_code>", transport="<transport>")
```

**Note:** The `transport` parameter is recommended but not always required for edit_method. ARC-1 auto-propagates the lock-provided `corrNr` when no explicit transport is supplied.

After writing all methods, run a syntax check:

```
SAPDiagnose(action="syntax", type="CLAS", name="<bp_class>")
```

If syntax errors occur:
1. Read the error message carefully
2. Common issues: wrong entity name in `READ ENTITIES`, incorrect field alias, missing `IN LOCAL MODE`
3. Fix the method and re-write
4. Re-check syntax

## Step 6: Activate and Verify

Activate the behavior pool and behavior definition together:

```
SAPActivate(objects=[{type:"BDEF", name:"<bdef>"}, {type:"CLAS", name:"<bp_class>"}])
```

Optionally, if a test class exists, run the unit tests:

```
SAPDiagnose(action="unittest", type="CLAS", name="<bp_class>")
```

Present a summary:

```
RAP Logic Generation Complete!

Implemented methods:
  [x] Determination: calculateTotalPrice — calculates total from price * quantity
  [x] Determination: setDefaultStatus — sets status to 'N' (New) on create
  [x] Validation: validateDates — ensures begin_date < end_date
  [x] Validation: validateCustomer — checks customer_id is not empty
  [ ] Validation: validateStatus — already implemented, skipped

Next steps:
  - Test the logic via the Fiori Elements preview
  - Add unit tests (use generate-abap-unit-test skill)
  - Add more validations/determinations to the BDEF as needed
```

## Common RAP Logic Patterns

### Field Calculation Determination

Calculate a derived field from other fields (e.g., total price = price * quantity):

```abap
METHOD calculateTotalPrice.
  READ ENTITIES OF zi_order IN LOCAL MODE
    ENTITY Order
      FIELDS ( Price Quantity )
      WITH CORRESPONDING #( keys )
    RESULT DATA(lt_orders).

  LOOP AT lt_orders ASSIGNING FIELD-SYMBOL(<order>).
    <order>-TotalPrice = <order>-Price * <order>-Quantity.
  ENDLOOP.

  MODIFY ENTITIES OF zi_order IN LOCAL MODE
    ENTITY Order
      UPDATE FIELDS ( TotalPrice )
      WITH VALUE #( FOR order IN lt_orders
        ( %tky = order-%tky
          TotalPrice = order-TotalPrice ) )
    REPORTED DATA(lt_reported).

  reported = CORRESPONDING #( DEEP lt_reported ).
ENDMETHOD.
```

### Default Value Determination

Set default values when an entity is created:

```abap
METHOD setDefaultStatus.
  READ ENTITIES OF zi_travel IN LOCAL MODE
    ENTITY Travel
      FIELDS ( Status )
      WITH CORRESPONDING #( keys )
    RESULT DATA(lt_travels).

  MODIFY ENTITIES OF zi_travel IN LOCAL MODE
    ENTITY Travel
      UPDATE FIELDS ( Status )
      WITH VALUE #( FOR travel IN lt_travels
                    WHERE ( Status IS INITIAL )
        ( %tky = travel-%tky
          Status = 'N' ) )
    REPORTED DATA(lt_reported).

  reported = CORRESPONDING #( DEEP lt_reported ).
ENDMETHOD.
```

### Mandatory Field Validation

Check that a required field is not empty:

```abap
METHOD validateCustomer.
  READ ENTITIES OF zi_travel IN LOCAL MODE
    ENTITY Travel
      FIELDS ( CustomerID )
      WITH CORRESPONDING #( keys )
    RESULT DATA(lt_travels).

  LOOP AT lt_travels ASSIGNING FIELD-SYMBOL(<travel>).
    IF <travel>-CustomerID IS INITIAL.
      APPEND VALUE #( %tky = <travel>-%tky ) TO failed-travel.
      APPEND VALUE #(
        %tky     = <travel>-%tky
        %msg     = new_message_with_text(
                     severity = if_abap_behv_message=>severity-error
                     text     = 'Customer must be specified' )
        %element-CustomerID = if_abap_behv=>mk-on
      ) TO reported-travel.
    ENDIF.
  ENDLOOP.
ENDMETHOD.
```

### Cross-Field Validation

Validate that related fields are consistent (e.g., begin date before end date):

```abap
METHOD validateDates.
  READ ENTITIES OF zi_travel IN LOCAL MODE
    ENTITY Travel
      FIELDS ( BeginDate EndDate )
      WITH CORRESPONDING #( keys )
    RESULT DATA(lt_travels).

  LOOP AT lt_travels ASSIGNING FIELD-SYMBOL(<travel>).
    IF <travel>-BeginDate IS NOT INITIAL
   AND <travel>-EndDate IS NOT INITIAL
   AND <travel>-BeginDate > <travel>-EndDate.
      APPEND VALUE #( %tky = <travel>-%tky ) TO failed-travel.
      APPEND VALUE #(
        %tky     = <travel>-%tky
        %msg     = new_message_with_text(
                     severity = if_abap_behv_message=>severity-error
                     text     = 'Begin date must be before end date' )
        %element-BeginDate = if_abap_behv=>mk-on
        %element-EndDate   = if_abap_behv=>mk-on
      ) TO reported-travel.
    ENDIF.
  ENDLOOP.
ENDMETHOD.
```

### Status Transition Validation

Validate that status changes follow allowed transitions:

```abap
METHOD validateStatus.
  READ ENTITIES OF zi_travel IN LOCAL MODE
    ENTITY Travel
      FIELDS ( Status )
      WITH CORRESPONDING #( keys )
    RESULT DATA(lt_travels).

  LOOP AT lt_travels ASSIGNING FIELD-SYMBOL(<travel>).
    CASE <travel>-Status.
      WHEN 'N' OR 'O' OR 'A' OR 'X'.
        " Valid statuses: New, Open, Accepted, Cancelled
      WHEN OTHERS.
        APPEND VALUE #( %tky = <travel>-%tky ) TO failed-travel.
        APPEND VALUE #(
          %tky     = <travel>-%tky
          %msg     = new_message_with_text(
                       severity = if_abap_behv_message=>severity-error
                       text     = |Invalid status: { <travel>-Status }| )
          %element-Status = if_abap_behv=>mk-on
        ) TO reported-travel.
    ENDCASE.
  ENDLOOP.
ENDMETHOD.
```

### Number Range Determination

Assign sequential numbers for non-UUID key scenarios:

```abap
METHOD setTravelID.
  READ ENTITIES OF zi_travel IN LOCAL MODE
    ENTITY Travel
      FIELDS ( TravelID )
      WITH CORRESPONDING #( keys )
    RESULT DATA(lt_travels).

  " Get next number from number range or max+1
  SELECT MAX( travel_id ) FROM ztravel_d INTO @DATA(lv_max_id).
  DATA(lv_next_id) = lv_max_id + 1.

  LOOP AT lt_travels ASSIGNING FIELD-SYMBOL(<travel>)
    WHERE TravelID IS INITIAL.
    <travel>-TravelID = lv_next_id.
    lv_next_id += 1.
  ENDLOOP.

  MODIFY ENTITIES OF zi_travel IN LOCAL MODE
    ENTITY Travel
      UPDATE FIELDS ( TravelID )
      WITH VALUE #( FOR travel IN lt_travels
                    WHERE ( TravelID IS NOT INITIAL )
        ( %tky = travel-%tky
          TravelID = travel-TravelID ) )
    REPORTED DATA(lt_reported).

  reported = CORRESPONDING #( DEEP lt_reported ).
ENDMETHOD.
```

## Error Handling

### Common Issues and Fixes

| Error | Cause | Fix |
|---|---|---|
| Method not found in behavior pool | Class name in BDEF doesn't match actual class | Check `implementation in class` in BDEF source, verify class exists |
| Syntax error: `<entity>` unknown in `READ ENTITIES` | Wrong entity name or alias | Use the exact alias from the BDEF `define behavior for ... alias <Alias>` |
| Syntax error: field `<Field>` unknown | Field alias doesn't match CDS view | Check CDS view field aliases — BDEF uses CDS aliases, not table field names |
| Activation fails | BDEF and class are incompatible | Activate BDEF and class together: `SAPActivate(objects=[...])` |
| `FAILED` / `REPORTED` structure mismatch | Wrong alias used in `failed-<alias>` or `reported-<alias>` | Use the lowercase entity alias from BDEF (e.g., `failed-travel`, not `failed-Travel`) |
| `IN LOCAL MODE` missing | Missing clause causes authorization check | Always use `IN LOCAL MODE` for internal reads/writes within the behavior pool |
| `%tky` not available | Method signature doesn't provide transactional key | Check method signature — determinations use `keys`, validations use `keys` |
| Runtime error on `MODIFY ENTITIES` | Trying to modify read-only fields | Don't modify fields marked `field ( readonly )` in BDEF |

## Notes

### BTP vs On-Prem Differences

- **BTP**: ABAP Cloud syntax strictly enforced. Only `READ ENTITIES` / `MODIFY ENTITIES` — no `SELECT` from database tables directly. All APIs must be released. `strict ( 2 )` in BDEF.
- **On-Prem**: More flexible — classic ABAP can be used in the behavior pool (e.g., `SELECT` directly), but `READ ENTITIES` / `MODIFY ENTITIES` is strongly recommended for consistency and future compatibility.

### What This Skill Does NOT Do

- **Custom actions**: Only determinations and validations. For custom actions (e.g., `action approve`), implement manually following a similar pattern.
- **Side effects**: No `side effects` implementation (UI refresh triggers). Add manually if needed.
- **Feature control**: No dynamic feature control (`instance_features`). Add manually.
- **Authorization**: No `authorization master` implementation. Add authorization checks manually.
- **Cross-BO logic**: No inter-business-object operations. Each determination/validation operates within its own BO.

### When to Use This Skill

- After creating a RAP service (use generate-rap-service first)
- When the BDEF has determination/validation declarations but empty method stubs
- When adding new business logic to an existing RAP service
- When the user describes desired behavior in natural language (e.g., "validate that the end date is after the begin date")
- NOT for creating the RAP service from scratch (use generate-rap-service)
- NOT for CDS unit tests (use generate-cds-unit-test or generate-abap-unit-test)
