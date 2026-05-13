---
name: sap-fiori-app-audit
description: Operational audit of a single SAP Fiori Elements V4 application — verifies user journey, frontend/backend contract coherence, manifest + annotations + EDMX alignment, i18n coverage, action availability, draft behavior, and applies only safe quick-win fixes on a dedicated branch. Use when asked to "audit Fiori app X", "verify Fiori Elements app", "check the manager/governance/billing app", "review the UI/UX of a Fiori app", "find action gaps in Fiori app", or to validate that a Fiori Elements V4 app is production-ready.
---

# SAP Fiori App Audit

Audit one Fiori Elements V4 app end-to-end. The audit covers the **operational journey** (filter → list → detail → action → refresh) and the **frontend/backend contract** (UI flag → CDS annotation → `@restrict` grant → handler implementation), then optionally applies **safe quick wins** on a dedicated branch.

The skill targets projects with a typical CAP + Fiori Elements V4 layout: a CAP service on the backend exposing entities and bound actions, and one or more Fiori Elements V4 apps under `app/<app-name>/webapp/` (or `apps/<app-name>/`), with `manifest.json`, `webapp/ext/` extensions, `webapp/i18n/` bundles, and CDS annotations split across `app/annotations*.cds`.

## v1 Guardrails

- **Single app per invocation.** `all` is supported but emits N reports (one per app), not a merged one.
- **Read-only by default.** `fix` is opt-in; applies only safe additive UX fixes.
- **Never touch dirty files**, unless they're inside the requested scope and the user has explicitly authorized.
- **Branch-isolated fixes.** Each audit-fix run creates `audit/fiori-<app>-<yyyy-mm-dd>`.
- **Cite `file:line`** on every finding.

## Smart Defaults (apply silently, do NOT ask)

| Aspect | Default | Why |
| --- | --- | --- |
| Mode | `report` | Safer default; user opts into `fix` |
| Output language | English (Italian if `CLAUDE.md`/`AGENTS.md` requires it) | Match the project's primary language |
| App-discovery roots | `app/`, `apps/`, `webapp/` | Most common layouts |
| Service introspection | `npx cds compile srv app --service <Service> --to edmx` | Single source of truth for action/property availability at runtime |
| UI5 version | The version declared in `manifest.json:sap.platform.cf` or `manifest.json:sap.ui5.dependencies.minUI5Version` | Don't bump it as a side effect |
| Test scope | Only files touched by the audit-fix branch | Keep run time under 30s |

## Input

Single argument with format `<app-name-or-scope> [mode]`:

| Argument | Meaning |
| --- | --- |
| `<app-name>` | App directory name (e.g. `manager-ui`, `governance`, `billing`). The skill resolves to `app/<app-name>` or `apps/<app-name>` |
| `all` | Iterate every Fiori app found under the app roots |
| `mode` (optional) | `report` (default) · `fix` (apply safe quick wins) · `pending-only` (only verify existing pending findings) |

Examples: `manager-ui`, `governance fix`, `all pending-only`.

## Step 1: Pre-flight

### 1a — Resolve the app

```bash
# Resolve target directory
for root in app apps; do
  test -d "$root/<app-name>" && echo "Found: $root/<app-name>" && break
done
```

If the app cannot be resolved, list all apps found and stop.

### 1b — Git state

```bash
git status --short
git branch --show-current
git log -1 --oneline
```

Classify dirty files:
- **Inside scope** → treat as in-flight work, do not overwrite in `fix` mode.
- **Outside scope** → ignore.

### 1c — Identify the file map

For the chosen app, locate:

| Artifact | Typical location |
| --- | --- |
| Manifest | `app/<app>/webapp/manifest.json` |
| Extensions / custom controllers | `app/<app>/webapp/ext/**/*.{ts,js,xml}` |
| i18n bundles | `app/<app>/webapp/i18n/i18n*.properties` |
| Annotations (global) | `app/annotations.cds` |
| Annotations (per-app) | `app/annotations/<app>.cds` if it exists |
| Backend service | `srv/*Srv.cds` (look for `@(path:'...')` matching the manifest `dataSources` URI) |
| Action handlers | `srv/handlers/*.ts` referenced by the service |
| Auth declarations | `srv/services-auth.cds`, `xs-security.json` |

