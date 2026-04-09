# Generate RAP OData Service — Research-First

Generate a production-quality RAP OData service through deep system research, best-practice analysis, and iterative planning before writing a single line of code. This is the "measure twice, cut once" counterpart to the vibe-coding `generate-rap-service` skill.

This skill produces an A+ implementation plan informed by the target SAP system's actual capabilities, existing code patterns, SAP documentation, and user requirements — then executes it only after explicit user approval.

## When to Use This Skill vs. `generate-rap-service`

| Use `generate-rap-service` (vibe code) | Use THIS skill (research-first) |
|---|---|
| Quick prototyping / proof of concept | Production-quality service |
| Simple CRUD with standard patterns | Complex domain with specific requirements |
| User knows exactly what they want | User has a high-level idea, needs guidance |
| `$TMP` / throwaway package | Transportable / long-lived code |
| Single root entity, managed, UUID | May need unmanaged, compositions, custom keys |

## Input

The user provides a natural language description of the business requirement. This can range from vague ("I need something to track maintenance orders") to detailed ("REST API for plant maintenance with equipment hierarchy, work orders, and time recording").

Gather initial context — do NOT over-interview at this stage. Research will surface the right questions later.

- **Business requirement** (required) — what the service should do
- **Package** (optional — default: `$TMP`)
- **Transport request** (optional — only if package is transportable)
- **Any known constraints** (optional — e.g., "must use existing table ZMAINT_ORDER", "needs to integrate with PM module")

If the user provides just a description, proceed directly to research. Questions come AFTER research, when you know enough to ask the right ones.

---

## Phase 1: Deep System Research

Research the target system thoroughly before designing anything. Every finding informs the plan.

### 1a. System Capabilities & Version

Detect what the system supports — this determines available RAP features, syntax, and patterns.

```
SAPManage(action="features")
```

Extract and note:
- **System type**: BTP ABAP Environment vs. On-Premise (and release level: 7.52, 7.54, 7.57, S/4HANA 2020+, etc.)
- **ABAP language version**: Cloud (strict, released APIs only) vs. Standard (full ABAP)
- **RAP support level**: Managed, unmanaged, abstract BOs? Draft support? Late numbering? Determination on modify vs. save?
- **CDS capabilities**: View entities vs. classic views? Table entities? Metadata extensions? Access control?
- **Available features**: ATC, syntax check, unit test runner, transport management

### 1b. Existing RAP Projects — Pattern Mining

Search for existing RAP artifacts to understand the system's established patterns. This is critical for consistency.

```
SAPSearch(query="BDEF Z*", maxResults=20)
```

```
SAPSearch(query="SRVD Z*", maxResults=20)
```

```
SAPSearch(query="SRVB Z*", maxResults=20)
```

If results are found, read 2-3 representative RAP stacks to extract the team's patterns:

```
SAPRead(type="BDEF", name="<found_bdef>")
```

```
SAPRead(type="DDLS", name="<found_interface_view>")
```

```
SAPRead(type="DDLS", name="<found_projection_view>")
```

```
SAPRead(type="DDLX", name="<found_metadata_ext>")
```

```
SAPContext(type="DDLS", name="<found_interface_view>")
```

From these, extract:
- **Naming conventions**: What prefix pattern? `ZI_`/`ZC_`/`ZR_`? Entity suffix patterns? Table naming?
- **Architecture style**: Managed vs. unmanaged? Draft enabled? `strict ( 2 )` or `strict`?
- **Annotation patterns**: Which `@UI` annotation style? Header info pattern? Facet structure?
- **Field naming**: CamelCase aliases? Underscore style? Abbreviation patterns?
- **Admin field patterns**: Which timestamp/user field types are used? (`syuname` vs `abp_creation_user`, `timestampl` vs `abp_creation_tstmpl`)
- **Key strategy**: UUID (`sysuuid_x16`)? Semantic keys? Number ranges?
- **Behavior patterns**: Which determinations/validations are standard? Authorization pattern?
- **Draft handling**: `with draft` present? Draft table naming? Draft actions included?
- **OData version**: V2 or V4 bindings?

