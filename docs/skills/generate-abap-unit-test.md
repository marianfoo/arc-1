# Generate ABAP Unit Test

Generate ABAP Unit test classes for classes, interfaces, and methods.

This skill replicates SAP Joule's `/test` command for general ABAP objects (not CDS -- see [Generate CDS Unit Test](generate-cds-unit-test.md) for CDS entities).

## Input

The user provides an ABAP object to test. Ask the user for:

- **Object name** (required) -- e.g., `ZCL_SALESORDER_HANDLER`
- **Method name** (optional) -- to generate tests for a specific method only
- **Test class name** (optional -- default: `ZCL_TEST_<object_name>`)
- **Package** (optional -- default: `$TMP`)
- **Transport request** (optional -- only if package is transportable)

## Step 1: Read the Source Code and Dependencies

### 1a. Read the class source

Full class:
```
SAPRead(type="CLAS", name="<name>")
```

Or list methods first, then read a specific one:
```
SAPRead(type="CLAS", name="<name>", method="*")
SAPRead(type="CLAS", name="<name>", method="<method_name>")
```

### 1b. Read local types (test classes, helper classes)

```
SAPRead(type="CLAS", name="<name>", include="testclasses")
```

Check if tests already exist -- don't duplicate.

### 1c. Get dependency context

```
SAPContext(type="CLAS", name="<name>")
```

This returns public API contracts for all dependencies. Essential for understanding:
- What interfaces the class implements (need to test all interface methods)
- What dependencies need to be mocked
- What types are used in method signatures

### 1d. Read interfaces (if the class implements any)

From the SAPContext output, identify implemented interfaces and read them if needed for full method signatures.

## Step 2: Analyze and Propose Test Cases

Analyze the source code and identify testable behavior:

### What to Test

| Category | What to Look For | Test Strategy |
|---|---|---|
| **Public methods** | All public method signatures | At least one test per public method |
| **Business logic** | IF/CASE branches, calculations | One test per significant branch |
| **Validations** | RAISE EXCEPTION, CHECK, ASSERT | Test valid + invalid inputs |
| **Error handling** | TRY/CATCH blocks, CX_* exceptions | Test that exceptions are raised correctly |
| **Interface methods** | Methods from implemented interfaces | Test interface contract fulfillment |
| **Factory methods** | CREATE OBJECT, NEW | Test correct instantiation |
| **Data transformations** | LOOP, MODIFY, mapping logic | Test input → output mapping |

### What NOT to Test

- Private methods (test them through public methods)
- Simple getters/setters with no logic
- SAP standard framework methods (AUTHORITY-CHECK, etc.)
- Constructor with no logic

### Output to User

Present the proposed test cases:

```
Proposed test cases for ZCL_SALESORDER_HANDLER:

1. [METHOD] test_create_order_success — Happy path for create_order
2. [METHOD] test_create_order_invalid_customer — Expect CX_INVALID_CUSTOMER
3. [BRANCH] test_calculate_discount_vip — VIP customer gets 10% discount
4. [BRANCH] test_calculate_discount_standard — Standard customer gets no discount
5. [ERROR] test_update_order_not_found — Expect CX_ORDER_NOT_FOUND
6. [INTERFACE] test_if_order_handler_validate — Interface method validation
```

Ask: **"Which test cases should I generate? (all / specific numbers / skip any?)"**

## Step 3: Fetch Testing Patterns from Documentation

Use mcp-sap-docs for best practices:

```
search("ABAP Unit test class FOR TESTING example")
search("ABAP test double framework cl_abap_testdouble")
```

Key patterns to look up:
- `cl_abap_testdouble` for mocking dependencies
- `cl_abap_unit_assert` for assertions
- Test isolation patterns (dependency injection)

## Step 4: Generate the Test Class

### Template Structure

