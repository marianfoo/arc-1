# Research: Fiori Elements App Deployment via ARC-1

## Question

Can ARC-1 go beyond RAP service generation to also create a Fiori Elements app on top, deploy it, and create a launchpad tile? What APIs exist? What do competitors offer?

## TL;DR

| Capability | Feasible? | How? |
|-----------|-----------|------|
| Generate Fiori Elements app (UI5 project files) | **Yes** | Generate `manifest.json` + `Component.js` + views locally, upload via BSP CRUD |
| Deploy to ABAP (BSP repository) | **Yes** | ADT `/sap/bc/adt/filestore/ui5-bsp` API — already feature-probed, needs CRUD implementation |
| Publish service binding | **Yes** | ADT API exists (`PublishServiceBinding`) — vibing-steampunk already uses it |
| Create launchpad tile | **Partial** | No standard ADT/OData API for FLP tile creation. Possible via custom ICF service or RFC |
| Create ICF node programmatically | **Unlikely via ADT** | No ADT endpoint for SICF. Would need custom ABAP program or RFC |

---

## Current State

### What ARC-1 Can Do Today (RAP Generation)

The `generate-rap-service` skill creates 9 artifacts:
1. Database table entity (TABL)
2. Interface CDS view (DDLS) — `ZI_<Entity>`
3. Interface behavior definition (BDEF) — `ZI_<Entity>`
4. Projection CDS view (DDLS) — `ZC_<Entity>`
5. Projection behavior definition (BDEF) — `ZC_<Entity>`
6. Metadata extension (DDLX) — `ZC_<Entity>` (with `@UI` annotations for Fiori)
7. Service definition (SRVD) — `ZSD_<Entity>`
8. Behavior pool class (CLAS) — `ZBP_I_<Entity>`
9. Service binding (SRVB) — **manual step** (ADT API cannot create SRVB, only read)

### What's Missing for End-to-End Fiori

| Gap | Severity | Notes |
|-----|----------|-------|
| SRVB creation | High | ADT API can read SRVB but not create — manual ADT step needed |
| SRVB publish/unpublish | High | API exists, not implemented in ARC-1. VSP has `PublishServiceBinding` |
| UI5 app generation | Medium | Need to generate `manifest.json`, `Component.js`, views, i18n |
| BSP deployment (upload) | High | ADT `/sap/bc/adt/filestore/ui5-bsp` exists, feature probe already coded |
| FLP tile/catalog | Medium | No standard API for programmatic tile creation |

---

## Competitor Analysis

### Feature Matrix: UI5/Fiori BSP

From `compare/00-feature-matrix.md`:

| Feature | ARC-1 | vibing-steampunk | fr0ster | dassian-adt | SAP Joule |
|---------|-------|-----------------|---------|-------------|-----------|
| UI5/Fiori BSP | **No** | **Yes (7 tools)** | No | No | No |
| Service Binding Publish | No | Yes | No | No | N/A |
| Fiori App Generation | No | No | No | No | No |
| Launchpad Tile Creation | No | No | No | No | No |

**Key finding:** vibing-steampunk is the **only** competitor with BSP CRUD capabilities. **No competitor** generates Fiori Elements apps or creates launchpad tiles. This would be a first-of-its-kind feature.

### vibing-steampunk's UI5/BSP Tools

From `compare/01-vibing-steampunk.md`, their expert mode includes BSP-related tools via the `/sap/bc/adt/filestore/ui5-bsp` endpoint. They also have `PublishServiceBinding` and `UnpublishServiceBinding`.

### mcp-abap-abap-adt-api (mario-andreschak)

From `compare/02-mcp-abap-abap-adt-api.md:53`, has 3 service binding tools:
- `publishServiceBinding`
- `unPublishServiceBinding`  
- `bindingDetails`

This confirms the ADT API for publishing service bindings exists and is usable.

---

## Available ADT APIs

### 1. UI5/Fiori BSP Repository — `/sap/bc/adt/filestore/ui5-bsp`

**Already feature-probed** in ARC-1 (`src/adt/features.ts:38`), but no CRUD operations implemented.

| Operation | HTTP Method | Endpoint | Purpose |
|-----------|------------|----------|---------|
| List apps | GET | `/sap/bc/adt/filestore/ui5-bsp` | List all BSP applications |
| Create app | POST | `/sap/bc/adt/filestore/ui5-bsp` | Create new BSP app container |
| Read app | GET | `/sap/bc/adt/filestore/ui5-bsp/{appName}` | Read app metadata + file list |
| Update metadata | PUT | `/sap/bc/adt/filestore/ui5-bsp/{appName}` | Update app description/package |
| Delete app | DELETE | `/sap/bc/adt/filestore/ui5-bsp/{appName}` | Delete entire BSP app |
| Upload file | PUT | `/sap/bc/adt/filestore/ui5-bsp/{appName}/{path}` | Upload individual file |
| Read file | GET | `/sap/bc/adt/filestore/ui5-bsp/{appName}/{path}` | Read individual file |

