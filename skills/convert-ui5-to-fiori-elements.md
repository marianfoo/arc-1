# Convert modern UI5 TS app ➜ Fiori Elements with extensions

Replace a freestyle UI5 TypeScript app with a Fiori Elements V4 list-report + object-page
configuration, driven by CDS UI annotations on the underlying RAP service, with extension API
hooks for any custom behavior the freestyle app had.

> **Status: stub.** This skill runs *after* both `migrate-segw-to-rap.md` (so we have a V4
> service with CDS) and `modernize-ui5-app.md` (so we have a clean TS baseline to compare
> against). Full version comes last.

## Why this is its own skill

Fiori Elements isn't a code transformation — it's a **deletion**. Most of the app is replaced
by FE templates that interpret CDS annotations. The skill's real job is:

1. Adding the right `@UI.*` annotations to the RAP CDS projection (so FE knows what to render)
2. Generating an FE list-report + object-page project that consumes the V4 service
3. Identifying the few places where the freestyle app did something FE templates can't, and
   wiring them as **extension API** hooks (extension points + extension controllers)

## Planned phases

1. **Read the modern TS app** — figure out what custom behavior exists beyond plain CRUD list+detail.
2. **Read the RAP CDS projection** (`ZC_DM_PROJECT` etc.) — list current annotations.
3. **Annotate** — add `@UI.lineItem`, `@UI.facet`, `@UI.headerInfo`, `@UI.fieldGroup`,
   `@UI.identification`, `@UI.dataPoint`, `@UI.selectionFields`, `@Search.searchable`, etc.
   to the CDS via `SAPWrite(action="update", type="DDLS", ...)`.
4. **Generate FE app** — `mcp__SAPUI5_MCP_Server__create_ui5_app` with template
   `OVPV4` / `LROPV4`, namespace `com.demo.migration.projects.fe`, target folder `fe-ui5-app/`.
5. **Map custom behavior to extensions:**
   - Custom validations → extension API `onBeforeCreate` / `onBeforeUpdate`
   - Custom buttons → extension point `EditableHeaderContent` / `Footer`
   - Custom navigation → extension API `routerRouting` overrides
   - Custom formatters → CDS `@UI.textArrangement` + virtual fields where possible
6. **Smoke test** — open the FE app, verify list-report shows projects with same columns,
   object-page shows tasks/time-entries facets, ApproveProject action button works.

## Inputs to pull from MCPs at runtime

- `mcp__sap-docs__search` for `@UI.*` annotation reference (cloud-flavour search).
- `mcp__SAPUI5_MCP_Server__get_guidelines` filtered to `fiori-elements` topic.
- `mcp__sap-docs__fetch` to get full Fiori Elements developer guide pages when designing facets.

## Acceptance criteria

- FE list-report renders with at least 4 columns + chevron navigation.
- Object page has a Tasks section facet showing the related tasks table.
- Tasks facet has a click-through to a TimeEntries section facet (deep nav).
- The `ApproveProject` action shows up as a button in the object-page header (auto-rendered
  from the BDEF action annotation).
- Zero custom controller code unless an extension hook is genuinely required.
- `mcp__SAPUI5_MCP_Server__run_ui5_linter` passes.
- `mcp__SAPUI5_MCP_Server__run_manifest_validation` passes.

## Open questions

- Building blocks vs full FE: if a customer can't move to full FE templates, this skill should
  optionally produce a "freestyle app with FE building blocks" — same FE benefits, more freedom.
  Decide upfront which mode the skill operates in based on user input.
- Multiple object pages (one per child entity) vs single object page with facets — depends on
  how richly nested the model is; for our Project → Tasks → TimeEntries case, one object page
  with two facets is correct.

(Both get resolved when we write the full version.)
