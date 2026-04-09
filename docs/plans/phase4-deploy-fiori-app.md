# Phase 4: Deploy Fiori Elements App (E2E Skill)

## Overview

Complete the end-to-end pipeline: Table → RAP → Published Service → Fiori Elements App → Deployed & Accessible. This phase adds the ability to generate a minimal Fiori Elements webapp (manifest.json, Component.js, i18n, index.html), ZIP it, and deploy it to the ABAP system via the ABAP Repository OData Service. The deployed app creates its own ICF node and is accessible directly via `index.html` — no Fiori Launchpad configuration needed.

This makes ARC-1 the first MCP server to offer end-to-end RAP + Fiori generation and deployment. The webapp files are generated in-memory based on patterns from SAP's `@sap-ux/fiori-elements-writer` — no npm dependency on SAP Fiori tools packages.

**Dependencies:** Phase 2 (publish SRVB) and Phase 3 (ABAP Repository query) must be completed first.

## Context

### Current State

- Phase 2 provides `publishServiceBinding()` — OData service is live and has a URL
- Phase 3 provides `getAppInfo()` — can check if BSP app exists (determines POST vs PUT)
- Phase 3 provides the HTTP foundation for calling the ABAP Repository OData Service
- No deployment capability exists in ARC-1
- No Fiori Elements template generation exists

### Target State

- `SAPManage(action="deploy_ui5", name="ZAPP_BOOKING", package="$TMP")` — deploy a UI5 app from a ZIP
- New skill `generate-fiori-app` — generates and deploys a minimal Fiori Elements app for a RAP service
- `generate-rap-service` skill extended with optional Fiori app generation as final step
- App accessible at `/sap/bc/ui5_ui5/sap/{appname}/index.html`

### Key Files

| File | Role |
|------|------|
| `src/adt/ui5-repository.ts` | Extend with `deployApp()`, `undeployApp()` (from Phase 3) |
| `src/adt/ui5-templates.ts` | **New** — manifest.json, Component.js, index.html generators |
| `src/handlers/intent.ts` | Add deploy/undeploy actions in SAPManage handler |
| `src/handlers/tools.ts` | Update SAPManage description |
| `src/handlers/schemas.ts` | Update SAPManage schema |
| `skills/generate-fiori-app.md` | **New** — Fiori Elements app generation skill |
| `.claude/commands/generate-fiori-app.md` | **New** — Claude Code command |
| `skills/generate-rap-service.md` | Update to reference generate-fiori-app as next step |
| `package.json` | Add `adm-zip` dependency |
| `tests/unit/adt/ui5-repository.test.ts` | Deploy unit tests |
| `tests/unit/adt/ui5-templates.test.ts` | **New** — template generation tests |

### Design Principles

1. Generate minimal webapp files in-memory — no dependency on `@sap-ux/fiori-elements-writer` or other SAP npm packages. The manifest.json template is parameterized; Component.js and index.html are static boilerplate.
2. Use `adm-zip` for ZIP creation — lightweight, no native dependencies, already used by SAP's deploy-tooling.
3. The deploy workflow follows SAP's pattern exactly: GET (check existence) → POST or PUT (create or update) with Atom XML payload containing base64 ZIP.
4. Package is uppercased. App name is uppercased. Transport is required for non-`$TMP` packages.
5. After deploy, the app URL is `/sap/bc/ui5_ui5/sap/{appName.toLowerCase()}/index.html?sap-client={client}`.
6. FLP tile configuration is out of scope — after deploy, provide system-specific guidance to the user.
7. The `index.html` uses FLP sandbox to render the Fiori Elements app standalone without launchpad.

## Development Approach

Test-driven with mock HTTP for deployment. Template generation tests verify manifest.json structure, Component.js content, and i18n properties. Use `adm-zip` to verify ZIP creation produces valid archives. The skill files are prompt templates and don't need automated testing.

## Validation Commands

- `npm test`
- `npm run typecheck`
- `npm run lint`

### Task 1: Add adm-zip dependency