This is the **same API** used by SAP Web IDE, SAP Business Application Studio (`@sap/ux-ui5-tooling`), and the `ui5-task-nwabap-deployer` npm package for deploying UI5 apps.

### 2. Service Binding Publish — `/sap/bc/adt/businessservices/bindings/{name}`

| Operation | HTTP Method | Endpoint/Params | Purpose |
|-----------|------------|-----------------|---------|
| Read binding | GET | `/sap/bc/adt/businessservices/bindings/{name}` | Get metadata (already implemented) |
| Publish | POST | `/sap/bc/adt/businessservices/bindings/{name}?action=publish` | Publish OData service |
| Unpublish | POST | `/sap/bc/adt/businessservices/bindings/{name}?action=unpublish` | Unpublish OData service |

ARC-1 already reads SRVB (`src/adt/client.ts:263-270`). Adding publish/unpublish would be minimal effort.

### 3. Service Binding Creation

**No standard ADT API exists** for creating SRVB objects. This is a known limitation across all MCP servers. The ADT object creation endpoint (`POST /sap/bc/adt/...`) doesn't cover service bindings in the same way it covers DDLS, BDEF, SRVD.

**Workaround:** Could potentially use the generic object creation endpoint or the AFF (ABAP File Formats) approach, but this needs investigation. SRVB has an AFF schema (`src/aff/schemas/srvb-v1.json`) which might enable creation via a generic template endpoint.

### 4. Launchpad / FLP Tile APIs

**No standard ADT API exists** for FLP tile/catalog management. FLP configuration is stored in:

| Store | Technology | API Available? |
|-------|-----------|---------------|
| `/UI2/PAGE_BUILDER_PERS` | Table (ABAP) | No REST API |
| `LPD_CUST` | Customizing transaction | No REST API |
| Fiori Launchpad Designer | Web UI | No public API |
| FLP Content Manager (BTP) | BTP service | REST API exists (BTP only) |
| `/UI2/FLPD_CUST_CONF` | OData (on-prem) | **Possible** — OData service for FLP designer |

**On-premise options:**
- `/sap/bc/ui2/flpd_cust_conf/` — OData service used by FLP Designer. Could potentially be called to create catalog entries and target mappings. Undocumented but discoverable.
- Custom RFC/ICF service — Most reliable approach for on-prem.

**BTP options:**
- Content Deployer (`@sap/ux-ui5-tooling`) — Uses `CommonDataModel.json` to deploy FLP content.
- Managed App Router automatically registers apps.

### 5. ICF Node Management

**No ADT API exists** for SICF (ICF service node management). ICF nodes are managed via:
- Transaction `SICF` — GUI only
- RFC `HTTP_ACTIVATE_ICF_SERVICE` / `HTTP_DEACTIVATE_ICF_SERVICE` — Programmatic but needs RFC
- Table `ICFSERVICE` + `ICFVIRSVR` — Direct table manipulation (dangerous)

Not feasible via ADT REST APIs.

---

## Proposed Solution: Three-Phase Approach

### Phase 1: Complete RAP-to-OData Pipeline (Effort: S, 1-2 days)

Close the gap between RAP generation and a running OData service.

| Task | Status |
|------|--------|
| Implement `PublishServiceBinding` | New — use POST with `?action=publish` |
| Implement `UnpublishServiceBinding` | New — use POST with `?action=unpublish` |
| Investigate SRVB creation via ADT/AFF | Research — check if AFF template endpoint works |

After Phase 1, the generated RAP service would have a **published OData endpoint** accessible via the service URL.

### Phase 2: BSP Deployment (Effort: M, 3-5 days)

Implement the UI5/Fiori BSP CRUD tools from roadmap FEAT-29e.

| Task | Details |
|------|---------|
| BSP app CRUD | 7 tools via `/sap/bc/adt/filestore/ui5-bsp` |
| Fiori Elements app template | Generate `manifest.json`, `Component.js`, `webapp/` structure |
| Deploy workflow | Create BSP → upload files → register |

The Fiori Elements app for a RAP service is mostly boilerplate:
```
webapp/
├── manifest.json          ← OData service URL, entity set, annotations
├── Component.js           ← ~10 lines, standard boilerplate
├── i18n/
│   └── i18n.properties   ← App title, entity labels
├── index.html             ← FLP sandbox launcher
└── localService/          ← Optional: mock data for local testing
```

The `manifest.json` is the critical file — it references the OData service URL and entity set. ARC-1 already knows both from the RAP generation step.