### 1c. Existing Database Tables & Domain Objects

If the user mentioned existing tables or business objects, read them:

```
SAPSearch(query="<mentioned_table_or_object>")
```

```
SAPRead(type="TABL", name="<found_table>")
```

```
SAPContext(type="TABL", name="<found_table>")
```

Also search for related SAP standard objects in the domain:

```
SAPSearch(query="<domain_keyword>", maxResults=10)
```

Check if there are existing CDS views or tables the new service should build on rather than duplicating data.

### 1d. Code Guidelines & Quality Standards

Check if the system has ATC configuration or custom check variants that indicate code quality standards:

```
SAPDiagnose(action="atc", type="CLAS", name="<any_existing_class>", variant="DEFAULT")
```

If existing RAP classes were found in 1b, run lint on one to understand the baseline:

```
SAPLint(type="CLAS", name="<found_bp_class>")
```

This reveals what lint rules and strictness levels are enforced.

### 1e. Best Practices Research — SAP Documentation

Use the SAP documentation MCP server to research current RAP best practices relevant to the user's request.

**Core RAP patterns:**

```
search("RAP managed business object implementation best practices")
```

```
search("RAP behavior definition managed scenario CDS view entity")
```

**Domain-specific patterns** (based on user's business requirement):

```
search("<business_domain> RAP example SAP")
```

For example, if the user wants a travel app:
```
search("RAP travel booking managed scenario example")
```

**Architecture decisions:**

```
search("RAP managed vs unmanaged scenario when to use")
```

```
search("RAP draft handling best practices Fiori Elements")
```

```
search("RAP compositions parent child entity")
```

**If the requirement suggests specific patterns:**

```
search("RAP custom actions determination validation")
```

```
search("RAP value help CDS annotation")
```

```
search("RAP access control authorization")
```

**SAP Notes for known issues or recommendations:**

```
sap_notes_search(q="RAP <specific_topic>")
```

### 1f. Research Summary

Before proceeding, compile a structured research summary. Present this to the user:

```
## System Research Summary

### System Profile
- Type: [BTP / On-Prem S/4HANA 20XX / ECC with ABAP Platform]
- ABAP Version: [Cloud / Standard ABAP 7.5X]
- RAP Support: [Full managed+draft / Managed only / Basic]

### Existing Code Patterns Found
- Naming: [e.g., "ZI_ prefix for interface views, ZC_ for projections, Z prefix + _D suffix for tables"]
- Architecture: [e.g., "All existing BOs use managed with draft, strict(2), UUID keys"]
- Field Style: [e.g., "CamelCase aliases, abp_ admin field types on BTP"]
- Annotation Style: [e.g., "Metadata extensions for all UI annotations, facet-based layout"]
- N existing RAP services found: [list names]

### Domain Research
- Related existing objects: [tables, views, classes found]
- SAP standard objects in domain: [relevant standard CDS views, BAPIs]
- Best practices from docs: [key findings]

### Quality Baseline
- ATC variant: [DEFAULT / custom]
- Lint findings: [clean / N issues on existing code]
- Strictness: [strict(2) / strict / none]
```

---

## Phase 2: Clarifying Questions

Based on research findings, ask targeted questions. Only ask what research couldn't answer. Group questions by category and provide recommendations based on findings.

### Architecture Questions

Present options with a recommendation based on what was found:

**1. Implementation scenario**
> Based on [finding], I recommend **managed** / **unmanaged**.
> - **Managed**: Framework handles CRUD, you focus on business logic (determinations, validations). Best for new greenfield BOs.
> - **Unmanaged**: You control all persistence. Needed when wrapping existing BAPIs/FMs or complex legacy logic.
> - **Managed with unmanaged save**: Managed BO but custom save sequence (e.g., calling a BAPI in the save phase).
>
> Which approach fits your needs?

**2. Entity structure**
> Your requirement suggests [single entity / parent-child hierarchy / multiple related entities].
> - **Single root entity**: Simple, one table, one CDS stack. Good for flat data.
> - **Compositions**: Parent-child (e.g., Order → LineItems). Draft-enabled compositions require draft tables for each entity.
> - **Associations**: Related but independent entities (e.g., Order → Customer lookup).
>
> How many entities do you need, and what are their relationships?

**3. Key strategy**
> Existing code uses [UUID / semantic keys / number ranges].
> - **UUID (internal early numbering)**: Auto-generated, no user input needed. Simplest.
> - **Semantic key**: User-provided (e.g., OrderNumber). Needs uniqueness validation.
> - **Number range**: Server-assigned sequential numbers. Needs number range object.
>
> Which key strategy fits your use case?

**4. Draft handling**
> [BTP systems typically use draft / On-prem: depends on Fiori Elements need].
> - **With draft**: Users can save incomplete data, resume editing later. Required for Fiori Elements "edit" workflow.
> - **Without draft**: Direct save only. Simpler, fewer artifacts.
>
> Do users need to save work-in-progress?

### Data Model Questions

**5. Fields and types**
> Based on your description, I've identified these business fields:
> | Field | Proposed Type | Notes |
> |-------|--------------|-------|
> | ... | ... | ... |
>
> Are these correct? Any fields to add, remove, or change types?

**6. Value helps / fixed values**
> Which fields need dropdowns or value helps?
> - Status field → fixed values (e.g., New/Open/Completed)?
> - Reference fields → value help from other CDS views?

**7. Existing data sources**
> [If tables/views were found in research]
> Should this service read from existing table `<TABLE>` or create a new table?

### Naming Questions

**8. Entity naming**
> Based on existing conventions on your system [`<pattern found>`], I propose:
> | Artifact | Name |
> |----------|------|
> | Table entity | `Z<ENTITY>_D` |
> | Interface view | `ZI_<Entity>` |
> | Projection view | `ZC_<Entity>` |
> | ... | ... |
>
> Does this align with your standards? Any name changes?

### UI / Service Questions

**9. OData version**
> [V4 is recommended / V2 if Fiori Launchpad on older system].
> Which OData version?

**10. UI layout preferences**
> For Fiori Elements, which layout pattern?
> - **List Report + Object Page** (most common): Table view → click row → detail page
> - **Worklist**: Simple table view, no object page
> - **Analytical List Page**: For reporting/analytics use cases

**11. Searchable fields**
> Which fields should be searchable (appear in the search bar)?

### Business Logic Questions (if applicable)

**12. Validations needed**
> Which business rules should be enforced?
> - Mandatory fields?
> - Cross-field validations (e.g., start date < end date)?
> - Status transition rules?

**13. Determinations needed**
> Which values should be auto-calculated?
> - Default values on create?
> - Derived fields (e.g., total = price × quantity)?

**14. Custom actions**
> Beyond standard CRUD, do you need actions like "Approve", "Release", "Cancel"?

**Important**: Don't ask all 14 questions. Research should have answered many of them. Only ask what's genuinely needed. Group remaining questions and present them concisely. Provide your recommendations for each.

Wait for the user to answer before proceeding.

---

## Phase 3: Implementation Plan

Based on research + user answers, create a detailed implementation plan.

### 3a. Design the Complete Artifact Stack

Create a comprehensive design table:

```
## RAP Service Implementation Plan: <Service Name>

### Architecture Decisions
| Decision | Choice | Rationale |
|----------|--------|-----------|
| Scenario | Managed / Unmanaged | [why] |
| Draft | Yes / No | [why] |
| Key strategy | UUID / Semantic / NumberRange | [why] |
| OData version | V4 / V2 | [why] |
| Strict mode | strict(2) / strict | [system dependent] |
| Admin fields | syuname+timestampl / abp_* types | [system dependent] |

### Entity Model
| Entity | Role | Key Fields | Business Fields |
|--------|------|-----------|-----------------|
| <Root> | Root entity | key_uuid | field1, field2, ... |
| <Child> | Composition of Root | key_uuid, parent_uuid | field_a, field_b, ... |

### Artifact Stack
| # | Type | Name | Description | Dependencies |
|---|------|------|-------------|-------------|
| 1 | DDLS | <table> | Database table entity | — |
| 2 | DDLS | <draft_table> | Draft table (if draft) | — |
| 3 | DDLS | ZI_<Entity> | Interface CDS view | #1 |
| 4 | CLAS | ZBP_I_<Entity> | Behavior pool class | #3 |
| 5 | BDEF | ZI_<Entity> | Interface behavior definition | #3, #4 |
| 6 | DDLS | ZC_<Entity> | Projection CDS view | #3 |
| 7 | BDEF | ZC_<Entity> | Projection behavior definition | #5, #6 |
| 8 | DDLX | ZC_<Entity> | Metadata extension | #6 |
| 9 | SRVD | ZSD_<Entity> | Service definition | #6 |
| 10 | SRVB | ZSB_<Entity>_V4 | Service binding (manual) | #9 |

### Field Definitions
| Field | DB Column | CDS Alias | Type | Annotations | Notes |
|-------|-----------|-----------|------|-------------|-------|
| Key | key_uuid | KeyUuid | sysuuid_x16 | @Semantics | Internal numbering |
| ... | ... | ... | ... | ... | ... |

### Behavior Definition Spec
- Scenario: managed
- Draft: with draft / without draft
- ETag: LocalLastChangedAt
- Lock: master [total etag LastChangedAt]
- Numbering: managed (KeyUuid)
- Read-only fields: KeyUuid, CreatedBy, CreatedAt, LastChangedBy, LastChangedAt, LocalLastChangedAt
- Draft actions: Resume, Edit, Activate (optimized), Discard, Prepare
- Determinations (Phase 1): [list with triggers]
- Validations (Phase 1): [list with triggers]
- Custom actions (Phase 1): [list or "none — add later"]

### UI Annotations Spec
- Header: typeName="<Entity>", title=<MainField>, description=<SecondaryField>
- Facets: [list facet structure]
- List columns: [ordered list with position, importance]
- Selection fields: [filter bar fields]
- Search fields: [searchable fields]

### Naming Convention Used
<Document which convention was followed and why — matches existing code / SAP standard / user preference>

### Quality Checks Planned
- Lint validation before each write (automatic via arc-1)
- Syntax check after each activation
- ATC check after full stack activation
- [If behavior logic]: Unit test skeleton
```

### 3b. Present Plan for Approval

Present the plan clearly and ask:

> **Implementation Plan Ready**
>
> I've designed a [managed/unmanaged] RAP service with [N] entities, [with/without] draft, using [naming convention].
>
> [Show the Artifact Stack table and Field Definitions table]
>
> **Please review:**
> 1. Are the artifact names correct?
> 2. Are the fields complete and correctly typed?
> 3. Is the architecture (managed/draft/keys) what you need?
> 4. Any changes before I start creating?
>
> **Say "approve" to proceed, or tell me what to change.**

Do NOT proceed until the user explicitly approves.

---

## Phase 4: Implementation

After approval, create the artifacts. Use batch creation when possible.

### 4a. Batch Creation (Preferred)

If the system supports it and the artifact stack is straightforward:

```
SAPWrite(action="batch_create", objects=[
  {type: "DDLS", name: "<table>", description: "<desc>", source: "<ddl>"},
  {type: "DDLS", name: "ZI_<entity>", description: "<desc>", source: "<ddl>"},
  {type: "DDLS", name: "ZC_<entity>", description: "<desc>", source: "<ddl>"},
  {type: "BDEF", name: "ZI_<entity>", description: "<desc>", source: "<bdef>"},
  {type: "BDEF", name: "ZC_<entity>", description: "<desc>", source: "<bdef>"},
  {type: "DDLX", name: "ZC_<entity>", description: "<desc>", source: "<ddlx>"},
  {type: "SRVD", name: "ZSD_<entity>", description: "<desc>", source: "<srvd>"},
  {type: "CLAS", name: "ZBP_I_<entity>", description: "<desc>", source: "<class>"}
], package="<package>", transport="<transport>")
```

Objects are created in array order — put dependencies first.

### 4b. Sequential Fallback

If batch creation fails or the stack is complex (compositions, multiple entities), create sequentially following the dependency order from the plan:

1. **Table entity/entities** → Create + Activate each
2. **Draft table(s)** (if draft) → Create + Activate each
3. **Interface CDS view(s)** → Create + Activate each
4. **Behavior pool class(es)** → Create + Activate
5. **Interface behavior definition(s)** → Create (do NOT activate individually — depends on class)
6. **Projection CDS view(s)** → Create + Activate
7. **Projection behavior definition(s)** → Create (do NOT activate individually)
8. **Metadata extension(s)** → Create + Activate
9. **Service definition** → Create + Activate

After all artifacts are created, batch activate the interdependent ones:

```
SAPActivate(objects=[
  {type: "CLAS", name: "ZBP_I_<entity>"},
  {type: "BDEF", name: "ZI_<entity>"},
  {type: "BDEF", name: "ZC_<entity>"}
])
```

### 4c. Source Code Templates

Use the source code templates from the plan. Adapt them based on research findings:

- **BTP systems**: Use `abp_*` admin field types, ABAP Cloud syntax, `strict ( 2 )`
- **On-Prem systems**: Use `syuname`/`timestampl` types, classic or Cloud syntax depending on what existing code uses
- **Follow existing patterns**: If existing RAP projects use a specific annotation style or field naming pattern, match it exactly
- **Draft**: Include draft table, draft actions in interface BDEF, `use draft` in projection BDEF

### 4d. Post-Creation Validation

After all artifacts are created and activated:

1. **Syntax check** the behavior pool:
   ```
   SAPDiagnose(action="syntax", type="CLAS", name="ZBP_I_<entity>")
   ```

2. **ATC check** the full stack (if ATC is available):
   ```
   SAPDiagnose(action="atc", type="BDEF", name="ZI_<entity>")
   ```

3. **Read back** key artifacts to confirm they're correct:
   ```
   SAPRead(type="BDEF", name="ZI_<entity>")
   SAPRead(type="DDLS", name="ZI_<entity>")
   SAPRead(type="SRVD", name="ZSD_<entity>")
   ```

4. **Lint check** the behavior pool:
   ```
   SAPLint(type="CLAS", name="ZBP_I_<entity>")
   ```

Fix any issues found. Re-activate if needed.

### 4e. Service Binding

ARC-1 cannot create service bindings (SRVB) via ADT API. Instruct the user:

> **Manual step required: Create Service Binding**
>
> In ADT:
> 1. Right-click package → New → Other ABAP Repository Object
> 2. Search "Service Binding" → Next
> 3. Name: `ZSB_<ENTITY>_V4`
> 4. Description: `<Entity> OData V4 Service`
> 5. Binding Type: OData V4 - UI
> 6. Service Definition: `ZSD_<ENTITY>`
> 7. Finish → Activate

After the user creates and activates the binding:

```
SAPActivate(action="publish_srvb", name="ZSB_<entity>_V4")
```

```
SAPRead(type="SRVB", name="ZSB_<entity>_V4")
```

---

## Phase 5: Verification & Summary

### 5a. Final Verification Checklist

```
RAP Service Generation Complete!

## Architecture
- Scenario: [managed/unmanaged]
- Draft: [enabled/disabled]
- Key strategy: [UUID/semantic/number range]
- OData version: [V4/V2]
- Followed conventions from: [existing code / SAP standard]

## Created Artifacts
  [x] Database table entity: <table_name>
  [x] Draft table entity: <draft_table> (if applicable)
  [x] Interface CDS view: ZI_<Entity>
  [x] Interface behavior definition: ZI_<Entity>
  [x] Projection CDS view: ZC_<Entity>
  [x] Projection behavior definition: ZC_<Entity>
  [x] Metadata extension: ZC_<Entity>
  [x] Service definition: ZSD_<Entity>
  [x] Behavior pool class: ZBP_I_<Entity>
  [ ] Service binding: ZSB_<Entity>_V4 → create manually (see above)

## Quality Checks
  [x] All artifacts activated successfully
  [x] Syntax check: clean
  [x] Lint check: clean
  [x] ATC check: [clean / N findings noted]

## Consistency with Existing Code
  [x] Naming matches existing convention: [pattern]
  [x] Annotation style matches: [pattern]
  [x] Admin fields match: [pattern]
```

### 5b. Next Steps

Offer follow-up actions based on the plan:

```
## Recommended Next Steps

1. **Create service binding** (manual step above)
2. **Publish and test** the service in Fiori Elements preview
3. **Add business logic** → use `generate-rap-logic` skill:
   - Determinations: [list from plan]
   - Validations: [list from plan]
4. **Add value helps** for reference fields
5. **Add access control** (DCLS) for authorization
6. **Add custom actions** if needed (e.g., Approve, Release)
7. **Generate unit tests** → use `generate-abap-unit-test` skill
8. **Add compositions** for child entities (if multi-entity scenario planned for Phase 2)
```

---

## Error Recovery

### If Research Finds No Existing RAP Projects

This is fine — the system may be new to RAP. Fall back to SAP standard naming conventions and best practices from documentation. Note this in the plan:

> "No existing RAP projects found on system. Using SAP standard naming conventions and current best practices from documentation."

### If System Doesn't Support Required Features

If research reveals the system lacks a feature the user needs (e.g., draft on old on-prem, table entities pre-7.55):

1. Inform the user of the limitation
2. Propose an alternative (e.g., classic DDIC table instead of table entity, without draft)
3. Adjust the plan accordingly

### If Batch Creation Fails

Fall back to sequential creation (Phase 4b). Report which objects succeeded and which failed. Fix the failing object and retry.

### Common Issues

| Error | Cause | Fix |
|---|---|---|
| Object already exists | Name collision | Search existing object, propose different name or offer to update |
| Feature not supported | System version too old | Adapt plan to available features |
| Activation error | Dependency order wrong | Use batch activation or sequential in dependency order |
| Lint blocks write | Code doesn't match lint rules | Adjust generated code to pass lint, or check if lint config is too strict |
| BDEF syntax error | Wrong field aliases or entity references | Cross-check CDS aliases with BDEF field references |

---

## Notes

### Philosophy

This skill prioritizes **correctness and consistency** over speed. The extra research time (5-10 minutes) pays off by:
- Avoiding naming conflicts with existing code
- Following established team conventions automatically
- Catching system limitations before hitting errors
- Producing code that looks like it belongs in the codebase
- Giving the user confidence in the architecture before committing

### What This Skill Does NOT Do (yet)

- **Multi-entity compositions** in a single run (plan them, create root entity, suggest Phase 2)
- **Unmanaged save** implementation (plan it, implement the managed wrapper, note the save handler as a follow-up)
- **Custom CDS functions/actions** (plan them, implement standard CRUD, add as follow-up)
- **Fiori app generation** (generates the OData service; Fiori Elements app is auto-generated from annotations)

### Relationship to Other Skills

| Skill | Relationship |
|---|---|
| `generate-rap-service` | Vibe code version — faster, less thorough, good for prototypes |
| `generate-rap-logic` | Natural follow-up — implement determinations/validations identified in the plan |
| `generate-abap-unit-test` | Follow-up — generate tests for the behavior pool |
| `explain-abap-code` | Can be used during research to understand existing RAP projects found on the system |
| `implement-feature` | For implementing non-RAP features in the arc-1 codebase itself |
