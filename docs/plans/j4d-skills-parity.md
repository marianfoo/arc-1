# J4D Skills Parity — Implementation Plan

## Overview

Implement 5 skills that replicate SAP Joule for Developers (J4D) capabilities using ARC-1 MCP tools + mcp-sap-docs. Each skill is a prompt template (markdown file) that orchestrates existing ARC-1 tools — no new MCP tools needed. The plan also includes backend improvements to `buildCreateXml()` that make object creation more reliable for all skills.

Skills to implement:
1. **explain-abap-code.md** (P0) — Explain ABAP objects, dependencies, and ATC findings
2. **generate-abap-unit-test.md** (P0) — Generate ABAP Unit tests with dependency analysis and test doubles
3. **generate-rap-service.md** (P0) — Already written, needs backend support (buildCreateXml templates)
4. **migrate-custom-code.md** (P0) — ATC-driven S/4HANA custom code migration assistant
5. **generate-rap-logic.md** (P1) — Generate RAP determination/validation implementations

Already done: `generate-cds-unit-test.md` (exists), `generate-rap-service.md` (skill file written).

## Context

### Current State
- ARC-1 has 11 intent-based tools: SAPRead, SAPWrite, SAPActivate, SAPDiagnose, SAPContext, SAPSearch, SAPQuery, SAPNavigate, SAPLint, SAPTransport, SAPManage
- One existing skill: `generate-cds-unit-test.md`
- One newly written skill: `generate-rap-service.md` (created but not yet backed by buildCreateXml improvements)
- `buildCreateXml()` in `src/handlers/intent.ts:697` only has XML templates for PROG, CLAS, INTF, INCL — DDLS/BDEF/SRVD/DDLX use a broken generic fallback
- Method surgery (`src/context/method-surgery.ts`) supports listMethods, extractMethod, spliceMethod — critical for test generation and RAP logic skills
- SAPDiagnose supports: syntax check, ABAP Unit tests, ATC checks (with variant param)
- SAPContext provides compressed dependency graphs with public API contracts

### Target State
- 6 skills total in `skills/` directory (CDS unit test + 5 new)
- All skills also available as Claude Code slash commands in `.claude/commands/`
- `buildCreateXml()` has proper XML templates for DDLS, BDEF, SRVD, DDLX
- SAPActivate batch example updated for full RAP stack
- `skills/README.md` updated with all skills

### Key Files

| File | Role |
|------|------|
| `skills/*.md` | Skill prompt templates |
| `.claude/commands/*.md` | Claude Code slash commands (copies of skills) |
| `skills/README.md` | Skills index |
| `src/handlers/intent.ts` | `buildCreateXml()` ~line 697, `objectUrlForType()` ~line 764, handlers for all tools |
| `src/handlers/tools.ts` | Tool definitions, SAPActivate batch example ~line 385 |
| `src/context/method-surgery.ts` | Method-level extraction and replacement |
| `src/context/compressor.ts` | SAPContext dependency compression |
| `src/adt/devtools.ts` | Syntax check, activation, ABAP Unit, ATC |
| `src/adt/client.ts` | ADT client — object readers |
| `tests/unit/handlers/intent.test.ts` | Handler unit tests |

### Design Principles

1. Skills are prompt templates — they orchestrate existing tools, no new backend code needed per skill
2. Each skill follows the pattern established by `generate-cds-unit-test.md`: Input → Gather Context → Analyze → Generate → Preview/Confirm → Write → Verify
3. All skills must document BTP vs on-prem differences
4. All skills must include error handling tables
5. Backend changes (buildCreateXml) benefit all skills that create objects
6. mcp-sap-docs integration is optional but recommended in every skill

## Development Approach

Skills are prompt templates (markdown files) — no compilation, no tests to break. Backend changes (buildCreateXml, tool descriptions) have unit tests. Tasks are ordered: skills first (no risk, can be done in parallel), then backend improvements, then final verification.

## Validation Commands

- `npm test`
- `npm run typecheck`
- `npm run lint`

### Task 1: Create explain-abap-code.md skill

**Files:**
- Create: `skills/explain-abap-code.md`
- Create: `.claude/commands/explain-abap-code.md`

Create the "Explain ABAP Code" skill. This is the simplest skill — it reads code and dependencies, then explains them. No writes needed.

The skill should follow the format of `skills/generate-cds-unit-test.md` (read it for reference). Structure:

