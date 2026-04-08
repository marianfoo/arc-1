# Generate RAP OData UI Service from Scratch

Generate a complete RAP (RESTful ABAP Programming Model) OData UI service from a natural language description. Creates all artifacts: database table, CDS interface view, CDS projection view, metadata extension, behavior definition, service definition, and service binding.

This skill replicates SAP Joule's "OData UI Service from Scratch" capability by combining ARC-1 (SAP system access) with mcp-sap-docs (documentation & best practices).

## Scope and Guardrails (v1)

This skill generates **managed RAP business objects** with strict guardrails:

- **Managed scenario only** — no unmanaged or abstract BOs
- **UUID internal early numbering** — all root entities use `sysuuid_x16` as primary key
- **Single root entity** — no compositions or child entities in v1
- **Standard CRUD only** — create, update, delete (no custom actions, determinations, or validations)
- **Draft optional** — user can choose transactional with or without draft handling
- **Read-only optional** — user can request a read-only projection
- **OData V4 preferred** — V2 available on on-premise if needed

These guardrails match SAP Joule's limitations and ensure reliable generation.

## Input

The user provides a natural language description of the business object. Ask the user for:

- **Business object description** (required) — e.g., "a travel booking app with fields for customer, destination, dates, and price"
- **Entity name prefix** (optional — default: auto-generate from description, Z namespace)
- **Package** (optional — default: `$TMP`)
- **Transport request** (optional — only if package is transportable)
- **Draft enabled?** (optional — default: yes on BTP, ask on on-premise)
- **OData version** (optional — default: V4)

If the description is vague (e.g., "make a RAP service"), ask 1-2 targeted questions about the business domain and key fields. Don't over-interview.

## Step 1: Check System Capabilities

Before generating anything, verify the target system supports RAP.

```
SAPManage(action="features")
```

Check:
- `systemType` — determines BTP vs on-premise (affects naming, language version, available features)
- RAP/CDS feature — must be available
- Draft support — if user wants draft, verify it's available

If RAP is unavailable, stop and inform the user.

### BTP vs On-Premise Differences

| Aspect | BTP ABAP Environment | On-Premise (7.55+) |
|--------|---------------------|---------------------|
| Namespace | Z*/Y* only | Z*/Y* (custom namespace possible) |
| Language version | ABAP Cloud only | Standard ABAP |
| SRVB creation | Via ADT (may need manual step) | Via ADT |
| Draft tables | Managed automatically | Need explicit draft table definition |
| OData version | V4 preferred | V2 or V4 |
| Access control | Recommended | Optional |

## Step 2: Design the Data Model

Based on the user's description, design the complete artifact stack. Use this naming convention:

| Artifact | Naming Pattern | Example |
|----------|---------------|---------|
| Database table | `Z<ENTITY>_D` | `ZTRAVEL_D` |
| Interface CDS view | `ZI_<Entity>` | `ZI_TRAVEL` |
| Projection CDS view | `ZC_<Entity>` | `ZC_TRAVEL` |
| Metadata extension | `ZC_<Entity>` (same as projection) | `ZC_TRAVEL` |
| Behavior definition (interface) | `ZI_<Entity>` (same as interface view) | `ZI_TRAVEL` |
| Behavior definition (projection) | `ZC_<Entity>` (same as projection) | `ZC_TRAVEL` |
| Service definition | `ZSD_<Entity>` | `ZSD_TRAVEL` |
| Service binding | `ZSB_<Entity>_V4` | `ZSB_TRAVEL_V4` |
| Behavior pool (class) | `ZBP_I_<Entity>` | `ZBP_I_TRAVEL` |

### Field Design Rules

