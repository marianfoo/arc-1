# Modernize UI5 freestyle JS app ➜ UI5 TypeScript app

Convert a legacy UI5 freestyle JavaScript app (typical 2018–2021 era — sync bootstrap, JS
controllers, `jQuery.sap.*`, ES5 patterns, no tests, `sap_belize`) into a modern UI5
TypeScript app on a recent 1.x release with async loading, manifest-driven configuration, a
proper `BaseController`, sap_horizon theme, and clean `ui5-linter` output. Runs side-by-side:
the legacy app stays untouched at `<source_app>/`; the modern app lands in `<modern_app>/`.

This skill is **one of two parallel UI paths** after the RAP backend lands. Pick this one if
the target architecture is a **freestyle TypeScript** app (custom controllers, manual binding,
explicit i18n). Pick `convert-ui5-to-fiori-elements.md` instead if the target is a
**Fiori Elements V4** app (annotation-driven; minimal custom code). Both start from the same
legacy JS app + the same V4 RAP service produced by `migrate-segw-to-rap`.

```
                  migrate-segw-to-rap.md  (backend: SEGW V2 → RAP V4)
                            │
              ┌─────────────┴─────────────┐
              ▼                           ▼
    modernize-ui5-app.md      convert-ui5-to-fiori-elements.md
        (freestyle TS)               (Fiori Elements V4)
```

> **Path/namespace placeholders.** `<source_app>/`, `<modern_app>/`, `<source_namespace>`,
> `<modern_namespace>` are user-provided. Defaults: source is `legacy-*-app/` (sibling of the
> target); modern app namespace is derived from source by appending `.modern`.

## Smart defaults (apply silently — do NOT ask before research)

| Setting | Default | Rationale |
|---|---|---|
| Source app | `<source_app>/` | The freestyle JS app under the workspace |
| Target app | `<modern_app>/` | Empty folder reserved for this skill's output |
| Target UI5 version | `1.147.2` | Latest 1.x at writing; 2.0-API-compatible; LTS-track |
| Language | TypeScript | Async-by-default; type-safe binding paths via `sap-ui5-types` |
| App namespace | Reuse source namespace, swap `.legacy` → `.modern` (e.g. `<modern_namespace>`) | Keeps grep/i18n key continuity; distinguishes from legacy in routing |
| Theme | `sap_horizon` | Default; legacy `sap_belize` is deprecated for new builds |
| Layout | Translate `sap.m.SplitApp` ➜ `sap.f.FlexibleColumnLayout` (FCL) | FCL is the modern responsive default for master-detail freestyle apps |
| Bootstrap | `data-sap-ui-async="true"` + `data-sap-ui-onInit="module:sap/ui/core/ComponentSupport"` | Sync bootstrap is deprecated and breaks UI5 2.x |
| Manifest version | `_version: 1.60.0` or later | Required for `sap.app.dataSources` + declarative models |
| OData model in modern app | The new V4 service from `migrate-segw-to-rap` if it exists (`/sap/opu/odata4/sap/zui_dm_projects_o4/srvd_a2x/sap/zui_dm_projects/0001`), otherwise the legacy V2 service via dev-server proxy | Lets the modern app demonstrate V4 features without forcing the V4 dependency for early iteration |
| Routing | `sap.m.routing.Router` ➜ `sap.f.routing.Router` with explicit `targets` per FCL column | FCL needs the f-router; m-router doesn't route into FCL columns |
| BaseController | Required | Single source of truth for `getRouter`, `getModel`, `getResourceBundle`, `getOwnerComponent` |
| Tests | OPA5 page object + journeys, QUnit unit tests for formatters/utilities | Skipped from first cut; promoted to a follow-up if Run 1 is green |
| Linter | `mcp__SAPUI5_MCP_Server__run_ui5_linter` → 0 findings | The hard acceptance criterion |
| Manifest validation | `mcp__SAPUI5_MCP_Server__run_manifest_validation` → 0 errors | The other hard acceptance criterion |

## Input

The user provides **one of**:

- A relative path to the legacy app, e.g. `<source_app>/`
- A target folder name, e.g. `<modern_app>/` (skill infers source as the sibling `legacy-*`)
- Nothing — assume defaults (`<source_app>/` ➜ `<modern_app>/`)

If both folders exist and the target is non-empty, ask: **"`<target>/` already has content.
Wipe it and start over, or migrate into the existing structure?"** Default to wipe-and-rewrite
for the demo.

---

## Phase 0 — Preflight