- [ ] Write the skill file `skills/explain-abap-code.md` with this structure:
  - **Input**: User provides an object name and type (CLAS, PROG, DDLS, BDEF, etc.) or just a name (auto-detect type via SAPSearch). Optional: "explain ATC findings" mode.
  - **Step 1: Read the object** — `SAPRead(type, name)` to get source code. For CLAS: also read `method="*"` to get method listing. For DDLS: also read `include="elements"` for structured field list.
  - **Step 2: Get dependency context** — `SAPContext(type, name)` to get compressed public API contracts of all dependencies. This is richer than J4D's IDE context. Use `depth=1` by default, `depth=2` for complex objects.
  - **Step 3: (Optional) Run ATC check** — If user asks to explain code quality or ATC findings: `SAPDiagnose(action="atc", type, name)`. Present findings grouped by priority.
  - **Step 4: (Optional) Research with mcp-sap-docs** — For unfamiliar SAP APIs found in source: `search("CL_<name> ABAP")`. For ATC findings: `search("<checkTitle> simplification item")`.
  - **Step 5: Explain** — Structured explanation with sections: Summary (purpose, scope), Public API (key methods/interfaces), Business Logic (core flow), Dependencies (from SAPContext), Code Quality (ATC findings if requested). Offer follow-ups: "More detailed?" / "Explain a specific method?" / "Show dependencies?"
  - **Error handling table**: Object not found, SAPContext fails (fallback to manual reads), ATC unavailable
  - **BTP vs on-prem notes**: BTP has fewer object types, released APIs only, no PROG/INCL
  - **What this skill does NOT do**: No code modification, no refactoring suggestions (use other skills for that)
- [ ] Copy `skills/explain-abap-code.md` to `.claude/commands/explain-abap-code.md`
- [ ] Run `npm test` — all tests must pass (no code changes, just verifying no breakage from file additions)

### Task 2: Create generate-abap-unit-test.md skill

**Files:**
- Create: `skills/generate-abap-unit-test.md`
- Create: `.claude/commands/generate-abap-unit-test.md`

Create the "Generate ABAP Unit Test" skill. This is the most complex skill — it analyzes class methods, identifies test-unfriendly dependencies, generates test doubles, and creates a complete test class. Read `skills/generate-cds-unit-test.md` for format reference — this skill follows the same structure but targets ABAP classes instead of CDS entities.

Key differences from CDS unit test skill:
- Subject is a class (CLAS) not a CDS entity (DDLS)
- Uses `cl_abap_unit_assert` instead of `cl_cds_test_environment`
- Test doubles are interface-based mocks, not CDS test doubles
- Dependency analysis via SAPContext identifies test-unfriendly deps (DB calls, external APIs)
- Method surgery enables surgical test method updates

- [ ] Write the skill file `skills/generate-abap-unit-test.md` with this structure:
  - **Input**: Class name (required), test class name (optional, default: `ZCL_TEST_<CLASS>`), methods to test (optional, default: all public), package, transport.
  - **Step 1: Gather class context** — (a) `SAPRead(type="CLAS", name="<class>")` for full source; (b) `SAPRead(type="CLAS", name="<class>", method="*")` to list all methods with signatures and visibility; (c) `SAPContext(type="CLAS", name="<class>")` to get dependency contracts; (d) Optionally read existing test class: `SAPRead(type="CLAS", name="<class>", include="testclasses")`.
  - **Step 2: Analyze methods and propose test cases** — For each public method: identify branches (IF/CASE), error paths (RAISE/TRY-CATCH), return values, state changes. Classify dependencies as: mockable (interfaces → create test double), stubbable (DB tables → fixture data in SETUP), or transparent (internal helpers). Present numbered test case list grouped by method, ask user to select (same pattern as CDS skill Step 2).
  - **Step 3: Fetch test framework reference** — `search("ABAP Unit cl_abap_unit_assert")`, `search("test double interface mock ABAP")`. Verify assertion method names and test double patterns.
  - **Step 4: Generate test class** — Template: `CLASS <name> DEFINITION PUBLIC FINAL FOR TESTING DURATION SHORT RISK LEVEL HARMLESS.` Include: CLASS-DATA for CUT (class under test) and mock objects; `class_setup` for one-time init; `setup` for per-test CUT instantiation; individual test methods per selected scenario. Test data rules: minimal rows, obvious values, type-correct, deterministic. Naming: `test_<method>_<scenario>` (max 30 chars).
  - **Step 5: Preview and confirm** — Show generated source, ask user to confirm.
  - **Step 6: Create, activate, and test** — `SAPWrite(action="create", type="CLAS", ...)`, `SAPActivate(type="CLAS", ...)`, `SAPDiagnose(action="unittest", type="CLAS", ...)`. If failures: analyze, fix with `SAPWrite(action="edit_method", ...)`, re-run.
  - **Error handling table**: class_setup fails (wrong CUT instantiation), mock injection fails (constructor mismatch), assertion fails (wrong expected value), activation error (syntax in generated code)
  - **BTP vs on-prem notes**: BTP requires ABAP Cloud syntax, only Z*/Y* test classes, released APIs only for mocking
  - **What this skill does NOT do**: No CDS unit tests (use generate-cds-unit-test), no integration tests, no performance tests