### Phase 3: Launchpad Integration (Effort: M-L, depends on approach)

**Option A: Custom ABAP Program (on-prem)**
Create a Z-program or Z-class that:
1. Creates a catalog entry in `LPD_CUST`
2. Creates a target mapping pointing to the BSP app
3. Creates a tile in a catalog/group

This program could be invoked via ARC-1's `SAPWrite` → activate → run pattern, or deployed once and called via a custom ICF service.

**Option B: OData API Discovery (on-prem)**
Investigate `/sap/bc/ui2/flpd_cust_conf/` OData service. If it supports create operations, it could be called directly without custom ABAP code.

**Option C: Content Deployer (BTP)**
For BTP ABAP, use the `CommonDataModel.json` format to define FLP content:
```json
{
  "applications": {
    "zapp_booking": {
      "semanticObject": "ZBooking",
      "action": "display",
      "title": "Manage Bookings",
      "url": "/sap/bc/ui5_ui5/sap/zapp_booking"
    }
  }
}
```

**Option D: Expose a Custom ICF Service**
Create a small ABAP class implementing `IF_HTTP_EXTENSION` that:
- Accepts JSON input (BSP name, tile title, catalog, semantic object)
- Creates FLP catalog entry + target mapping + tile
- Returns success/error JSON

This would be a one-time deployment (like vibing-steampunk's `ZADT_VSP`). ARC-1 could call it via HTTP POST.

---

## What a Full "Generate RAP + Fiori + Deploy" Skill Would Look Like

```
Step 1-12:  [Existing] Generate RAP stack (table, CDS, BDEF, SRVD, DDLX, CLAS)
Step 13:    [New] Create service binding (if ADT API supports it, else manual)
Step 14:    [New] Publish service binding → OData service is live
Step 15:    [New] Generate Fiori Elements webapp files (manifest.json, Component.js, etc.)
Step 16:    [New] Create BSP application via ADT filestore API
Step 17:    [New] Upload webapp files to BSP
Step 18:    [New] Register in app index (automatic on some systems)
Step 19:    [Optional] Create FLP tile (via custom service or manual instruction)
Step 20:    [Verify] Open service URL, test Fiori app
```

---

## Recommendations

### Priority 1: Publish Service Binding (Immediate Value)
- **Effort:** XS (half day)
- **Impact:** Eliminates the biggest manual step in RAP generation
- **API:** Already confirmed working (VSP + mcp-abap-abap-adt-api use it)
- **Implementation:** Add `publishServiceBinding()` and `unpublishServiceBinding()` to `src/adt/devtools.ts`

### Priority 2: BSP CRUD (FEAT-29e)
- **Effort:** M (3-5 days)
- **Impact:** Enables full Fiori app deployment
- **API:** `/sap/bc/adt/filestore/ui5-bsp` — well-documented, widely used
- **Implementation:** New methods in `src/adt/client.ts` + `src/adt/crud.ts`, new operations in intent handler

### Priority 3: Fiori Elements App Template
- **Effort:** S (1-2 days)  
- **Impact:** Automates boilerplate generation — `manifest.json` is 90% of the work
- **Implementation:** Template engine in a new `src/fiori/` module or as part of the RAP generation skill

### Priority 4: FLP Tile (Research Needed)
- **Effort:** M-L (depends on approach)
- **Impact:** Nice-to-have — most devs can create tiles manually
- **Recommendation:** First investigate `/sap/bc/ui2/flpd_cust_conf/` OData API. If it supports creates, no custom ABAP needed. Otherwise, consider a Z-helper class.

### Not Recommended: Custom ICF Node
- Creating ICF nodes programmatically is not supported via ADT APIs
- BSP deployment automatically creates the necessary ICF service entry
- No need for a custom ICF node just for deployment

---

## Summary

| Question | Answer |
|----------|--------|
| Can we create Fiori Elements app? | **Yes** — generate webapp files + deploy to BSP via ADT API |
| Can we deploy it? | **Yes** — `/sap/bc/adt/filestore/ui5-bsp` API exists and is proven |
| Can we create a tile? | **Partial** — no standard API, needs custom ABAP or OData investigation |
| Do competitors do this? | **Only vibing-steampunk** has BSP CRUD. **Nobody** generates Fiori apps or tiles. |
| Is a custom ICF node needed? | **No** — BSP deployment creates its own ICF entry automatically |
| Are OData APIs available? | **Possibly** — `/sap/bc/ui2/flpd_cust_conf/` for FLP content, needs investigation |

**Bottom line:** Phases 1-3 are fully feasible with existing SAP APIs. This would make ARC-1 the **first MCP server** to offer end-to-end RAP + Fiori generation and deployment — a significant competitive differentiator since not even SAP's Joule does this.