1. **Primary key**: Always `sysuuid_x16` (RAW 16) with `@Semantics.systemField: #key` — UUID internal early numbering
2. **Admin fields**: Always include `created_by`, `created_at`, `last_changed_by`, `last_changed_at`, `local_last_changed_at`
3. **Business fields**: Derive from user description, using appropriate ABAP types:
   - Strings: `abap.char(N)` or `abap.string`
   - Numbers: `abap.int4`, `abap.dec(P,S)`, `abap.curr(P,S)`
   - Dates: `abap.dats` (date), `abap.tims` (time)
   - Amounts: `abap.curr(15,2)` with currency key field `abap.cuky(5)`
   - Status fields: `abap.char(1)` with fixed values
4. **Draft fields**: If draft enabled, add `abap.timestampl` for `local_last_changed_at` (needed for draft ETag)

### Present the Design to the User

Before creating anything, present a summary:

```
RAP Service Design for "Travel Booking":

Artifacts to create:
  1. Table:      ZTRAVEL_D (persistent table)
  2. CDS View:   ZI_TRAVEL (interface view — data model + behavior)
  3. CDS View:   ZC_TRAVEL (projection view — UI consumption)
  4. DDLX:       ZC_TRAVEL (metadata extension — Fiori annotations)
  5. BDEF:       ZI_TRAVEL (behavior definition — managed, draft)
  6. BDEF:       ZC_TRAVEL (projection behavior)
  7. SRVD:       ZSD_TRAVEL (service definition)
  8. SRVB:       ZSB_TRAVEL_V4 (service binding — OData V4)

Fields:
  - travel_uuid (key, UUID)
  - travel_id (NUMC 8)
  - customer_name (CHAR 50)
  - destination (CHAR 50)
  - begin_date (DATS)
  - end_date (DATS)
  - total_price (CURR 15,2)
  - currency_code (CUKY 5)
  - status (CHAR 1)
  - description (STRING)
  + admin fields (created_by, created_at, etc.)

Package: $TMP
Draft: enabled
OData: V4

Proceed? (yes / adjust fields / cancel)
```

Wait for user confirmation before proceeding.

## Step 3: Research RAP Patterns (Optional but Recommended)

If mcp-sap-docs is available, fetch current RAP best practices:

```
search("RAP managed business object CDS behavior definition managed UUID early numbering")
```

```
search("RAP draft handling total ETag behavior definition")
```

```
search("CDS annotation Fiori Elements list report object page")
```

Use the documentation to validate:
- Correct `managed` BDEF syntax with `with draft`
- Correct admin field annotations (`@Semantics.user.createdBy`, etc.)
- Correct draft table naming and ETag field
- Current Fiori Elements annotation best practices

If mcp-sap-docs is unavailable, proceed with built-in knowledge — the patterns below are well-established.

## Step 4: Create the Database Table

The database table is the persistent storage. On BTP, this must use ABAP Cloud syntax (no classic DDIC).

**Important**: ARC-1 currently does not support `SAPWrite(type="TABL")` — database tables cannot be created via ADT CRUD. Two options:

### Option A: Create table via ABAP class (BTP and on-prem)

Generate a CDS table entity definition and create it as a DDLS:

> **Note**: On BTP ABAP Environment, tables are typically created as CDS table entities (`define table entity`), not classic DDIC tables. On on-premise systems with SAP_BASIS >= 7.55, CDS table entities are also supported.

The table is defined as part of the CDS interface view's underlying persistence. For systems that support it, use:

```
SAPWrite(action="create", type="DDLS", name="ZTRAVEL_D", source="<table entity DDL>", package="<pkg>", transport="<tr>")
```

Table entity DDL:
```
@EndUserText.label : 'Travel persistence'
@AbapCatalog.enhancement.category : #NOT_EXTENSIBLE
@AbapCatalog.tableCategory : #TRANSPARENT
@AbapCatalog.deliveryClass : #A
@AbapCatalog.dataMaintenance : #RESTRICTED
define table ztravel_d {
  key client         : abap.clnt not null;
  key travel_uuid    : sysuuid_x16 not null;
  travel_id          : abap.numc(8);
  customer_name      : abap.char(50);
  destination        : abap.char(50);
  begin_date         : abap.dats;
  end_date           : abap.dats;
  total_price        : abap.curr(15,2);
  currency_code      : abap.cuky(5);
  status             : abap.char(1);
  description        : abap.sstring(256);
  created_by         : abp_creation_user;
  created_at         : abp_creation_tstmpl;
  last_changed_by    : abp_locinst_lastchange_user;
  last_changed_at    : abp_lastchange_tstmpl;
  local_last_changed_at : abp_locinst_lastchange_tstmpl;
}
```