### 0a. Legacy app readable

```text
Bash: cat <legacy>/webapp/manifest.json
Bash: ls <legacy>/webapp/{controller,view,model,fragment,i18n,formatter}
```

Assert: `manifest.json` parses; `webapp/controller/` and `webapp/view/` both exist; at least
one `*.controller.js` and one `*.view.xml` are present. If any of these fail, stop with
*"`<legacy>` does not look like a UI5 app — check the path."*

### 0b. UI5 MCP server reachable

```text
mcp__SAPUI5_MCP_Server__get_version_info
```

Assert: returns a version >= 1.130. If not, stop with *"UI5 MCP server is not configured;
configure it in `.cursor/mcp.json` before running this skill."*

### 0c. npm + node available

```text
Bash: node --version && npm --version
```

Assert: Node 18+ and npm 9+. Otherwise stop with the version found and the requirement.

---

## Phase 1 — Discover the legacy app

Read every relevant file in `<legacy>/webapp/`. For each, classify findings as
**blocker** (must fix for modern UI5), **cleanup** (worst-practice but works), or
**cosmetic** (style).

### 1a. Manifest scan

Pull `_version`, `sap.ui5.dependencies.minUI5Version`, `sap.ui5.rootView`,
`sap.ui5.dependencies.libs`, `sap.ui5.routing`, `sap.ui5.models`, `sap.ui5.contentDensities`,
`sap.ui5.resources`, theme references.

Common legacy patterns to flag:

- `_version: 1.40.0` (legacy) ➜ blocker (FE compat requires 1.60+)
- `minUI5Version` < 1.108 ➜ blocker (no async support guarantees)
- `routerClass: "sap.m.routing.Router"` with FCL target ➜ blocker
- Hard-coded service URLs in `sap.ui5.models` ➜ cleanup (move to `sap.app.dataSources`)
- `contentDensities: { compact: true, cozy: true }` ➜ cleanup (deprecated key)
- `supportedThemes: ["sap_belize"]` ➜ cleanup (set `sap_horizon`)

### 1b. Component.js scan

Read `<legacy>/webapp/Component.js`. Look for:

- `sap.ui.define([...], function() { ... })` wrapper ➜ OK, normal
- `var UIComponent = ...` capture ➜ OK
- Bare `init()` with `this._oRouter = ...` ➜ cleanup (use `UIComponent.prototype.init.apply`)
- Manual model creation in `init()` (e.g. `new sap.ui.model.odata.v2.ODataModel(...)`) ➜
  cleanup (move to manifest declarative)
- `jQuery.sap.require(...)` ➜ blocker (delete)

### 1c. Controller scan (per controller)

For each `<legacy>/webapp/controller/<X>.controller.js`:

```text
Read: <legacy>/webapp/controller/<X>.controller.js
```

Flag:

- `var that = this;` followed by closures ➜ cleanup (rewrite as arrow functions)
- `oCtx.getPath()` regex parsing ➜ cleanup (use `oCtx.getProperty("Key")`)
- `sap.ui.getCore().byId(...)` ➜ cleanup (use `this.byId(...)`)
- `sap.ui.getCore().getModel(...)` ➜ blocker (use `this.getOwnerComponent().getModel(...)`)
- `MessageBox.show(...)` import via `sap.ui.commons` ➜ blocker (switch to `sap.m.MessageBox`)
- `jQuery.sap.require(...)` ➜ blocker (use ES module import in TS)
- Globals formatter calls like `'window.com.demo.formatter.X'` ➜ cleanup (controller-relative
  `'.formatter.X'` with the required-module shorthand)
- Sync XHR / `jQuery.ajax({async:false})` ➜ blocker
- No JSDoc / type hints on parameters ➜ cosmetic (TS rewrite handles it)
- Method `onInit` doing routing setup manually ➜ cleanup (use manifest routing + attachRouteMatched)

### 1d. View scan (per view)

For each `<legacy>/webapp/view/<X>.view.xml`:

```text
Read: <legacy>/webapp/view/<X>.view.xml
```

Flag:

- Inline event handlers like `press=".onSomething"` referencing a method that doesn't exist
  in the controller ➜ blocker (will throw at runtime)
- `<core:Fragment fragmentName="...">` without async ➜ cleanup
- Deprecated controls (e.g. `sap.ui.commons.*`) ➜ blocker (replace with `sap.m.*` / `sap.f.*`)
- `sap.m.SplitApp` ➜ blocker (translate to `sap.f.FlexibleColumnLayout` per smart-defaults)
- Hardcoded strings instead of i18n keys ➜ cleanup