- [ ] Copy `skills/generate-abap-unit-test.md` to `.claude/commands/generate-abap-unit-test.md`
- [ ] Run `npm test` — all tests must pass

### Task 3: Create migrate-custom-code.md skill

**Files:**
- Create: `skills/migrate-custom-code.md`
- Create: `.claude/commands/migrate-custom-code.md`

Create the "Custom Code Migration Assistant" skill. This skill runs ATC readiness checks, groups findings, explains them using mcp-sap-docs, and generates fix proposals. Read `skills/generate-cds-unit-test.md` for format reference.

- [ ] Write the skill file `skills/migrate-custom-code.md` with this structure:
  - **Input**: Object name and type (PROG, CLAS, FUNC, FUGR), OR package name (to check multiple objects). Optional: target release variant (e.g., "S4HANA_2023"), scope ("explain only" vs "explain and fix").
  - **Step 1: Run ATC readiness check** — `SAPDiagnose(action="atc", type="<type>", name="<name>", variant="<variant>")`. If no variant specified, run default ATC first, then suggest readiness variant if available. If checking a package: use `SAPSearch(query="<package>*")` to find all objects, then run ATC on each.
  - **Step 2: Group and prioritize findings** — Group by: (a) priority (1=error, 2=warning, 3=info), (b) check category (deprecated API, syntax change, semantic change, performance), (c) affected object. Deduplicate findings with same checkTitle. Present summary table: `| Priority | Check | Count | Affected Objects |`
  - **Step 3: Explain findings** — For each unique finding: (a) Read affected source: `SAPRead(type, name)` to show code context around the finding line; (b) Search documentation: `search("<checkTitle> S/4HANA migration")` and `search("<deprecated_api> replacement")` via mcp-sap-docs; (c) If SAP Notes MCP is available: `sap_notes_search(q="<checkTitle>")` for specific correction notes; (d) Present: what the finding means, why it matters, what the replacement is.
  - **Step 4: Generate fix proposals** — For each fixable finding: generate replacement code using mcp-sap-docs patterns. Present 3 options per finding (like J4D): Apply (auto-write), Show (display diff), Skip. Group related fixes that can be applied together.
  - **Step 5: Apply selected fixes** — `SAPWrite(action="update", ...)` or `SAPWrite(action="edit_method", ...)` for method-level fixes. After each batch of fixes: `SAPDiagnose(action="syntax", ...)` to validate. Then `SAPActivate(...)`.
  - **Step 6: Re-validate** — Run ATC again to confirm findings are resolved. Report: findings fixed, findings remaining, findings that need manual attention.
  - **Error handling table**: ATC variant not found (list available variants), object locked (inform user), fix causes new syntax error (revert and show diff), no mcp-sap-docs available (explain from ATC finding text only)
  - **BTP vs on-prem notes**: BTP has limited ATC variants (cloud readiness only), on-prem has full S/4HANA readiness variants (2020-2023+). BTP objects already use ABAP Cloud — migration focus is different (deprecated released APIs vs classic ABAP).
  - **Common migration patterns table**: `CALL FUNCTION → class method`, `SELECT...ENDSELECT → SELECT INTO TABLE`, `MOVE-CORRESPONDING → CORRESPONDING #()`, `READ TABLE WITH KEY → line_exists() / VALUE #()`, `FORM/PERFORM → method`, `DB view → CDS view`
  - **What this skill does NOT do**: No transport management (user handles), no mass migration (one object/package at a time), no custom ATC variant creation
- [ ] Copy `skills/migrate-custom-code.md` to `.claude/commands/migrate-custom-code.md`
- [ ] Run `npm test` — all tests must pass

### Task 4: Create generate-rap-logic.md skill

**Files:**
- Create: `skills/generate-rap-logic.md`
- Create: `.claude/commands/generate-rap-logic.md`

Create the "RAP Business Logic Prediction" skill. This skill reads a behavior definition, identifies empty determination/validation method stubs, and generates implementation code. Read `skills/generate-cds-unit-test.md` for format reference.

