# Generate CDS Unit Test

Generate an ABAP Unit test class for a CDS entity using the CDS Test Double Framework.

This skill replicates SAP Joule's "CDS Unit Test Generation" capability by combining ARC-1 (SAP system access) with mcp-sap-docs (documentation & best practices).

## Input

The user provides a CDS entity name (e.g., `ZI_SALESORDER`, `ZC_TRAVEL`). Ask the user for:
- **CDS entity name** (required)
- **Test class name** (optional — default: `ZCL_TEST_<entity_name>`)
- **Package** (optional — default: `$TMP`)
- **Transport request** (optional — only if package is transportable)

If the user provides just an entity name, use defaults and proceed.

## Step 1: Gather CDS Entity Context

Read the CDS entity and its dependencies to understand the full picture.

### 1a. Read the CDS DDL source

```
SAPRead(type="DDLS", name="<entity_name>")
```

### 1b. Read metadata extensions (if they exist)

```
SAPRead(type="DDLX", name="<entity_name>")
```

This may fail if no DDLX exists — that's fine, skip it.

### 1c. Read the behavior definition (if it exists)

```
SAPRead(type="BDEF", name="<entity_name>")
```

This may fail if no BDEF exists — that's fine, skip it.

### 1d. Read underlying table/view structures

Parse the CDS DDL source to identify all data sources in FROM clauses, JOINs, and associations. For each underlying table or CDS view, read its structure:

- For DDIC tables: `SAPRead(type="TABL", name="<table_name>")`
- For other CDS views: `SAPRead(type="DDLS", name="<view_name>")`

This gives you the field catalog needed to create correctly-typed test data.

### 1e. (On-premise only) Query field catalog for precise types

If on an on-premise system, query DD03L for exact field types:

```
SAPQuery(sql="SELECT FIELDNAME, DATATYPE, LENG, DECIMALS, KEYFLAG FROM DD03L WHERE TABNAME = '<table>' ORDER BY POSITION", maxRows=100)
```

## Step 2: Analyze CDS Semantics and Propose Test Cases

Analyze the CDS DDL source you read in Step 1 and identify all testable semantics. Group them by category:

### Semantic Categories to Look For

| Category | What to Look For in DDL | Example Test Case |
|---|---|---|
| **Calculations** | Arithmetic expressions (`field1 * field2`, `field1 - field2`) | Insert known values, verify calculated result |
| **CASE expressions** | `case when ... then ... else ... end` | One test per branch |
| **Type casts** | `cast(field as abap.dec(15,2))`, `cast(field as abap.char(10))` | Insert value, verify cast output |
| **WHERE filters** | `where status = 'A'` or `where amount > 0` | Insert matching + non-matching rows, verify only matching appear |
| **HAVING clauses** | `having sum(amount) > 1000` | Insert data that triggers and doesn't trigger the filter |
| **JOINs** | `inner join`, `left outer join`, `association` | Insert matching keys in both tables; test with non-matching keys for outer joins |
| **Aggregations** | `sum()`, `count()`, `avg()`, `min()`, `max()` with `group by` | Insert multiple rows, verify aggregated result |
| **Null handling** | `coalesce(field, 'default')`, null-safe expressions | Insert row with null field, verify default |
| **Parameters** | `with parameters p_param : type` | Call view with parameter, verify filtering |
| **Currency/Unit conversion** | `currency_conversion()`, `unit_conversion()` | Insert conversion data, verify result |
| **String operations** | `concat()`, `substring()`, `length()` | Insert string values, verify output |
| **Associations** | `association [0..*] to ...` | Insert data in both sides, verify navigation |

### Output to User

Present the identified test cases as a numbered list:

```
Identified test cases for ZI_SALESORDER:

1. [CALCULATION] test_net_amount_calculation — Verify net_amount = gross_amount - discount
2. [CASE] test_status_text_open — Verify status 'O' maps to 'Open'
3. [CASE] test_status_text_closed — Verify status 'C' maps to 'Closed'
4. [JOIN] test_customer_join — Verify customer data is correctly joined
5. [WHERE] test_active_orders_filter — Verify only active orders are returned
6. [NULL] test_description_coalesce — Verify null description gets default value
```

Ask the user: **"Which test cases should I generate? (all / specific numbers / skip any?)"**

If the user says "all" or doesn't respond with preferences, generate all.

## Step 3: Fetch CDS Test Double Framework Reference

Use mcp-sap-docs to get the latest CDS Test Double Framework patterns. This ensures generated code follows SAP best practices.

```
search("CDS test double framework cl_cds_test_environment")
```

Also fetch:
```
search("ABAP Unit cl_abap_unit_assert")
```

Use the returned documentation to inform the generated code patterns. Key things to verify:
- Correct `cl_cds_test_environment=>create()` signature
- Correct `get_double()` / `insert()` pattern
- Correct assertion method names

## Step 4: Generate the Test Class

Generate a complete ABAP test class following this structure:

### Template

