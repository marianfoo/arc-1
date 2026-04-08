# J4D Skills Parity Plan for ARC-1 + SAP Docs MCP

Last updated: 2026-04-07
Owner: ARC-1
Goal: Recreate SAP Joule for Developers (J4D) skill coverage using ARC-1 MCP tools + `mcp-sap-docs` skills orchestration.

## 1) Scope and source baseline

This plan is based on:
- `compare/J4D/01-joule-for-developers.md`
- `compare/J4D/02-sap-abap-mcp-server-vscode.md`
- `compare/J4D/03-abap-file-formats-opportunity.md`
- `compare/J4D/ADT_AI_TOOLS.pdf` (58 pages, generated 2026-04-04)

Current ARC-1 baseline:
- 11 intent tools available (`SAPRead`, `SAPWrite`, `SAPActivate`, `SAPDiagnose`, `SAPContext`, etc.)
- Existing skill: `skills/generate-cds-unit-test.md`
- Known open roadmap items relevant to J4D parity: FEAT-10 (PrettyPrint), FEAT-12 (Quickfix), FEAT-05 (Refactor), FEAT-27 (Migration Analysis)

## 2) J4D capability -> ARC-1 skill target map

| J4D capability | Target ARC-1 skill | Parity target | Priority |
|---|---|---|---|
| Explain (`/explain`) | `explain-abap-code.md` | Full | P0 |
| ABAP Unit (`/aunit`) | `generate-abap-unit-test.md` | Full-ish (phased) | P0 |
| CDS Unit Test | `generate-cds-unit-test.md` (exists) | Full | Done |
| Consume (`/consume`) | `consume-odata-service.md` | High | P0 |
| OData UI Service from Scratch | `generate-rap-service.md` | High | P0 |
| RAP Business Logic Prediction | `generate-rap-logic.md` | High | P1 |
| Custom Code Migration Assistant | `migrate-custom-code.md` | High | P0 |
| Embedded Analytics Star Schema | `generate-analytics-star-schema.md` | Medium | P1 |
| Extensibility Assistant | `extensibility-assistant.md` | Medium/Partial | P2 |
| Documentation Chat (`/docs`) | No wrapper required | Already covered by `mcp-sap-docs` | Done |
| Predictive Code Completion | Out of scope (IDE-native) | N/A | N/A |

## 3) Per-skill gap matrix (what is missing)

### 3.1 `explain-abap-code.md` (P0)

What exists now:
- ARC-1: `SAPRead`, `SAPContext`, `SAPDiagnose(action=atc)`
- Docs MCP: strong coverage for ABAP reference and RAP concepts

Missing for good quality:
- ARC-1: optional `SAPContext` JSON output (today text-only; still usable)
- Docs MCP: none blocking

Decision:
- Implement now as prompt-only skill. No server change required for v1.

### 3.2 `generate-abap-unit-test.md` (P0)

What exists now:
- ARC-1: method-level surgery (`SAPWrite(action=edit_method)`), class include reads (`include=testclasses`), unit test execution
- Docs MCP: ABAP Unit + test double framework documentation available

Missing for strong J4D parity:
- ARC-1: no first-class "test-unfriendly dependency" classifier output (skill must infer from `SAPContext` + source)
- ARC-1: no dedicated test-double generation endpoint (skill-level generation needed)
- ARC-1: no dedicated split-test-class / split-test-method operation
- ARC-1: no built-in guided refactoring instruction presets for test code

Decision:
- Build v1 fully as skill orchestration (no backend blocker).
- Add optional backend enhancers later (see section 5).

### 3.3 `consume-odata-service.md` (P0)

What exists now:
- ARC-1: can generate ABAP code and read many object types
- Docs MCP: high-quality OData Client Proxy docs, service consumption model conceptual docs

Missing:
- ARC-1: no explicit Service Consumption Model object support in `SAPRead` (no `SRVC`/SCM read/list path exposed)
- ARC-1: no helper for discovering existing consumption models by service root

Decision:
- Skill v1 can generate proxy code from user-supplied model details.
- For good UX parity, add ARC-1 support for reading/listing consumption models (P1 backend work).

### 3.4 `generate-rap-service.md` (P0)

What exists now:
- ARC-1: DDLS/DDLX/BDEF/SRVD write + batch activation, package and transport support
- Docs MCP: RAP and generated-object guidance available

Missing:
- ARC-1: no single transactional multi-object "create RAP stack" action (skill must orchestrate many calls)
- ARC-1: no explicit generator constraints guardrail (single BO, UUID-only, no unmanaged/actions/associations) beyond skill logic

Decision:
- Build v1 as skill orchestration with strict guardrails and preview/confirm checkpoints.
- Consider `SAPWrite(action=batch)` or `SAPBatch` for v2.

### 3.5 `generate-rap-logic.md` (P1)

What exists now:
- ARC-1: `SAPRead(BDEF/CLAS)`, `SAPWrite(edit_method)`
- Docs MCP: RAP validation/determination docs available

Missing:
- ARC-1: no Quick Fix endpoint integration (`/sap/bc/adt/quickfixes/*`) to apply SAP-suggested deterministic edits

Decision:
- Build v1 skill using `edit_method` + compile/test loop.
- Add quickfix support for higher trust and speed.

### 3.6 `migrate-custom-code.md` (P0)

What exists now:
- ARC-1: ATC runs, diagnostics, code update/activation
- Docs MCP: help content for ATC explain migration flow exists

