# Research: Fiori Elements App Deployment via ARC-1

## Question

Can ARC-1 go beyond RAP service generation to also create a Fiori Elements app on top, deploy it, and create a launchpad tile? What APIs exist? What do competitors offer?

## TL;DR

| Capability | Feasible? | How? |
|-----------|-----------|------|
| Generate Fiori Elements app | **Yes** | Generate `manifest.json` + `Component.js` + i18n, ZIP it, deploy |
| Deploy to ABAP (BSP repository) | **Yes** | OData service `/sap/opu/odata/UI5/ABAP_REPOSITORY_SRV` — base64 ZIP upload |
| Publish service binding | **Yes** | ADT API exists (`PublishServiceBinding`) — confirmed working |
| Create launchpad tile | **Yes** | `crossNavigation.inbounds` in manifest.json — auto-registered by app index |
| Custom ICF node needed? | **No** | Deployment creates ICF entry automatically; FLP uses manifest.json |

**CRITICAL CORRECTION from initial research:** The ADT filestore endpoint (`/sap/bc/adt/filestore/ui5-bsp`) is **READ-ONLY** — returns HTTP 405 on POST/PUT/DELETE. SAP's official deploy-tooling uses a completely different OData service for writes.

---

## VSP (vibing-steampunk) UI5/BSP: The Cautionary Tale

### What Happened

vibing-steampunk implemented 7 UI5/BSP tools in v2.10.0 against the ADT filestore endpoint. In v2.10.1, **4 write tools were disabled** because the ADT filestore API returns HTTP 405 (Method Not Allowed) on POST/PUT/DELETE.

**Only 3 read-only tools work:**
1. `UI5ListApps` — List BSP applications
2. `UI5GetApp` — Get app details + file structure
3. `UI5GetFileContent` — Read individual file content

**4 write tools exist in code but are disabled:**
4. `UI5UploadFile` — PUT with content types (405)
5. `UI5DeleteFile` — DELETE (405)
6. `UI5CreateApp` — POST with XML payload (405)
7. `UI5DeleteApp` — DELETE (405)

### Sources

- `internal/mcp/tools_focused.go`: `// UI5/Fiori BSP Management (3 read-only - ADT filestore is read-only)`
- `articles/2026-02-10-vsp-two-months-later.md`: "Write operations blocked - ADT Filestore is read-only"
- `articles/2026-02-18-100-stars-celebration.md`: "UI5/BSP writes - ADT filestore is read-only. Need alternate API."
- SAP/open-ux-tools issue #943 confirms the ADT filestore service is read-only

### VSP's Identified Workaround (Not Implemented)

They identified `/UI5/CL_REPOSITORY_LOAD` (ABAP class) and `/UI5/UI5_REPOSITORY_LOAD` (function module) as alternatives, but haven't implemented them. Their README states: "UI5/BSP Write - ADT filestore is read-only, needs custom plugin."

### API Quirks Discovered by VSP

- App names must be **uppercased**
- Directory listing is **NOT recursive** (only immediate children)
- Leading slashes must be stripped from file paths before URL encoding
- Response format is **Atom XML feed**, not JSON
- Feature detection should use **OPTIONS** request (200 or 405 = available, 404 = unavailable)

---

## The Real Deployment API: SAP ABAP Repository OData Service

### Discovery from SAP/open-ux-tools

SAP's official `@sap-ux/deploy-tooling` package (part of the 89-package open-ux-tools monorepo) does **NOT** use the ADT filestore for deployment. Instead, it uses:

**`/sap/opu/odata/UI5/ABAP_REPOSITORY_SRV`**

This is an OData service available since **SAP_UI 7.53** that accepts a **base64-encoded ZIP archive** of the entire webapp in an Atom XML payload. This is how SAP Web IDE, SAP Business Application Studio, and the `ui5-task-nwabap-deployer` all deploy Fiori apps.

### API Specification

#### Check if app exists
```
GET /sap/opu/odata/UI5/ABAP_REPOSITORY_SRV/Repositories('{appName}')?$format=json
```

#### Deploy new app (POST)
```
POST /sap/opu/odata/UI5/ABAP_REPOSITORY_SRV/Repositories
Content-Type: application/atom+xml; type=entry; charset=UTF-8
X-Csrf-Token: {token}
Query: CodePage='UTF8'&CondenseMessagesInHttpResponseHeader=X&format=json
Optional: TransportRequest={TR}&TestMode=true&SafeMode={bool}
```

