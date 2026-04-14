# Generate RAP OData Service — Research-First

Generate a production-quality RAP OData service through deep system research, best-practice analysis, and iterative planning before writing a single line of code.

This skill produces an implementation plan informed by the target SAP system's actual capabilities, existing code patterns, SAP documentation, and user requirements — then executes it only after explicit user approval.

## Smart Defaults (apply silently, do NOT ask before research)

| Setting | Default | Rationale |
|---|---|---|
| Package | User's Z* package with transport | Production-ready; only use `$TMP` if user explicitly asks |
| Key strategy | UUID (`sysuuid_x16`), managed numbering | Simplest, no collision risk |
| Behavior scenario | Managed | Framework handles CRUD, most common |
| OData version | V4 | Current SAP standard |
| Draft | Yes on BTP, No on-prem | BTP Fiori Elements expects draft |
| Strict mode | `strict ( 2 )` | Current RAP best practice |
| Naming | SAP standard (see reference section) | Overridden by existing system patterns if found |
| Admin fields | System-appropriate (`syuname`/`timestampl` or `abp_*`) | Detected from system type |

These defaults are starting points — research in Phase 1 may override them based on existing system patterns.

## Input

The user provides a natural language description of the business requirement. This can range from vague ("I need something to track maintenance orders") to detailed ("REST API for plant maintenance with equipment hierarchy, work orders, and time recording").

Only the **business requirement** is required. Gather initial context — do NOT over-interview at this stage. Research will surface the right questions later.

Optionally, the user may specify:
- **Package** (required — ask if not provided; only default to `$TMP` if user explicitly says so)
- **Transport request** (only needed for non-`$TMP` packages — resolved in Phase 1-pre)
- **Any known constraints** (e.g., "must use existing table ZMAINT_ORDER", "needs to integrate with PM module")

If the user provides just a description, proceed directly to research. Questions come AFTER research, when you know enough to ask the right ones.

---

## Phase 1-pre: Resolve Package and Transport

Ask the user for their target package if not provided. Then resolve the transport request (skip only if package is `$TMP`):

```
SAPTransport(action="check", objectType="DDLS", objectName="<placeholder_name>", package="<package>")
```

This checks if a transport is required and returns existing transports for the package. If a transport is required:

1. **User provided a transport**: Use it for all creates
2. **Existing transport found**: Present the list and ask the user to pick one
3. **No transport available**: Create one:
   ```
   SAPTransport(action="create", description="RAP Service: <Entity>", package="<package>")
   ```

**If transport is required but unavailable, STOP** — all write operations will fail without a valid transport for non-`$TMP` packages.

---

## Phase 1: Deep System Research

Research the target system thoroughly before designing anything. Every finding informs the plan.

### 1a. System Capabilities & Version

Detect what the system supports — this determines available RAP features, syntax, and patterns.

```
SAPManage(action="probe")
```

**Note:** `rap.available` in the probe response is informational — it indicates whether the DDL source endpoint was detected, but RAP may still be available. Proceed with creation and handle errors if they occur.

Extract and note:
- **System type**: BTP ABAP Environment vs. On-Premise (and release level: 7.52, 7.54, 7.57, S/4HANA 2020+, etc.)
- **ABAP language version**: Cloud (strict, released APIs only) vs. Standard (full ABAP)
- **RAP support level**: Managed, unmanaged, abstract BOs? Draft support? Late numbering? Determination on modify vs. save?
- **CDS capabilities**: View entities vs. classic views? Table entities? Metadata extensions? Access control?
- **Available features**: ATC, syntax check, unit test runner, transport management, FLP customization
- **FLP support**: If `flp` feature is available, the service can be registered in the Fiori Launchpad after creation

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

If building on existing objects on a BTP system, check their API release state for Clean Core compliance:

```
SAPRead(type="API_STATE", name="<found_table_or_view>", objectType="TABL")
```

If an object is deprecated (C2) or not released, avoid building on it — search for its released successor instead.

To understand what already depends on a found object (reverse dependency):

```
SAPContext(type="DDLS", name="<found_view>", action="usages")
```

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