### Option B: Instruct user to create manually (fallback)

If table entity creation fails, tell the user:
> "I cannot create the database table via ADT. Please create table `ZTRAVEL_D` manually in ADT/Eclipse with these fields: [list fields]. Then tell me when it's done so I can continue with the CDS views."

## Step 5: Create the Interface CDS View (ZI_*)

The interface view defines the data model and is the anchor for the behavior definition.

```
SAPWrite(action="create", type="DDLS", name="ZI_TRAVEL", source="<interface view DDL>", package="<pkg>", transport="<tr>")
```

Interface view DDL:
```
@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'Travel - Interface View'
define root view entity ZI_Travel
  as select from ztravel_d
{
  key travel_uuid          as TravelUUID,
      travel_id            as TravelID,
      customer_name        as CustomerName,
      destination          as Destination,
      begin_date           as BeginDate,
      end_date             as EndDate,
      @Semantics.amount.currencyCode: 'CurrencyCode'
      total_price           as TotalPrice,
      currency_code         as CurrencyCode,
      status                as Status,
      description           as Description,

      @Semantics.user.createdBy: true
      created_by            as CreatedBy,
      @Semantics.systemDateTime.createdAt: true
      created_at            as CreatedAt,
      @Semantics.user.lastChangedBy: true
      last_changed_by       as LastChangedBy,
      @Semantics.systemDateTime.lastChangedAt: true
      last_changed_at       as LastChangedAt,
      @Semantics.systemDateTime.localInstanceLastChangedAt: true
      local_last_changed_at as LocalLastChangedAt
}
```

## Step 6: Create the Behavior Definition (Interface — ZI_*)

The behavior definition specifies the transactional behavior.

```
SAPWrite(action="create", type="BDEF", name="ZI_TRAVEL", source="<behavior DDL>", package="<pkg>", transport="<tr>")
```

### With Draft:
```
managed implementation in class ZBP_I_Travel unique;
strict ( 2 );
with draft;

define behavior for ZI_Travel alias Travel
persistent table ztravel_d
draft table ztravel_d_d
lock master total etag LastChangedAt
authorization master ( instance )
etag master LocalLastChangedAt
{
  field ( readonly )
    TravelUUID,
    CreatedBy,
    CreatedAt,
    LastChangedBy,
    LastChangedAt,
    LocalLastChangedAt;

  field ( numbering : managed )
    TravelUUID;

  create;
  update;
  delete;

  draft action Resume;
  draft action Edit;
  draft action Activate optimized;
  draft action Discard;
  draft determine action Prepare;

  mapping for ztravel_d
  {
    TravelUUID         = travel_uuid;
    TravelID           = travel_id;
    CustomerName       = customer_name;
    Destination        = destination;
    BeginDate          = begin_date;
    EndDate            = end_date;
    TotalPrice         = total_price;
    CurrencyCode       = currency_code;
    Status             = status;
    Description        = description;
    CreatedBy          = created_by;
    CreatedAt          = created_at;
    LastChangedBy      = last_changed_by;
    LastChangedAt      = last_changed_at;
    LocalLastChangedAt = local_last_changed_at;
  }
}
```

