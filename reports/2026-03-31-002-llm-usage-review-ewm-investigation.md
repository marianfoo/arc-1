# LLM Usage Review: EWM/RAP Investigation — Feedback Analysis & Implementation Plan

> **Source:** Post-session self-review by an LLM after investigating EWM RAP actions via ARC-1 v0.2.0
> **Date:** 2026-03-31 (revised with peer review corrections)
> **Scope:** 7 tools available, 4 used across ~28 calls over 12+ turns

---

## Executive Summary

An LLM used ARC-1 to investigate a custom EWM packing scenario (RAP actions, BDEFs, service definitions). The analysis succeeded but was inefficient — 12+ turns where 5 would have sufficed. The feedback is highly credible and identifies real gaps, primarily in **tool discoverability** and **SQL dialect documentation** rather than in missing functionality. All features the LLM wished it had used already exist.

**Key insight:** The tools are capable, but LLMs don't discover capabilities organically during a session. The fix is better tool descriptions and guardrails, not new features.

> **Note:** This document was reviewed against the actual codebase and corrected for several technical inaccuracies in the initial analysis — see items marked *[Corrected]* below.

---

## Feedback Item Analysis

### 1. Never Used `SAPContext` — Biggest Token Waste

**Feedback:** After reading a 237KB class (`Z1EWM_CL_ODATA_PACK_RAP`), the LLM manually followed dependencies with ~5 separate `SAPRead` calls instead of one `SAPContext` call.

**Evaluation: Valid — this is the #1 priority issue.**

**Current state of `SAPContext` description:**

```
"Get compressed dependency context for an ABAP object. Returns only the public API
contracts (method signatures, interface definitions, type declarations) of all objects
that the target depends on — NOT the full source code. This is the most token-efficient
way to understand dependencies."
```

The description is already good and mentions the `source` parameter to skip a round-trip. But the problem is **when** the LLM thinks to use it. After reading a large class, the natural next step is to read individual dependencies — not to invoke a separate "context" tool.

**Root cause:** The tool description tells the LLM *what* SAPContext does but doesn't create a strong enough trigger for *when* to use it. The final paragraph says "Use SAPContext BEFORE writing code" which scopes it too narrowly — this LLM was reading/analyzing, not writing.

**Proposed changes:**

1. **Expand the "when to use" guidance** in the SAPContext tool description:

   Add at the start of the description:
   ```
   IMPORTANT: After reading a large class/program with SAPRead, use SAPContext as
   your NEXT call to understand its dependencies. Do NOT manually follow dependencies
   with multiple SAPRead calls — SAPContext does this in one call with 7-30x fewer tokens.
   ```

   Change the final guidance from:
   ```
   Use SAPContext BEFORE writing code that modifies or extends existing objects.
   ```
   To:
   ```
   Use SAPContext whenever you need to understand an object's dependencies — whether
   for analysis, debugging, or before writing code. If you've just read a class with
   SAPRead and need to understand what it calls/uses, SAPContext is always the next step.
   ```

2. **Add a hint in `SAPRead` responses for large objects.** When the response exceeds a threshold, append a hint:

   ```
   Hint: This object is large. Use SAPContext(type='CLAS', name='...') to get compressed
   dependency contracts instead of reading each dependency individually.
   ```

   **Implementation:** In `ts-src/handlers/intent.ts`, after the SAPRead CLAS handler returns, check response length and append hint.

   **Threshold choice:** 50KB would fire on many medium-sized classes. A line count of ~2000 lines or ~100KB is a better threshold — targets genuinely large objects where manual dep-chasing is costly.

   *[Corrected]* **`source` parameter trade-off:** The hint should recommend `SAPContext(type, name)` without `source` for very large objects (>5000 lines / 200KB). Passing a 237KB/7258-line class back as a `source` parameter wastes tokens. For objects that large, it's cheaper to let SAPContext re-fetch internally. The `source` skip-round-trip optimization is most valuable for smaller classes (~500-2000 lines).

