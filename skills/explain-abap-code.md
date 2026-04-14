# Explain ABAP Code

Explain ABAP objects with full dependency context and optional ATC code quality analysis.

This skill replicates SAP Joule's "Explain Code" capability by combining ARC-1 (SAP system access) with mcp-sap-docs (documentation & best practices). It goes beyond J4D by providing compressed dependency graphs via SAPContext.

## Smart Defaults (apply silently, do NOT ask)

| Setting | Default | Rationale |
|---|---|---|
| Object type | Auto-detect via SAPSearch | Don't make user look up the type |
| Depth | Overview | Start high-level, user can ask for detail |
| ATC | No | Only run if user asks about code quality |
| Dependencies | Fetch via SAPContext | Always get the dependency graph |

## Input

The user provides an ABAP object name (e.g., `ZCL_TRAVEL_HANDLER`, `ZI_SALESORDER`, `Z_REPORT_POSTING`).

Only the **object name** is required. If the user provides just an object name, auto-detect the type and proceed immediately with an overview explanation.

Optionally, the user may specify:
- **Object type** (default: auto-detect)
- **Explain ATC findings?** (default: no)
- **Depth** — "overview" or "detailed" (default: overview)

## Step 1: Read the Object

### 1a. Resolve type (if not provided)

If the user didn't specify a type, search for the object:

```
SAPSearch(query="<object_name>")
```

Use the first result's type. If ambiguous (multiple matches), ask the user.

### 1b. Read the source code

```
SAPRead(type="<type>", name="<object_name>")
```

### 1c. For classes — also get the method listing

```
SAPRead(type="CLAS", name="<class_name>", method="*")
```

This returns all methods with their signatures, visibility (public/protected/private), and parameter types. Essential for understanding the class API.

### 1d. For CDS entities — also get the structured field list

```
SAPRead(type="DDLS", name="<entity_name>", include="elements")
```

Returns a formatted listing of all fields with key markers, aliases, associations, and expression types.

### 1e. (Optional) Read related artifacts

Depending on type, also read associated objects:
- **CLAS**: `SAPRead(type="CLAS", name="<class>", include="testclasses")` — check if tests exist
- **DDLS**: `SAPRead(type="BDEF", name="<entity>")` — check if behavior definition exists; `SAPRead(type="DDLX", name="<entity>")` — check for metadata extensions
- **BDEF**: `SAPRead(type="DDLS", name="<entity>")` — read the associated CDS view

These may fail if the related artifact doesn't exist — that's fine, skip them.

## Step 2: Get Dependency Context

```
SAPContext(type="<type>", name="<object_name>")
```

This automatically extracts all dependencies and fetches compressed public API contracts for each. It provides:
- For classes: used interfaces, superclasses, injected dependencies, called methods on other classes
- For CDS views: data sources (FROM, JOIN), associations, compositions, projection bases
- For programs: called function modules, used classes, included programs

For complex objects with deep dependency chains, use `depth=2`:

```
SAPContext(type="<type>", name="<object_name>", depth=2)
```

If SAPContext fails (e.g., unsupported type), fall back to manual reads of key dependencies identified in the source code.

## Step 3: (Optional) Run ATC Check

If the user asked to explain code quality or ATC findings:

```
SAPDiagnose(action="atc", type="<type>", name="<object_name>")
```

If a specific ATC variant is needed (e.g., S/4HANA readiness):

```
SAPDiagnose(action="atc", type="<type>", name="<object_name>", variant="<variant>")
```

Group findings by priority:
- **Priority 1 (Errors)**: Must-fix issues — deprecated APIs, syntax problems
- **Priority 2 (Warnings)**: Should-fix — performance, maintainability
- **Priority 3 (Info)**: Nice-to-fix — style, conventions

## Step 4: (Optional) Research with mcp-sap-docs

For unfamiliar SAP APIs found in the source code:

```
search("<class_or_function_name> ABAP documentation")
```

For ATC findings that need explanation:

```
search("<checkTitle> simplification item S/4HANA")
```

For SAP Notes if available:

```
sap_notes_search(q="<finding_or_api_name>")
```

Use documentation results to enrich the explanation with official SAP context.

## Step 5: Explain

Present a structured explanation with the following sections. Adapt depth based on user preference (overview vs detailed).

### Summary
- **Purpose**: What the object does in one sentence
- **Type**: Object type and classification (e.g., "RAP behavior pool", "interface CDS view", "ALV report")
- **Scope**: How many methods/fields/lines, complexity assessment

### Public API
For classes:
- Key public methods with their signatures and purpose
- Implemented interfaces
- Constructor parameters (especially injected dependencies)
- Events raised

For CDS views:
- Exposed fields with business meaning
- Parameters (if any)
- Associations available for navigation

### Business Logic
- Core processing flow (what happens when key methods are called)
- Important business rules and conditions
- Data transformations and calculations
- Error handling approach

### Dependencies
From SAPContext results:
- Direct dependencies with their roles (data source, helper, framework)
- Key interfaces/classes used and why
- External system calls (RFC, HTTP, etc.) if any
- Database tables accessed

### Code Quality (if ATC was run)
From ATC results:
- Summary: total findings by priority
- Top findings with explanation of impact
- Recommendations for improvement

### Follow-up Options

Offer the user next steps:
- "Want me to explain a specific method in detail?"
- "Want me to analyze the ATC findings and suggest fixes?" (→ migrate-custom-code skill)
- "Want me to generate unit tests for this class?" (→ generate-abap-unit-test skill)
- "Want me to show the full dependency graph?" (→ SAPContext with depth=2)

## Error Handling

### Common Issues and Fixes

| Error | Cause | Fix |
|---|---|---|
| Object not found | Name misspelled or object doesn't exist | Use SAPSearch to find similar names |
| SAPContext fails | Object type not supported for dependency analysis | Fall back to manual reads of key dependencies found in source |
| ATC check returns no findings | No ATC configuration or clean code | Inform user — no findings is good news |
| ATC variant not found | Specified variant doesn't exist on system | Run default ATC, list available variants |
| Method listing empty | Object is not a class or has no methods | Skip method listing, explain from source only |
| Source is empty | Object exists but has no source (e.g., generated proxy) | Inform user, try reading related objects instead |

## Notes

### BTP vs On-Premise Differences

- **BTP**: Fewer object types available — no PROG, INCL, FUGR. Focus on released APIs and ABAP Cloud objects. DDLS, CLAS, INTF, BDEF, DDLX, SRVD are the primary types. ATC variants are limited to cloud readiness checks.
- **On-Premise**: Full range of object types. All ATC variants available. Can explain legacy objects (FORM routines, function modules, classic reports).

### What This Skill Does NOT Do

- **No code modification**: This skill only reads and explains — it never writes or changes code
- **No refactoring suggestions**: For improvement suggestions, use ATC analysis or migration skill
- **No test generation**: For generating tests, use generate-abap-unit-test or generate-cds-unit-test skills
- **No cross-system comparison**: Explains objects on one system at a time

### When to Use This Skill

- When onboarding to an unfamiliar codebase
- When investigating a bug or understanding existing behavior
- When reviewing code quality before a migration
- When documenting an undocumented object
- When understanding the impact of changing a shared class or CDS view