- [ ] Write the skill file `skills/generate-rap-logic.md` with this structure:
  - **Input**: Behavior definition name (required, e.g., "ZI_TRAVEL"), specific determination/validation name (optional — if omitted, list all and let user choose). Optional: natural language description of desired behavior.
  - **Step 1: Read the RAP stack** — (a) `SAPRead(type="BDEF", name="<bdef>")` to get behavior definition source — parse to find: managed/unmanaged, determinations, validations, actions, draft status, entity aliases, persistent table name; (b) `SAPRead(type="DDLS", name="<interface_view>")` to understand data model and field types; (c) `SAPContext(type="DDLS", name="<interface_view>")` to get dependency context (underlying tables, associations); (d) Find the behavior pool class name from BDEF source (`implementation in class <name>`), then `SAPRead(type="CLAS", name="<bp_class>", method="*")` to list all methods and identify empty stubs.
  - **Step 2: Identify target methods** — Parse BDEF for determination/validation declarations. For each: extract trigger conditions (`on modify`, `on save`), trigger fields, and the method name. Check which methods in the behavior pool are empty stubs (body is just comments or blank). Present list: `| # | Type | Name | Trigger | Status |` where Status is "empty" or "implemented". Ask user which to implement.
  - **Step 3: Research RAP patterns** — `search("RAP validation implementation ABAP example")`, `search("RAP determination on save trigger")`. For specific patterns: `search("RAP calculate total price")`, `search("RAP status validation")`. Use documentation to inform correct ABAP Cloud patterns: `READ ENTITIES`, `MODIFY ENTITIES`, `FAILED`, `REPORTED` structures.
  - **Step 4: Generate method implementation** — For each selected method: (a) Determine the method signature from the BDEF context (keys, importing params for validations vs determinations); (b) Generate ABAP Cloud code following RAP patterns: use `READ ENTITIES OF <entity> IN LOCAL MODE` for reading, `MODIFY ENTITIES` for updating, proper `FAILED`/`REPORTED` handling; (c) Show generated code to user for review.
  - **Step 5: Write and validate** — `SAPWrite(action="edit_method", type="CLAS", name="<bp_class>", method="<method>", source="<generated_code>")` for each method. Then `SAPDiagnose(action="syntax", type="CLAS", name="<bp_class>")`. If syntax errors: read error, fix, re-write.
  - **Step 6: Activate and verify** — `SAPActivate(objects=[{type:"BDEF", name:"<bdef>"}, {type:"CLAS", name:"<bp_class>"}])`. Optionally run ABAP Unit tests if test class exists: `SAPDiagnose(action="unittest", type="CLAS", name="<bp_class>")`.
  - **Common RAP logic patterns section**: Table of patterns with code snippets: (a) Field calculation determination (e.g., total_price = sum of items), (b) Status validation (check field values before save), (c) Mandatory field validation, (d) Cross-field validation, (e) Number range determination (for non-UUID keys), (f) Default value determination.
  - **Error handling table**: Method not found in behavior pool (check class name in BDEF), syntax error in generated code (common: wrong entity name in READ ENTITIES), activation fails (BDEF and class must be compatible), `FAILED`/`REPORTED` structure mismatch.
  - **BTP vs on-prem notes**: BTP requires ABAP Cloud only (`READ ENTITIES` not `SELECT`), strict mode enforced. On-prem: more flexible, can use classic ABAP in behavior pool (not recommended).
  - **What this skill does NOT do**: No custom actions (only determinations/validations), no side effects, no feature control, no authorization implementation. These can be added manually after generation.
- [ ] Copy `skills/generate-rap-logic.md` to `.claude/commands/generate-rap-logic.md`
- [ ] Run `npm test` — all tests must pass

### Task 5: Update skills README with all new skills

**Files:**
- Modify: `skills/README.md`

Update the skills README to list all 6 skills (1 existing + 5 new).

- [ ] Read `skills/README.md` and find the "Available Skills" table. Add entries for all new skills after the existing ones. The table should have these rows:
  - `| [generate-cds-unit-test](generate-cds-unit-test.md) | Generate ABAP Unit tests for CDS entities using CDS Test Double Framework |` (already exists)
  - `| [generate-rap-service](generate-rap-service.md) | Generate complete RAP OData UI service from natural language description |` (already added in previous commit)
  - `| [explain-abap-code](explain-abap-code.md) | Explain ABAP objects with dependency context and optional ATC analysis |`
  - `| [generate-abap-unit-test](generate-abap-unit-test.md) | Generate ABAP Unit tests for classes with dependency analysis and test doubles |`
  - `| [migrate-custom-code](migrate-custom-code.md) | ATC-driven S/4HANA custom code migration with fix proposals |`
  - `| [generate-rap-logic](generate-rap-logic.md) | Generate RAP determination and validation implementations |`