```abap
"! @testing <CLASS_UNDER_TEST>
CLASS <test_class_name> DEFINITION
  PUBLIC FINAL
  FOR TESTING
  DURATION SHORT
  RISK LEVEL HARMLESS.

  PUBLIC SECTION.
  PROTECTED SECTION.
  PRIVATE SECTION.
    DATA cut TYPE REF TO <class_under_test>.
    " Mocked dependencies
    DATA mock_<dep> TYPE REF TO <interface>.

    METHODS setup.

    "! <test case description>
    METHODS <test_method> FOR TESTING RAISING cx_static_check.
ENDCLASS.

CLASS <test_class_name> IMPLEMENTATION.

  METHOD setup.
    " Create test doubles for dependencies
    mock_<dep> = CAST #( cl_abap_testdouble=>create( '<INTERFACE>' ) ).

    " Inject mocks into class under test
    cut = NEW <class_under_test>( io_<dep> = mock_<dep> ).
  ENDMETHOD.

  METHOD <test_method>.
    " Arrange — configure mock behavior
    cl_abap_testdouble=>configure_call( mock_<dep>
      )->returning( <expected_value>
      )->and_expect( )->is_called_once( ).

    " Act — call the method under test
    DATA(result) = cut-><method>( <parameters> ).

    " Assert — verify outcome
    cl_abap_unit_assert=>assert_equals(
      act = result
      exp = <expected>
      msg = '<assertion message>' ).
  ENDMETHOD.

ENDCLASS.
```

### Mocking Strategy

1. **Constructor injection**: If the class accepts dependencies via constructor, create test doubles and inject them
2. **Test seams**: If no injection, check for `CREATE OBJECT` statements that can be overridden in test subclasses
3. **No mocking needed**: If the method is pure logic (no external calls), test directly without mocks
4. **Database access**: If methods read from DB, consider if the class can be tested with test doubles or if integration tests are more appropriate

### Test Data Guidelines

1. **Meaningful names**: Use `lo_valid_customer`, not `lo_obj1`
2. **Boundary values**: Test edge cases (empty tables, zero amounts, max length strings)
3. **Type-correct**: Match ABAP types exactly (NUMC with leading zeros, DATS as `'YYYYMMDD'`)
4. **Self-documenting**: Values should make the expected behavior obvious

### Naming Conventions

- Test class: `ZCL_TEST_<CLASS>` or `LTH_<CLASS>` (local test helper)
- Test methods: `test_<method>_<scenario>` (e.g., `test_calculate_total_empty_items`)
- Keep method names under 30 characters
- Use snake_case

## Step 5: Preview and Confirm

Show the user the complete test class and ask:

**"Here's the generated test class. Should I create it on the SAP system? (yes / edit first / cancel)"**

## Step 6: Create, Activate, and Run

### 6a. Create the test class

```
SAPWrite(action="create", type="CLAS", name="<test_class>", source="<source>", package="<package>", transport="<transport>")
```

### 6b. Update source if needed

```
SAPWrite(action="update", type="CLAS", name="<test_class>", source="<source>", transport="<transport>")
```

### 6c. Activate

```
SAPActivate(type="CLAS", name="<test_class>")
```

### 6d. Run unit tests

```
SAPDiagnose(action="unittest", type="CLAS", name="<test_class>")
```

### 6e. Fix failures iteratively

If tests fail:

1. Analyze the failure message
2. Determine root cause (test data issue, assertion issue, missing mock configuration)
3. Fix using method surgery: `SAPWrite(action="edit_method", type="CLAS", name="<test_class>", method="<failing_test>", source="<fixed_source>")`
4. Re-activate and re-run

Repeat until all tests pass or failures are due to actual bugs in the code under test (report these to the user).

## Step 7: Report Results

Show the user:
- Number of tests passed / failed / skipped
- For failures: method name, assertion message, expected vs actual
- Whether failures indicate bugs in the production code or in the test

## Error Handling

| Error | Cause | Fix |
|---|---|---|
| `CL_ABAP_TESTDOUBLE` not found | System doesn't support test double framework | Use manual mock class instead |
| Type mismatch in mock config | Wrong type in `returning()` call | Check interface method signature |
| Activation error | Syntax error in generated test | Fix syntax, re-activate |
| Test class exists | Already created | Use `SAPWrite(action="update", ...)` |
| `FOR TESTING` not allowed | Package restriction | Check package settings |

## Notes

### When to Use This vs Generate CDS Unit Test

- **This skill**: For testing ABAP classes, methods, business logic
- **[Generate CDS Unit Test](generate-cds-unit-test.md)**: For testing CDS entity logic (calculations, CASE, WHERE, JOINs) using CDS Test Double Framework

### BTP vs On-Premise

- **BTP**: Only `cl_abap_testdouble` for released interfaces. No test doubles for unreleased SAP classes.
- **On-Premise**: Full test double framework available. Can mock any interface.

### Limitations

- Cannot generate tests that require external system calls (RFC, HTTP) -- these need integration tests
- Test doubles only work for interfaces, not concrete classes
- Complex inheritance hierarchies may need manual test setup