#### Update existing app (PUT)
```
PUT /sap/opu/odata/UI5/ABAP_REPOSITORY_SRV/Repositories('{appName}')
Content-Type: application/atom+xml; type=entry; charset=UTF-8
X-Csrf-Token: {token}
Query: (same as POST)
```

#### Delete app (DELETE)
```
DELETE /sap/opu/odata/UI5/ABAP_REPOSITORY_SRV/Repositories('{appName}')
Query: TransportRequest={TR}&TestMode=true (optional)
```

#### Download app files
```
GET /sap/opu/odata/UI5/ABAP_REPOSITORY_SRV/Repositories('{appName}')
Query: CodePage='UTF8'&DownloadFiles='RUNTIME'
```
Returns base64-encoded ZIP.

### Atom XML Payload (POST/PUT)

```xml
<?xml version="1.0" encoding="utf-8"?>
<entry xmlns="http://www.w3.org/2005/Atom"
       xmlns:m="http://schemas.microsoft.com/ado/2007/08/dataservices/metadata"
       xmlns:d="http://schemas.microsoft.com/ado/2007/08/dataservices"
       xml:base="{serviceUrl}">
  <id>{serviceUrl}/Repositories('{appName}')</id>
  <title type="text">Repositories('{appName}')</title>
  <updated>{ISO-8601-timestamp}</updated>
  <category term="/UI5/ABAP_REPOSITORY_SRV.Repository"
            scheme="http://schemas.microsoft.com/ado/2007/08/dataservices/scheme"/>
  <link href="Repositories('{appName}')" rel="edit" title="Repository"/>
  <content type="application/xml">
    <m:properties>
      <d:Name>{appName}</d:Name>
      <d:Package>{PACKAGE_UPPERCASE}</d:Package>
      <d:Description>{description}</d:Description>
      <d:ZipArchive>{base64-encoded-zip-of-webapp}</d:ZipArchive>
      <d:Info/>
    </m:properties>
  </content>
</entry>
```

### Key Implementation Details

- **Always ZIP**: Entire webapp is zipped, base64-encoded, sent as single `ZipArchive` property
- **No incremental deployment**: Full ZIP uploaded every time, SAP extracts and replaces all files
- **CSRF tokens**: First request sends `X-Csrf-Token: Fetch` header, response returns token for subsequent writes
- **Error handling**: 401 (auth failure), 412 (SafeMode conflict — app ID mismatch), 408/504 (timeout — retry up to 3 times)
- **App URL after deployment**: `/sap/bc/ui5_ui5/sap/{appName}?sap-client={client}`
- **Config**: `maxBodyLength: Infinity`, `maxContentLength: Infinity` (ZIPs can be large)
- **Prerequisite**: SAP_UI 7.53+ with `S_DEVELOP` authorization

### Deploy Workflow

```
1. Build webapp files (manifest.json, Component.js, i18n, etc.)
2. Create ZIP archive of webapp/ directory
3. Base64-encode the ZIP
4. GET /Repositories('{appName}') → check if app exists
5. If new:  POST /Repositories with Atom XML payload
   If exists: PUT /Repositories('{appName}') with Atom XML payload
6. Handle transport request (optional, via ADT CTS services)
7. App is live at /sap/bc/ui5_ui5/sap/{appName}
8. App index is automatically updated (no separate registration)
```

---

## FLP Tile Creation: No Separate API Needed

### The Discovery

SAP's `@sap-ux/flp-config-sub-generator` does NOT call any FLP API. It simply writes `crossNavigation.inbounds` into the `manifest.json`. The Fiori app index **automatically** picks up this configuration when the app is deployed via the ABAP Repository service.

### manifest.json FLP Configuration

```json
{
  "sap.app": {
    "crossNavigation": {
      "inbounds": {
        "myApp-display": {
          "semanticObject": "ZBooking",
          "action": "display",
          "title": "{{appTitle}}",
          "subtitle": "{{appSubTitle}}",
          "icon": "sap-icon://list",
          "signature": {
            "parameters": {},
            "additionalParameters": "allowed"
          }
        }
      }
    }
  }
}
```

### What's Needed for a Tile to Appear

