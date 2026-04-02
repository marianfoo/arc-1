# Dassian ADT vs ARC-1: Feature Gap Analysis

> **Origin:** PR report from 2026-03-28, autoclosed. Updated 2026-04-02 against current ARC-1 main.
> **Repo:** https://github.com/DassianInc/dassian-adt (v2.0.0)
> **Successor:** https://github.com/albanleong/abap-mcpb (MCPB repackaging)
> **Compared against:** ARC-1 main (fef9afc, 2026-04-02)

---

## Executive Summary

Dassian ADT is a fork of `mcp-abap-abap-adt-api` wrapping Marcello Urbani's `abap-adt-api` npm library. It exposes **25 individual tools** vs ARC-1's **11 intent-based tools**. Its strength: practitioner-focused features from daily internal use with Claude Code.

Since the original analysis (2026-03-28), ARC-1 has closed several gaps: MCP elicitation, session management, DDLX/SRVB/DOMA/DTEL types, error hints, and batch activation are all implemented. This updated report focuses on **remaining gaps** worth adopting.

---

## Category A: Remaining High-Value Gaps

### 1. ABAP Code Execution (`abap_run`)
**Priority: MEDIUM** (was HIGH — moved down due to security complexity)

Creates temp `ZCL_TMP_ADT_RUN` class implementing `IF_OO_ADT_CLASSRUN`, executes arbitrary ABAP, captures `out->write()` output, auto-deletes afterward.

Key details:
- Auto-detects SAP release (`~run` ≤2023 vs `~main` 2024+) by reading interface source
- Handles leftover classes from failed prior runs via elicitation
- Session management: ends stateful session before classrun POST
- `keepClass` option for debugging
- Guaranteed cleanup in `finally` block

**ARC-1 status:** Not implemented. Would need safety gating (`OperationType.Execute`), elicitation for confirmation, and careful cleanup. vibing-steampunk also has this.

### 2. Error Classification with Actionable Hints
**Priority: HIGH** (partially closed)

Dassian classifies SAP errors with remediation guidance:

| Error Pattern | Hint |
|--------------|------|
| Object locked | "Check SM12 for lock entries" |
| Adjustment/upgrade mode | "Use SPAU_ENH in SAP GUI" |
| Session timeout | Auto-retries via `withSession()` |
| Incorrect URL path | "Message X::NNN usually means wrong object type in URL" |
| L-prefix include (read-only) | "Write to the parent function module instead" |
| String template pipe issues | "Escape literal pipes with \\| or use CONCATENATE" |
| Activation failures | Cross-references `abap_syntax_check` |
| Inactive dependencies | "Activate dependencies first" |

**ARC-1 status:** `formatErrorForLLM()` in `intent.ts` has basic hints for 404/401/403/network errors. **Gap: no SAP-domain-specific classification** (SM12, SPAU, L-prefix includes, activation deps). The dassian-level hints would significantly improve AI self-correction.

### 3. Transport Contents (`transport_contents`)
**Priority: MEDIUM**

Queries table E071 to list all objects on a transport request (PGMID, object type, name).

**ARC-1 status:** `getTransport` returns transport metadata but doesn't list contained objects. Straightforward addition to `SAPTransport`.

### 4. Transport Assignment (`transport_assign`)
**Priority: MEDIUM**

Assigns existing objects to transports via no-op save cycle: lock -> read -> write unchanged with transport -> unlock. For metadata types (VIEW, TABL, DOMA), uses `transportReference` instead.

**ARC-1 status:** Not implemented. ARC-1 has create/list/get/release but no assign.

### 5. Function Group Bulk Fetch
**Priority: MEDIUM**

Fetches ALL includes + FMs in one call via parallel requests. Reduces LLM round trips.

**ARC-1 status:** `getFunctionGroup()` fetches one at a time. Could add a `bulk` flag to return all includes in a single response.

---

## Category B: Closed Gaps (implemented since 2026-03-28)