```abap
"! @testing <CDS_ENTITY_NAME>
CLASS <test_class_name> DEFINITION
  PUBLIC FINAL
  FOR TESTING
  DURATION SHORT
  RISK LEVEL HARMLESS.

  PUBLIC SECTION.
  PROTECTED SECTION.
  PRIVATE SECTION.
    CLASS-DATA environment TYPE REF TO if_cds_test_environment.

    CLASS-METHODS class_setup    RAISING cx_static_check.
    CLASS-METHODS class_teardown.
    METHODS setup.

    "! <description of test case 1>
    METHODS <test_method_1> FOR TESTING RAISING cx_static_check.
    "! <description of test case 2>
    METHODS <test_method_2> FOR TESTING RAISING cx_static_check.
    " ... one method per selected test case
ENDCLASS.

CLASS <test_class_name> IMPLEMENTATION.

  METHOD class_setup.
    environment = cl_cds_test_environment=>create( i_for_entity = '<CDS_ENTITY_NAME>' ).
  ENDMETHOD.

  METHOD class_teardown.
    environment->destroy( ).
  ENDMETHOD.

  METHOD setup.
    environment->clear_doubles( ).
  ENDMETHOD.

  METHOD <test_method_1>.
    " Arrange — prepare test data for underlying tables
    DATA lt_<table> TYPE STANDARD TABLE OF <underlying_table> WITH EMPTY KEY.
    lt_<table> = VALUE #(
      ( <field1> = '<value1>' <field2> = '<value2>' ... )
    ).
    environment->get_double( '<UNDERLYING_TABLE>' )->insert( lt_<table> ).

    " Act — SELECT from the CDS entity under test
    SELECT * FROM <cds_entity> INTO TABLE @DATA(lt_result).

    " Assert — verify expected behavior
    cl_abap_unit_assert=>assert_equals(
      act = lines( lt_result )
      exp = <expected_count>
      msg = |Expected { <expected_count> } rows| ).

    cl_abap_unit_assert=>assert_equals(
      act = lt_result[ 1 ]-<field>
      exp = '<expected_value>'
      msg = '<assertion message>' ).
  ENDMETHOD.

  " ... more test methods

ENDCLASS.
```

### Test Data Generation Rules

Follow these principles when generating test data:

1. **Minimal rows**: Use the fewest rows needed to exercise the semantic. Typically 1-3 rows per test.
2. **Obvious values**: Choose values where the expected result is trivially verifiable:
   - For `gross - discount = net`: use 100.00 - 10.00 = 90.00, not 37.83 - 4.27
   - For CASE branches: use exactly the values from the CASE expression
   - For WHERE filters: one row that passes, one that doesn't
3. **Type-correct**: Match ABAP types exactly:
   - Use `'001'` for NUMC fields (string with leading zeros)
   - Use `'100.00'` for DEC/CURR fields
   - Use `'20260101'` for DATS fields
   - Use `'EUR'` for CUKY fields
4. **Key fields populated**: Always fill key fields even if not directly tested
5. **Deterministic**: Never use random or date-dependent values
6. **Isolated**: Each test method should be self-contained (clear_doubles in setup ensures this)

### Naming Conventions

- Test class: `ZCL_TEST_<ENTITY>` or `ZCL_<ENTITY>_TEST`
- Test methods: `test_<semantic>_<detail>` (e.g., `test_status_case_open`, `test_net_amount_calc`)
- Use snake_case for method names (ABAP convention for test methods)
- Keep method names under 30 characters

## Step 5: Preview and Confirm

Show the user the complete generated test class source code and ask:

**"Here's the generated test class. Should I create it on the SAP system? (yes / edit first / cancel)"**

If the user wants edits, incorporate them before proceeding.

## Step 6: Create, Activate, and Test

### 6a. Create the test class

```
SAPWrite(action="create", type="CLAS", name="<test_class_name>", source="<generated_source>", package="<package>", transport="<transport>")
```

### 6b. Update the source (if create only scaffolds)

```
SAPWrite(action="update", type="CLAS", name="<test_class_name>", source="<generated_source>", transport="<transport>")
```

### 6c. Activate the test class

```
SAPActivate(type="CLAS", name="<test_class_name>")
```

Check activation messages. If there are errors, fix them and re-activate.

### 6d. Run the unit tests

```
SAPDiagnose(action="unittest", type="CLAS", name="<test_class_name>")
```

### 6e. Report results

Show the user:
- Number of tests passed / failed / skipped
- For any failures: the assertion message and which test method failed
- Suggested fixes for any failures

If tests fail:
1. Analyze the failure message
2. Determine if it's a test data issue, assertion issue, or CDS logic issue
3. Fix the test method using `SAPWrite(action="edit_method", ...)`
4. Re-activate and re-run

## Error Handling

### Common Issues and Fixes

| Error | Cause | Fix |
|---|---|---|
| `CX_CDS_TEST_ENVIRONMENT` during class_setup | Entity name wrong or not active | Verify entity name, check activation status |
| Type mismatch in VALUE constructor | Wrong field type in test data | Check DD03L or table structure for correct types |
| `GET_DOUBLE` fails for a data source | Data source name doesn't match | Check CDS DDL for exact data source names (case-sensitive!) |
| Assertion fails with unexpected values | Test data or expected result wrong | Re-check CDS logic, adjust test data or assertion |
| Activation error: "test relation not found" | `@testing` annotation points to wrong entity | Fix entity name in `"! @testing` comment |
| Class exists already | Test class already created | Use `SAPWrite(action="update", ...)` instead |

## Notes

### BTP vs On-Premise Differences

- **BTP**: Only Z*/Y* classes can be created. Standard SAP tables cannot be queried via DD03L. Use released CDS entities for type reference.
- **On-Premise**: Full access to DD03L, DD02L for field catalogs. Can query TADIR for object existence checks.

### What This Skill Does NOT Do

- **Performance testing**: CDS Test Doubles are for logic testing, not performance
- **Authorization testing**: DCL/CDS access control testing requires separate patterns
- **Integration testing**: This generates isolated unit tests, not end-to-end flows
- **RAP behavior testing**: For validations/actions/determinations, use the RAP BO Test Double Framework instead

### When to Use This Skill

- When a CDS entity has non-trivial logic (calculations, CASE, filters, joins)
- When the user wants basic test coverage as a starting point
- When refactoring CDS logic and wanting regression tests
- NOT for trivial projections that just rename fields
