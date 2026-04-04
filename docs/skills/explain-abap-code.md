# Explain ABAP Code

Explain ABAP code in natural language, including its purpose, logic flow, dependencies, and SAP context.

This skill replicates SAP Joule's `/explain` command by combining ARC-1 (live SAP system access) with mcp-sap-docs (SAP documentation lookup).

## Input

The user provides an ABAP object identifier. Ask the user for:

- **Object type and name** (required) -- e.g., `ZCL_SALESORDER`, `ZI_TRAVEL`, `ZFUGR_UTILS`
- **Method name** (optional) -- to explain a specific method instead of the whole class
- **Depth** (optional) -- how deep to go into dependencies (default: surface-level)

If the user provides just a name, infer the type from naming conventions:
- `ZCL_*` / `CL_*` → CLAS
- `ZIF_*` / `IF_*` → INTF
- `ZI_*` / `ZC_*` / `ZR_*` → DDLS (CDS view)
- `Z*` with no clear prefix → search with SAPSearch

## Step 1: Read the Source Code

### 1a. For classes -- read full source or a specific method

Full class:
```
SAPRead(type="CLAS", name="<name>")
```

Specific method (95% token reduction):
```
SAPRead(type="CLAS", name="<name>", method="<method_name>")
```

To see all methods first:
```
SAPRead(type="CLAS", name="<name>", method="*")
```

### 1b. For CDS views

```
SAPRead(type="DDLS", name="<name>")
SAPRead(type="DDLS", name="<name>", include="elements")
```

### 1c. For other types

```
SAPRead(type="<TYPE>", name="<name>")
```

Supported types: PROG, INTF, FUNC, FUGR, INCL, TABL, STRU, DOMA, DTEL, SRVD, SRVB, BDEF, DDLX.

## Step 2: Gather Dependency Context

Use SAPContext to understand the object's dependencies without fetching full source of every dependency:

```
SAPContext(type="<TYPE>", name="<name>")
```

This returns compressed public API contracts (method signatures, interface definitions, type declarations) for all dependencies -- typically 7-30x smaller than full source.

For deeper dependency chains (e.g., understanding a class that uses another class that implements an interface):
```
SAPContext(type="<TYPE>", name="<name>", depth=2)
```

## Step 3: Look Up SAP Documentation (Optional)

If the code uses SAP standard APIs, RAP patterns, or unfamiliar ABAP statements, use mcp-sap-docs:

```
search("CL_SOME_SAP_CLASS usage example")
search("RAP behavior definition validation")
```

Also check if APIs used are released for ABAP Cloud (relevant for BTP systems):
```
sap_search_objects(name="CL_SOME_SAP_CLASS")
```

## Step 4: Check Code Quality Context (Optional)

If the user wants to understand issues with the code, add quality context:

```
SAPDiagnose(action="syntax", type="<TYPE>", name="<name>")
SAPDiagnose(action="atc", type="<TYPE>", name="<name>")
SAPLint(source="<source_code>")
```

## Step 5: Generate the Explanation

Structure the explanation as follows:

### Explanation Structure

1. **Purpose** (1-2 sentences): What does this object do? What business problem does it solve?

2. **Architecture**: Where does this fit in the application?
   - For RAP: Is this a BO interface view, consumption view, behavior definition, service binding?
   - For classes: Is this a handler, helper, factory, service?
   - For CDS: What's the data model hierarchy?

3. **Key Logic Flow**: Walk through the main logic paths:
   - Entry points (public methods, events, determinations, validations)
   - Core business logic
   - Error handling and edge cases

4. **Dependencies**: What does this object depend on?
   - Other classes/interfaces used
   - Database tables/CDS views accessed
   - External API calls (RFC, HTTP)

5. **Data Model** (for CDS/tables): Field overview, key fields, associations, calculated fields

6. **Notable Patterns**: Highlight any design patterns, SAP-specific patterns (RAP, BOPF, ALV), or anti-patterns

7. **Potential Issues** (if quality checks were run): Syntax errors, ATC findings, lint warnings

### Formatting Guidelines

- Use clear section headers
- Include relevant code snippets (short) to illustrate key points
- Reference specific line numbers when discussing logic
- For CDS views: include a data flow diagram if multiple views are chained
- Keep the explanation appropriate to the complexity -- don't over-explain simple code

## Customization

The user may ask for different explanation styles:

- **"Explain like I'm new to ABAP"** → Focus on ABAP-specific syntax, explain SAP concepts
- **"Explain the business logic"** → Skip technical details, focus on what the code does for the business
- **"Explain the architecture"** → Focus on how this fits into the larger system, dependency graph
- **"What does method X do?"** → Focus on a single method, use method-level read
- **"Is this code any good?"** → Run quality checks and include assessment

## Notes

### BTP vs On-Premise

- **BTP**: Some object types (PROG, INCL, VIEW) are not available. CDS views and classes are the primary objects.
- **On-Premise**: Full access to all object types including legacy programs, function modules, and dictionary objects.

### When This Skill Adds Value Over J4D

- **Dependency context**: J4D explains code in isolation. This skill fetches dependency contracts so the explanation includes how the object interacts with its dependencies.
- **On-premise support**: J4D requires BTP/S/4HANA Cloud. This skill works with any SAP system.
- **Quality context**: Optionally includes syntax, ATC, and lint findings in the explanation.
- **SAP documentation**: Optionally looks up SAP Help and Community content for standard APIs used in the code.