### 1d — Pending findings (if registry exists)

If the project keeps an audit-pending registry (e.g. `docs/audit/APP_AUDIT_PENDING.md`):

1. Read every entry whose scope matches the chosen app and status is `Pending` or `Recheck`.
2. For each, re-verify the evidence against the current code AND against the **runtime EDMX**:

```bash
npx cds compile srv app --service <Service> --to edmx > /tmp/<service>.edmx
```

Source-level fix without EDMX evidence is `Partially Fixed`, not `Closed`.

3. Classify outcomes: `Closed`, `Still Open`, `Partially Fixed`, `Superseded` (with reason).

If `pending-only` mode, stop here and emit the verification table.

## Step 2: End-to-end user journey

Walk the canonical journey of the app and audit each station. Document gaps as you go.

### 2a — Entry point (List Report / landing)

- Does the manifest declare a landing page with sensible defaults (`navigation.list.detail.routing`, `initialLoad`)?
- Are filter variants persisted (`flexEnabled: true` + `supportedLocales`)?
- Is `liveMode: true` enabled only on **small** datasets (CodeLists, master data)? On large entities it triggers a `$batch` per keystroke — performance regression.

### 2b — Filter bar and variants

- For every filter field that points to master data (FK to CodeList / Categories / etc.), is there a `@Common.ValueList` annotation? Free-text input on a master-data field is a P2 finding.
- For required filters, is `@UI.SelectionFields` aligned with backend `@assert.range` constraints?
- Validate `@Common.ValueListWithFixedValues` is **not duplicated** on the same field — MDC will crash with "Invalid property definition".

### 2c — ObjectPage navigation

- Is the routing target reachable? `routing.routes` must declare every ObjectPage referenced by the List Report.
- Does the ObjectPage have a meaningful HeaderInfo (Title / TypeName / Description)? Missing HeaderInfo → "Object" generic title.
- For draft-enabled entities (`@odata.draft.enabled: true`):
  - Is the active/inactive transition handled in the controller's `before('EDIT', ...)`?
  - Are computed flags re-evaluated on draft activation (otherwise stale `Can*` flags persist into the active row)?

### 2d — Sections and Facets

- Audit every `@UI.Facets[].$Type` is one of `UI.ReferenceFacet`, `UI.CollectionFacet`, `UI.ReferenceURLFacet`.
- Detect duplicate Facet IDs — Fiori Elements generates auto-Facets for HeaderInfo; custom Facets with the same ID will collide.
- For each table Facet (`UI.LineItem` on a composition target), verify the navigation property is reachable from the parent entity.

### 2e — Primary and secondary actions

For every action exposed via `UI.Identification` or `UI.LineItem`:

| Check | Pattern |
| --- | --- |
| Backend action exists | `grep -nE "action <name>" srv/*Srv.cds` |
| `@Core.OperationAvailable` references a flag | `Can<name>` flag is computed by a handler |
| Flag is NOT `@UI.Hidden` | FE v4 with `autoExpandSelect: true` skips hidden properties in `$select` → flag undefined → button stuck disabled |
| `@restrict` grants the action to expected roles | `srv/services-auth.cds` |
| Handler implementation present | `srv/handlers/*.ts` |

### 2f — Refresh after action

- Does the action use `@Common.SideEffects` to refresh affected fields/sections?
- Does the handler return the **full entity** (no `.columns()` filter)? Returning a partial entity breaks edit-mode refresh in FE v4.
- For batched/list actions, are `TargetProperties` and `TargetEntities` declared so FE knows what to invalidate?

### 2g — Error handling, empty states, i18n

- Backend errors: action handlers should use a centralized reject helper (e.g. `rejectSafe`) — never leak `err.message` to the client.
- Empty states: does the table have a `noData` text in i18n bundle?
- i18n bundle present in `webapp/i18n/i18n.properties` + at least one localized variant? Hardcoded user-visible text in TS/XML is a P2 finding.
- Manifest declares `i18n` model under `sap.ui5.models` with `bundleName` matching the actual file path?

### 2h — Responsive / mobile

- Does the table declare `condensedTableLayout: true`?
- Are column widths or visibility tuned with `@UI.Importance` (`#High` / `#Medium` / `#Low`)?
- For long text columns, is `wrap` or `maxLines` set to avoid overflow?