**Note:** `SAPContext` is always available — it's registered unconditionally in `tools.ts`, not gated behind `config.readOnly`. The `source` parameter is correctly implemented in `handleSAPContext` (`if (args.source) { source = String(args.source); }` before fetching). This is purely a discoverability problem.

**Files to modify:**
- `ts-src/handlers/tools.ts` — SAPContext description (lines ~120-145)
- `ts-src/handlers/tools.ts` — SAPRead description (add cross-reference to SAPContext)
- `ts-src/handlers/intent.ts` — SAPRead handler, add size-based hint (~line 280)

**Effort:** Low
**Impact:** High — would have saved ~5 tool calls and significant tokens in this session

---

### 2. Tried `source_code` Search Without Probing Features First

**Feedback:** LLM tried `SAPSearch(searchType='source_code')` and got a "not available (requires SAP_BASIS >= 7.51)" error. Should have started with `SAPManage(action='probe')`.

**Evaluation: Valid, but with two important technical corrections.**

The error is informative — the LLM learned from it immediately. The real question is whether we should make probing easier and more complete.

*[Corrected]* **Two separate read-only mechanisms exist:**

The initial analysis conflated two different systems:

- **`config.readOnly`** (CLI flag / `SAP_READ_ONLY`) → controls tool **registration** in `tools.ts`. When true, `SAPManage` is simply not registered as a tool (`if (!config.readOnly) tools.push(SAPManage)` at line 286).
- **`TOOL_SCOPES['SAPManage'] = 'write'`** → controls per-user **authInfo scope enforcement** in `handleToolCall`, only active when `authInfo` is present (XSUAA/OIDC deployments).

For local stdio deployments (Claude Desktop, Cursor), `authInfo` is never present, so `TOOL_SCOPES` is irrelevant. The real problem is that `SAPManage` is not registered when `config.readOnly = true`. The fix is simpler than initially proposed: move `SAPManage` outside the `if (!config.readOnly)` block in `tools.ts` and change its scope in `TOOL_SCOPES` to `'read'`.

*[Corrected]* **`probeFeatures` does NOT probe source_code search availability:**

The `PROBES` array in `features.ts` checks 6 endpoints:
```
hana, abapGit, rap, amdp, ui5, transport
```

There is **no probe for the textSearch endpoint** (`/sap/bc/adt/repository/informationsystem/textSearch`). Even if the LLM runs `SAPManage(probe)`, it will never learn that source_code search is unavailable. The probe recommendation in the original feedback is therefore incomplete — it wouldn't have actually prevented the wasted call.

**Proposed changes (revised):**

1. **De-gate `SAPManage` from read-only mode.** Move it outside `if (!config.readOnly)` in `tools.ts`. Change `TOOL_SCOPES['SAPManage']` from `'write'` to `'read'`. Probe and features are purely read operations (HEAD requests).

2. **Add `sourceSearch` to `PROBES` in `features.ts`:**

   ```typescript
   { id: 'sourceSearch', endpoint: '/sap/bc/adt/repository/informationsystem/textSearch?searchString=_&maxResults=1', description: 'Source code full-text search (requires SAP_BASIS ≥ 7.51)' }
   ```

   Then reference `cachedFeatures?.sourceSearch?.available` in the `source_code` search path of `handleSAPSearch` to fail fast with a clear message.

3. **Add auto-probe on first tool call.** When any tool is invoked for the first time in a session, automatically run `probeFeatures()` in the background and cache the results.

   **Implementation note:** `probeFeatures` signature is `probeFeatures(client: AdtHttpClient, config: FeatureConfig)`. The `FeatureConfig` is derived from `ServerConfig` by mapping individual feature flags (`_config.featureHana`, `_config.featureRap`, etc.) — exactly as `handleSAPManage` currently does (lines ~735-749). Auto-probe is not a one-liner; it needs the same `FeatureConfig` construction.

4. **Improve the source_code search error message** to suggest alternatives:

   Current: `"Source code search is not available (requires SAP_BASIS ≥ 7.51)"`

   Proposed: `"Source code search is not available (requires SAP_BASIS ≥ 7.51). Alternative: use SAPQuery on metadata tables like SEOCOMPO (class methods) or REPOSRC (source text) to find references."`

