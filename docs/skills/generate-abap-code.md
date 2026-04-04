# Generate ABAP Code

Generate ABAP objects from natural-language descriptions, with syntax validation and iterative refinement.

This skill replicates SAP Joule's `/generate` command by combining ARC-1 (live SAP system access), mcp-sap-docs (SAP documentation and best practices), and LLM code generation.

## Input

The user provides a natural-language description of what they want. Ask the user for:

- **Description** (required) -- what to generate (e.g., "Create a CDS view that joins SCARR and SPFLI", "Generate a class that validates sales orders")
- **Object type** (optional -- infer from description): CLAS, INTF, DDLS, BDEF, SRVD, SRVB, PROG, FUNC
- **Object name** (optional -- generate a name if not provided)
- **Package** (optional -- default: `$TMP`)
- **Transport request** (optional -- only if package is transportable)

## Step 1: Understand the Context

### 1a. Check system capabilities

```
SAPManage(action="features")
```

Determine:
- Is this a BTP or on-premise system? (affects available ABAP features)
- Is RAP/CDS supported?
- What ABAP version is available?

### 1b. Look up SAP documentation for the requested pattern

Use mcp-sap-docs to find relevant examples and best practices:

```
search("<relevant pattern> ABAP example")
```

Examples:
- For RAP: `search("RAP managed scenario implementation example")`
- For CDS: `search("CDS view with association annotation example")`
- For Clean Core: `search("ABAP Cloud released API <domain>")`

### 1c. Check for existing related objects

```
SAPSearch(query="Z*<keyword>*", type="<type>")
```

Understand naming conventions and existing patterns in the user's system.

### 1d. If extending existing code, read it first

```
SAPRead(type="<TYPE>", name="<name>")
SAPContext(type="<TYPE>", name="<name>")
```

## Step 2: Check Clean Core Compliance (BTP / S/4HANA Cloud)

For BTP and S/4HANA Cloud systems, verify that planned API usage is clean-core compliant:

```
sap_search_objects(name="<SAP_API_TO_USE>")
sap_get_object_details(object="<SAP_API_TO_USE>")
```

- Only use released APIs (C1 contract)
- Check for successor objects if a planned API is deprecated
- Prefer ABAP Cloud syntax (no classic statements like CALL FUNCTION, WRITE, etc.)

## Step 3: Generate the Code

Based on the description, context, and documentation, generate the ABAP source code.

### Generation Guidelines

1. **Follow naming conventions**:
   - Classes: `ZCL_<NAME>` (or `YCL_`)
   - Interfaces: `ZIF_<NAME>`
   - CDS Views: `ZI_<NAME>` (interface), `ZC_<NAME>` (consumption), `ZR_<NAME>` (restricted/RAP)
   - Behavior Definitions: Same as CDS entity name
   - Service Definitions: `ZSD_<NAME>`
   - Service Bindings: `ZSB_<NAME>`

2. **Follow SAP best practices**:
   - Use ABAP OO (no procedural code unless specifically requested)
   - Use ABAP Cloud syntax on BTP systems
   - Follow RAP patterns for transactional scenarios
   - Use proper exception handling (class-based exceptions)

3. **Keep it minimal**:
   - Generate only what was asked for
   - Don't add unnecessary boilerplate
   - Include ABAP Doc comments for public methods

4. **For multi-object scenarios** (e.g., RAP stack), generate in dependency order:
   - Database table (TABL) → CDS interface view (DDLS) → CDS consumption view (DDLS) → Behavior definition (BDEF) → Service definition (SRVD) → Service binding (SRVB)

## Step 4: Preview and Confirm

Show the user:
- Complete source code for each object to be created
- Object names and types
- Package and transport assignment
- Any assumptions made

Ask: **"Here's the generated code. Should I create it on the SAP system? (yes / edit first / cancel)"**

## Step 5: Create and Activate

### 5a. Create objects (in dependency order)

```
SAPWrite(action="create", type="<TYPE>", name="<name>", source="<source>", package="<package>", transport="<transport>")
```

### 5b. Syntax check before activation

```
SAPDiagnose(action="syntax", type="<TYPE>", name="<name>")
```

If syntax errors found:
1. Analyze the error
2. Fix the source
3. Update: `SAPWrite(action="update", type="<TYPE>", name="<name>", source="<fixed_source>")`
4. Re-check syntax

### 5c. Activate (batch for multi-object scenarios)

Single object:
```
SAPActivate(type="<TYPE>", name="<name>")
```

Multi-object (RAP stack):
```
SAPActivate(objects=[
  {"type": "DDLS", "name": "ZI_TRAVEL"},
  {"type": "DDLS", "name": "ZC_TRAVEL"},
  {"type": "BDEF", "name": "ZI_TRAVEL"},
  {"type": "SRVD", "name": "ZSD_TRAVEL"},
  {"type": "SRVB", "name": "ZSB_TRAVEL"}
])
```

### 5d. Run quality checks

```
SAPDiagnose(action="atc", type="<TYPE>", name="<name>")
SAPLint(source="<source>")
```

Report any findings to the user.

## Step 6: Verify and Report

Show the user:
- All created objects with their names and types
- Activation status (success or errors)
- ATC findings (if any)
- Next steps (e.g., "You can now test the service binding in the SAP Fiori preview")

## Common Generation Scenarios

### RAP Managed Scenario

User: "Create a RAP app for managing travel bookings"

Generate:
1. Database table `ZTRAVEL`
2. Interface CDS view `ZI_TRAVEL`
3. Consumption CDS view `ZC_TRAVEL` with UI annotations
4. Behavior definition with managed implementation
5. Service definition
6. Service binding (OData V4)

### Utility Class

User: "Create a utility class for date calculations"

Generate:
1. Interface `ZIF_DATE_UTILS` with method signatures
2. Class `ZCL_DATE_UTILS` implementing the interface

### CDS View

User: "Create a CDS view joining sales orders with customers"

Generate:
1. CDS view `ZI_SALESORDER_CUSTOMER` with proper annotations, associations, and key fields

## Error Handling

| Error | Cause | Fix |
|---|---|---|
| Object already exists | Name collision | Suggest alternative name or update existing |
| Package not found | Wrong package name | List available packages with SAPSearch |
| Transport required | Transportable package | Ask user for transport or create one |
| Syntax error after create | Generated code has issues | Fix and update iteratively |
| Activation dependency | Objects must be activated together | Use batch activation |
| Clean Core violation | Used unreleased API on BTP | Check sap_search_objects for released alternative |

## Notes

### BTP vs On-Premise

- **BTP**: Only CLAS, INTF, DDLS, DDLX, BDEF, SRVD can be created. Use ABAP Cloud syntax. No PROG, FUNC, INCL.
- **On-Premise**: All object types available. Classic ABAP syntax allowed.

### When This Skill Goes Beyond J4D

- **Multi-object generation**: J4D generates one object at a time. This skill can generate a full RAP stack in sequence.
- **Documentation-driven**: Uses mcp-sap-docs to find latest SAP patterns before generating.
- **Clean Core validation**: Automatically checks API release status on BTP systems.
- **Iterative refinement**: Syntax check → fix → re-check loop until code compiles.