These were flagged in the original report but have since been implemented in ARC-1.

### ~~MCP Elicitation~~ -- IMPLEMENTED
- `src/server/elicit.ts`: `confirmDestructive()`, `selectOption()`, `promptString()`
- Graceful fallback when client doesn't support elicitation
- Audit logging of all elicitation events

### ~~Session Auto-Recovery~~ -- IMPLEMENTED
- `src/adt/http.ts`: `withStatefulSession()` ensures lock/modify/unlock share same session cookies
- Automatic CSRF token refresh on 403
- Cookie persistence via internal `cookieJar` Map

### ~~Object Type Expansion~~ -- IMPLEMENTED
- DDLX, SRVB, DOMA, DTEL, STRU, TRAN all added in PRs #21-#22
- Still missing: DCLS (access control), ENHO/ENHS (enhancements), SQLT (table types), SHLP (search helps)

### ~~Error Hints for LLM~~ -- PARTIALLY IMPLEMENTED
- `formatErrorForLLM()` provides HTTP-level hints (404, 401, network)
- Missing: SAP-domain-specific hints (see Category A item #2 above)

### ~~Batch Activation~~ -- IMPLEMENTED
- `SAPActivate` supports `objects` array for batch activation (PR #22)

---

## Category C: Lower Priority / Deferred

| Feature | Dassian | ARC-1 Status | Priority |
|---------|---------|-------------|----------|
| `raw_http` escape hatch | Arbitrary ADT requests | Not implemented (all ops gated) | Low -- security concern |
| gCTS (git_repos, git_pull) | Yes | Feature flag exists, no tools | Low |
| 16 type auto-mappings (CLAS->CLAS/OC) | Yes | Not implemented | Low |
| ATC ciCheckFlavour workaround | Yes | Not implemented | Low |
| Per-user browser login (HTTP) | `/login` page | OIDC/XSUAA covers this better | Low |
| Smart parameter redirects | Error-based hints | Not implemented | Low |
| SAP release auto-detection | For `abap_run` | Not needed unless code exec added | Low |
| AI self-test prompt | scripts/ai-selftest.md | Interesting idea, not critical | Low |

---

## Category D: ARC-1 Advantages (no Dassian equivalent)

| ARC-1 Feature | Detail |
|---|---|
| Safety system | Read-only, op filter, pkg filter, SQL blocking, transport gating, dry-run |
| BTP ABAP Environment | Full OAuth 2.0, Destination Service, Cloud Connector, Principal Propagation |
| OIDC / XSUAA / API key / MCP scope auth | 4 auth methods vs 2 |
| Feature auto-detection | 6 probes for SAP capabilities |
| ABAP Lint (abaplint/core) | Local offline linting |
| Code intelligence | Find definition, references, completion |
| Cache (SQLite + memory) | Reduces SAP round trips |
| Context compression (SAPContext) | AST-based, 7-30x reduction |
| Method-level surgery | 95% source reduction |
| Hyperfocused mode | Single tool, ~200 tokens |
| npm + Docker + release-please | Professional distribution |
| 707+ unit tests | vs 163 |
| MCP elicitation with audit | Elicitation + compliance logging |
| Structured JSON logging | Stderr, sensitive field redaction |

---

## Recommended Next Steps (aligned with ARC-1 goals)

### Quick Wins (< 1 day each)
1. **SAP-domain error hints** -- Extend `formatErrorForLLM()` with SM12/SPAU/L-prefix/activation-dep patterns. High impact, low effort.
2. **Transport contents** -- Add `contents` action to `SAPTransport` querying E071. Straightforward.

### Medium Effort (1-3 days)
3. **Transport assign** -- No-op save cycle with metadata-type awareness.
4. **Function group bulk fetch** -- Parallel include fetching, return combined response.

### Deferred (needs design)
5. **ABAP code execution** -- Significant security implications. Needs `OperationType.Execute`, elicitation, cleanup. Defer until safety framework review.

---

_Last updated: 2026-04-02_
