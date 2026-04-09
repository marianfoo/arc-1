# Phase 4: Deploy Fiori Elements App (E2E Skill)

## Goal

Complete the pipeline: Table → RAP → Published Service → Fiori Elements App → Deployed & Accessible. Create a skill that generates a minimal Fiori Elements app on top of a RAP service and deploys it to the ABAP system. The deployed app creates its own ICF node and can be opened directly via `index.html` without any launchpad configuration.

## Why Last

- Depends on Phase 2 (publish SRVB → get service URL) and Phase 3 (ABAP_REPOSITORY_SRV client)
- Most complex phase — involves ZIP creation, OData writes, webapp generation
- Highest risk — the deploy API needs extensive manual testing in Phase 3

## Architecture Decision: Generate Files In-Memory

**Do NOT take a dependency on `@sap-ux/fiori-elements-writer` or any SAP Fiori tools npm packages.** Instead, generate the minimal webapp files ourselves based on the patterns learned from open-ux-tools source code.

Reasons:
- ARC-1 is a standalone MCP server — adding large npm dependencies increases bundle size
- The generated app is minimal (4 files) — no template engine needed
- We control the exact output — easier to debug and customize
- The manifest.json template is well-understood (see research docs)

## Minimal Webapp Structure

```
manifest.json          ← Primary config file (OData service, routing, entity)
Component.js           ← Standard boilerplate (~5 lines)
i18n/i18n.properties   ← App title and entity labels
index.html             ← FLP sandbox launcher (enables direct access)
```

### manifest.json Template

Parameterized by:
- `{appId}` — e.g., `z.booking.app` (derived from entity name)
- `{appTitle}` — e.g., `Manage Bookings`
- `{serviceUrl}` — e.g., `/sap/opu/odata4/sap/zsb_booking_v4/srvd_a2x/sap/zsd_booking/0001/`
- `{entityName}` — e.g., `Booking` (the CDS entity name from the projection view)
- `{odataVersion}` — `4.0` or `2.0`

See `docs/plans/fiori-deployment-api-reference.md` "Fiori Elements manifest.json Template" section and `docs/plans/fiori-deployment-research.md` for the complete template.

### Component.js (Static)

```javascript
sap.ui.define(["sap/fe/core/AppComponent"], function(AppComponent) {
  "use strict";
  return AppComponent.extend("{appId}.Component", {
    metadata: { manifest: "json" }
  });
});
```

### index.html (FLP Sandbox)

Standard FLP sandbox that loads the app without requiring launchpad configuration:

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <script src="/sap/public/bc/ui5_ui5/resources/sap-ui-core.js"
    data-sap-ui-theme="sap_horizon"
    data-sap-ui-compatVersion="edge"
    data-sap-ui-resourceroots='{ "{appId}": "" }'
    data-sap-ui-frameOptions="trusted">
  </script>
  <script>
    sap.ui.require(["sap/fe/core/AppComponent"], function() {
      new sap.ui.core.ComponentContainer({
        name: "{appId}",
        settings: {},
        async: true
      }).placeAt("content");
    });
  </script>
</head>
<body class="sapUiBody" id="content"></body>
</html>
```

**Note:** The exact index.html for FLP sandbox may need refinement during manual testing. The approach above is a simplified version — the SAP standard uses `ushell` sandbox which may be needed for proper annotation handling.

### i18n/i18n.properties

```properties
appTitle=Manage {EntityLabel}
appDescription={EntityLabel} List Report
```

## Deploy Workflow

```
1. [Prerequisite] RAP service exists and SRVB is published (Phase 1-2)

2. Get service binding metadata:
   SAPRead(type="SRVB", name="ZSB_{entity}_V4")
   → Extract service URL, OData version

3. Generate webapp files in memory:
   - manifest.json (parameterized template)
   - Component.js (static boilerplate)
   - i18n/i18n.properties (entity labels)
   - index.html (FLP sandbox)

4. Create ZIP archive:
   const zip = new AdmZip();
   zip.addFile('manifest.json', Buffer.from(manifest));
   zip.addFile('Component.js', Buffer.from(component));
   zip.addFile('i18n/i18n.properties', Buffer.from(i18n));
   zip.addFile('index.html', Buffer.from(indexHtml));
   const archive = zip.toBuffer();

5. Check if BSP app exists:
   GET /sap/opu/odata/UI5/ABAP_REPOSITORY_SRV/Repositories('{bspName}')

6. Deploy (POST or PUT):
   POST/PUT with Atom XML payload containing base64(archive)