**Files to modify:**
- `ts-src/handlers/tools.ts` — move SAPManage outside readOnly guard
- `ts-src/handlers/intent.ts` — TOOL_SCOPES change, auto-probe logic, FeatureConfig construction
- `ts-src/adt/features.ts` — add `sourceSearch` probe to `PROBES` array
- `ts-src/adt/types.ts` — add `sourceSearch` to `ResolvedFeatures` type (if needed)

**Effort:** Medium (three coupled changes: de-gate + add probe + auto-probe)
**Impact:** Medium — prevents wasted calls and makes probe actually useful for source_code search

---

### 3. Wrong ABAP SQL Syntax in `SAPQuery`

**Feedback:** LLM used `FETCH FIRST 20 ROWS ONLY` (ANSI SQL) instead of the `maxRows` parameter. The `/sap/bc/adt/datapreview/freestyle` endpoint uses ABAP Open SQL, not ANSI SQL.

**Evaluation: Valid and actionable — this is the #2 priority issue.**

**Current `SAPQuery` description:**
```
"Execute ABAP SQL queries against SAP tables. Returns structured data with column
names and rows. Powerful for reverse-engineering: query metadata tables..."
```

The description mentions "ABAP SQL" but doesn't explain how it differs from standard SQL. The `maxRows` parameter description is minimal: `"Maximum rows (default 100)"`.

**Proposed changes:**

1. **Add SQL dialect guidance to the `SAPQuery` description:**

   ```
   IMPORTANT — SQL dialect: This executes ABAP Open SQL, NOT standard/ANSI SQL.
   Key differences:
   - Row limiting: Do NOT use FETCH FIRST, LIMIT, or ROWNUM. Use the maxRows parameter instead.
   - Aggregates: COUNT(*), SUM(), AVG() work. Use SELECT SINGLE for single-row results.
   - String literals: Use single quotes ('value'), not double quotes.
   - Table aliases: Supported with AS keyword.
   - JOINs: INNER JOIN and LEFT OUTER JOIN supported. No RIGHT JOIN or FULL JOIN.
   - LIKE: Works as expected with % and _ wildcards.
   - UP TO n ROWS: Supported at end of SELECT, but prefer maxRows parameter.
   ```

2. **Detect and correct common SQL mistakes at runtime.** In the `SAPQuery` handler, detect patterns like `FETCH FIRST`, `LIMIT \d+`, `ROWNUM` and either:
   - Auto-strip them and add a note: "Removed FETCH FIRST clause — use maxRows parameter instead"
   - Or reject with a clear error before hitting SAP

   **Implementation:** In `ts-src/handlers/intent.ts` around line 394, add a SQL pre-processor:

   ```typescript
   // Strip ANSI row-limit clauses and warn
   const ansiLimitPattern = /\b(FETCH\s+FIRST\s+\d+\s+ROWS\s+ONLY|LIMIT\s+\d+)\s*$/i;
   if (ansiLimitPattern.test(sql)) {
     sql = sql.replace(ansiLimitPattern, '').trim();
     warnings.push('Removed ANSI row-limit clause. Use the maxRows parameter instead.');
   }
   ```

3. **Improve the `maxRows` parameter description:**

   Current: `"Maximum rows (default 100)"`

   Proposed: `"Maximum rows to return (default 100). This is the ONLY way to limit rows — do not use FETCH FIRST, LIMIT, or ROWNUM in your SQL."`

**Files to modify:**
- `ts-src/handlers/tools.ts` — SAPQuery description and maxRows description
- `ts-src/handlers/intent.ts` — SQL pre-processor/validator (~line 394)

**Effort:** Low
**Impact:** High — SQL dialect confusion will affect every LLM user

---

### 4. Over-Broad `SAPSearch` Patterns

**Feedback:** LLM searched `Z1EWM*` (80 results, mostly irrelevant) and `Z1EWM*BDEF*` (0 results, because BDEF is an object type not a name part). Better alternatives: `SAPRead(type='DEVC')` for package contents, `SAPQuery` on TADIR for type-filtered searches.

**Evaluation: Valid. The tool description could better guide search strategy.**