### 1e. Build the findings report

Output a structured summary to the user:

```text
Discovery — legacy app: <legacy>
  Manifest version: 1.40.0 (target 1.60+)
  UI5 version: 1.84.0 (target 1.147.2)
  Controllers: 3 (App, Master, Detail)
  Views: 5 (App, Master, Detail, Welcome, NotFound)
  Layout: sap.m.SplitApp (target sap.f.FlexibleColumnLayout)
  Theme: sap_belize (target sap_horizon)

Blockers (<n>):
  - Component.js: jQuery.sap.require(...)
  - Master.controller.js: sap.ui.getCore().getModel("legacyData")
  - App.view.xml: <SplitApp> root needs FCL translation
  - ...

Cleanups (<n>):
  - Detail.controller.js: 4× `var that = this;` patterns
  - ...

Cosmetic (<n>):
  - Missing JSDoc across controllers
  - ...
```

---

## Phase 2 — Design plan + user approval

Print the migration plan in this exact format and STOP for `ok` / `edit` / question:

```text
Plan — modernize <legacy> ➜ <target>:

UI5 version:       1.147.2 (latest 1.x)
Language:          TypeScript
Namespace:         <source_namespace>.modern (e.g. <modern_namespace>)
Theme:             sap_horizon
Layout:            sap.f.FlexibleColumnLayout (translated from SplitApp)
OData model:       <V4 if migrate-segw-to-rap ran, else V2 via proxy>

Files to generate (target/webapp):
  Component.ts
  manifest.json (v1.60.0)
  controller/BaseController.ts
  controller/App.controller.ts
  controller/Master.controller.ts
  controller/Detail.controller.ts
  view/App.view.xml (FCL root)
  view/Master.view.xml
  view/Detail.view.xml
  view/Welcome.view.xml
  view/NotFound.view.xml
  i18n/i18n.properties + i18n_en.properties + i18n_de.properties
  css/style.css
  model/models.ts (just the device model helper — OData is declarative)
  formatter/ (consolidated from legacy formatter calls)
  ui5.yaml (with sap-ui5-types + ui5-tooling-transpile)
  package.json (ui5-cli + dev-dependencies)
  tsconfig.json

Blockers being fixed: <count> (listed above)
Cleanups applied:     <count>
Cosmetic skipped:     <count> (run a separate prettier pass later if desired)

Tests in this skill: none (OPA5/QUnit follow-up)
Acceptance:          ui5-linter clean + manifest validation clean + npm start renders home view

Type `ok` to proceed, `edit` to revise, or ask any question.
```

Wait for `ok` before mutating anything in `<target>/`.

---

## Phase 3 — Scaffold the modern TS app

```text
mcp__SAPUI5_MCP_Server__create_ui5_app(
  appName = "<target-folder-basename>",
  namespace = "<source_namespace>.modern",
  version = "1.147.2",
  framework = "OpenUI5",
  language = "TypeScript",
  template = "freestyle-ts"
)
```

Verify the structure after generation:

```text
Bash: ls -la <target>/ && ls <target>/webapp/
```

Expected: `package.json`, `ui5.yaml`, `tsconfig.json`, `webapp/{Component.ts,manifest.json,view/,controller/,i18n/,index.html}`.

If `create_ui5_app` fails or produces a JS-only template, fall back to manual scaffolding via
the `@ui5/cli` CLI:

```text
Bash: cd <target> && npx --yes @ui5/cli init --name <app> --framework openui5 --version 1.147.2
```

Then add `ui5-tooling-transpile` and TS deps to `package.json` manually.

---

## Phase 4 — Translate manifest.json

Read the freshly-generated `<target>/webapp/manifest.json` from the template, then **merge in**
the legacy specifics:

1. Set `sap.app.id` = `<source_namespace>.modern`.
2. Set `sap.app.title` / `sap.app.description` from `i18n` keys (already templated).
3. Copy `sap.app.icons` from legacy if non-empty.
4. Add `sap.app.dataSources` with the chosen OData service:
   ```json
   "dataSources": {
     "mainService": {
       "uri": "<V4 or V2 URL>",
       "type": "OData",
       "settings": { "odataVersion": "<4.0 or 2.0>", "localUri": "localService/metadata.xml" }
     }
   }
   ```
5. Set `sap.ui5.dependencies.minUI5Version` = `"1.147.0"` and add libs the legacy used:
   `sap.ui.core`, `sap.m`, `sap.f`, `sap.ui.layout`.
