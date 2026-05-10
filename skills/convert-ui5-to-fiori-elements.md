# Convert modern UI5 TS app ➜ Fiori Elements V4 with extensions

Replace a freestyle UI5 TypeScript app with a Fiori Elements V4 list-report + object-page
configuration, driven by `@UI.*` annotations on the underlying RAP CDS projection. Custom
behavior from the freestyle app that FE templates can't render is wired via the extension API
(extension points and extension controllers). Runs side-by-side: the freestyle TS app stays
untouched at `<modern_app>/`; the FE app lands in `<fe_app>/`.

This skill is the **last step** in the UI5con talk demo chain. It depends on:

- `migrate-segw-to-rap.md` having produced an active V4 RAP service (CDS roots + projections,
  BDEF, SRVD, SRVB published, V4 routing group registered).
- `modernize-ui5-app.md` having produced a TS baseline so we have something concrete to
  identify as "lost" / "extension-needed" features.

> **Domain example.** Annotation templates in this skill use an illustrative `Project → Tasks
> → TimeEntries` domain. Substitute the user's entities throughout — the LLM running this
> skill should rewrite every projection/entity/field identifier to match the V4 service.

## Why this is its own skill

Fiori Elements isn't a code transformation — it's a **deletion**. Most of the freestyle app
is replaced by FE templates that interpret CDS annotations. The skill's real job is:

1. Adding `@UI.*` annotations to the RAP CDS projection so FE knows what to render.
2. Generating an FE list-report + object-page project that consumes the V4 service.
3. Identifying the few places where the freestyle app did something FE templates can't, and
   wiring them via extension API (controller extensions + extension points).

## Smart defaults (apply silently — do NOT ask before research)