- [ ] Run `npm test` — all tests must pass

### Task 6: Add type-specific buildCreateXml templates for DDLS, BDEF, SRVD, DDLX

**Files:**
- Modify: `src/handlers/intent.ts`
- Modify: `tests/unit/handlers/intent.test.ts`

The `buildCreateXml()` function at `src/handlers/intent.ts:697` only has specific XML templates for PROG, CLAS, INTF, INCL. All other types fall through to a generic `objectReferences` body that uses an incorrect URI pattern (`/sap/bc/adt/programs/programs/`). This causes `SAPWrite(action="create")` to fail for DDLS, BDEF, SRVD, DDLX — which are critical for the RAP service, RAP logic, and migration skills.

The ADT API requires type-specific XML root elements. All follow the same pattern as the existing PROG/CLAS/INTF templates:
```xml
<type:element xmlns:type="<namespace>" xmlns:adtcore="http://www.sap.com/adt/core"
              adtcore:description="..." adtcore:name="..." adtcore:type="TYPE/SUBTYPE"
              adtcore:masterLanguage="EN" adtcore:masterSystem="H00"
              adtcore:responsible="DEVELOPER">
  <adtcore:packageRef adtcore:name="..."/>
</type:element>
```

- [ ] In `src/handlers/intent.ts`, find `buildCreateXml()` (starts at line ~697). Add `case 'DDLS':` before the `default:` returning XML with root element `<ddl:ddlSource xmlns:ddl="http://www.sap.com/adt/ddic/ddlsources">` and `adtcore:type="DDLS/DF"`. Follow the exact pattern of `case 'CLAS':`.
- [ ] Add `case 'BDEF':` returning XML with root element using namespace `http://www.sap.com/adt/bo/behaviordefinitions` and `adtcore:type="BDEF/BDO"`.
- [ ] Add `case 'SRVD':` returning XML with namespace `http://www.sap.com/adt/ddic/srvd/sources` and `adtcore:type="SRVD/SRV"`.
- [ ] Add `case 'DDLX':` returning XML with namespace `http://www.sap.com/adt/ddic/ddlx/sources` and `adtcore:type="DDLX/EX"`.
- [ ] Fix the `default:` case's generic fallback to use `objectUrlForType(type, name)` instead of the hardcoded `/sap/bc/adt/programs/programs/` URI, so any future type gets the correct URL.
- [ ] Add unit tests (~8 tests): Test `buildCreateXml` returns correct XML for each new type (DDLS, BDEF, SRVD, DDLX) — verify root element name, namespace, `adtcore:type` attribute, name attribute, package reference. Test the default fallback uses correct URL. Test existing PROG/CLAS/INTF templates still work unchanged.
- [ ] Run `npm test` — all tests must pass
- [ ] Run `npm run typecheck` — no errors

### Task 7: Improve SAPActivate batch description for RAP stack workflow

**Files:**
- Modify: `src/handlers/tools.ts`

The SAPActivate tool description already mentions batch activation for RAP stacks, but the example is incomplete. Update it so the LLM has a better template when generating RAP services or activating migration changes.

- [ ] In `src/handlers/tools.ts`, find the SAPActivate `objects` property description (line ~385). Update the example array to show a full RAP stack: `[{type:"DDLS",name:"ZI_TRAVEL"},{type:"BDEF",name:"ZI_TRAVEL"},{type:"DDLS",name:"ZC_TRAVEL"},{type:"BDEF",name:"ZC_TRAVEL"},{type:"DDLX",name:"ZC_TRAVEL"},{type:"SRVD",name:"ZSD_TRAVEL"}]`
- [ ] Run `npm test` — all tests must pass

### Task 8: Final verification

**Files:**
- All modified files from Tasks 1-7

- [ ] Run full test suite: `npm test` — all tests pass
- [ ] Run typecheck: `npm run typecheck` — no errors
- [ ] Run lint: `npm run lint` — no errors
- [ ] Verify all 6 skill files exist in `skills/`: `generate-cds-unit-test.md`, `generate-rap-service.md`, `explain-abap-code.md`, `generate-abap-unit-test.md`, `migrate-custom-code.md`, `generate-rap-logic.md`
- [ ] Verify all 5 new command files exist in `.claude/commands/`: `generate-rap-service.md`, `explain-abap-code.md`, `generate-abap-unit-test.md`, `migrate-custom-code.md`, `generate-rap-logic.md`
- [ ] Verify `skills/README.md` lists all 6 skills
- [ ] Move this plan to `docs/plans/completed/`