### Without Draft:
```
managed implementation in class ZBP_I_Travel unique;
strict ( 2 );

define behavior for ZI_Travel alias Travel
persistent table ztravel_d
lock master
authorization master ( instance )
etag master LocalLastChangedAt
{
  field ( readonly )
    TravelUUID,
    CreatedBy,
    CreatedAt,
    LastChangedBy,
    LastChangedAt,
    LocalLastChangedAt;

  field ( numbering : managed )
    TravelUUID;

  create;
  update;
  delete;

  mapping for ztravel_d
  {
    TravelUUID         = travel_uuid;
    TravelID           = travel_id;
    CustomerName       = customer_name;
    Destination        = destination;
    BeginDate          = begin_date;
    EndDate            = end_date;
    TotalPrice         = total_price;
    CurrencyCode       = currency_code;
    Status             = status;
    Description        = description;
    CreatedBy          = created_by;
    CreatedAt          = created_at;
    LastChangedBy      = last_changed_by;
    LastChangedAt      = last_changed_at;
    LocalLastChangedAt = local_last_changed_at;
  }
}
```

## Step 7: Create the Projection CDS View (ZC_*)

The projection view exposes the interface view for UI consumption with search and value help annotations.

```
SAPWrite(action="create", type="DDLS", name="ZC_TRAVEL", source="<projection view DDL>", package="<pkg>", transport="<tr>")
```

Projection view DDL:
```
@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'Travel - Projection View'
@Metadata.allowExtensions: true
@Search.searchable: true
define root view entity ZC_Travel
  provider contract transactional_query
  as projection on ZI_Travel
{
  key TravelUUID,

      @Search.defaultSearchElement: true
      @Search.fuzzinessThreshold: 0.8
      TravelID,

      @Search.defaultSearchElement: true
      CustomerName,

      Destination,
      BeginDate,
      EndDate,
      TotalPrice,
      CurrencyCode,

      @Search.defaultSearchElement: true
      Status,

      Description,
      CreatedBy,
      CreatedAt,
      LastChangedBy,
      LastChangedAt,
      LocalLastChangedAt
}
```

## Step 8: Create the Projection Behavior Definition (ZC_*)

```
SAPWrite(action="create", type="BDEF", name="ZC_TRAVEL", source="<projection behavior>", package="<pkg>", transport="<tr>")
```

### With Draft:
```
projection;
strict ( 2 );
use draft;

define behavior for ZC_Travel alias Travel
{
  use create;
  use update;
  use delete;

  use action Resume;
  use action Edit;
  use action Activate;
  use action Discard;
  use action Prepare;
}
```

### Without Draft:
```
projection;
strict ( 2 );

define behavior for ZC_Travel alias Travel
{
  use create;
  use update;
  use delete;
}
```

## Step 9: Create the Metadata Extension (DDLX — ZC_*)

The metadata extension provides Fiori Elements annotations for list report + object page.

```
SAPWrite(action="create", type="DDLX", name="ZC_TRAVEL", source="<metadata extension>", package="<pkg>", transport="<tr>")
```

Metadata extension:
```
@Metadata.layer: #CUSTOMER
@UI: {
  headerInfo: {
    typeName: 'Travel',
    typeNamePlural: 'Travels',
    title: { type: #STANDARD, value: 'TravelID' },
    description: { type: #STANDARD, value: 'Description' }
  }
}
annotate view ZC_Travel with
{
  @UI.facet: [
    { id: 'Travel',
      purpose: #STANDARD,
      type: #IDENTIFICATION_REFERENCE,
      label: 'Travel Details',
      position: 10 }
  ]

  @UI.hidden: true
  TravelUUID;

  @UI: {
    lineItem: [{ position: 10 }],
    identification: [{ position: 10 }],
    selectionField: [{ position: 10 }]
  }
  TravelID;

  @UI: {
    lineItem: [{ position: 20 }],
    identification: [{ position: 20 }],
    selectionField: [{ position: 20 }]
  }
  CustomerName;

  @UI: {
    lineItem: [{ position: 30 }],
    identification: [{ position: 30 }]
  }
  Destination;

  @UI: {
    lineItem: [{ position: 40 }],
    identification: [{ position: 40 }]
  }
  BeginDate;

  @UI: {
    identification: [{ position: 50 }]
  }
  EndDate;

  @UI: {
    lineItem: [{ position: 60 }],
    identification: [{ position: 60 }]
  }
  TotalPrice;

  @UI: {
    lineItem: [{ position: 70, criticality: 'Status' }],
    identification: [{ position: 70 }],
    selectionField: [{ position: 30 }]
  }
  Status;

  @UI: {
    identification: [{ position: 80 }]
  }
  Description;

  @UI.hidden: true
  CreatedBy;

  @UI.hidden: true
  CreatedAt;

  @UI.hidden: true
  LastChangedBy;

  @UI.hidden: true
  LastChangedAt;

  @UI.hidden: true
  LocalLastChangedAt;
}
```