## Step 3: Frontend ↔ backend contract chain

For every primary action exposed by the app, trace the full chain:

```
Manifest / annotation / fragment
  → flag Can* / CanUse*
  → READ enrichment or projection CDS
  → @restrict in services-auth.cds
  → action handler backend
  → SideEffects / refresh UI
  → test exists or test missing
```

Compile findings into a table:

| Action | Surface | Flag | Backend grant | Handler | Refresh | Test | Gap |
| --- | --- | --- | --- | --- | --- | --- | --- |

Common gaps to record:

1. **UX-positive-false**: UI shows action, backend rejects with 403/409. Always P1 if blocks the only path forward, else P2.
2. **UX-negative-false**: UI hides action that the role would be granted to invoke.
3. **Flag computed with state-only logic, grant is user-aware** (or vice versa).
4. **Company-code / tenant scope mismatch** between UI query, enrichment, and handler.
5. **Draft vs active behavior divergence** for the same action.

## Step 4: Automated checks (scoped)

Run only the targets relevant to the scope.

```bash
# CDS compile and EDMX dump
npx cds compile srv app --service <Service> --to edmx > /tmp/<service>.edmx

# TypeScript typecheck (if app has tsconfig.json)
test -f "app/<app>/tsconfig.json" && (cd "app/<app>" && npm run ts-typecheck 2>&1 | tail -20)

# UI5 build (if app has build script)
test -f "app/<app>/package.json" && grep -q '"build"' "app/<app>/package.json" && (cd "app/<app>" && npm run build 2>&1 | tail -10)

# UI5 linter (if installed)
which @ui5/linter || npx -y @ui5/linter --version
(cd "app/<app>" && npx -y @ui5/linter 2>&1 | tail -20)

# Manifest validation (via UI5 MCP if available, fallback to JSON Schema)
# mcp__plugin_sapui5_ui5-tooling__run_manifest_validation app/<app>/webapp/manifest.json
```

If a tool is not available, record it as "TOOL UNAVAILABLE" and proceed — never silently skip.

## Step 5: Quick wins (mode = `fix` only)

A finding is a quick win when **all** of these hold:

- Local impact, reversible.
- Touches ≤3 application files.
- No DB migration, no contract OData change, no functional policy decision.
- Scoped test/compile available to verify.
- Does not require real SAP/BTP credentials.

Apply these:

✅ Allowed:
- Annotation moved into the correct file (per-app vs global).
- `@Core.OperationAvailable` added (referring to an **already-computed** `Can*` flag).
- `@Common.SideEffects` added (when navigation target already exists).
- Fragment custom-handler short dotted path → fully-qualified extension name.
- i18n key added in `webapp/i18n/i18n*.properties` (NOT renamed).
- `@Common.ValueList` added for a master-data field on the filter bar (NOT on the edit form — edit-form value list may require cascading-filter context).
- Manifest binding fix when the target flag already exists.
- Contract test added for an action handler that has none.

❌ Forbidden:
- Process redesign.
- State machine change.
- Role / SoD change.
- Schema or migration.
- New OData contract that hasn't been agreed.
- Ambiguous security policy decision.
- Wide refactoring.

## Step 6: Output and verification

### 6a — Report

```markdown
# Fiori App Audit — <app> — <yyyy-mm-dd>

## Pending verification
| ID | Status | Evidence | Action |
| --- | --- | --- | --- |

## Applied fixes (mode=fix)
| Area | File:line | Description | Test |
| --- | --- | --- | --- |

## New findings
1. [P1] Title
   - File: …
   - Impact: …
   - Evidence: …
   - Required action: …
   - Quick win: yes/no

## PR
- Branch:
- Commit:
- PR URL:

## Verifications
- CDS compile: PASS/FAIL
- Typecheck/build: PASS/FAIL
- Scoped tests: PASS/FAIL
- Browser check: performed / skipped (reason)

## Residual risk
- …
```

### 6b — Verification

After fixes:

```bash
# Recompile
npx cds compile srv app --service <Service> --to edmx > /tmp/<service>.edmx

# Scoped TS check
test -f "app/<app>/tsconfig.json" && (cd "app/<app>" && npm run ts-typecheck)

# Scoped tests (only files touched)
npx jest <files> --runInBand
```