1. Deploy the app with `crossNavigation.inbounds` in manifest.json
2. App index auto-registers the app
3. Admin assigns the app to a catalog/group in FLP Designer (or it's auto-assigned in BTP)

The `crossNavigation.inbounds` section defines the semantic object, action, title, and icon. This is sufficient for the app to be discoverable in FLP. Assignment to specific catalogs/groups is a one-time admin task, not something that needs automation.

---

## Fiori Elements manifest.json Template (OData V4 LROP)

Based on SAP's `@sap-ux/fiori-elements-writer`, here is the complete manifest.json structure for a List Report + Object Page:

```json
{
  "_version": "1.65.0",
  "sap.app": {
    "id": "z.my.app",
    "type": "application",
    "title": "{{appTitle}}",
    "description": "{{appDescription}}",
    "applicationVersion": { "version": "1.0.0" },
    "dataSources": {
      "mainService": {
        "uri": "/sap/opu/odata4/sap/{service_binding}/srvd_a2x/sap/{service_definition}/0001/",
        "type": "OData",
        "settings": {
          "odataVersion": "4.0"
        }
      }
    },
    "crossNavigation": {
      "inbounds": {
        "{appId}-display": {
          "semanticObject": "{SemanticObject}",
          "action": "display",
          "title": "{{appTitle}}",
          "signature": {
            "parameters": {},
            "additionalParameters": "allowed"
          }
        }
      }
    }
  },
  "sap.ui": {
    "technology": "UI5",
    "deviceTypes": { "desktop": true, "tablet": true, "phone": true }
  },
  "sap.ui5": {
    "flexEnabled": true,
    "dependencies": {
      "minUI5Version": "1.120.0",
      "libs": {
        "sap.m": {},
        "sap.ui.core": {},
        "sap.ushell": {},
        "sap.fe.templates": {}
      }
    },
    "models": {
      "": {
        "dataSource": "mainService",
        "preload": true,
        "settings": {
          "operationMode": "Server",
          "autoExpandSelect": true,
          "earlyRequests": true
        }
      },
      "@i18n": {
        "type": "sap.ui.model.resource.ResourceModel",
        "uri": "i18n/i18n.properties"
      }
    },
    "routing": {
      "routes": [
        {
          "pattern": ":?query:",
          "name": "{Entity}List",
          "target": "{Entity}List"
        },
        {
          "pattern": "{Entity}({key}):?query:",
          "name": "{Entity}ObjectPage",
          "target": "{Entity}ObjectPage"
        }
      ],
      "targets": {
        "{Entity}List": {
          "type": "Component",
          "id": "{Entity}List",
          "name": "sap.fe.templates.ListReport",
          "options": {
            "settings": {
              "contextPath": "/{Entity}",
              "variantManagement": "Page",
              "navigation": {
                "{Entity}": {
                  "detail": { "route": "{Entity}ObjectPage" }
                }
              }
            }
          }
        },
        "{Entity}ObjectPage": {
          "type": "Component",
          "id": "{Entity}ObjectPage",
          "name": "sap.fe.templates.ObjectPage",
          "options": {
            "settings": {
              "editableHeaderContent": false,
              "contextPath": "/{Entity}"
            }
          }
        }
      }
    },
    "contentDensities": { "compact": true, "cozy": true }
  },
  "sap.fiori": {
    "registrationIds": [],
    "archeType": "transactional"
  }
}
```

### Template Types Supported by SAP

From `@sap-ux/fiori-elements-writer`:
- `lrop` — List Report + Object Page (most common for RAP)
- `worklist` — Worklist page
- `alp` — Analytical List Page
- `ovp` — Overview Page
- `feop` — Form Entry Object Page
- `fpm` — Flexible Programming Model

### Minimal Webapp Structure

```
webapp/
├── manifest.json          ← The critical file (see template above)
├── Component.js           ← ~10 lines standard boilerplate
├── i18n/
│   └── i18n.properties   ← appTitle, appDescription, entity labels
└── index.html             ← FLP sandbox launcher (optional, for testing)
```

**Component.js** (standard boilerplate):
```javascript
sap.ui.define(["sap/fe/core/AppComponent"], function(AppComponent) {
  "use strict";
  return AppComponent.extend("z.my.app.Component", {
    metadata: { manifest: "json" }
  });
});
```

---

## Other Useful open-ux-tools APIs Discovered

### ADT Filestore (Read-Only) — for reading deployed apps

```
GET /sap/bc/adt/filestore/ui5-bsp/objects/{appName}/content
Accept: application/xml
```
Returns Atom XML feed of files/folders. Useful for verifying deployment.

### App Index Service — for querying deployed apps

```
GET /sap/bc/ui2/app_index/?fields={fields}&{searchParams}
GET /sap/bc/ui2/app_index/ui5_app_info_json?id={appId}
```
Read-only. Automatically populated by ABAP Repository service on deploy.

### ADT Transport Check — for UI5 app transport

```
POST /sap/bc/adt/cts/transportchecks
Content-Type: application/vnd.sap.as+xml; charset=UTF-8; dataname=com.sap.adt.transport.service.checkData

<DATA>
  <DEVCLASS>{packageName}</DEVCLASS>
  <OPERATION>I</OPERATION>
  <URI>/sap/bc/adt/filestore/ui5-bsp/objects/{appName}/$create</URI>
</DATA>
```

### ADT Transport Create — for UI5 app transport

```
POST /sap/bc/adt/cts/transports
Content-Type: application/vnd.sap.as+xml; charset=UTF-8; dataname=com.sap.adt.CreateCorrectionRequest

<DATA>
  <OPERATION>I</OPERATION>
  <DEVCLASS>{packageName}</DEVCLASS>
  <REQUEST_TEXT>{description}</REQUEST_TEXT>
  <REF>/sap/bc/adt/filestore/ui5-bsp/objects/{appName}/$create</REF>
</DATA>
```

### ATO Settings — detect cloud vs on-prem

```
GET /sap/bc/adt/ato/settings
Accept: application/*
```
Returns: `operationsType` (C=Cloud, P=Premise), `developmentPackage`, `isTransportRequestRequired`.

### UI5 Version — detect available UI5 version

```
GET /sap/public/bc/ui5_ui5/bootstrap_info.json
```
Returns: `{ "Version": "1.120.0" }`. Useful for setting `minUI5Version` in manifest.json.

### LREP Service — for adaptation projects (not needed for new apps)

```
POST/PUT/DELETE /sap/bc/lrep/dta_folder/
```
For deploying adaptation projects (app variants). Different from BSP deployment.

---

## Competitor Analysis (Updated)

### Feature Matrix: UI5/Fiori Deployment

| Feature | ARC-1 | vibing-steampunk | fr0ster | dassian-adt | SAP Joule | SAP fiori-mcp-server |
|---------|-------|-----------------|---------|-------------|-----------|---------------------|
| BSP Read (ADT filestore) | No | **Yes (3 tools)** | No | No | No | No |
| BSP Write (ADT filestore) | N/A | **Broken (405)** | No | No | No | No |
| BSP Deploy (ABAP_REPOSITORY_SRV) | No | No | No | No | No | No |
| SRVB Publish | No | Yes | No | No | N/A | No |
| Fiori App Generation | No | No | No | No | No | **Yes** |
| FLP Tile via manifest.json | No | No | No | No | No | No |

**Key findings:**
1. **VSP's 7 BSP tools are misleading** — only 3 read-only tools work, 4 write tools are disabled
2. **Nobody uses the correct deployment API** (`ABAP_REPOSITORY_SRV`) yet
3. SAP has a `fiori-mcp-server` that can generate Fiori apps but doesn't deploy to ABAP
4. **No MCP server** offers end-to-end RAP + Fiori + Deploy

### SAP fiori-mcp-server

Discovered in the open-ux-tools monorepo. Uses `@modelcontextprotocol/sdk` 1.29.0 with LanceDB embeddings. Tools include: `search_docs`, `list_fiori_apps`, `list_functionalities`, `get_functionality_details`, `execute_functionality`. Can generate Fiori Elements apps but doesn't deploy to ABAP systems.

---

## Revised Implementation Plan

### Phase 1: Publish Service Binding (Effort: XS, half day)

Add `publishServiceBinding()` and `unpublishServiceBinding()` to complete the RAP generation pipeline.

```
POST /sap/bc/adt/businessservices/bindings/{name}?action=publish
POST /sap/bc/adt/businessservices/bindings/{name}?action=unpublish
```

### Phase 2: ABAP Repository Deployment (Effort: M, 3-5 days)

Implement the OData-based deployment using `/sap/opu/odata/UI5/ABAP_REPOSITORY_SRV`.

| Task | Details |
|------|---------|
| Feature probe | HEAD `/sap/opu/odata/UI5/ABAP_REPOSITORY_SRV` — detect availability |
| Get app info | GET `/Repositories('{name}')` — check existence |
| Deploy new app | POST `/Repositories` — Atom XML with base64 ZIP |
| Redeploy app | PUT `/Repositories('{name}')` — same payload |
| Undeploy app | DELETE `/Repositories('{name}')` |
| Download app | GET `/Repositories('{name}')` with `DownloadFiles='RUNTIME'` |
| ZIP creation | Use Node.js `archiver` or `adm-zip` to create webapp ZIP |
| Transport integration | Reuse existing `src/adt/transport.ts` + new CTS check endpoint |

**Note:** This is a separate HTTP endpoint from the ADT APIs (`/sap/opu/odata/` vs `/sap/bc/adt/`). ARC-1's HTTP client may need a small extension to support OData service paths.

### Phase 3: Fiori Elements App Generation (Effort: S, 1-2 days)

Generate the webapp files that get zipped and deployed.

| File | Source |
|------|--------|
| `manifest.json` | Template with entity name, service URL, FLP config |
| `Component.js` | Static boilerplate (~10 lines) |
| `i18n/i18n.properties` | Entity labels from CDS annotations |
| `index.html` | Optional FLP sandbox launcher |

The `manifest.json` template (see above) is parameterized by:
- Entity name (from RAP generation)
- Service binding name (from RAP generation)
- Service definition name (from RAP generation)
- App ID (derived from entity name)
- Semantic object (user input or derived)
- UI5 version (from `/sap/public/bc/ui5_ui5/bootstrap_info.json`)

### Phase 4: ADT Filestore Read (Effort: S, 1 day)

Add read-only BSP tools for verifying deployed apps:

| Tool | Endpoint |
|------|----------|
| List BSP apps | GET `/sap/bc/adt/filestore/ui5-bsp/objects` |
| Read app structure | GET `/sap/bc/adt/filestore/ui5-bsp/objects/{name}/content` |
| Read file content | GET `/sap/bc/adt/filestore/ui5-bsp/objects/{name}/{path}/content` |

---

## What a Full "Generate RAP + Fiori + Deploy" Skill Would Look Like

```
Step 1-12:  [Existing] Generate RAP stack (table, CDS, BDEF, SRVD, DDLX, CLAS)
Step 13:    [Existing] Create service binding (manual, instruct user)
Step 14:    [New] Publish service binding → OData service is live
Step 15:    [New] Detect UI5 version from target system
Step 16:    [New] Generate manifest.json with service URL, entity, FLP config
Step 17:    [New] Generate Component.js, i18n, index.html
Step 18:    [New] ZIP webapp files, base64-encode
Step 19:    [New] Deploy via POST /sap/opu/odata/UI5/ABAP_REPOSITORY_SRV/Repositories
Step 20:    [New] Verify deployment via ADT filestore read
Step 21:    [Verify] App accessible at /sap/bc/ui5_ui5/sap/{appName}
```

---

## Summary

| Question | Answer |
|----------|--------|
| Can we create a Fiori Elements app? | **Yes** — generate manifest.json + Component.js + i18n |
| Can we deploy it? | **Yes** — via `/sap/opu/odata/UI5/ABAP_REPOSITORY_SRV` (NOT ADT filestore) |
| Can we create a tile? | **Yes** — via `crossNavigation.inbounds` in manifest.json (auto-registered) |
| Do competitors do this? | **Nobody does end-to-end.** VSP has read-only BSP tools. SAP fiori-mcp-server generates but doesn't deploy. |
| Is a custom ICF node needed? | **No** — ABAP Repository service handles everything |
| Does the ADT filestore work for writes? | **No** — returns HTTP 405. Use ABAP_REPOSITORY_SRV instead. |
| What about on-prem vs BTP? | Both supported — ABAP_REPOSITORY_SRV available since SAP_UI 7.53 |

**Bottom line:** This is fully feasible with proven SAP APIs. ARC-1 would be the **first MCP server** to offer end-to-end RAP + Fiori generation + deployment + FLP tile registration. The previous research incorrectly assumed the ADT filestore was the deployment API — SAP's official tooling uses an entirely different OData service.