**Current `SAPSearch` description:** Describes wildcards and search modes but doesn't mention `DEVC` or `SAPQuery` on TADIR as alternatives for package-scoped exploration.

**Proposed changes:**

1. **Add search strategy guidance to `SAPSearch` description:**

   ```
   Tips for efficient searching:
   - To list ALL objects in a package: use SAPRead(type='DEVC', name='PACKAGE_NAME') instead
   - To find objects of a specific type in a package: use SAPQuery on TADIR:
     SAPQuery(sql="SELECT obj_name FROM tadir WHERE devclass = 'PKG' AND object = 'CLAS'")
   - Object type (CLAS, PROG, BDEF, etc.) is NOT part of the object name — don't include
     it in search patterns. Use objectType filter for source_code search instead.
   ```

2. **Add `objectType` filter to object search mode.** Currently `objectType` is only documented for `source_code` search. The ADT quickSearch endpoint supports type filtering via `objectType` parameter.

   *[Corrected]* **ADT format mapping required.** The quickSearch endpoint uses compound type format — `CLAS/OC` (classes), `BDEF/BDO` (behavior definitions), `PROG/P` (programs), `SRVD/SRV` (service definitions), etc. The `searchObject` return values already contain this format in `objectType` fields. If we expose `objectType` as a user-facing parameter accepting simple types like `CLAS`, the server needs a mapping layer:

   ```typescript
   const ADT_OBJECT_TYPE_MAP: Record<string, string> = {
     CLAS: 'CLAS/OC', INTF: 'INTF/OI', PROG: 'PROG/P',
     BDEF: 'BDEF/BDO', SRVD: 'SRVD/SRV', DDLS: 'DDLS/DF',
     TABL: 'TABL/DT', FUGR: 'FUGR/F', FUNC: 'FUNC/FF', ...
   };
   ```

   This mapping is the actual complexity of the feature, not the plumbing.

3. **Add `packageName` filter to object search mode.** The `searchSource` (text search) already supports `packageName`, but `searchObject` (quickSearch) does not pass it through. Searching `Z1EWM*` scoped to `ZTGW_EWM_ODATA_BL` would have been far more useful than the 80-result dump. One parameter addition in `client.ts` covers this.

   Current `searchObject` URL:
   ```
   /sap/bc/adt/repository/informationsystem/search?operation=quickSearch&query=${query}&maxResults=${maxResults}
   ```

   With both filters:
   ```
   ...&query=${query}&maxResults=${maxResults}&objectType=${adtType}&packageName=${pkg}
   ```

**Files to modify:**
- `ts-src/handlers/tools.ts` — SAPSearch description (add tips), schema (allow objectType + packageName for object search)
- `ts-src/adt/client.ts` — `searchObject` method (add objectType + packageName params, ADT type mapping)
- `ts-src/handlers/intent.ts` — pass new params to search

**Effort:** Low (description) / Medium (objectType filter due to ADT format mapping + packageName)
**Impact:** Medium — reduces wasted broad searches. objectType + packageName together make object search significantly more precise.

---

### 5. Never Used `SAPNavigate` for Where-Used

**Feedback:** When needing to find who calls `Z1EWM_CL_ODATA_PACK_RAP`, the LLM guessed instead of using `SAPNavigate(action='references')`.

**Evaluation: Valid but lower priority — the feature exists and is documented.**

The `SAPNavigate` description already says: "Navigate code: find definitions, references, and code completion. Use for 'go to definition', 'where is this used?'" and supports `type+name` as an alternative to `uri`.

**Root cause:** The LLM simply didn't think to use it. This is partly a discoverability issue — when you're deep in analysis, you don't re-scan all available tools.

**Proposed changes:**

1. **Cross-reference `SAPNavigate` in `SAPRead` results.** When returning a class source, add a subtle hint:

   ```
   Tip: Use SAPNavigate(action='references', type='CLAS', name='...') to find all callers.
   ```

   This is lighter than the SAPContext hint — only add it when the class has public methods that might be called externally.