| Setting | Default | Rationale |
|---|---|---|
| Source TS app | `<modern_app>/` | The freestyle TS app from `modernize-ui5-app.md` |
| Target FE app | `<fe_app>/` | Reserved folder for this skill's output |
| FE floorplan | List Report + Object Page (LROP V4) when the BO has a clear root + child facets | Maps cleanly to the typical RAP composition root + children |
| Template | `lropv4` (or `feopv4` if user wants OP-only) | Default LROP unless explicitly told otherwise |
| App namespace | `<source_namespace>.fe` | Keeps the three apps distinguishable |
| UI5 version | Match `<modern_app>/`'s UI5 version | Same FE tooling release across the chain |
| Language | TypeScript | Match the modern app; extension files are TS |
| OData V4 service URL | User-provided. Default: derive from the SRVB name produced by `migrate-segw-to-rap` (typical shape `/sap/opu/odata4/sap/<service>_o4/srvd_a2x/sap/<service>/0001`). | The FE generator needs the exact endpoint to bind `$metadata` |
| Main entity | The root entity exposed by the SRVB (the alias on the root projection's `define root view entity ... alias <X>`) | The LR+OP floorplan is rooted at a single entity |
| Annotations location | **In CDS via `SAPWrite update DDLS`** — not in a local annotation file | The annotations belong to the service; FE app reads them via `$metadata`. Local annotation files are an antipattern for RAP-bound apps. |
| Extension language | TypeScript | Match the rest of the chain |
| Acceptance | FE app runs end-to-end against the V4 service: list-report shows the root entity; OP shows child facets; row navigation works; any RAP `action` annotation renders as a header button | Concrete deliverable; verifiable by browser smoke test |

## Input

- A path to the modern TS app (default: `<modern_app>/`).
- A path/name for the FE app (default: `<fe_app>/`).
- Optional: a `featureMap` describing which freestyle features must survive as extensions.
  If omitted, the skill discovers them by reading the modern app.

If the user provides nothing, default to `<modern_app>/` ➜ `<fe_app>/`.

---

## Phase 0 — Preflight

### 0a. RAP V4 service is live and bindable

```text
SAPManage(action="probe")
```

Assert `rap.available == true`.

```text
SAPRead(type="SRVB", name="ZUI_DM_PROJECTS_O4")
```

Assert the SRVB exists and is active. If not, stop with *"V4 service binding
`ZUI_DM_PROJECTS_O4` is missing or inactive — run `migrate-segw-to-rap.md` first."*

```text
Bash: curl -s "<base>/sap/opu/odata4/sap/zui_dm_projects_o4/srvd_a2x/sap/zui_dm_projects/0001/$metadata" | head -5
```

Assert 200 OK and valid XML. If 403, the V4 service group registration is missing — surface
the well-known `/n/IWFND/MAINT_SERVICE` manual step.

### 0b. CDS projection is readable + writable

```text
SAPRead(type="DDLS", name="ZC_DM_PROJECT")
```

Assert active version returns. If not, stop with *"Projection `ZC_DM_PROJECT` is missing —
re-run `migrate-segw-to-rap.md` Phase 6 Step 3."*

### 0c. Modern TS app exists

```text
Bash: cat <modern>/webapp/manifest.json | head -20
Bash: ls <modern>/webapp/controller/
```

Assert manifest parses and controllers exist. Stop with the explicit reason otherwise.

### 0d. UI5 MCP reachable

```text
mcp__SAPUI5_MCP_Server__get_version_info
```

Assert version is recent enough to template FE V4 (>= 1.130).

---

## Phase 1 — Discover what FE templates can vs. cannot handle

Read the modern TS app and classify each user-facing feature as:

- **standard** — FE templates render this natively (list, sort, filter, group, paginate, edit,
  create, delete, draft, value help on FK fields).
- **annotation-driven** — Achievable by adding the right `@UI.*` annotation (column order,
  visible facets, header info, identification group, line-item arrangement).
- **extension** — Genuinely custom behavior that needs an extension controller or extension
  point hook in the FE app.

### 1a. Read every controller in the modern app

```text
Bash: ls <modern>/webapp/controller/
Read: <modern>/webapp/controller/<each>.controller.ts
```

For each controller, enumerate every public method. Classify per the rules above. Typical
findings from a freestyle migration:

| Feature | Class | Notes |
|---|---|---|
| Project list + paging | standard | FE list-report default |
| Project sort by Status / EndDate | annotation-driven | `@UI.selectionFields` |
| Open project on row click | standard | FE row navigation default |
| Tasks list under each project | annotation-driven | `@UI.facet` referencing `_Tasks` association |
| Time entries under each task | annotation-driven | nested facet |
| ApproveProject button | annotation-driven | BDEF `action` annotation auto-renders header button |
| Custom validation before approve | extension | `onBeforeAction` extension hook |
| Side-effect badge in the list | annotation-driven | `@UI.dataPoint` |
| Open external URL on a field click | extension | `routeMatched` extension or custom `Press` event |

### 1b. Read the legacy view files for context

```text
Bash: ls <modern>/webapp/view/
Read: <modern>/webapp/view/<each>.view.xml
```

Confirm column lists / form sections. The annotation plan in Phase 2 needs to know which
fields are "headline" vs. "detail" vs. "hidden".

### 1c. Build the feature classification report

```text
Feature classification — <modern>:

Standard (handled by FE templates out of the box):
  - <n features>

Annotation-driven (need @UI.* in ZC_DM_PROJECT or related projections):
  - @UI.lineItem on ProjectId, Title, Status, StartDate, EndDate
  - @UI.selectionFields on Status, ProjectId
  - @UI.headerInfo on Title (title) + ProjectId (description)
  - @UI.facet for Tasks (via _Tasks association)
  - @UI.facet for TimeEntries (via _Tasks._TimeEntries)
  - BDEF action annotation: approve_project ➜ object-page header button
  - <list more as discovered>

Extension hooks needed:
  - Custom validation on ApproveProject ➜ ListReportExt / ObjectPageExt
  - <list more as discovered>
```

---

## Phase 2 — Annotation plan + user approval

Print the plan in this exact format and STOP for `ok` / `edit` / question:

```text
Plan — generate FE app at <target>:

Floorplan:        List Report + Object Page (LROP V4)
Namespace:        <source_namespace>.fe
UI5 version:      1.147.2 TS
OData V4 source:  <base>/sap/opu/odata4/.../zui_dm_projects/0001

Annotations to add (via SAPWrite update DDLS on the projection):
  ZC_DM_PROJECT:
    @UI.lineItem        (list-report columns): ProjectId, Title, Status, StartDate, EndDate
    @UI.headerInfo      (object-page header): title=Title, description=ProjectId
    @UI.selectionFields (filter bar): Status, ProjectId
    @UI.facet           Tasks (via _Tasks), TimeEntries (via _Tasks._TimeEntries)
    @UI.identification  (form section): Description, StartDate, EndDate, Status

  ZC_DM_TASK:
    @UI.lineItem        in Tasks facet: TaskId, Title, Status, Priority, DueDate
    @UI.headerInfo      title=Title, description=TaskId

  ZC_DM_TIMEENTRY:
    @UI.lineItem        in TimeEntries facet: EntryId, WorkDate, WorkHours, Description

  ZI_DM_PROJECT_BEH (BDEF):
    action approve_project gets @UI.headerInfo button rendering (already from BDEF action;
    no extra annotation needed)

Extension hooks (TS files to scaffold in <target>):
  - controller/ListReportExt.ts        — onBeforeRendering, page-level helpers
  - controller/ObjectPageExt.ts        — onBeforeAction("approve_project") validation
  - <list per feature classification>

Plain-text strings the FE templates need (label, headerInfo title text, etc) come from the
existing `@EndUserText.label` already on the CDS field aliases.

Type `ok` to proceed, `edit` to revise, or ask any question.
```

Wait for `ok` before mutating anything.

---

## Phase 3 — Add `@UI.*` annotations to the CDS projections

For each projection, read the current source, splice the annotations onto the right
declarations, and `update` via ARC-1.

### 3a. Annotate `ZC_DM_PROJECT` (root projection)

```text
SAPRead(type="DDLS", name="ZC_DM_PROJECT")
```

Splice annotation blocks per the plan:

```cds
@Metadata.allowExtensions: true

@UI.headerInfo: {
  typeName:       'Project',
  typeNamePlural: 'Projects',
  title:          { value: 'Title' },
  description:    { value: 'ProjectId' }
}
@UI.selectionFields: [ 'Status', 'ProjectId' ]
@UI.facet: [
  { id: 'GeneralInfo', purpose: #STANDARD,    type: #IDENTIFICATION_REFERENCE, label: 'General' },
  { id: 'Tasks',       purpose: #STANDARD,    type: #LINEITEM_REFERENCE,        label: 'Tasks',      targetElement: '_Tasks' }
]
define root view entity ZC_DM_PROJECT
  provider contract transactional_query
  as projection on ZR_DM_PROJECT
{
  key   @UI.lineItem:       [{ position: 10 }]
        @UI.identification: [{ position: 10 }]
        ProjectId,

        @UI.lineItem:       [{ position: 20 }]
        @UI.identification: [{ position: 20 }]
        Title,

        @UI.lineItem:       [{ position: 30, criticality: #STATUS_CRITICALITY }]
        @UI.identification: [{ position: 30 }]
        Status,

        @UI.lineItem:       [{ position: 40 }]
        @UI.identification: [{ position: 40 }]
        StartDate,

        @UI.lineItem:       [{ position: 50 }]
        @UI.identification: [{ position: 50 }]
        EndDate,

        Description,
        Erdat, Erzet, Ernam, Aedat, Aezet, Aenam,
        CreationTimeStamp, LastChangedStamp,

  /* associations */
  _Tasks
}
```

```text
SAPWrite(action="update", type="DDLS", name="<root_projection>", source="<spliced source>",
         transport="<transport>")
SAPActivate(type="DDLS", name="ZC_DM_PROJECT")
```

### 3b. Annotate `ZC_DM_TASK`

Repeat with `@UI.lineItem` per Task field + a `@UI.facet` for `_TimeEntries`:

```cds
@UI.headerInfo: { title: { value: 'Title' }, description: { value: 'TaskId' } }
@UI.facet: [
  { id: 'TaskInfo',    purpose: #STANDARD, type: #IDENTIFICATION_REFERENCE, label: 'Task' },
  { id: 'TimeEntries', purpose: #STANDARD, type: #LINEITEM_REFERENCE, label: 'Time Entries', targetElement: '_TimeEntries' }
]
define view entity ZC_DM_TASK as projection on ZR_DM_TASK { ... }
```

### 3c. Annotate `ZC_DM_TIMEENTRY`

`@UI.lineItem` per TimeEntry field. No further facets — TimeEntry is a leaf.

### 3d. Verify $metadata reflects the annotations

```text
Bash: curl -s "<base>/sap/opu/odata4/.../zui_dm_projects/0001/$metadata" | grep -E "UI.LineItem|UI.HeaderInfo|UI.Facets" | head -10
```

Should show inline annotations in the V4 metadata. If empty, the SRVD/SRVB hasn't picked up
the CDS changes — re-publish:

```text
SAPWrite(action="publish_srvb", name="ZUI_DM_PROJECTS_O4")
```

---

## Phase 4 — Generate the FE app

```text
mcp__SAPUI5_MCP_Server__create_ui5_app(
  appName    = "<target-folder-basename>",
  namespace  = "<source_namespace>.fe",
  version    = "1.147.2",
  framework  = "OpenUI5",
  language   = "TypeScript",
  template   = "lropv4",
  serviceUrl = "<base>/sap/opu/odata4/sap/zui_dm_projects_o4/srvd_a2x/sap/zui_dm_projects/0001",
  mainEntity = "Project"
)
```

If `create_ui5_app` doesn't expose `template=lropv4`, fall back to the Yeoman generator that
ships with `@sap/generator-fiori`:

```text
Bash: cd <workspace> && npx --yes @sap/generator-fiori --no-deploy --template "fiori-elements:lrop"
```

Then patch the generated `package.json` to use TS (`ui5-tooling-transpile`) if needed.

### 4a. Verify the generated structure

```text
Bash: ls <target>/webapp/ && cat <target>/webapp/manifest.json | head -40
```

Expected:

- `webapp/Component.ts`
- `webapp/manifest.json` with `sap.ui.generic.app` config (LRO + OP pages)
- `webapp/i18n/i18n.properties`
- `webapp/ext/` (folder for extensions, may be empty at first)
- `package.json` / `ui5.yaml` / `tsconfig.json`

### 4b. Wire `sap.app.dataSources.mainService` to the V4 service explicitly

The generator may have used a placeholder URL. Replace it with the real V4 endpoint and confirm
`odataVersion: "4.0"`.

### 4c. Smoke-test the empty FE app

```text
Bash: cd <target> && npm install && (npm start &)
```

Wait ~5 seconds, then:

```text
Bash: curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8081/index.html
```

(Use a different port from `<modern_app>/`'s `8080`.)

Open in a browser. The list-report should render with the columns dictated by `@UI.lineItem`.
If it's empty, check the console for `400` / `404` from the metadata fetch — usually the V4
URL is wrong or the service group isn't registered.

---

## Phase 5 — Implement extension hooks

For each "extension" feature from Phase 1's classification, scaffold a TS extension. FE
extensions come in two flavors:

- **Controller extensions** — extend a specific page controller. Used for `onBeforeAction`,
  `onBeforeSave`, `routeMatched`, custom field validation.
- **Extension points** — slot custom XML/Fragment into a specific spot in a page (header,
  footer, before/after a section).

For the talk demo, the typical extension is the **ApproveProject pre-condition** — block the
action if Description is empty:

```text
Write: <target>/webapp/ext/ObjectPageExt.ts
```

```typescript
import ControllerExtension from "sap/ui/core/mvc/ControllerExtension";
import MessageBox from "sap/m/MessageBox";

/**
 * @namespace <source_namespace>.fe.ext
 */
export default class ObjectPageExt extends ControllerExtension {
  public static overrides = {
    /**
     * Block ApproveProject if Description is empty.
     */
    editFlow: {
      onBeforeAction: async function (this: ObjectPageExt, mParameters: {
        actionName: string;
        context: any;
      }) {
        if (mParameters.actionName !== "ZUI_DM_PROJECTS.approve_project") return;
        const description = mParameters.context.getProperty("Description");
        if (!description) {
          MessageBox.error("Cannot approve a project without a description.");
          throw new Error("Approval blocked by extension");
        }
      }
    }
  };
}
```

Register the extension in the FE manifest:

```json
"sap.ui5": {
  "extends": {
    "extensions": {
      "sap.ui.controllerExtensions": {
        "sap.fe.templates.ObjectPage.ObjectPageController": {
          "controllerName": "<source_namespace>.fe.ext.ObjectPageExt"
        }
      }
    }
  }
}
```

Run the linter after each extension scaffold:

```text
mcp__SAPUI5_MCP_Server__run_ui5_linter(files=["<target>/webapp/ext/ObjectPageExt.ts"])
```

Repeat for every extension from Phase 1. Keep them small — one concern per extension class.

---

## Phase 6 — Validation + smoke test

### 6a. Linter + manifest validation

```text
mcp__SAPUI5_MCP_Server__run_ui5_linter
mcp__SAPUI5_MCP_Server__run_manifest_validation
Bash: cd <target> && npx tsc --noEmit
```

All three must return clean before declaring done.

### 6b. End-to-end browser smoke

Restart the dev server (kill the previous `npm start` first to free port 8081):

```text
Bash: cd <target> && pkill -f "ui5 serve" ; (npm start &)
```

Open `http://localhost:8081` in a browser. Validate (in order):

1. **List-report renders** with at least 4 columns (ProjectId, Title, Status, StartDate, EndDate).
2. **Filter bar** has Status + ProjectId filters from `@UI.selectionFields`.
3. **Row click** opens the object page.
4. **Object page header** shows Title + ProjectId (from `@UI.headerInfo`).
5. **Identification section** shows the form fields.
6. **Tasks facet** shows the related tasks (from the `_Tasks` association annotation).
7. **Click a task** → TimeEntries facet shows that task's entries.
8. **ApproveProject button** renders in the OP header (from BDEF action annotation).
9. **Click Approve without a Description** → extension blocks with the message box.
10. **Add a description, click Approve again** → success, Status flips to `A`.

If any step fails, capture the symptom + console output + network log + ARC-1 / UI5 MCP calls
into `RUN-NOTES.md` Run X.

### 6c. Final report

```text
Fiori Elements conversion complete — <target>

Floorplan:    List Report + Object Page (LROP V4)
UI5:          1.147.2 TS
V4 service:   <URL>
Annotations:  <count> @UI.* annotations added across <count> projections (ZC_DM_*)
Extensions:   <count> controller extensions (<list>)
Linter:       clean
Manifest:     clean
TypeCheck:    clean
Browser:      all 10 smoke steps pass

What just happened in 3 sentences:
  - Started with the freestyle TS app (<modern_app>/) targeting V4.
  - Annotated the CDS projections in the SAP system so FE knows how to render Project +
    Tasks + TimeEntries.
  - Generated the FE app (<fe_app>/) on top of the now-annotated $metadata, with custom
    behavior surfacing through controller extensions.

ARC-1 calls used:
  - SAPManage(action=probe)                          → <durationms>
  - SAPRead(type=DDLS, name=ZC_DM_PROJECT)           → <ms>
  - SAPWrite(action=update, type=DDLS, ...)          → <ms> × <projections>
  - SAPActivate(type=DDLS, ...)                      → <ms>
  - SAPWrite(action=publish_srvb, name=...)          → <ms> (if re-publish needed)
  - SAPRead(type=SRVB, name=ZUI_DM_PROJECTS_O4)      → <ms>
UI5 MCP calls used:
  - get_version_info
  - create_ui5_app (template=lropv4)
  - run_ui5_linter × <n>
  - run_manifest_validation
```

---

## Error handling — known modes

| Symptom | Cause | Fix |
|---|---|---|
| `$metadata` reflects no annotations after `SAPWrite update DDLS` | DDLS reactivated but SRVB wasn't republished | `SAPWrite(action="publish_srvb", name="ZUI_DM_PROJECTS_O4")` |
| `create_ui5_app` succeeds but FE app shows a blank shell | mainEntity passed without an annotated CDS view | Re-check Phase 3 — every entity in the `@UI.facet` chain needs at least `@UI.lineItem` and (for OP root) `@UI.headerInfo` |
| `400 Bad Request` on metadata fetch from FE app | Wrong V4 URL — generator used a placeholder | Patch `sap.app.dataSources.mainService.uri` in `<target>/webapp/manifest.json` to the real ZUI_DM_PROJECTS_O4 endpoint |
| FE list-report shows no columns | `@UI.lineItem` annotation is on the root view, not the projection | Move annotations to the projection (`ZC_DM_*`), not the root (`ZR_DM_*`). FE reads them from the service the SRVB exposes, which is the projection. |
| ApproveProject button not visible | Action wasn't exposed on the projection BDEF, or `use action approve_project` is missing | Check the projection BDEF (`define behavior for ZC_DM_PROJECT { ... use action approve_project; }`) and re-publish |
| Filter bar empty | `@UI.selectionFields` annotation missing or pointing at field that's not @Search.searchable | Add `@UI.selectionFields: [ '...', ... ]` at the root-projection level |
| Controller extension throws "Override target not found" | Wrong controller name in the manifest extension config | Check the FE doc for the exact controller path; LRO is `sap.fe.templates.ListReport.ListReportController`, OP is `sap.fe.templates.ObjectPage.ObjectPageController` |
| Lint flags the extension as unused | Extension isn't registered in `sap.ui5.extends.extensions` | Wire the extension in the manifest; the linter traces from there |
| `npm start` works but the OP shows "Object Not Found" | `mainEntity` in `sap.ui.generic.app` differs from the BDEF root entity | Align — for our domain it's `Project` (the alias from `ZC_DM_PROJECT alias Project`) |
| `403 Forbidden` opening the FE app | V4 service group not registered in `/n/IWFND/MAINT_SERVICE` | Manual step at end of Phase 6 in `migrate-segw-to-rap.md` — do it first |

---

## What this skill explicitly does NOT cover

- **Multi-floorplan composition** (Overview Page + LRO + ALP). Single LRO+OP is the talk
  demo's scope. Composition is a follow-up.
- **Heavy custom rendering** that genuinely can't fit into FE building blocks. If the user
  needs that, they should keep `<modern_app>/` instead of converting.
- **Custom OData V4 services** beyond the BDEF-bound projection. The FE app reads exactly
  what the SRVB exposes — no additional service config.
- **Localization beyond what the CDS `@EndUserText.label` provides.** FE picks labels from the
  service metadata. Additional translations live in i18n files in `<target>`.
- **Authorization policy.** FE renders what the service authorizes. PFCG / S_DEVELOP changes
  happen on the SAP side, not in this skill.

---

## Notes for the LLM running this skill

- ARC-1 calls in this skill are limited to: read/update DDLS for annotations, activate, and
  publish_srvb. No CLAS writes, no BDEF mutations — those happen in `migrate-segw-to-rap.md`.
  If the user wants to *also* change the BDEF here (e.g. add an annotation that needs a new
  action), stop and refer them back to the migration skill.
- Annotations belong on the **projection**, not the root view. The SRVB exposes the projection.
  FE reads from there.
- Republish the SRVB after every CDS change that affects exposed annotations. ADT will not
  do this automatically.
- The "facets reference associations" pattern is the trickiest part: a facet of type
  `#LINEITEM_REFERENCE` with `targetElement: '_Tasks'` only works if `_Tasks` is an exposed
  association on the projection. Check the projection's `use association _Tasks { ... }`
  block.
- Controller extensions are the escape hatch — when in doubt about whether something needs
  one, ask the user. The FE template can express more than people expect; only escalate when
  truly necessary.
- Reach for `mcp__sap-docs__search` with topic="fiori-elements" for the authoritative annotation
  reference before guessing.