6. Add `sap.ui5.models.""`:
   ```json
   "": {
     "type": "<sap.ui.model.odata.v4.ODataModel or v2.ODataModel>",
     "dataSource": "mainService",
     "settings": { "operationMode": "Server", "synchronizationMode": "None" }
   }
   ```
7. Set `sap.ui5.rootView` to `<ns>.view.App` (FCL root).
8. Set `sap.ui5.routing.config.routerClass` = `"sap.f.routing.Router"`, `viewType` = `"XML"`,
   `viewPath` = `"<ns>.view"`, `async` = `true`, `controlId` = `"flexibleColumnLayout"`,
   `controlAggregation` = `"beginColumnPages"` (default; per-route overrides for mid/end).
9. Translate routes — preserve patterns from legacy (`""`, `"Projects/{projectId}"`,
   `"Projects/{projectId}/Tasks/{taskId}"` if FCL deep-nav).
10. Add `sap.ui5.contentDensities` = `{ "compact": true, "cozy": true }` (still supported, just
    declarative now).
11. Drop `supportedThemes` from `sap.ui` (sap_horizon is default).

Write the merged manifest:

```text
Write: <target>/webapp/manifest.json
```

Validate:

```text
mcp__SAPUI5_MCP_Server__run_manifest_validation
```

Fix anything it flags before moving on.

---

## Phase 5 — BaseController + Component.ts + App.view.xml

### 5a. BaseController.ts

```text
Write: <target>/webapp/controller/BaseController.ts
```

Template:

```typescript
import Controller from "sap/ui/core/mvc/Controller";
import UIComponent from "sap/ui/core/UIComponent";
import Router from "sap/f/routing/Router";
import Model from "sap/ui/model/Model";
import ResourceModel from "sap/ui/model/resource/ResourceModel";
import ResourceBundle from "sap/base/i18n/ResourceBundle";

/**
 * @namespace <source_namespace>.modern.controller
 */
export default class BaseController extends Controller {
  public getRouter(): Router {
    return UIComponent.getRouterFor(this) as Router;
  }
  public getModel(name?: string): Model | undefined {
    return this.getView()?.getModel(name);
  }
  public setModel(model: Model, name?: string): void {
    this.getView()?.setModel(model, name);
  }
  public async getResourceBundle(): Promise<ResourceBundle> {
    const i18n = this.getOwnerComponent()!.getModel("i18n") as ResourceModel;
    return (await i18n.getResourceBundle()) as ResourceBundle;
  }
  public onNavBack(): void {
    const history = window.history;
    if (history.length > 1) history.back();
    else this.getRouter().navTo("master", {}, true);
  }
}
```

### 5b. Component.ts

Read the generated `Component.ts` and ensure:

```typescript
import UIComponent from "sap/ui/core/UIComponent";
import models from "./model/models";

export default class Component extends UIComponent {
  public static metadata = { manifest: "json" };
  public init(): void {
    super.init();
    this.setModel(models.createDeviceModel(), "device");
    this.getRouter().initialize();
  }
}
```

### 5c. App.view.xml (FCL root)

```xml
<mvc:View
    xmlns:mvc="sap.ui.core.mvc"
    xmlns="sap.f"
    controllerName="<source_namespace>.modern.controller.App"
    displayBlock="true"
    height="100%">
    <FlexibleColumnLayout id="flexibleColumnLayout"
        backgroundDesign="Solid"
        layout="OneColumn"/>
</mvc:View>
```

App.controller.ts is minimal — just `BaseController` extension, no body needed unless the
legacy `App.controller.js` had logic.

---

## Phase 6 — Per-view conversion

For each legacy `<View>.view.xml` + `<View>.controller.js`, generate the modern equivalent.
Process them in this order: **Master ➜ Detail ➜ Welcome ➜ NotFound**. The view-by-view
translation is mechanical once the smart defaults table is internalized; the controller
translation is the part to focus on.

### 6a. View translation pattern

- Replace `<SplitApp>` / `<Page>` root with FCL column XML — Master goes into `beginColumnPages`,
  Detail into `midColumnPages`, etc. Each view's content (toolbar, list, form) stays.
- Replace `controllerName="<source_namespace>.<X>"` with `controllerName="<source_namespace>.modern.controller.<X>"`.
- Drop sap.ui.commons references.
- Convert deprecated controls to sap.m / sap.f equivalents (e.g. `sap.ui.table.Table` → keep,
  but `sap.ui.commons.Table` → replace with `sap.m.Table`).