2. **Add "where-used" as a keyword in the SAPNavigate description** since LLMs often think in SAP terminology:

   Current: `"find definitions, references, and code completion"`
   Proposed: `"find definitions, references (where-used list), and code completion"`

**Files to modify:**
- `ts-src/handlers/tools.ts` — SAPNavigate description

**Effort:** Very low
**Impact:** Low-medium — nice to have but not a major friction point

---

### 6. Sequential Searches When Parallel Is Fine

**Feedback:** The LLM made independent `SAPRead` calls sequentially across multiple turns instead of batching them.

**Evaluation: Valid but NOT an ARC-1 issue — this is an MCP client / LLM behavior issue.**

ARC-1 is a server. Whether the client batches tool calls is determined by:
1. The LLM's tendency to batch (Claude does this well, others vary)
2. The MCP client's ability to send parallel tool calls
3. Whether the LLM perceives the calls as independent

**There is nothing ARC-1 can do server-side to force parallel calls.** However, tool descriptions could hint at parallelism:

**Proposed change (minor):**

Add a general note to the server's tool listing preamble (if one exists) or to the most-used tools:

```
Tip: SAPRead, SAPSearch, SAPQuery, and SAPNavigate calls are stateless and independent.
Batch multiple calls in one turn when you need several objects.
```

**Implementation:** This could be added as a server-level `instructions` field in the MCP protocol, or as a note in each tool description. The MCP SDK supports a server-level `instructions` string.

**Files to modify:**
- `ts-src/server/server.ts` — add MCP server instructions field

**Effort:** Very low
**Impact:** Low — depends on client/LLM behavior

---

## Priority Matrix (Revised)

| # | Issue | Priority | Effort | Impact |
|---|-------|----------|--------|--------|
| 3 | SQL dialect documentation + pre-processor | **P1** | Low | High |
| 1 | SAPContext discoverability (description + hints) | **P1** | Low | High |
| 2 | SAPManage de-gating + sourceSearch probe + auto-probe | **P2** | Medium | Medium |
| 4 | Search strategy guidance (description only) | **P2** | Very low | Medium |
| 4b | objectType + packageName filter for object search | **P3** | Medium | Medium |
| 5 | SAPNavigate where-used discoverability | **P3** | Very low | Low-Med |
| 6 | Parallel call hints | **P3** | Very low | Low |

---

## Recommended Implementation Plan (Revised)

### Phase 1: SQL Pre-processor + Description Improvements (P1 — immediate)

**Implementation order within Phase 1:**

1. **SQL pre-processor first** (item 3) — single function in `intent.ts`, zero risk, pure win. Strip `FETCH FIRST`, `LIMIT n`, `ROWNUM` before `runQuery` call.

2. **Tool descriptions** in `ts-src/handlers/tools.ts`:
   - **SAPQuery:** Add ABAP SQL dialect section, improve `maxRows` description
   - **SAPContext:** Strengthen "when to use" trigger, remove write-only framing
   - **SAPRead:** Add cross-reference to SAPContext for large objects
   - **SAPSearch:** Add search strategy tips, DEVC alternative, type-is-not-name warning
   - **SAPNavigate:** Add "where-used" keyword

3. **Large-response hint** in `intent.ts` — append SAPContext suggestion after SAPRead returns large objects. Threshold: ~2000 lines or ~100KB (not 50KB — that fires on medium classes). The hint should NOT suggest passing `source` for objects >5000 lines — let SAPContext re-fetch.

**Files:** `ts-src/handlers/tools.ts`, `ts-src/handlers/intent.ts`
**Estimated scope:** ~50 lines description + ~20 lines pre-processor + ~10 lines hint logic.

### Phase 2: Feature Probing Overhaul (P2)

These three changes are tightly coupled — do them together:

1. **De-gate `SAPManage`** — move outside `if (!config.readOnly)` in `tools.ts`, change scope to `'read'`
2. **Add `sourceSearch` probe** — add textSearch endpoint to `PROBES` in `features.ts`, add to `ResolvedFeatures` type
3. **Auto-probe on first call** — in `handleToolCall`, if `cachedFeatures` is null, construct `FeatureConfig` from `ServerConfig` (same mapping as `handleSAPManage` lines ~735-749) and call `probeFeatures()`. Not a one-liner.