**Files:**
- Modify: `package.json`

Add the `adm-zip` npm package for ZIP archive creation.

- [ ] Run `npm install adm-zip` and `npm install -D @types/adm-zip`
- [ ] Verify `package.json` has `adm-zip` in dependencies and `@types/adm-zip` in devDependencies
- [ ] Run `npm test` — all tests must pass (no regressions from new dependency)

### Task 2: Create Fiori Elements template generator

**Files:**
- Create: `src/adt/ui5-templates.ts`
- Create: `tests/unit/adt/ui5-templates.test.ts`

Generate minimal Fiori Elements webapp files from RAP service parameters.

- [ ] Create `src/adt/ui5-templates.ts` with interface `FioriAppConfig { appId: string; appTitle: string; serviceUrl: string; entityName: string; odataVersion: '2.0' | '4.0'; serviceName: string }`
- [ ] Implement `generateManifest(config: FioriAppConfig): string` — returns a JSON manifest.json string for a Fiori Elements List Report + Object Page. For OData V4: use `sap.fe.templates.ListReport` and `sap.fe.templates.ObjectPage`. For OData V2: use `sap.suite.ui.generic.template.ListReport` and `sap.suite.ui.generic.template.ObjectPage`. Include `crossNavigation.inbounds` with semantic object derived from entity name. Use the complete template from `docs/plans/fiori-deployment-research.md` "Fiori Elements manifest.json Template" section.
- [ ] Implement `generateComponent(appId: string): string` — returns Component.js boilerplate: `sap.ui.define(["sap/fe/core/AppComponent"], function(AppComponent) { "use strict"; return AppComponent.extend("{appId}.Component", { metadata: { manifest: "json" } }); });`
- [ ] Implement `generateI18n(appTitle: string, entityLabel: string): string` — returns `i18n.properties` content: `appTitle={appTitle}\nappDescription={entityLabel} List Report\n`
- [ ] Implement `generateIndexHtml(appId: string): string` — returns FLP sandbox HTML that loads `sap-ui-core.js`, creates a `ComponentContainer` with the app, and mounts it. Use `sap_horizon` theme.
- [ ] Implement `createWebappZip(config: FioriAppConfig): Buffer` — generates all 4 files, creates a ZIP using `adm-zip`, returns the ZIP buffer
- [ ] Add unit tests (~10 tests): manifest contains correct service URL, manifest has correct routing with entity, manifest OData V4 uses fe.templates, manifest OData V2 uses generic.template, Component.js contains appId, i18n has correct title, index.html loads sap-ui-core, ZIP contains all 4 files, ZIP entries have correct paths (no parent directory), manifest JSON is valid parseable JSON
- [ ] Run `npm test` — all tests must pass

### Task 3: Implement deploy and undeploy

**Files:**
- Modify: `src/adt/ui5-repository.ts`
- Modify: `tests/unit/adt/ui5-repository.test.ts`

Add write operations to the ABAP Repository module created in Phase 3.

- [ ] Add helper `createAtomPayload(appName: string, packageName: string, description: string, zipBase64: string, serviceUrl: string): string` — builds the Atom XML entry payload. XML-escape name and description. Uppercase the package. Use ISO timestamp for `<updated>`. Include `<d:Name>`, `<d:Package>`, `<d:Description>`, `<d:ZipArchive>`, `<d:Info/>`.
- [ ] Implement `deployApp(http, safety, config: { name: string; package: string; description: string; archive: Buffer; transport?: string }): Promise<string>` — (1) `checkOperation(safety, OperationType.Create, 'DeployUI5App')`, (2) call `getAppInfo()` to check existence, (3) base64-encode archive, (4) build Atom XML payload, (5) POST (new) or PUT (existing) to `/Repositories` with headers `Content-Type: application/atom+xml; type=entry; charset=UTF-8`, query params `CodePage='UTF8'&CondenseMessagesInHttpResponseHeader=X&format=json`, optional `TransportRequest={transport}`. Return app URL.
- [ ] Implement retry logic for 408/504 timeout: retry up to 3 times, re-check `getAppInfo()` on retry to determine POST vs PUT
- [ ] Implement `undeployApp(http, safety, appName: string, transport?: string): Promise<void>` — DELETE `/Repositories('{name}')` with same query params
- [ ] Parse `sap-message` response header (JSON) for success/error details and log them
- [ ] Add unit tests (~10 tests): deploy new app (POST), redeploy existing (PUT), undeploy, transport parameter included in query, Atom XML payload structure, base64 encoding, package uppercased, retry on 504, safety check blocks, app URL construction
- [ ] Run `npm test` — all tests must pass