Missing:
- ARC-1: no built-in migration-specific ATC variant profiles or simplification-item aware post-processing
- Docs MCP: no dedicated SAP Note retrieval in this server (simplification notes are referenced, but note-level workflows are weak)
- Docs MCP: best results often need SAP Note content; this is currently outside `mcp-sap-docs`

Decision:
- Build v1 with ATC-centered workflow and docs-backed remediation patterns.
- For enterprise parity, add SAP Notes integration (separate MCP/app) and migration-oriented ATC helpers.

### 3.7 `generate-analytics-star-schema.md` (P1)

What exists now:
- ARC-1: DDLS CRUD + activation
- Docs MCP: embedded analytics/star schema references available

Missing:
- ARC-1: no dedicated analytics generator; skill must create cube/dimension templates and enforce annotation rules

Decision:
- Build as skill-driven scaffold generator first.

### 3.8 `extensibility-assistant.md` (P2)

What exists now:
- Docs MCP provides extensibility assistant documentation and procedural guidance

Missing (major):
- ARC-1 has no dedicated APIs for custom-field app automation/business-context operations (many flows are app-level, not plain ADT object CRUD)
- This is not primarily a repository-code generation flow

Decision:
- Ship as advisory skill (guidance + checklists + object discovery) first.
- Mark as partial parity until dedicated APIs/automation path is added.

## 4) SAP Docs MCP capability assessment (for skill readiness)

### Strong coverage (usable now)
- OData Client Proxy consumption docs (ABAP Help + examples)
- ABAP Unit/Test Double docs (cheat sheets + help)
- RAP concepts and behavior implementation docs
- J4D capability pages (explain, migration explain, star schema, extensibility)

### Gaps / issues found
- Fetch reliability issue for `abap-platform-rap-opensap` result IDs from `search`:
  - `fetch("/abap-platform-rap-opensap/week5/unit2")` -> error
  - `fetch("/abap-platform-rap-opensap/week3/unit5#summary")` -> error
- No dedicated SAP Note retrieval in this MCP server, which limits simplification-item deep workflows for migration skills.

### Priority for docs MCP improvements
- P1: Fix `fetch()` for `abap-platform-rap-opensap` IDs returned by `search`
- P1: Add first-class SAP Note retrieval path (or document supported companion connector)
- P2: Add curated query presets for migration/consume/RAP-generation tasks to reduce noisy retrieval

## 5) ARC-1 backend feature additions needed for higher parity

| Feature | Why | Priority |
|---|---|---|
| Service Consumption Model read/list support (object type + endpoints) | Needed for strong `/consume` parity | P1 |
| Quick Fix API integration (`/sap/bc/adt/quickfixes/*`) | Needed for safer auto-fix + migration + RAP logic | P1 |
| Pretty Printer endpoint support | Needed for prettify/refinement flows | P2 |
| Refactoring API integration (`/sap/bc/adt/refactorings/*`) | Better split/refactor parity for `/aunit` and code quality skills | P2 |
| Batch object create orchestration (`SAPBatch` or `SAPWrite(action=batch)`) | Needed for robust RAP service generation UX | P2 |
| Optional structured `SAPContext` output (`outputFormat=json`) | Better machine-readable skill internals | P3 |

## 6) Implementation phases (skills + backend)

### Phase A (P0 parity skills, 2-3 weeks)
- Build skills:
  1. `explain-abap-code.md`
  2. `generate-abap-unit-test.md`
  3. `generate-rap-service.md`
  4. `consume-odata-service.md` (v1: with user-provided consumption model metadata)
  5. `migrate-custom-code.md` (v1: ATC-driven)
- Add a unified skill template format (input contract, tool-call sequence, verification loop, failure handling).
- Add smoke tests/eval prompts for each new skill scenario.

Exit criteria:
- Each skill can run end-to-end on a reference system with at least one successful scenario.
- Skills include explicit human review/confirmation before destructive writes.

### Phase B (P1 parity enhancers, 2 weeks)
- ARC-1:
  1. Service Consumption Model read/list support
  2. Quick Fix API support
- Skills:
  1. Upgrade `consume-odata-service` to auto-discover models
  2. Upgrade `migrate-custom-code` to propose fix-proposal-driven remediations
  3. Add `generate-rap-logic.md`
  4. Add `generate-analytics-star-schema.md`
- Docs MCP:
  1. Resolve `abap-platform-rap-opensap` fetch failures

Exit criteria:
- `/consume` skill no longer depends on manual model metadata.
- Migration skill can optionally apply SAP quickfix proposals.

### Phase C (P2/P3 completion, 2-4 weeks)
- ARC-1: PrettyPrint + Refactor + optional batch write orchestration
- Skills:
  1. `extensibility-assistant.md` (advisory first, then automate where APIs allow)
  2. Add optional `prettify-abap-code.md` and `refactor-abap-code.md`

Exit criteria:
- Full J4D functional coverage except IDE-native predictive completion.

## 7) Skill quality bar (definition of "good skill")

Every skill must include:
- Explicit input contract (required/optional params and defaults)
- Deterministic tool-call order with fallback branches
- Preview + user confirmation before write/activate/release actions
- Validation loop (syntax/ATC/unittest where applicable)
- Error playbook with common SAP failure modes and recovery steps
- BTP/on-prem differences and safety constraints

## 8) Immediate next actions

1. Create 5 P0 skill files and link them in `skills/README.md`.
2. Add a small "skill eval" checklist document for repeatable manual acceptance tests.
3. Open backend tasks for:
   - Service Consumption Model support
   - Quick Fix API integration
4. Open docs MCP task for `abap-platform-rap-opensap` fetch reliability.