If the project has a UI dev-server, attempt to start it and verify in a browser **only if the user explicitly requested a visual check** — otherwise record "browser check skipped (not requested)".

## BTP vs On-Premise Differences

| Aspect | BTP (CF / Kyma) | On-Premise |
| --- | --- | --- |
| Manifest `sap.platform` | `cf` or `kyma` | typically empty or `abap` |
| Auth claims source | XSUAA / IAS | Keycloak / NetWeaver IdP |
| Approuter path rewriting | Required (CSRF, CORS) | Often absent (same-origin) |
| FLP shell | Standalone with `init.ts` registering `ShellUIService` | Real FLP shell from on-prem launchpad |
| UI5 version source | `https://ui5.sap.com/<version>/` | `/sap/public/bc/ui5_ui5/` |

The audit logic is identical; expect different manifest sap.platform values and slightly different bootstrap.

## Error Handling

| Symptom | Likely cause | Action |
| --- | --- | --- |
| App directory not resolved | Wrong scope name | Print discovered apps and stop |
| `npx cds compile` fails | Schema error or missing model | Don't proceed with EDMX-dependent checks; record P1 and stop |
| Tests fail before fixes | Pre-existing breakage | Record baseline, don't attempt to fix |
| Tests fail after fixes | Audit introduced a regression | Revert the offending fix, escalate to manual review |
| Manifest validation skipped (MCP unavailable) | Tooling not installed | Fall back to JSON Schema check |

## What This Skill Does NOT Do

- Does **not** redesign the user journey.
- Does **not** change the state machine.
- Does **not** modify backend grants or auth boundaries.
- Does **not** modify CodeList CSV seeds.
- Does **not** translate or rewrite user-facing text (use `sap-cap-text-polish`).
- Does **not** audit the role/scope layer in depth (use `sap-cap-security-rbac-matrix`).
- Does **not** run the full repository test suite.

## When to Use This Skill

- Before merging a Fiori app PR.
- When a user reports "button is missing" or "button does nothing".
- After a UI5 version bump, to verify nothing regressed.
- Before quarterly releases, as a regression-prevention audit.
- When validating pending audit findings (`pending-only` mode).

## When NOT to Use

- For greenfield design of a new Fiori app (use `convert-ui5-to-fiori-elements` or design skills).
- For backend-only changes (use a CAP code review skill).
- For pure performance tuning (different skill).
- For cross-app navigation strategy review — this is single-app focused.

## Follow-up

- Pair with [`../sap-cap-security-rbac-matrix/SKILL.md`](../sap-cap-security-rbac-matrix/SKILL.md) to validate role/scope layer surfaced by Step 3.
- Pair with [`../sap-cap-text-polish/SKILL.md`](../sap-cap-text-polish/SKILL.md) to clean up i18n gaps surfaced by Step 2g.
- Pair with [`../sap-cap-clean-core-enforce/SKILL.md`](../sap-cap-clean-core-enforce/SKILL.md) when the app consumes Tier-2 S/4 proxies.
- Pair with [`../convert-ui5-to-fiori-elements/SKILL.md`](../convert-ui5-to-fiori-elements/SKILL.md) when the audit reveals patterns that should be migrated to Fiori Elements V4.
- Pair with [`../sap-cap-ci-gates-pattern/SKILL.md`](../sap-cap-ci-gates-pattern/SKILL.md) to add CI gates that prevent regressions of the high-severity findings.

## References

- [SAP Fiori Elements V4 — Guidance](https://sapui5.hana.ondemand.com/sdk/#/topic/03265b0408e2432c9571d6b3feb6b1fd)
- [SAP CAP — Fiori Service Annotations](https://cap.cloud.sap/docs/advanced/fiori)
- [OData V4 — Common Annotations](http://docs.oasis-open.org/odata/odata-vocabularies/v4.0/cs01/vocabularies/Org.OData.Capabilities.V1.md)
- [SAP UI5 — `flexEnabled` and Variant Management](https://sapui5.hana.ondemand.com/sdk/#/topic/465f01dcf1cd49b08230e7d3b53b29ed)
- [SAP UI5 — `@Core.OperationAvailable` and Action Visibility](https://sapui5.hana.ondemand.com/sdk/#/topic/cbcb1f3b9c6b4d24aaf5db9447eafa92)