Use the SAP documentation MCP server to research current RAP best practices relevant to the user's request. The search terms below are **starting suggestions** — adapt them based on the user's specific business requirement and the architecture decisions that need to be made. Craft search queries that target the gaps in your knowledge for this particular service.

**Example search terms** (adapt to the user's spec):

```
search("RAP managed business object implementation best practices")
search("RAP behavior definition managed scenario CDS view entity")
```

**Domain-specific** — tailor to the user's business domain:

```
search("<business_domain> RAP example SAP")
```

For example, if the user wants a travel app: `search("RAP travel booking managed scenario example")`

**Architecture decisions** — search only for topics relevant to this service:

```
search("RAP managed vs unmanaged scenario when to use")
search("RAP draft handling best practices Fiori Elements")
search("RAP compositions parent child entity")
```

**Specific patterns** — search if the requirement suggests them:

```
search("RAP custom actions determination validation")
search("RAP value help CDS annotation")
search("RAP access control authorization")
```

**Important:** Don't just run these searches verbatim. Analyze the user's spec and craft targeted queries that fill specific knowledge gaps. If the user asks for something unusual (e.g., integration with a specific SAP module, specific field types, custom numbering), search for those specifics.

No need to research naming conventions at runtime — the official SAP naming schema is documented below in the "SAP Official Naming Conventions" reference section. Use it directly as the default.

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

For each question, lead with a concrete recommendation based on the user's spec and research, explain why, then list alternatives with upsides/downsides. **These are foundational decisions — changing them after creation requires rebuilding most artifacts.** Make sure the user understands the trade-offs.

**1. Implementation scenario**
> Based on your spec [quote relevant part], I would suggest **managed** because [reason — e.g., "this is a new greenfield BO with no existing persistence logic to wrap"].
>
> Your options:
> | Option | Upside | Downside |
> |--------|--------|----------|
> | **Managed** | Framework handles CRUD automatically, less code, faster to build | Less control over persistence, must follow RAP conventions |
> | **Unmanaged** | Full control over persistence, can wrap existing BAPIs/FMs | You must implement all CRUD yourself, significantly more code |
> | **Managed with unmanaged save** | Managed convenience + custom save (e.g., call BAPI in save phase) | More complex, need to understand save sequence |
>
> Does managed fit, or do you need to wrap existing logic?

**2. Entity structure**
> Based on your spec [quote relevant part], I would suggest **[single entity / compositions]** because [reason — e.g., "your description mentions line items which is a classic parent-child pattern"].
>
> Your options:
> | Option | Upside | Downside |
> |--------|--------|----------|
> | **Single root entity** | Simplest, one table, one CDS stack | Cannot model hierarchies |
> | **Compositions (parent → child)** | Models real business hierarchies (Order → Items), draft cascades to children | Each child entity needs its own table + draft table + CDS stack |
> | **Associations** | Lightweight references to related entities (e.g., lookup to Customer) | No lifecycle dependency, no cascade delete |
>
> How many entities do you need and what are their relationships?

**3. Key strategy**
> Based on your spec, I would suggest **UUID (internal early numbering)** because [reason — e.g., "there's no mention of a user-visible business key, and UUID is the simplest and most reliable approach"].
>
> Your options:
> | Option | Upside | Downside |
> |--------|--------|----------|
> | **UUID (internal early numbering)** | Auto-generated, no user input, no collision risk, simplest | Keys are not human-readable |
> | **Semantic key** | User-provided meaningful key (e.g., OrderNumber) | Needs uniqueness validation, user must know the key upfront |
> | **Number range** | Server-assigned sequential numbers, human-readable | Needs number range object configuration, more setup |
>
> Which key strategy fits your use case?

**4. OData version & draft**
> I recommend **OData V4 with draft** because V4 is the current SAP standard for Fiori Elements applications and draft is the default interaction pattern for V4 transactional services.
>
> **Important context on OData V2 vs V4 and draft:**
> - **V4 + draft** (recommended default): Standard for Fiori Elements List Report / Object Page. Draft is essentially built-in — V4 transactional services expect draft.
> - **V2 without draft**: Better suited for non-draft transactional apps and SAP UI5 freestyle applications. V2 is more common in the freestyle world and has broader legacy support.
> - **V4 without draft**: Not a standard pattern — V4 transactional services are designed around draft. Possible for read-only analytical services, but not for CRUD apps.
> - **V2 with draft**: Supported but less common. Use only if V2 is required and draft is needed.
>
> Unless your requirements specifically suggest a non-draft or freestyle app, V4 with draft is the right choice. Is there any reason to deviate?

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

**7b. Proper DDIC typing (production services)**
> For production-quality services, I can create **proper domains (DOMA) and data elements (DTEL)** instead of using inline types. This enables:
> - Reusable field types across multiple tables/views
> - Fixed value lists on domains (e.g., status domain with A=Active, I=Inactive)
> - Consistent field labels (short/medium/long/heading) across all UIs
> - Search help attachments on data elements
>
> For `$TMP` prototypes, inline types are fine. For transportable packages, proper DOMA/DTEL is recommended.
> Want me to create dedicated domains and data elements for the business fields?

### Naming Questions

**8. Entity naming**
> I'm using the **official SAP naming conventions** (see reference section below). For an entity named e.g. `Travel`:
>
> | Artifact | SAP Convention | Proposed Name |
> |----------|---------------|---------------|
> | Active persistence table | `A_` prefix | `ZA_TRAVEL` |
> | Draft table | `D_` prefix | `ZD_TRAVEL` |
> | Base/interface CDS view | `R_` or `I_` prefix, `TP` suffix | `ZR_TravelTP` |
> | Projection CDS view | `C_` prefix | `ZC_Travel` |
> | Interface BDEF | Same as root entity | `ZR_TravelTP` |
> | Projection BDEF | Same as projection view | `ZC_Travel` |
> | Metadata extension | Same as CDS entity it annotates | `ZC_Travel` |
> | Service definition | `UI_` prefix (if UI service) | `ZUI_Travel` |
> | Service binding | `UI_` prefix, `_O4` suffix | `ZUI_Travel_O4` |
> | Behavior pool class | `BP_` prefix | `ZBP_R_TravelTP` |
>
> [If different patterns were found on the system]: Note: I found existing RAP projects on your system using a different convention (`<pattern found>`). I'm defaulting to SAP standard naming, but if you prefer to match the existing system-wide convention, or use a completely different one, let me know.
>
> Any name changes?

### UI / Service Questions

**9. Fiori Elements frontend**
> Will this service be consumed by a **Fiori Elements** app (auto-generated UI from annotations)?
>
> If yes, the metadata extension (DDLX) and UI annotations in the plan will be optimized for Fiori Elements List Report + Object Page (the most common pattern).
>
> **Note**: ARC-1 currently does not generate the Fiori Elements frontend application itself — only the backend OData service with proper annotations. The Fiori app can be generated from ADT ("Create Fiori Project..." on the service binding) or via the SAP Fiori tools in VS Code. The plan will include guidance on this as a follow-up step.
>
> If no (freestyle UI5 app or non-UI consumer), we can simplify the annotations.

**10. Searchable fields**
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
| 10 | SRVB | ZSB_<Entity>_V4 | Service binding (manual in ADT) | #9 |

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

Present the plan clearly and ask. **Emphasize that changes after creation are significantly harder:**

> **Implementation Plan Ready**
>
> I've designed a [managed/unmanaged] RAP service with [N] entities, [with/without] draft, using [naming convention].
>
> [Show the Artifact Stack table and Field Definitions table]
>
> **⚠️ Important: Please review carefully before approving.** Once the artifacts are created on the SAP system, changing fundamental decisions (managed vs. unmanaged, key strategy, entity structure, draft yes/no) requires deleting and recreating most artifacts. It is **much easier to change the plan now** than to restructure after creation. If anything is unclear or you're unsure about a decision, ask now.
>
> **Please review:**
> 1. Are the artifact names correct?
> 2. Are the fields complete and correctly typed?
> 3. Is the architecture (managed/draft/keys) what you need?
> 4. Any questions about the design decisions?
> 5. Any changes before I start creating?
>
> **Say "approve" to proceed, or ask questions / tell me what to change.**

Do NOT proceed until the user explicitly approves.

---

## Phase 4: Implementation

After approval, create the artifacts. Use batch creation when possible.

**Fail fast:** If the first DDLS/BDEF write fails with 415 or 500, stop all further CDS writes immediately. Do not retry with different types — the underlying issue is system-level, not object-specific. Run `SAPManage(action="probe")` to verify `rap.available` status.

### 4-pre. Pre-Implementation Check

Before creating artifacts, optionally check for lingering inactive objects that might cause conflicts:

```
SAPRead(type="INACTIVE_OBJECTS")
```

**Note:** This may return 404 on some systems where the `/sap/bc/adt/activation/inactive` endpoint is not available. If so, skip this check and proceed — it's a convenience check, not a requirement.

If inactive objects with conflicting names exist, resolve them first (activate or delete).

### 4-doma. Create Domains and Data Elements (if approved in Phase 2)

If the user opted for proper DDIC typing, create domains and data elements before the table entity:

```
SAPWrite(action="create", type="DOMA", name="Z<DOMAIN>", package="<package>", transport="<transport>",
  dataType="CHAR", length=1, fixedValues=[{low:"A", description:"Active"}, {low:"I", description:"Inactive"}])
```

```
SAPWrite(action="create", type="DTEL", name="Z<DATAELEMENT>", package="<package>", transport="<transport>",
  typeKind="domain", dataType="Z<DOMAIN>", labels={short:"Status", medium:"Object Status", long:"Object Status", heading:"Status"})
```

```
SAPActivate(objects=[{type:"DOMA", name:"Z<DOMAIN>"}, {type:"DTEL", name:"Z<DATAELEMENT>"}])
```

Then reference the data elements in the table entity DDL instead of inline types (e.g., `status : z<dataelement>` instead of `status : abap.char(1)`).

### 4a. Batch Creation (Preferred)

If the system supports it and the artifact stack is straightforward:

```
SAPWrite(action="batch_create", objects=[
  {type: "TABL", name: "<table>", description: "<desc>", source: "<ddl>"},
  {type: "DDLS", name: "ZI_<entity>", description: "<desc>", source: "<ddl>"},
  {type: "DDLS", name: "ZC_<entity>", description: "<desc>", source: "<ddl>"},
  {type: "BDEF", name: "ZI_<entity>", description: "<desc>", source: "<bdef>"},
  {type: "BDEF", name: "ZC_<entity>", description: "<desc>", source: "<bdef>"},
  {type: "DDLX", name: "ZC_<entity>", description: "<desc>", source: "<ddlx>"},
  {type: "SRVD", name: "ZSD_<entity>", description: "<desc>", source: "<srvd>"},
  {type: "CLAS", name: "ZBP_I_<entity>", description: "<desc>", source: "<class>"},
  {type: "SRVB", name: "ZSB_<entity>_V4", description: "<desc>", serviceDefinition: "ZSD_<entity>", bindingType: "ODataV4-UI"}
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

**Note:** Activation returns structured responses with detailed error/warning messages including line numbers and URIs. Errors block activation; warnings allow it but should be reviewed. Use this information to pinpoint exact issues rather than re-reading full source.

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

3. **Verify no inactive objects remain** (may return 404 on some systems — skip if so):
   ```
   SAPRead(type="INACTIVE_OBJECTS")
   ```

4. **Read back** key artifacts to confirm they're correct:
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

### 4e. Create and Publish Service Binding

Create the service binding:

```
SAPWrite(action="create", type="SRVB", name="ZSB_<entity>_V4", package="<package>", transport="<transport>",
  serviceDefinition="ZSD_<entity>", bindingType="ODataV4-UI", description="<Entity> OData V4 Service")
```

Activate the service binding:

```
SAPActivate(type="SRVB", name="ZSB_<entity>_V4")
```

Publish the service binding (makes the OData service available):

```
SAPActivate(action="publish_srvb", name="ZSB_<entity>_V4")
```

Verify the publish status and service URL:

```
SAPRead(type="SRVB", name="ZSB_<entity>_V4")
```

⚠️ **CHECKPOINT**: Verify the SRVB read shows `published: true` and a service URL. If not published, retry `publish_srvb`.

### 4f. Preview the Service

After the service binding is published, the RAP service can be previewed directly. In ADT, the user can open the service binding, select an entity (e.g., "Root"), and click "Preview..." to launch the Fiori Elements preview in a browser. This generates a preview URL via the ADT business services endpoint.

Inform the user:

> **Your service is live!** Open the service binding `ZSB_<ENTITY>_V4` in ADT, select the root entity, and click "Preview..." to see the auto-generated Fiori Elements List Report + Object Page.

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
  [x] Service binding: ZSB_<Entity>_V4
  [x] Service binding published

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

1. **Preview the service** in Fiori Elements (ADT → Service Binding → select entity → Preview...)
2. **Add business logic** → use `generate-rap-logic` skill:
   - Determinations: [list from plan]
   - Validations: [list from plan]
3. **Add value helps** for reference fields
4. **Add access control (DCL)** for authorization — must be created manually in ADT (ARC-1 DCL support pending FEAT-37)
5. **Add custom actions** if needed (e.g., Approve, Release)
6. **Generate unit tests** → use `generate-abap-unit-test` skill
7. **Add compositions** for child entities (if multi-entity scenario planned for Phase 2)
8. **Register in FLP** (if FLP feature available) → use SAPManage:
   - `SAPManage(action="flp_create_catalog", catalogId="Z_<ENTITY>_C", title="<Entity> Catalog")`
   - `SAPManage(action="flp_create_tile", catalogId="Z_<ENTITY>_C", tile={id:"Z_<ENTITY>_T", title:"<Entity>", semanticObject:"<Entity>", semanticAction:"manage"})`
   - `SAPManage(action="flp_create_group", groupId="Z_<ENTITY>_G", title="<Entity>")`
   - `SAPManage(action="flp_add_tile_to_group", groupId="Z_<ENTITY>_G", catalogId="Z_<ENTITY>_C", tileId="Z_<ENTITY>_T")`
9. **Create DOMA/DTEL** (if not done in Phase 4) for proper reusable typing
10. **Release transport** (if transportable package) → use `SAPTransport(action="release_recursive", transport="<TR>")` to release tasks and parent in one step
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
| 415 Unsupported Media Type on DDLS/BDEF | RAP/CDS endpoint not responding as expected | Check `SAPManage(action="probe")` for system info. Verify ICF service activation. Try creating the object in ADT to confirm system capability. |
| Object already exists | Name collision | Search existing object, propose different name or offer to update |
| Feature not supported | System version too old | Adapt plan to available features |
| Activation error | Dependency order wrong | Use batch activation or sequential in dependency order |
| Lint blocks write | Code doesn't match lint rules | Adjust generated code to pass lint, or check if lint config is too strict |
| BDEF syntax error | Wrong field aliases or entity references | Cross-check CDS aliases with BDEF field references |
| Transport required | Non-$TMP package without transport | Use `SAPTransport(action="check")` to find or create a transport — see Phase 1-pre |
| Lock conflict on create | Object locked by another user/transport | Wait or use a different name; check `SAPTransport(action="list")` for conflicting transports |

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
- **Access control (DCL)** — ARC-1 does not yet support DCL read/write (FEAT-37). Create manually in ADT. This is the main gap for a fully automated e2e RAP stack.

### Relationship to Other Skills

| Skill | Relationship |
|---|---|
| `generate-rap-service` | Vibe code version — faster, less thorough, good for prototypes |
| `generate-rap-logic` | Natural follow-up — implement determinations/validations identified in the plan |
| `generate-abap-unit-test` | Follow-up — generate tests for the behavior pool |
| `explain-abap-code` | Can be used during research to understand existing RAP projects found on the system |
| `implement-feature` | For implementing non-RAP features in the arc-1 codebase itself |

---

## Reference: SAP Official Naming Conventions for RAP Artifacts

Source: [SAP Help — Naming Conventions for Development Objects](https://help.sap.com/docs/ABAP_Cloud/f055b8bf582d4f34b91da667bc1fcce6/8b8f9d8f3cb948b2841d6045a255e503.html)

### General Rule

```
[/<namespace>/][<prefix>]_<object_name>_[<suffix>]
```

- Use your own namespace reserved for your organization (Z* or Y* for customer objects)
- The `/DMO/` namespace is reserved for SAP demo purposes only — never use it in productive development
- Prefixes convey semantic differences between types of the same object kind
- Suffixes add secondary differentiation (e.g., OData version, development guide variant)

### ABAP Dictionary Objects

| Object | Convention | Example (customer namespace) |
|--------|-----------|------------------------------|
| **Active persistence table** | `A_` prefix | `ZA_TRAVEL` |
| **Draft table** | `D_` prefix | `ZD_TRAVEL` |

### CDS Objects

| Object | Convention | Notes | Example |
|--------|-----------|-------|---------|
| **Base/Root CDS view entity** | `R_` prefix | The base BO entity. Use `TP` suffix to indicate transactional processing relevance | `ZR_TravelTP` |
| **Interface CDS view** | `I_` prefix | Reusable interface view layer (alternative to R_ in some patterns) | `ZI_Travel` |
| **Projection CDS view** | `C_` prefix | `C` = consumption layer. If multiple projections exist, the name should represent the projection role | `ZC_Travel` |
| **Extension include view** | `E_` prefix | For extensibility | `ZE_Travel` |
| **Behavior definition** | Same name as root entity | BDEF always shares the name of the CDS view it belongs to | `ZR_TravelTP` (interface), `ZC_Travel` (projection) |
| **Metadata extension** | Same name as CDS entity | If multiple extensions for one entity, add numbered suffix | `ZC_Travel`, `ZC_Travel_2` |

### Business Services

| Object | Convention | Notes | Example |
|--------|-----------|-------|---------|
| **Service definition** | No mandatory prefix | If not reused across UI/API, may use `UI_` or `API_` prefix | `ZUI_Travel` or `Z_Travel` |
| **Service binding (UI)** | `UI_` prefix | For Fiori Elements / UI consumption | `ZUI_Travel_O4` |
| **Service binding (Web API)** | `API_` prefix | For programmatic / integration consumption | `ZAPI_Travel_O4` |
| **OData V2 suffix** | `_O2` | | `ZUI_Travel_O2` |
| **OData V4 suffix** | `_O4` | | `ZUI_Travel_O4` |

### Source Code Objects

| Object | Convention | Notes | Example |
|--------|-----------|-------|---------|
| **Behavior pool class** | `BP_` prefix | Global class implementing BO behavior | `ZBP_R_TravelTP` |
| **Local handler class** | `LHC_` prefix | Local class within behavior pool | `LHC_Travel_Create` |
| **Local saver class** | `LSC_` prefix | Local class within behavior pool | `LSC_Travel` |

### Complete Example: "Travel" Entity (V4, UI, Draft, Managed)

| # | Object Type | SAP Naming | Name |
|---|-------------|-----------|------|
| 1 | Database table (active) | `A_` prefix | `ZA_TRAVEL` |
| 2 | Database table (draft) | `D_` prefix | `ZD_TRAVEL` |
| 3 | Base CDS view entity | `R_` prefix + `TP` suffix | `ZR_TravelTP` |
| 4 | Projection CDS view | `C_` prefix | `ZC_Travel` |
| 5 | Interface BDEF | = root entity name | `ZR_TravelTP` |
| 6 | Projection BDEF | = projection view name | `ZC_Travel` |
| 7 | Metadata extension | = projection view name | `ZC_Travel` |
| 8 | Service definition | `UI_` prefix (optional) | `ZUI_Travel` |
| 9 | Service binding | `UI_` prefix + `_O4` suffix | `ZUI_Travel_O4` |
| 10 | Behavior pool class | `BP_` prefix | `ZBP_R_TravelTP` |

### Notes on R_ vs I_ Prefix

- **`R_`** (base/root view entity): Used in the SAP standard RAP development guides (managed, unmanaged, draft). This is the **current SAP recommendation** for new RAP development.
- **`I_`** (interface view): Historically used and still common. Represents a reusable interface layer. Many existing tutorials and older projects use `I_` instead of `R_`.
- Both are valid. Default to `R_` for new projects following SAP's latest guides. If existing code on the system uses `I_`, match that for consistency.

### Notes on Table Naming

- SAP uses `A_` and `D_` prefixes for active and draft tables respectively
- Some older tutorials and community patterns use `_D` suffix for the table and `_DD` for draft — this is **not** the official SAP convention but is widely seen in practice
- The SAP "OData UI Service from Scratch" wizard generates tables with these prefixes automatically