## Step 10: Create the Service Definition (SRVD)

```
SAPWrite(action="create", type="SRVD", name="ZSD_TRAVEL", source="<service definition>", package="<pkg>", transport="<tr>")
```

Service definition:
```
@EndUserText.label: 'Travel Service Definition'
define service ZSD_Travel {
  expose ZC_Travel as Travel;
}
```

## Step 11: Batch Activate All Artifacts

Activate all artifacts together. Order matters — activate in dependency order. Use batch activation for the core stack:

```
SAPActivate(objects=[
  { type: "DDLS", name: "ZTRAVEL_D" },
  { type: "DDLS", name: "ZI_TRAVEL" },
  { type: "BDEF", name: "ZI_TRAVEL" },
  { type: "DDLS", name: "ZC_TRAVEL" },
  { type: "BDEF", name: "ZC_TRAVEL" },
  { type: "DDLX", name: "ZC_TRAVEL" },
  { type: "SRVD", name: "ZSD_TRAVEL" }
])
```

If batch activation fails, try activating in sequence:
1. Table entity (DDLS: `ZTRAVEL_D`)
2. Interface view (DDLS: `ZI_TRAVEL`)
3. Interface behavior definition (BDEF: `ZI_TRAVEL`)
4. Projection view (DDLS: `ZC_TRAVEL`)
5. Projection behavior definition (BDEF: `ZC_TRAVEL`)
6. Metadata extension (DDLX: `ZC_TRAVEL`)
7. Service definition (SRVD: `ZSD_TRAVEL`)

Check activation messages. If there are errors:
1. Read the error message carefully
2. Use `SAPDiagnose(action="syntax", type="<type>", name="<name>")` on the failing object
3. Fix the source with `SAPWrite(action="update", ...)`
4. Re-activate

## Step 12: Create the Behavior Pool Class

The behavior definition references `ZBP_I_Travel`. Create a minimal behavior pool:

```
SAPWrite(action="create", type="CLAS", name="ZBP_I_TRAVEL", source="<class source>", package="<pkg>", transport="<tr>")
```

Class source:
```
CLASS zbp_i_travel DEFINITION
  PUBLIC
  ABSTRACT
  FINAL
  FOR BEHAVIOR OF zi_travel.
ENDCLASS.

CLASS zbp_i_travel IMPLEMENTATION.
ENDCLASS.
```

Then activate:
```
SAPActivate(type="CLAS", name="ZBP_I_TRAVEL")
```

## Step 13: Create the Service Binding (SRVB)

**Important limitation**: ARC-1 currently does not support `SAPWrite(type="SRVB")` — service bindings cannot be created programmatically.

Instruct the user:
> "All RAP artifacts have been created and activated. The last step is to create the service binding manually:
>
> 1. In ADT (Eclipse) or BAS: Right-click on package → New → Other → Service Binding
> 2. Name: `ZSB_TRAVEL_V4`
> 3. Binding Type: OData V4 - UI (or OData V2 - UI on older systems)
> 4. Service Definition: `ZSD_TRAVEL`
> 5. Activate and click 'Publish'
>
> After publishing, the OData service will be available at:
> `/sap/opu/odata4/sap/zsd_travel/srvd_a2x/sap/zsd_travel/0001/`"

Alternatively, verify if the service binding was created:
```
SAPRead(type="SRVB", name="ZSB_TRAVEL_V4")
```