### Task 4: Wire up SAPManage handler

**Files:**
- Modify: `src/handlers/schemas.ts`
- Modify: `src/handlers/tools.ts`
- Modify: `src/handlers/intent.ts`

Expose deploy/undeploy via the SAPManage tool.

- [ ] Add `deploy_ui5` and `undeploy_ui5` to SAPManage action enum in `src/handlers/schemas.ts`. Add fields: `archive_base64: z.string().optional()` (for raw ZIP upload), `service_binding: z.string().optional()` (for auto-generation from SRVB)
- [ ] Update SAPManage description in `src/handlers/tools.ts` to include: `deploy_ui5: deploy a UI5/Fiori app to the ABAP system (provide service_binding to auto-generate from a published RAP service, or archive_base64 for a pre-built ZIP). undeploy_ui5: remove a deployed UI5 app.`
- [ ] Add `deploy_ui5` case in `handleSAPManage` at `src/handlers/intent.ts`: if `service_binding` is provided, read SRVB metadata, read projection CDS entity name, call `createWebappZip()` to generate the app, then call `deployApp()`. If `archive_base64` is provided, decode it and call `deployApp()` directly. Return the app URL.
- [ ] Add `undeploy_ui5` case: call `undeployApp()` with name and optional transport
- [ ] Add handler unit tests (~5 tests): deploy from service binding, deploy from archive, undeploy, missing name error, deploy returns URL
- [ ] Run `npm test` — all tests must pass

### Task 5: Create generate-fiori-app skill

**Files:**
- Create: `skills/generate-fiori-app.md`
- Create: `.claude/commands/generate-fiori-app.md`
- Modify: `skills/generate-rap-service.md`
- Modify: `.claude/commands/generate-rap-service.md`
- Modify: `skills/README.md`

Create the skill prompt template and update existing skills.

- [ ] Create `skills/generate-fiori-app.md` with the following steps: (1) Read SRVB metadata, (2) Read projection CDS view for entity name, (3) Read DDLX for UI annotation labels, (4) Call `SAPManage(action="deploy_ui5", service_binding="ZSB_...", name="ZAPP_...", package="$TMP")`, (5) Present the app URL. Include input section (service binding name required, BSP name optional, package optional, transport optional).
- [ ] Create `.claude/commands/generate-fiori-app.md` with same content
- [ ] Update `skills/generate-rap-service.md` Step 14 to add: "Next step: Generate a Fiori Elements app with the generate-fiori-app skill" with a reference to the new skill
- [ ] Update `.claude/commands/generate-rap-service.md` with same reference
- [ ] Add `generate-fiori-app` to the skills table in `skills/README.md`
- [ ] Run `npm test` — all tests must pass (skill changes are markdown, just verify no regressions)

### Task 6: Final verification

- [ ] Run full test suite: `npm test` — all tests pass
- [ ] Run typecheck: `npm run typecheck` — no errors
- [ ] Run lint: `npm run lint` — no errors
- [ ] Verify the complete E2E flow works conceptually: `generate-rap-service` → manual SRVB creation → `SAPActivate(action="publish_srvb")` → `generate-fiori-app` → app URL returned
- [ ] Document FLP guidance in skill: for BTP point to crossNavigation auto-registration, for on-prem point to `/UI2/FLPD_CUST` transaction and SAP documentation
- [ ] Move this plan to `docs/plans/completed/`