**Files:** `ts-src/handlers/tools.ts`, `ts-src/handlers/intent.ts`, `ts-src/adt/features.ts`, `ts-src/adt/types.ts`
**Estimated scope:** ~40-50 lines across 4 files.

### Phase 3: Search Enhancements (P2-P3)

1. **`objectType` filter for object search** — needs ADT compound format mapping (`CLAS` → `CLAS/OC`, etc.). Medium effort due to the mapping layer, not the plumbing.
2. **`packageName` filter for object search** — low effort, just add query param to `searchObject` URL.

**Files:** `ts-src/adt/client.ts`, `ts-src/handlers/tools.ts`, `ts-src/handlers/intent.ts`
**Estimated scope:** ~30-40 lines (mapping table + parameter threading).

### Phase 4: Server-Level Hints (P3)

1. **MCP server instructions** — add parallel-call guidance and general workflow tips
2. **Cross-tool hints in responses** — context-aware suggestions based on what was just returned

**Estimated scope:** ~10-20 lines in server.ts.

---

## Validation

All six issues map to existing functionality that the LLM failed to discover. The one genuinely missing piece is the `sourceSearch` probe in `features.ts` — without it, `SAPManage(probe)` wouldn't have prevented the source_code search failure even if the LLM had used it.

The fixes are primarily:

- **50% documentation** — better tool descriptions with stronger triggers
- **30% guardrails** — SQL pre-processor, large-response hints, auto-probe
- **20% features** — sourceSearch probe, objectType/packageName filter, read-only probe access

This aligns with the principle that for MCP servers, **tool descriptions are the UX** — they are the primary interface through which LLMs understand capabilities.

---

## Comparison with Previous Feedback (Report 001)

Report `2026-03-31-001` covered an ISU/BPEM investigation session. Common themes:

| Theme | Report 001 | This Report |
|-------|-----------|-------------|
| SAPContext underused | Not mentioned | **#1 issue** |
| SQL dialect confusion | Not mentioned | **#2 issue** |
| Feature probing missed | Not mentioned | Mentioned |
| Search inefficiency | Mentioned (different angle) | **#4 issue** |
| Large response handling | Mentioned (237KB friction) | Same issue, same class size |
| Error message quality | **#1 issue** (401 errors) | Not mentioned |

The two reports are complementary — Report 001 focuses on onboarding friction (auth errors, first-use experience) while this report focuses on tool usage efficiency during an established session.

---

## Appendix: Ideal 5-Turn Workflow (from feedback, annotated)

The LLM's proposed optimal workflow, with practical notes:

```
Turn 1 (parallel):
  SAPManage(action='probe')
  SAPRead(type='DEVC', name='ZTGW_EWM_ODATA_BL')

Turn 2 (parallel):
  SAPRead(type='BDEF', name='Z1EWM_X_HANDLINGUNIT_NIO')
  SAPRead(type='SRVD', name='Z1EWM_NIO')
  SAPRead(type='CLAS', name='Z1EWM_CL_ODATA_PACK_RAP')

Turn 3:
  SAPContext(type='CLAS', name='Z1EWM_CL_ODATA_PACK_RAP', maxDeps=15)
  # Note: omit source= for this 237KB/7258-line class — let SAPContext re-fetch
  # internally rather than passing 237KB back as a parameter. The source= optimization
  # is better suited for smaller classes (~500-2000 lines).

Turn 4:
  SAPRead(type='CLAS', name='/TGW/CL_CE_HUNIT_ITEM_BO')

Turn 5:
  SAPNavigate(action='references', type='CLAS', name='Z1EWM_CL_ODATA_PACK_RAP')
```

This reduces from 28 tool calls / 12+ turns to ~9 tool calls / 5 turns — a 3x efficiency improvement. Post-implementation, this workflow should be achievable naturally without the LLM needing to know it in advance.

**Note on Turn 1:** After adding the `sourceSearch` probe (Phase 2), `SAPManage(probe)` will correctly report source_code search availability. Currently it doesn't — this is a gap.