7. Return app URL:
   /sap/bc/ui5_ui5/sap/{bspName.toLowerCase()}/index.html?sap-client={client}
```

## Skill Design: `generate-fiori-app`

New skill at `skills/generate-fiori-app.md` and `.claude/commands/generate-fiori-app.md`.

### Input
- **Service binding name** (required) — e.g., `ZSB_BOOKING_V4`
- **BSP app name** (optional — default: derive from entity, e.g., `ZAPP_BOOKING`)
- **Package** (optional — default: `$TMP`)
- **Transport** (optional — only if non-local package)

### Steps

```
Step 1:  Read SRVB metadata → get service URL, OData version, service definition
Step 2:  Read projection CDS view → get entity name and fields
Step 3:  Read DDLX metadata extension → get UI annotation labels
Step 4:  Generate manifest.json, Component.js, i18n, index.html
Step 5:  Create ZIP, base64-encode
Step 6:  Deploy via ABAP_REPOSITORY_SRV (POST new or PUT update)
Step 7:  Verify via ADT filestore read (Phase 1)
Step 8:  Present URL to user
```

### Integration with generate-rap-service

The E2E pipeline skill would be an **extension** of `generate-rap-service`, adding optional steps at the end:

```
[Existing Steps 1-14 from generate-rap-service]
Step 15: [New] Ask user: "Would you like to generate and deploy a Fiori Elements app?"
Step 16: [New] If yes → invoke generate-fiori-app with the service binding name
```

This keeps the skills composable — `generate-fiori-app` works standalone or as part of the RAP pipeline.

## Dependencies

- **Phase 2:** Must be completed — need published SRVB to get service URL
- **Phase 3:** Must be completed — need ABAP_REPOSITORY_SRV client with tested CSRF/auth
- **npm:** Add `adm-zip` dependency for ZIP creation (`npm install adm-zip`)

## Safety Considerations

- Deploy is a **write operation** — uses `OperationType.Create` or `OperationType.Update`
- Blocked by `readOnly` mode
- Package must be in `allowedPackages` (default: `$TMP`)
- Transport required for non-local packages
- SafeMode prevents accidental overwrites (different `sap.app/id`)

## FLP Guidance (Post-Deploy)

After deployment, provide system-specific guidance instead of automating:

**For BTP ABAP:**
> Your app is deployed and accessible at `{url}/index.html`. To add it to the Fiori Launchpad, the `crossNavigation.inbounds` in manifest.json will be auto-registered by the app index. An administrator can assign it to a catalog/group.

**For On-Prem:**
> Your app is deployed and accessible at `{url}/index.html`. To add it to the Fiori Launchpad:
> 1. Open transaction `/UI2/FLPD_CUST` (FLP Designer)
> 2. Create a catalog entry with semantic object `{entity}` and action `display`
> 3. Add a target mapping pointing to BSP app `{bspName}`
> 4. Assign to a group
> See SAP Help: https://help.sap.com/docs/SAP_FIORI_LAUNCHPAD

## Files to Create/Modify

| File | Change |
|------|--------|
| `src/adt/ui5-repository.ts` | Add `deployApp()`, `undeployApp()` (extends Phase 3) |
| `src/adt/ui5-templates.ts` | **New** — manifest.json, Component.js, index.html generators |
| `src/handlers/intent.ts` | Add deploy/undeploy handling in SAPManage or new tool |
| `src/handlers/tools.ts` | Add deploy action description |
| `src/handlers/schemas.ts` | Add deploy schema |
| `skills/generate-fiori-app.md` | **New** — Fiori Elements app generation skill |
| `.claude/commands/generate-fiori-app.md` | **New** — Claude Code command |
| `skills/generate-rap-service.md` | Update to reference generate-fiori-app as next step |
| `package.json` | Add `adm-zip` dependency |
| `tests/unit/adt/ui5-repository.test.ts` | Deploy unit tests |
| `tests/unit/adt/ui5-templates.test.ts` | **New** — template generation tests |

## Estimated Effort

5-7 days including manual testing, template refinement, and skill writing.

## Risk Mitigation

- **index.html may not work as-is** — FLP sandbox bootstrap may need `ushell` container. Test on real system and iterate.
- **OData V2 vs V4 differences** — manifest.json template needs two variants. V4 uses `sap.fe.templates`, V2 uses `sap.suite.ui.generic.template`.
- **BTP vs on-prem differences** — service URL format differs. The SRVB metadata provides the correct URL.
- **Large ZIPs** — set `maxBodyLength: Infinity` on the HTTP request (as SAP's deploy-tooling does).