- Keep `press=".onWhatever"` event handler names — the controller will declare matching methods.
- Replace inline binding `text="{path}"` with type info if the field is numeric/date:
  `text="{path: 'Aedat', type: 'sap.ui.model.type.Date', formatOptions: {pattern: 'yyyy-MM-dd'}}"`.

### 6b. Controller translation pattern

For each `<X>.controller.js`:

1. Convert `sap.ui.define([...], function() { return ...; })` to ES module imports.
2. Class extends `BaseController` (from step 5a).
3. Translate `var that = this; function() { that.something(); }` → arrow function
   `() => { this.something(); }`.
4. Translate `var oModel = sap.ui.getCore().getModel("X")` → `const oModel = this.getOwnerComponent()!.getModel("X")`.
5. Translate `sap.ui.getCore().byId(...)` → `this.byId(...)`.
6. Translate `sap.ui.commons.MessageBox` → `sap.m.MessageBox`.
7. Translate path-string parsing (`oCtx.getPath().replace(...)`) to property access (`oCtx.getProperty("Key")`).
8. Replace `jQuery.sap.require(...)` with ES `import`.
9. Add type annotations: `private oTable: Table;`, `public onPressItem(event: ListItemBase$PressEvent): void { ... }`.
10. Move private fields to class properties (no `this._oTable = ...` in `onInit`).
11. Pull legacy formatter functions into `<target>/webapp/formatter/<X>.ts` and import them
    in the views via `path: 'X', formatter: '.formatter.X'` syntax.

### 6c. Write each pair

```text
Write: <target>/webapp/view/<X>.view.xml
Write: <target>/webapp/controller/<X>.controller.ts
```

After each pair, run the linter against just the new file:

```text
mcp__SAPUI5_MCP_Server__run_ui5_linter(files=["<target>/webapp/controller/<X>.controller.ts"])
```

Fix findings before advancing to the next view. **Do not** accumulate lint debt — each file
should ship green.

### 6d. i18n / formatter / model

Mirror the legacy `webapp/i18n/i18n.properties` keys into `<target>/webapp/i18n/i18n.properties`
verbatim. Add missing translations only if the user asked for them.

Consolidate legacy formatter functions (globals `window.com.demo.formatter.X`, inline anonymous
functions in views) into `<target>/webapp/formatter/index.ts` with one named export per
function. Update views to use `formatter: '.formatter.<fnName>'`.

`model/models.ts` holds only the device-model helper. The OData model is declarative in the
manifest.

---

## Phase 7 — Validation pass

```text
mcp__SAPUI5_MCP_Server__run_ui5_linter
```

Expected: zero findings. Common false-positives to suppress with a JSDoc `@ui5-lint-disable`
only as a last resort — most findings have a real fix.

```text
mcp__SAPUI5_MCP_Server__run_manifest_validation
```

Expected: zero errors. Warnings about unused i18n keys are OK.

```text
Bash: cd <target> && npx tsc --noEmit
```

Expected: zero errors. Fix type errors before advancing.

---

## Phase 8 — Smoke test

### 8a. Install + serve

```text
Bash: cd <target> && npm install && (npm start &)
```

Wait ~5 seconds for the dev server to start.

### 8b. HTTP probe

```text
Bash: curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8080/index.html
Bash: curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8080/manifest.json
```

Expected: both return 200. If 404, the ui5.yaml `webapp` path is wrong.

### 8c. OData probe (through dev-server proxy)

If targeting V4:

```text
Bash: curl -s "http://localhost:8080/sap/opu/odata4/sap/zui_dm_projects_o4/srvd_a2x/sap/zui_dm_projects/0001/$metadata" | head -5
```

If targeting V2 (legacy compat path):

```text
Bash: curl -s "http://localhost:8080/sap/opu/odata/sap/<legacy_service>/$metadata" | head -5
```

Expected: valid XML metadata response. If 401, the proxy isn't authenticating; if 404, the
service binding isn't published yet.

### 8d. Final report

Print to the user — final report; no `ok` wait:

```text
Modernization complete — <target>

UI5 version:    1.147.2 (TypeScript)
Theme:          sap_horizon
Layout:         sap.f.FlexibleColumnLayout
OData:          V<2|4> (<URL>)
Views:          <count>, all under FCL columns
Controllers:    <count>, all extending BaseController
Linter:         clean (<n> auto-fixed)
Manifest:       valid
TypeCheck:      clean
Smoke:          200 OK on index.html + manifest.json + $metadata

ARC-1 calls used: 0 (this skill talks to UI5 MCP, not ARC-1)
UI5 MCP calls:    <count> (create_ui5_app, run_ui5_linter, run_manifest_validation, ...)

What's next:
  - Open http://localhost:8080 in a browser. Master list should render with projects from
    the OData service.
  - Run convert-ui5-to-fiori-elements.md to replace this freestyle TS app with a Fiori
    Elements V4 list-report + object-page (depends on V4 RAP service).
  - Run RUN-NOTES.md Run X capture if any quirks surfaced.
```

---

## Error handling — known modes

| Symptom | Cause | Fix |
|---|---|---|
| `create_ui5_app` fails with "namespace already exists" | Target folder has a partial generation from a prior run | `rm -rf <target>/` and retry; manifest's `sap.app.id` is the namespace check |
| `run_ui5_linter` returns 100s of findings on a freshly-generated app | UI5 MCP picked a JS template, not TS | Inspect `<target>/webapp/`; if `.js` files everywhere, re-run create_ui5_app with `language="TypeScript"` explicit |
| `tsc --noEmit` complains about missing types from `sap/m/...` | `sap-ui5-types` not installed | `cd <target> && npm install --save-dev @sapui5/types@1.147.2` |
| `npm start` fails with "port 8080 in use" | Legacy app's `npm start` already running on same port | Stop legacy first (`pkill -f "ui5 serve"`); or run modern on a different port via `ui5 serve -p 8081` |
| Browser shows blank page, console says "failed to load Component.js" | Manifest's `sap.app.id` doesn't match the runtime path | Check `index.html`'s `data-sap-ui-resourceroots` and align with `sap.app.id` |
| OData service returns 401 | Dev-server proxy not forwarding auth | Check `ui5.yaml` middleware config; should use `ui5-middleware-simpleproxy` or similar with `authentication: basic` and env-var-driven creds |
| FCL doesn't switch layouts on navigation | Routing `targets.<X>.controlAggregation` set to wrong FCL column | Master ➜ `beginColumnPages`, Detail ➜ `midColumnPages`, third level ➜ `endColumnPages`; layout property on route specifies `OneColumn` / `TwoColumnsMidExpanded` / etc. |
| `MessageBox` import fails in TS | Wrong import path | `import MessageBox from "sap/m/MessageBox";` — the legacy `sap.ui.commons` path is gone |
| Lint flags formatter functions as "unused" | Formatter imported into controller but only referenced in view XML | Add JSDoc `@public` on each exported formatter function; the linter will trace XML usage |
| Manifest validation flags `dataSources.mainService.uri` as missing | Default value in scaffolded template wasn't replaced | Update with the real URL from the discovery phase; localUri can be a placeholder for offline testing |

---

## What this skill explicitly does NOT cover

- **Adding new features.** This is a translation skill — feature-parity with the legacy app
  only. If the legacy app didn't have search, the modern app doesn't get search.
- **Tests.** OPA5 + QUnit scaffolding is a follow-up skill — skipped here to keep scope tight
  and let the first cut land green.
- **Accessibility audit.** UI5 1.147 controls are accessible by default, but a real audit (axe,
  manual screen-reader pass) is its own deliverable.
- **Fiori Launchpad integration.** The modern app stands alone here. FLP tile registration is
  part of the FE skill or a separate FLP skill.
- **i18n expansion.** If the legacy app shipped only English, the modern app does too. Adding
  German / Spanish / etc. is a follow-up.

---

## Notes for the LLM running this skill

- Per-view granularity matters: do one view fully (XML + controller + formatter + lint) before
  moving to the next. Don't accumulate technical debt across views.
- Reach for `mcp__SAPUI5_MCP_Server__get_api_reference` whenever a legacy API name disappears
  in the modern target; don't guess the replacement.
- Reach for `mcp__SAPUI5_MCP_Server__get_typescript_conversion_guidelines` before the first
  controller — it has the authoritative TS migration playbook from SAP.
- If `mcp__SAPUI5_MCP_Server__get_guidelines` returns the FE guidelines mixed in, filter to the
  freestyle-TS topic — they're different.
- ARC-1 is not in scope for this skill. All MCP calls go to the SAPUI5 MCP server. If the user
  asks why ARC-1 isn't being used, explain: ARC-1 is the ABAP/backend tool; the UI5 app lives
  outside the SAP system.