## Step 14: Verify the Complete Service

Run verification checks on the created artifacts:

### 14a. Verify interface view
```
SAPRead(type="DDLS", name="ZI_TRAVEL")
```

### 14b. Verify behavior definition
```
SAPRead(type="BDEF", name="ZI_TRAVEL")
```

### 14c. Verify projection view
```
SAPRead(type="DDLS", name="ZC_TRAVEL")
```

### 14d. Verify service definition
```
SAPRead(type="SRVD", name="ZSD_TRAVEL")
```

### 14e. Run syntax check
```
SAPDiagnose(action="syntax", type="DDLS", name="ZI_TRAVEL")
SAPDiagnose(action="syntax", type="CLAS", name="ZBP_I_TRAVEL")
```

### 14f. Report summary

Show the user:
```
RAP Service Generation Complete!

Created artifacts:
  [x] ZTRAVEL_D        — Database table (CDS table entity)
  [x] ZI_TRAVEL         — Interface CDS view
  [x] ZI_TRAVEL         — Interface behavior definition (managed, draft)
  [x] ZC_TRAVEL         — Projection CDS view
  [x] ZC_TRAVEL         — Projection behavior definition
  [x] ZC_TRAVEL         — Metadata extension (Fiori annotations)
  [x] ZSD_TRAVEL        — Service definition
  [x] ZBP_I_TRAVEL      — Behavior pool class
  [ ] ZSB_TRAVEL_V4     — Service binding (manual step required)

Next steps:
  1. Create and publish service binding ZSB_TRAVEL_V4 in ADT
  2. Preview the Fiori Elements app via the service binding
  3. (Optional) Add validations, determinations, and actions to ZI_TRAVEL BDEF
  4. (Optional) Add value helps and additional annotations to ZC_TRAVEL DDLX
```

## Error Handling

### Common Issues and Fixes

| Error | Cause | Fix |
|---|---|---|
| "Object already exists" | Artifact with same name exists | Use `SAPWrite(action="update", ...)` or choose different names |
| Activation error: "Type X unknown" | Dependency not activated yet | Activate in order: table → view → BDEF → projection → SRVD |
| "Draft table not found" | Draft table `*_D` not auto-created | On on-premise: create draft table manually. On BTP: should auto-create |
| "Field mapping incomplete" | BDEF mapping doesn't match table | Verify all table fields are in the mapping block |
| "ETag field not found" | Wrong ETag field name in BDEF | Ensure `etag master LocalLastChangedAt` matches CDS field alias |
| "Behavior pool not found" | Class not created/activated yet | Create and activate `ZBP_I_*` before activating BDEF |
| BDEF creation fails (generic XML body) | `buildCreateXml` uses generic fallback for BDEF | Try `SAPWrite(action="create")` — if it fails, create as DDLS first, then update source |
| Lint blocks write | Pre-write lint validation rejects source | Check lint errors, fix or skip if false positive |

### Recovery Strategy

If creation fails partway through:
1. List what was already created: `SAPSearch(query="Z<PREFIX>*")`
2. Delete failed objects: `SAPWrite(action="delete", ...)`
3. Retry from the failed step

## Notes

### What This Skill Does NOT Do (v1)

- **Compositions/child entities**: No parent-child relationships (e.g., Travel → Booking). Plan for v2.
- **Custom actions**: No `action Approve;` or similar. Add manually after generation.
- **Determinations/validations**: No business logic. Use the `generate-rap-logic` skill for this.
- **Value helps**: Basic annotations only. Add domain-specific value helps manually.
- **Access control (DCLS)**: Not generated. Add manually for authorization.
- **Unmanaged/abstract BOs**: Only managed scenario supported.

### When to Use This Skill

- When starting a new RAP-based application from scratch
- When prototyping a business object for demo or exploration
- When learning RAP and wanting a working reference implementation
- NOT for extending existing RAP BOs (use manual development or `generate-rap-logic`)
- NOT for migrating existing classic applications to RAP
