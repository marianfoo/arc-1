# ARC-1 Roadmap

**Last Updated:** 2026-04-14
**Project:** ARC-1 (ABAP Relay Connector) — MCP Server for SAP ABAP Systems
**Repository:** https://github.com/marianfoo/arc-1

---

## Vision

Every other SAP MCP server today runs on the developer's local machine — unmanaged, unaudited, with whatever permissions the developer happens to have. There is no admin oversight, no token budget control, no audit trail, and no way to restrict what an LLM can do to an SAP system.

**ARC-1 is different.** It is a **centralized, admin-controlled MCP gateway** deployed on BTP Cloud Foundry or a company server (Docker). One instance per SAP system, serving multiple users. The admin controls which tools are exposed, which packages can be touched, and whether writes are allowed — before any LLM request reaches SAP.

---

## Priority & Effort Legends

### Priority Legend

| Priority | Meaning |
|----------|---------|
| P0 | Critical — blocks enterprise adoption |
| P1 | High — significant value, should do next |
| P2 | Medium — nice to have, plan for later |
| P3 | Low — future consideration |

### Effort Legend

| Effort | Meaning |
|--------|---------|
| XS | < 1 day |
| S | 1-2 days |
| M | 3-5 days |
| L | 1-2 weeks |
| XL | 2-4 weeks |

---

## Overview: Not Yet Implemented (sorted by priority)

| # | ID | Feature | Priority | Effort | Category |
|---|-----|---------|----------|--------|----------|
| ~~1~~ | ~~FEAT-02~~ | ~~API Release Status / Clean Core~~ | ~~P0~~ | ~~S~~ | ~~Completed 2026-04-10~~ |
| 2 | FEAT-07 | TLS/HTTPS for HTTP Streamable | P3 | S | Features |
| ~~3~~ | ~~FEAT-08~~ | ~~Content-Type 415/406 Auto-Retry~~ | ~~P0~~ | ~~XS~~ | ~~Completed 2026-04-12~~ |
| ~~4~~ | ~~FEAT-14~~ | ~~401 Session Timeout Auto-Retry~~ | ~~P0~~ | ~~XS~~ | ~~Completed 2026-04-12~~ |
| ~~5~~ | ~~FEAT-15~~ | ~~Namespace URL Encoding Audit~~ | ~~P1~~ | ~~XS~~ | ~~Completed 2026-04-12~~ |
| 6 | FEAT-12 | Fix Proposals / Auto-Fix from ATC | P1 | S | Features |
| ~~7~~ | ~~FEAT-13~~ | ~~DDIC Domain/Data Element Write~~ | ~~P1~~ | ~~S~~ | ~~Completed 2026-04-12~~ |
| 8 | FEAT-16 | Error Intelligence (Actionable Hints) | P1 | S | Features |
| 9 | FEAT-17 | Type Auto-Mappings for SAPWrite | P1 | XS | Features |
| 10 | FEAT-18 | Function Group Bulk Fetch | P1 | S | Features |
| 11 | DOC-01 | Copilot Studio Setup Guide | P1 | S | Docs |
| 12 | DOC-02 | Basis Admin Security Guide | P1 | S | Docs |
| 13 | SEC-05 | Rate Limiting | P2 | S | Security |
| 14 | FEAT-03 | Enhancement Framework (BAdI) | P2 | M | Features |
| 15 | FEAT-06 | Cloud Readiness Assessment | P2 | M | Features |
| 16 | FEAT-09 | SQL Trace Monitoring | P2 | S | Features |
| 17 | FEAT-10 | PrettyPrint (Code Formatting) | P1 ↑ | XS | Features |
| 18 | FEAT-11 | Inactive Objects List | P2 | XS | Features | ✅ Completed |
| 19 | FEAT-19 | Transport Contents (E071 List) | P2 | XS | Features | ✅ Completed (subsumed by FEAT-39) |
| 20 | FEAT-20 | Source Version / Revision History | P1 ↑ | S | Features |
| 21 | FEAT-21 | ABAP Documentation (F1 Help) | P2 | XS | Features |
| 22 | FEAT-22 | gCTS/abapGit Integration | P2 | M | Features |
| 23 | FEAT-23 | GetProgFullCode (Include Traversal) | P2 | S | Features |
| 24 | FEAT-24 | CompareSource (Diff) | P2 | S | Features |
| 25 | FEAT-25 | CDS Unit Tests | P2 | S | Features |
| 26 | FEAT-26 | MCP Client Config Snippets | P2 | S | Features |
| 27 | FEAT-27 | Migration Analysis (ECC->S/4) | P2 | S | Features |
| 28 | FEAT-28 | SAP Compatibility Hardening | P2 | S | Features |
| 29 | FEAT-30 | ABAP Cleaner Integration | P2 | M | Features |
| 30 | FEAT-31 | Code Coverage from Unit Tests | P2 | S | Features |
| 31 | FEAT-32 | Table Pagination / Offset | P2 | XS | Features |
| 32 | FEAT-33 | CDS Impact Analysis | P2 | S | Features |
| 33 | FEAT-34 | i18n Translation Management | P2 | M | Features |
| 34 | FEAT-36 | Type Information (SAPNavigate) | P2 | S | Features |
| 35 | OPS-02 | Health Check Enhancements | P2 | XS | Ops |
| 36 | DOC-03 | SAP Community Blog Post | P2 | S | Docs |
| 37 | FEAT-37 | DCL (Access Control) Read/Write | P1 | S | Features |
| 38 | FEAT-38 | ADT Service Discovery (MIME Negotiation) | P0 | S | Features |
| 39 | FEAT-39 | Transport Enhancements (delete, reassign, types) | P2 | S | Features | ✅ Completed (K/W/T types; S/R deferred) |
| ~~40~~ | ~~FEAT-40~~ | ~~FLP Launchpad Management (OData)~~ | ~~P1~~ | ~~M~~ | ~~Completed 2026-04-12~~ |
| 41 | FEAT-41 | ABAP Unit Test Coverage (statement-level) | P2 | S | Features |
| 42 | FEAT-42 | ATC Output Formats (JUnit4, checkstyle, codeclimate) | P2 | XS | Features |
| 43 | FEAT-43 | DDIC Auth & Misc Read (Authorization Fields, Feature Toggles) | P2 | S | Features |
| 44 | FEAT-44 | TABL (Database Table) Create | P1 | S | Features |
| 45 | FEAT-45 | DEVC (Package) Create | P1 | S | Features | ✅ Completed (2026-04-14) |
| ~~46~~ | ~~FEAT-46~~ | ~~SRVB (Service Binding) Create~~ | ~~P2~~ | ~~S~~ | ~~Completed 2026-04-14~~ |
| 47 | FEAT-47 | MSAG (Message Class) Read/Write | P2 | S | Features |
| 48 | FEAT-05 | Code Refactoring (Rename, Extract) | P3 | L | Features |
| 49 | FEAT-29 | P3 Backlog (14 items) | P3 | various | Features |
| 50 | OPS-03 | Multi-System Routing | P3 | L | Ops |

---

## Overview: Completed (sorted by date, newest first)

| ID | Feature | Completed | Category |
|----|---------|-----------|----------|
| FEAT-46 | SRVB (Service Binding) Create | 2026-04-14 | Features |
| — | RAP Write Guard (feature-aware) | 2026-04-13 | Features |
| FEAT-13 | DDIC Domain/Data Element Write | 2026-04-12 | Features |
| FEAT-08 | Content-Type 415/406 Auto-Retry | 2026-04-12 | Features |
| FEAT-14 | 401 Session Timeout Auto-Retry | 2026-04-12 | Features |
| FEAT-15 | Namespace URL Encoding Audit | 2026-04-12 | Features |
| FEAT-40 | FLP Launchpad Management (OData) | 2026-04-12 | Features |
| SEC-08 | OAuth Security Hardening (RFC 9700) | 2026-04-08 | Security |
| — | AFF Structured Class Read | 2026-04-08 |  Features |
| — | AFF Batch Object Creation | 2026-04-08 | Features |
| — | AFF Schema Validation | 2026-04-08 | Features |
| — | Zod v4 Input Validation | 2026-04-08 | Features |
| — | Two-Dimensional Auth (scopes x roles x safety) | 2026-04-07 | Security |
| FEAT-01 | Where-Used Analysis | 2026-04-04 | Features |
| — | Enhanced Abaplint (cloud/on-prem presets) | 2026-04-04 | Features |
| — | Object Caching (SQLite + memory) | 2026-04-04 | Features |
| — | HTTP Client Migration (axios -> undici) | 2026-04-04 | Features |
| SEC-04 | Audit Logging (multi-sink) | 2026-04-01 | Security |
| FEAT-04 | DDIC Completeness | 2026-04-01 | Features |
| — | Hyperfocused Mode (1 tool, ~200 tokens) | 2026-04-01 | Features |
| — | Method-Level Surgery | 2026-04-01 | Features |
| — | Runtime Diagnostics (SAPDiagnose) | 2026-04-01 | Features |
| — | RAP CRUD (DDLS/DDLX/BDEF/SRVD) | 2026-04-01 | Features |
| — | Context Compression (7-30x) | 2026-04-01 | Features |
| — | MCP Elicitation | 2026-04-01 | Features |
| — | BTP ABAP Environment (OAuth 2.0) | 2026-04-01 | Features |
| SEC-01 | Principal Propagation (per-user SAP auth) | 2026-03-27 | Security |
| SEC-02 | BTP Cloud Connector PP | 2026-03-27 | Security |
| SEC-06 | Tool Restriction by User Role | 2026-03-27 | Security |
| SEC-07 | XSUAA OAuth Proxy | 2026-03-27 | Security |
| — | Dynamic Client Registration (RFC 7591) | 2026-03-27 | Security |
| STRAT-01 | TypeScript Migration (Go -> TS) | 2026-03-26 | Infrastructure |
| FEAT-35 | Class Hierarchy (SAPNavigate) | 2026-04-09 | Features |
| — | API Key Auth | — | Security |
| — | OAuth/OIDC (Entra ID) | — | Security |
| — | BTP CF Deployment | — | Infrastructure |
| OPS-01 | Structured JSON Logging | — | Ops |
| OPS-04 | CI/CD Pipeline | — | Ops |
| CLEAN-01 | Go Code Removal | — | Cleanup |
| CLEAN-02 | CLI Surface | — | Cleanup |
| SEC-03 | S_DEVELOP Awareness | — | Security |

---

## Prioritized Execution Order

> Priorities are assigned based on which [core design principle](#vision) a feature serves. Sourced from 4 competitor trackers ([fr0ster](../compare/fr0ster/overview.md), [VSP](../compare/vibing-steampunk/overview.md), [abap-adt-api](../compare/abap-adt-api/overview.md), [dassian-adt](../compare/07-dassian-adt.md)) and the [cross-project feature matrix](../compare/00-feature-matrix.md).
>
> **2026-04-14 priority re-evaluation:** dassian-adt's explosive growth (0→32 stars, 25→53 tools, OAuth/XSUAA, multi-system in 2 weeks) and SAP's confirmed Q2 2026 GA for official ABAP MCP Server increase urgency on fix proposals (FEAT-12↑P1), error intelligence (FEAT-16↑P1), and pretty print (FEAT-10↑P1). SAP Joule entering the space makes ARC-1's enterprise-grade safety/auth differentiation even more important.

### Phase A: Production Blockers (P0)
1. ~~**FEAT-02** API Release Status / Clean Core (S)~~ — **completed 2026-04-10**
2. ~~**FEAT-08** Content-Type 415/406 Auto-Retry (XS)~~ — **completed 2026-04-12** (already implemented in transport write compatibility work)
3. ~~**FEAT-14** 401 Session Timeout Auto-Retry (XS)~~ — **completed 2026-04-12** (session reset + re-auth retry in `src/adt/http.ts`)
4. ~~**FEAT-15** Namespace URL Encoding Audit (XS)~~ — **completed 2026-04-12** (audit confirmed `encodeURIComponent` consistency; XML attribute escaping hardened in `devtools.ts`)

### Phase A.5: Proactive Compatibility (P0)
6. **FEAT-38** ADT Service Discovery / MIME Negotiation (S) — probe `/sap/bc/adt/discovery` once at startup to learn supported MIME types per endpoint; eliminates 415/406 retries entirely. sapcli has had this since 2018. Supersedes reactive FEAT-08 approach.

### Phase B: Core Value Features (P1)
7. **FEAT-37** DCL (Access Control) Read/Write (S) — missing CDS access control objects; sapcli, VSP have this. Critical for RAP development workflow.
8. ~~**FEAT-40** FLP Launchpad Management (M)~~ — **completed 2026-04-12**
9. **FEAT-17** Type Auto-Mappings for SAPWrite (XS) — eliminate LLM type code confusion
10. **FEAT-12** Fix Proposals / Auto-Fix (S) — safer than LLM-guessed fixes. **↑ Priority increased:** dassian-adt now has `abap_fix_proposals` tool (Apr 2026). abap-adt-api has `fixProposals` + `fixEdits` methods as implementation reference.
11. **FEAT-16** Error Intelligence (S) — actionable hints for SAP errors (subsumes SEC-03). **↑ Priority increased:** dassian-adt has extensive SAP-domain error classification (SM12, SPAU, L-prefix, activation deps, session timeout detection). High impact for AI self-correction.
12. ~~**FEAT-13** DDIC Domain/Data Element Write (S) — complete data modeling workflow~~ (**completed 2026-04-12**)
13. ~~**FEAT-44** TABL (Database Table) Create (S)~~ — **completed 2026-04-14** (source-based TABL create/update/delete + batch_create support in SAPWrite)
14. ~~**FEAT-45** DEVC (Package) Create (S)~~ — **completed 2026-04-14**. Endpoint: `/sap/bc/adt/packages`.
15. **FEAT-18** Function Group Bulk Fetch (S) — token/round-trip savings. dassian-adt has parallel fetch.
16. **FEAT-10** PrettyPrint (XS) — **↑ Upgraded from P2:** dassian-adt and VSP both have this. XS effort, high visibility.
17. **FEAT-20** Source Version / Revision History (S) — **↑ Upgraded from P2:** dassian-adt added `abap_get_revisions`. Enables diff and rollback workflows.
18. **DOC-01** Copilot Studio Setup Guide (S) — critical for enterprise adoption
19. **DOC-02** Basis Admin Security Guide (S) — admin audience needs clear guidance

### Phase C: ADT Feature Parity (P2) — Quick Wins
13. **FEAT-32** Table Pagination / Offset (XS) — VSP has this, practical improvement
14. ~~**FEAT-10** PrettyPrint (XS) — **promoted to P1/Phase B** (dassian-adt + VSP have it)~~
15. **FEAT-11** Inactive Objects List (XS) — development workflow
16. **FEAT-19** Transport Contents (XS) — review objects before release
17. **FEAT-21** ABAP Documentation / F1 Help (XS) — real docs instead of hallucination
18. **FEAT-28** SAP Compatibility Hardening (S) — 7 compat fixes bundled (expanded Apr 8)
19. **OPS-02** Health Check Enhancements (XS) — `/health/deep` with SAP connectivity check

### Phase D: ADT Feature Parity (P2) — Larger Items
20. ~~**FEAT-46** SRVB (Service Binding) Create (S)~~ — **completed 2026-04-14** (SAPWrite now supports SRVB create/update/delete + batch_create; create guidance points to activate + publish flow).
21. **FEAT-47** MSAG (Message Class) Read/Write (S) — used in RAP for exception classes and validation messages. Endpoint: `/sap/bc/adt/messageclass/`.
22. **FEAT-39** Transport Enhancements (S) — delete, reassign owner, transport type selection (K/W/T/S/R), recursive release. sapcli has full CTS lifecycle.
21. **FEAT-41** ABAP Unit Test Coverage (S) — statement-level coverage via `/runtime/traces/coverage/measurements/{id}` with paginated follow-up. sapcli + AWS Accelerator have this.
22. **FEAT-42** ATC Output Formats (XS) — JUnit4, checkstyle, codeclimate formatters for CI/CD integration. sapcli has these.
23. **FEAT-43** DDIC Auth & Misc Read (S) — Authorization Fields (`/authorizationfields`), Feature Toggles, Enhancement Implementations. sapcli added auth fields Apr 2026.
24. **FEAT-09** SQL Trace Monitoring (S) — completes diagnostics story
25. **SEC-05** Rate Limiting (S) — prevent runaway AI loops
26. ~~**FEAT-20** Source Version / Revision History (S) — **promoted to P1/Phase B** (dassian-adt added revisions tool)~~
27. **FEAT-31** Code Coverage from Unit Tests (S) — VSP has this (Apr 4). See also FEAT-41 for sapcli's approach.
28. **FEAT-33** CDS Impact Analysis (S) — VSP has this (Apr 4)
25. **FEAT-24** CompareSource / Diff (S) — code review workflows
26. **FEAT-26** MCP Client Config Snippets (S) — onboarding UX
27. **FEAT-25** CDS Unit Tests (S) — CDS test-driven development
28. **FEAT-23** GetProgFullCode / Include Traversal (S) — reduce round trips
29. **FEAT-27** Migration Analysis ECC->S/4 (S) — custom code migration
30. **FEAT-06** Cloud Readiness Assessment (M) — ATC cloud checks + abaplint
31. **FEAT-03** Enhancement Framework / BAdI (M) — customization scenarios
32. **FEAT-22** gCTS/abapGit Integration (M) — Git-based ABAP workflows (VSP has 10 tools now)
33. **FEAT-34** i18n Translation Management (M) — VSP has 7 tools (Apr 5)
34. **OPS-03** Multi-System Routing (L) — one instance -> multiple SAP systems
35. **DOC-03** SAP Community Blog Post (S) — visibility and adoption
36. **FEAT-30** ABAP Cleaner Integration (M) — optional Java-based code cleanup (see below)

### Phase E: New Capabilities from Competitor Sprint (P2-P3)
33. **FEAT-31** Code Coverage from Unit Tests (S) — VSP added line-level coverage metrics
34. **FEAT-32** Table Pagination / Offset (XS) — VSP added offset + columns_only to table contents
35. **FEAT-33** CDS Impact Analysis (S) — VSP added downstream consumer tracing for CDS views
36. **FEAT-34** i18n Translation Management (M) — VSP added 7 translation tools

### Phase F: Future / Niche (P3)
37. **FEAT-07** TLS/HTTPS for HTTP Streamable (S) — most deployments use reverse proxy (BTP gorouter, nginx, K8s Ingress) for TLS termination; in-app TLS is edge case
38. **FEAT-05** Code Refactoring (L) — rename, extract method, change package
39. **FEAT-29** P3 Backlog — see [FEAT-29 table](#feat-29-p3-backlog-future--niche) for SSE, debugger, execute ABAP, call graph, UI5/BSP, RFC, embeddable server, lock registry, language attributes

### Strategic Context: SAP Official ABAP MCP Server (Q2 2026)

SAP confirmed GA of ABAP Cloud Extension for VS Code with built-in agentic AI powered by official ABAP MCP Server in Q2 2026. Initial scope: RAP UI service development. Key implications for ARC-1:

1. **SAP's MCP server will be ABAP Cloud only** — ARC-1's on-premise + BTP support remains a differentiator
2. **SAP will re-offer Joule capabilities as MCP tools** — creates a baseline expectation for MCP tooling quality
3. **SAP is making local MCP servers available for SAP Build** — enables Cursor, Claude Code, Cline, Windsurf to use SAP frameworks
4. **ARC-1's safety system, multi-client support, and enterprise auth are not in SAP's scope** — the managed gateway model remains unique
5. **Risk**: SAP's official server may reduce demand for community alternatives for ABAP Cloud customers
6. **Opportunity**: ARC-1 serves the vast on-premise + RISE customer base that SAP's cloud-only offering won't reach

---

## Details: Not Yet Implemented

### FEAT-02: API Release Status Tool (Clean Core)
| Field | Value |
|-------|-------|
| **Priority** | P0 |
| **Effort** | S (1-2 days) |
| **Risk** | Low |
| **Usefulness** | Very High — critical for S/4HANA Cloud and clean core compliance |
| **Status** | Completed |
| **Source** | [VSP eval](../compare/vibing-steampunk/evaluations/7270ad7-api-release-state.md) |

**What:** Check whether an SAP object (class, function module, table, CDS view) is released, deprecated, or internal. Returns the API release state (C1 Released, C2 Deprecated, Not Released) and the recommended successor.

**Why:** Every S/4HANA Cloud / BTP ABAP customer needs to check if their code uses only released APIs. This is a "must have" for any AI copilot helping with ABAP Cloud development.

**Implementation (2026-04-10):** Added `API_STATE` type to `SAPRead`. Uses ADT endpoint `/sap/bc/adt/apireleases/{encoded-uri}` with `Accept: application/vnd.sap.adt.apirelease.v10+xml`. Returns structured JSON with contract-level states (C0-C4), successor info, and catalog metadata. Based on VSP's corrected implementation (commit 8a478aa).

---

### FEAT-07: TLS/HTTPS for HTTP Streamable Transport
| Field | Value |
|-------|-------|
| **Priority** | P3 (downgraded from P0, 2026-04-11) |
| **Effort** | S (1-2 days) |
| **Risk** | Low |
| **Usefulness** | Low — most deployments use reverse proxy for TLS termination |
| **Status** | Completed (2026-04-12) |
| **Source** | [fr0ster tracker: TLS evaluation](../compare/fr0ster/evaluations/tls-https-support.md) |

**What:** Add native TLS support to the HTTP Streamable transport. fr0ster added this in v4.6.0 with `--tls-cert`/`--tls-key` flags. Currently ARC-1 requires a reverse proxy (nginx, CF router) for HTTPS.

**Why:** Enterprise customers deploying outside BTP CF (e.g., on VMs, Kubernetes) need HTTPS without an external proxy. fr0ster's implementation shows the pattern: load cert/key files, create `https.Server` instead of `http.Server`.

**Why not:** Standard practice is reverse proxy (nginx, CF gorouter, K8s Ingress) for TLS termination — adding TLS inside the Node.js app duplicates certificate management. BTP CF already provides auto-renewed platform certs at the routing layer. In-app TLS adds complexity (hot-reload on cert renewal, potential for misconfigured cert chains) without improving security over a reverse proxy. For Docker-on-VM deployments the argument is stronger, but even there nginx+certbot is well-understood.

**Implementation:**
- Add `SAP_TLS_CERT` / `SAP_TLS_KEY` env vars (and `--tls-cert` / `--tls-key` CLI flags)
- In `src/server/http.ts`, conditionally create `https.createServer()` when cert/key are provided
- Auto-detect port 443 vs 8080 based on TLS mode

---

### FEAT-08: Content-Type 415/406 Auto-Retry
| Field | Value |
|-------|-------|
| **Priority** | P0 |
| **Effort** | XS (< 1 day) |
| **Risk** | Low |
| **Usefulness** | High — robustness fix for SAP system variations |
| **Status** | **Completed** (2026-04-12) |

> **Implementation note:** Already fully implemented in `src/adt/http.ts:325-398` with guard-protected single retry, fallback header logic, and 13 unit tests. Was implemented as part of the transport write compatibility work.
| **Source** | [fr0ster tracker: 415 evaluation](../compare/fr0ster/evaluations/415-content-type-retry.md), [VSP tracker: issue #9](../compare/vibing-steampunk/evaluations/issue-9-transport-accept-header.md) |

**What:** SAP systems vary in Accept/Content-Type expectations across versions and endpoint types. When a request gets 415 (Unsupported Media Type) or 406 (Not Acceptable), automatically retry with alternative Content-Type headers.

**Why:** Both fr0ster (issue #22/#23) and VSP (issue #9) hit this on transport endpoints. It's a common SAP ADT compatibility issue across system versions. A transparent retry in `src/adt/http.ts` would handle it for all endpoints.

**Why not:** ARC-1's `src/adt/http.ts` already has guard-protected retry logic for 406/415 with fallback headers. A code audit may reveal the existing implementation already covers the necessary cases. 415/406 errors are rare in practice — no production issues have been reported against ARC-1 specifically. Adding more elaborate retry strategies increases code surface for marginal gain.

**Implementation:**
- In `src/adt/http.ts`, intercept 415/406 responses
- Retry with `Accept: application/xml` -> `Accept: */*` (or vice versa)
- Retry with `Content-Type: application/xml` -> `text/plain` for transport endpoints
- Max 1 retry, log the fallback
- **See also FEAT-38** (ADT Service Discovery) for proactive MIME negotiation instead of reactive retry

---

### FEAT-14: 401 Session Timeout Auto-Retry
| Field | Value |
|-------|-------|
| **Priority** | P0 |
| **Effort** | XS (< 1 day) |
| **Risk** | Low |
| **Usefulness** | High — prevents mid-conversation failures |
| **Status** | **Completed** (2026-04-12) |

> **Implementation note:** Added `authRetryInProgress` guard and 401 retry block to `src/adt/http.ts`. On 401: reset session (cookies + CSRF), re-apply auth (Basic or Bearer token refresh), re-fetch CSRF for modifying methods, retry once. Follows the same guard pattern as DB connection retry. 7 unit tests cover Basic Auth, Bearer token, guard, cookie clearing, and per-request guard reset.
| **Source** | [VSP eval](../compare/vibing-steampunk/evaluations/d73460a-401-auto-retry.md) |

**What:** After idle, SAP returns 401. ARC-1 handles CSRF 403 refresh but may not handle 401 session timeout. Add silent re-authentication and retry on 401 in `src/adt/http.ts`.

**Why:** Mid-conversation failures are disruptive to LLM workflows. VSP (#32) and `abap-adt-api` both handle this. A centralized gateway that stays idle between user requests will hit this frequently.

**Why not:** Silent re-auth on 401 conflicts with ARC-1's stateless request design. In BTP ABAP (OAuth), a 401 means the token was rejected (revoked, clock skew, user deactivated) — retry won't help. In on-premise (Basic Auth), credentials are cached so 401 is a real auth failure. Silently retrying obscures the real failure and could break lock/modify/unlock transactions that depend on a consistent session. If ARC-1 re-authenticates, it needs stored credentials (security risk). Surfacing the error to the LLM lets it prompt the user to re-authenticate, which is more transparent.

---

### FEAT-15: Namespace URL Encoding Audit
| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Effort** | XS (< 1 day) |
| **Risk** | Low |
| **Usefulness** | High — prevents hard-to-debug failures |
| **Status** | **Completed** (2026-04-12) |

> **Implementation note:** Audit confirmed `encodeURIComponent()` is consistently applied across all 35+ call sites. Additionally hardened XML attribute escaping: extracted shared `escapeXmlAttr()` to `src/adt/xml-parser.ts`, applied it to all 6 interpolation sites in `devtools.ts`, and updated `codeintel.ts` and `transport.ts` to use the shared utility. 4 devtools escaping tests + 3 escapeXmlAttr unit tests added.
| **Source** | [VSP eval](../compare/vibing-steampunk/evaluations/59b4b90-namespace-url-encoding.md), [VSP eval](../compare/vibing-steampunk/evaluations/6d1f00a-namespace-syntax-check.md) |

**What:** Namespaced objects (`/NAMESPACE/CLASS`) fail if `/` is not correctly encoded in ADT URLs. VSP hit this in issues #18, #52. Audit all `encodeURIComponent` usage in `src/adt/client.ts` and `src/adt/http.ts`.

**Why:** Namespaced SAP objects are common in enterprise systems. Silent URL encoding failures are hard to debug.

**Why not:** Code audit shows `encodeURIComponent` is consistently applied in all object name positions across `src/adt/client.ts`, `src/adt/crud.ts`, `src/adt/devtools.ts`, `src/adt/diagnostics.ts`, and `src/adt/codeintel.ts`. SAP object names are alphanumeric + underscore; the `/` in namespaced names (e.g., `/DMO/BS_BOOKING`) is already correctly encoded to `%2F` by `encodeURIComponent`. The "namespace" issue in VSP was XML namespace stripping, which ARC-1 handles differently via `fast-xml-parser` with `removeNSPrefix`. A formal audit is unlikely to find actionable bugs.

---

### FEAT-12: Fix Proposals / Auto-Fix from ATC
| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Effort** | S (1-2 days) |
| **Risk** | Low |
| **Usefulness** | High — safer than LLM-guessed fixes |
| **Status** | Completed (2026-04-14) |
| **Source** | [abap-adt-api eval](../compare/abap-adt-api/evaluations/issue-37-quickfix.md) |

**What:** When ATC or syntax check finds an issue, SAP's fix proposal API (`/sap/bc/adt/quickfixes`) suggests the exact correction. Expose this via SAPDiagnose or SAPWrite so the LLM can apply verified fixes instead of guessing.

**Why:** Far safer than having the LLM guess the fix. Directly supports **safe defaults** and **token efficiency** — the LLM gets the exact fix without trial-and-error. The `abap-adt-api` library implements `fixProposals` and `fixEdits`.

**Why not:** The ADT quickfixes endpoint (`/sap/bc/adt/quickfixes`) is undocumented in SAP Help and has unclear API stability across SAP releases. SAP's quickfixes are heuristic-based (pattern matching) and not always semantically correct — an LLM told "these are verified SAP fixes" may apply them blindly, shifting blame to ARC-1. The project already integrates `@abaplint/core` for pre-write validation with 100+ rules and fix suggestions, so adding SAP quickfixes creates ambiguity about which fix authority is canonical. Maintenance burden grows if the API contract changes per SAP patch.

---

### FEAT-13: DDIC Domain/Data Element Write
| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Effort** | S (1-2 days) |
| **Risk** | Low |
| **Usefulness** | High — completes AI-assisted data modeling |
| **Status** | Complete (2026-04-12) |
| **Source** | [abap-adt-api eval](../compare/abap-adt-api/evaluations/646bb9b-dtel-doma-write.md) |

**What:** ARC-1 reads DOMA/DTEL but can't write properties or fixed values. The `abap-adt-api` library (v7.1.1) added `createDomainDefinition`, `createDataElement`, and `createStructure` with full property support. Add write support for these in SAPWrite.

**Why:** Blocks full AI-assisted data modeling workflows. A developer asking the LLM to "create a domain ZSTATUS with values A=Active, I=Inactive" currently can't be fulfilled end-to-end.

**Implementation (2026-04-12):**
- Added DDIC metadata XML builders in `src/adt/ddic-xml.ts` (`buildDomainXml`, `buildDataElementXml`) with fixed value support and strict DTEL field ordering.
- Added `updateObject` + `safeUpdateObject` in `src/adt/crud.ts` for lock/PUT/unlock metadata writes.
- Enabled `DOMA`/`DTEL` in SAPWrite schemas and tool definitions (`src/handlers/schemas.ts`, `src/handlers/tools.ts`), including DDIC-specific parameters.
- Wired SAPWrite create/update/batch_create in `src/handlers/intent.ts` to use DDIC v2 content types (`application/vnd.sap.adt.domains.v2+xml`, `application/vnd.sap.adt.dataelements.v2+xml`) and metadata write flow (no `/source/main`).
- Added unit tests, integration CRUD lifecycle tests, and E2E tests for DOMA/DTEL write paths.

---

### FEAT-16: Error Intelligence (Actionable Hints)
| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Effort** | S (1-2 days) |
| **Risk** | Low |
| **Usefulness** | High — directly improves admin control and LLM UX |
| **Status** | Not started |
| **Source** | Dassian pattern, Roadmap SEC-03 |

**What:** When SAP returns common errors (409 locked, 423 enqueued, 403 auth, 415 content type), return actionable hints: "Object locked by user X — check SM12", "Authorization failed — check SU53/PFCG", "Transport required — check SE09". Subsumes SEC-03 (S_DEVELOP awareness).

**Why:** Supports **centralized admin control** — admins and LLMs get clear guidance instead of raw SAP error HTML. Dassian does this well with its error intelligence pattern.

**Why not:** Error hints become stale across SAP releases — a hint for "error 409 = object locked" in 7.50 may not be accurate in BTP ABAP. ARC-1 only sees the HTTP status code, not the user's roles (SU01), package ownership (DEVC), or enqueue status (SM12), so hints are educated guesses rather than true intelligence. A generic "Check SU53" hint is what experienced developers already do — the feature adds noise without truly solving the diagnosis problem. It also increases the support burden: users follow the hint, get lost, and blame ARC-1.

---

### FEAT-17: Type Auto-Mappings for SAPWrite
| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Effort** | XS (< 1 day) |
| **Risk** | Low |
| **Usefulness** | Medium — reduces LLM confusion |
| **Status** | Not started |
| **Source** | Dassian pattern |

**What:** Auto-map friendly type codes to ADT internal codes: `CLAS` -> `CLAS/OC`, `INTF` -> `INTF/OI`, `PROG` -> `PROG/P`, etc. LLMs shouldn't need to know ADT's internal type code suffixes.

**Why:** Supports **token efficiency** — reduces failed create attempts where the LLM guesses the wrong type code.

**Why not:** The mapping is incomplete and fragile — SAP has multiple variants (`PROG/P` vs `PROG/I`, `CLAS/OC` vs `CLAS/LI`) and defaults may differ by release. Power users who know the correct suffix can't bypass the auto-mapping, creating a false abstraction. Better error messages (extracting ADT's 400 "expected CLAS/OC" response) solve the root cause more cleanly. The mapping also encourages sloppy LLM behavior — if ARC-1 always "fixes" type codes, the LLM stops learning the correct ones, creating problems when users switch to other tools.

---

### FEAT-18: Function Group Bulk Fetch
| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Effort** | S (1-2 days) |
| **Risk** | Low |
| **Usefulness** | High — significant token/round-trip savings |
| **Status** | Not started |
| **Source** | Dassian pattern |

**What:** Fetch ALL includes and function modules of a function group in one call, instead of N sequential requests. Returns combined source with clear delimiters.

**Why:** Supports **token efficiency** — a function group with 20 FMs currently requires 20+ round trips. One bulk call reduces latency and simplifies the LLM's context.

**Why not:** ADT has no bulk fetch endpoint for function groups — implementation would still make N sequential HTTP calls internally, just hiding them from the client. The bottleneck is network latency, not round-trips — HTTP/2 pipelining and ARC-1's existing SQLite cache already mitigate this. Bundling 20+ function sources into one response may hit context window limits or timeout. Parsing "combined source with delimiters" is error-prone (function names with special characters, include ordering). The feature also conflicts with the per-object caching strategy in `src/cache/caching-layer.ts`.

---

### SEC-05: Rate Limiting
| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Effort** | S (1-2 days) |
| **Risk** | Low |
| **Usefulness** | Medium — prevents runaway AI loops from overwhelming SAP |
| **Status** | Not started |

**What:** Token bucket rate limiter per MCP session, configurable via env var. Prevents an AI agent in a retry loop from generating thousands of SAP API calls per minute.

**Why:** Prevents LLM retry loops from overloading SAP. Enterprise deployments need predictable load.

**Why not:** Rate limiting at the MCP session level doesn't prevent SAP overload — a single aggressive query can exhaust a bucket in milliseconds while a slow query stays under limits. SAP's own throttling (RFC connection pools, dialog process limits) and reverse proxies (API Gateway rate limits) are more effective at the right layer. For multi-instance deployments, rate limiting requires distributed state (Redis), adding a significant dependency. Better handled by infrastructure (API Gateway, BTP rate limiting, SAP ICM settings) than by the application.

**Configuration:**
```bash
SAP_RATE_LIMIT=60        # requests per minute per session (0 = unlimited)
SAP_RATE_LIMIT_BURST=10  # burst allowance
```

**Implementation:**
- Use `rate-limiter-flexible` npm package or simple in-memory token bucket
- Per-session limiter (keyed by MCP session ID or OIDC user)
- Return MCP error with retry-after hint when rate limited

---

### FEAT-03: Enhancement Framework (BAdI/Enhancement Spot)
| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Effort** | M (3-5 days) |
| **Risk** | Low |
| **Usefulness** | Medium — important for customization scenarios |
| **Status** | Not started |

**What:** Read enhancement spots, BAdI definitions, and enhancement implementations. Uses ADT endpoints `/sap/bc/adt/enhancements/*`.

**Why:** BAdIs are the primary extensibility mechanism in SAP — LLMs helping with customization need to discover and understand them.

**Why not:** BAdI discovery is primarily a human-driven IDE task (Eclipse ADT, SE80) — LLMs almost never implement BAdIs autonomously. ADT doesn't have a clean dedicated BAdI endpoint; implementation would require parsing program annotations and text include chains, making it fragile and version-sensitive. Reading BAdI definitions overlaps with what `SAPRead CLAS` already provides (method signatures of the implementing class). Adding enhancement-specific tools violates the "11 intent-based" design philosophy and opens the door to user exits, custom BAdIs, and other extension mechanisms.

---

### FEAT-06: Cloud Readiness Assessment
| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Effort** | M (3-5 days) |
| **Risk** | Low |
| **Usefulness** | High — unique differentiator for S/4HANA migration |
| **Status** | Not started |

**What:** Run ATC checks with ABAP Cloud check variant to assess whether code is cloud-ready. Combined with the enhanced abaplint integration (system-aware cloud/on-prem presets, pre-write validation, auto-fix), provide a comprehensive clean core compliance report.

**Why:** AWS ABAP Accelerator has this as a key feature. ARC-1 combines ATC cloud checks with `@abaplint/core` for offline linting.

**Why not:** `SAPLint` (abaplint with cloud preset) + `SAPDiagnose` (ATC checks) already cover cloud readiness individually — a combined report just concatenates outputs the LLM can already interpret. Enterprise cloud readiness assessments are formal compliance projects with custom rules; a generic tool won't satisfy their requirements. Combining two independently tested tools risks version mismatch errors (old ATC + new abaplint = false positives).

**Current state (partially implemented):**
- System-aware abaplint presets (BTP cloud vs on-prem) with auto-detection from SAP_BASIS release
- Pre-write lint validation blocks cloud_types/strict_sql/obsolete_statement violations on BTP
- Auto-fix via `lint_and_fix` action (keyword_case, obsolete_statement, etc.)
- Custom rule overrides via `--abaplint-config` or per-call `rules` parameter
- ATC Cloud check variant integration (server-side, complements offline abaplint)
- Combined cloud readiness report (ATC + abaplint findings merged)
- ✅ API release state check (FEAT-02, completed 2026-04-10)

---

### FEAT-09: SQL Trace Monitoring
| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Effort** | S (1-2 days) |
| **Risk** | Low |
| **Usefulness** | Medium — performance diagnostics |
| **Status** | Not started |
| **Source** | [Feature matrix #17](../compare/00-feature-matrix.md) |

**What:** Read SQL trace state, list SQL traces, analyze trace results. Uses ADT endpoints `/sap/bc/adt/runtime/traces/sql/*`. VSP has `GetSQLTraceState`, `ListSQLTraces`.

**Why:** Completes the diagnostics story alongside short dumps and profiler traces. Useful for AI-assisted performance analysis.

**Why not:** SQL tracing is a performance debugging tool, not a development task — LLMs don't optimize query performance, humans do. ADT's trace endpoints are read-only (can't start/stop traces from ADT — users must start them in SAP's ST05), making the tool half-featured. A single SQL trace can contain thousands of lines, bloating the LLM context window for marginal diagnostic value.

---

### FEAT-10: PrettyPrint (Code Formatting)
| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Effort** | XS (< 1 day) |
| **Risk** | Low |
| **Usefulness** | Medium — code formatting via ADT API |
| **Status** | Not started |
| **Source** | [Feature matrix #14](../compare/00-feature-matrix.md) |

**What:** Format ABAP source code via ADT's PrettyPrint API. VSP and mcp-abap-abap-adt-api have this. Also includes get/set PrettyPrinter settings.

**Why:** Consistent code formatting is important for readability and team standards.

**Why not:** `SAPLint` with auto-fix already handles code formatting (indentation, spacing, line breaks, keyword casing) via `@abaplint/core` — locally, without a SAP round-trip. ADT PrettyPrint adds 100ms+ network latency for zero additional value over the local formatter. Code formatting is stateless and doesn't need SAP's ADT. Users who want IDE-style formatting use their IDE, not an MCP server.

---

### FEAT-11: Inactive Objects List
| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Effort** | XS (< 1 day) |
| **Risk** | Low |
| **Usefulness** | Medium — development workflow improvement |
| **Status** | Done (via SAPRead type=INACTIVE_OBJECTS) |
| **Source** | [Feature matrix #19](../compare/00-feature-matrix.md) |

**What:** List inactive objects system-wide. VSP and fr0ster both have this. Uses `/sap/bc/adt/activation/inactive`.

**Why:** Helps developers find objects they forgot to activate or that need attention.

**Why not:** System-wide queries can be slow on large systems (100K+ custom objects), blocking the MCP session. This is an administrative/housekeeping concern, not a development task — SAP's REPO_LIFECYCLE_MGR transaction is the canonical tool. LLMs don't decide "activate this old object" — humans do. The feature would sit mostly unused in typical LLM workflows.

---

### FEAT-19: Transport Contents (E071 List)
| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Effort** | XS (< 1 day) |
| **Risk** | Low |
| **Usefulness** | Medium — show objects inside a transport request |
| **Status** | ✅ Completed (subsumed by FEAT-39) |
| **Source** | Dassian pattern, abap-adt-api |

**What:** List the objects (E071 entries) contained in a transport request. Both dassian and abap-adt-api support this. Useful for reviewing what an LLM has changed before release.

**Resolution:** Subsumed by FEAT-39. Transport object parsing (`tm:abap_object` elements) is now included in `getTransport()` responses when the SAP system returns them. Objects are parsed best-effort from task nodes with fields: pgmid, type, name, wbtype, description, locked, position.

---

### FEAT-20: Source Version / Revision History
| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Effort** | S (1-2 days) |
| **Risk** | Low |
| **Usefulness** | Medium — version comparison, rollback context |
| **Status** | Not started |
| **Source** | [abap-adt-api eval](../compare/abap-adt-api/evaluations/d3c6940-source-versions.md), [VSP eval](../compare/vibing-steampunk/evaluations/dd06202-version-history.md) |

**What:** Load specific versions of ABAP source, compare active vs inactive, view revision history. The `abap-adt-api` library (v6.0.0) added `loadSourceVersion` and `sourceVersions`. Enables "show me what changed" and rollback workflows.

**Why:** Version history is essential for code review and understanding change context.

**Why not:** ADT's version management endpoints are poorly documented and may not exist in all SAP releases. Modern ABAP shops use abapGit or gCTS for version control, making SAP's internal versioning redundant. LLMs rarely need historical source ("show me the version from 2 weeks ago") — they work with current source. Implementing version management adds complexity for a niche workflow.

**Competitive update (2026-04-08):** VSP added 3 version history tools (commit dd06202, Apr 2): list versions, compare versions, get specific version. Both VSP and abap-adt-api now have this.

---

### FEAT-21: ABAP Documentation (F1 Help)
| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Effort** | XS (< 1 day) |
| **Risk** | Low |
| **Usefulness** | Medium — LLM fetches real docs instead of hallucinating |
| **Status** | Not started |
| **Source** | [abap-adt-api eval](../compare/abap-adt-api/evaluations/7d5c653-abap-documentation.md), VSP |

**What:** Fetch official ABAP keyword documentation (F1 help) via ADT API. The `abap-adt-api` library (v7.1.0) added `abapDocumentation`. Lets the LLM look up correct syntax instead of guessing.

**Why:** LLMs sometimes hallucinate ABAP syntax. Real documentation prevents this.

**Why not:** LLMs already know ABAP keywords well from training data — fetching F1 docs adds latency for redundant information. ADT doesn't have a clean endpoint for keyword documentation; would need to parse SAP's help server or documentation XML (version-specific, fragile). SAP's F1 docs vary by release, so a "fetch keyword doc" tool returns inconsistent results across systems. Claude, GPT-4, and Gemini have cleaner ABAP knowledge than SAP's own F1 text.

---

### FEAT-22: gCTS/abapGit Integration
| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Effort** | M (3-5 days) |
| **Risk** | Low |
| **Usefulness** | Medium — Git-based ABAP workflows |
| **Status** | Not started |
| **Source** | Dassian, [VSP eval](../compare/vibing-steampunk/evaluations/81cce41-gcts-tools.md), abap-adt-api |

**What:** List Git repositories, pull changes, check repo status. Multiple competitors have this (VSP, dassian, abap-adt-api). Enables Git-based ABAP development workflows.

**Why:** Git-based workflows are increasingly standard in ABAP development.

**Why not:** gCTS and abapGit are full version control systems with their own workflows (commit, branch, merge, conflict resolution). Wrapping both in MCP tools is massive scope creep — like adding git to an SQL client. Version control is a deployment concern, not a development task; LLMs don't decide "commit to Git" — that's a human/CI decision. Both tools have their own APIs with different maturity levels, adding maintenance burden. Users should use dedicated Git tooling, not route through an MCP server.

**Competitive update (2026-04-08):** VSP added 10 gCTS tools (commit 81cce41, Apr 5): repo management, branch operations, commit history, pull/push. Closes VSP issue #39. Three competitors now have gCTS (VSP, dassian, abap-adt-api).

---

### FEAT-23: GetProgFullCode (Include Traversal)
| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Effort** | S (1-2 days) |
| **Risk** | Low |
| **Usefulness** | Medium — reduces round trips for programs with includes |
| **Status** | Not started |
| **Source** | fr0ster |

**What:** Fetch a program with all its includes resolved into a single response. fr0ster has `GetProgFullCode`. Reduces N+1 round trips when reading programs with many includes.

**Why:** Simplifies reading programs with includes for LLMs.

**Why not:** `SAPContext` with dependency extraction already resolves includes and returns combined context with AST-based compression (7-30x reduction). A dedicated "full code" tool just renames existing functionality without adding behavior — it violates the 11-tool design principle. The LLM can already request `SAPRead PROG` followed by individual includes if needed; a bulk tool trades flexibility for marginal convenience.

---

### FEAT-24: CompareSource (Diff)
| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Effort** | S (1-2 days) |
| **Risk** | Low |
| **Usefulness** | Medium — diff two versions of source |
| **Status** | Not started |
| **Source** | VSP |

**What:** Diff two versions of ABAP source (active vs inactive, or across transports). VSP has `CompareSource`. Useful for code review workflows.

**Why:** Diff is a fundamental code review operation.

**Why not:** Without FEAT-20 (revision history), there's no way to fetch "version B of object X" — the tool can only compare active vs inactive, which is a niche use case. LLMs are excellent at diffing code — the user can fetch two sources via `SAPRead` and ask the LLM to compare them. A diff utility is a client concern, not a server concern. Adding diff as an MCP tool wraps a trivial operation in unnecessary round-trip latency.

---

### FEAT-25: CDS Unit Tests
| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Effort** | S (1-2 days) |
| **Risk** | Low |
| **Usefulness** | Medium — CDS test-driven development |
| **Status** | Not started |
| **Source** | fr0ster |

**What:** Create, run, and check CDS unit tests. fr0ster is the only project with this capability. Enables AI-assisted CDS development with test coverage.

**Why:** CDS views are increasingly central to S/4HANA development. Test support enables test-driven CDS development.

**Why not:** CDS unit tests (via CDS Test Environment) require ABAP code generation for test doubles and fixture setup — ADT doesn't have a dedicated endpoint. The complexity is 3-4x higher than ABAP unit tests. LLMs can already generate CDS unit test code directly, create the test class via `SAPWrite batch_create`, and run it via `SAPDiagnose` — no intermediate tool needed. The feature is a convenience wrapper over existing capabilities, not new functionality.

---

### FEAT-26: MCP Client Config Snippets
| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Effort** | S (1-2 days) |
| **Risk** | Low |
| **Usefulness** | Medium — great onboarding UX |
| **Status** | Not started |
| **Source** | [fr0ster eval](../compare/fr0ster/evaluations/5f975fe-mcp-client-configurator.md) |

**What:** `arc-1 config --client claude` prints ready-to-paste MCP client configuration. fr0ster supports 11 clients. Lowers the barrier to first connection.

**Why:** Reduces friction for first-time setup.

**Why not:** Config snippets are static reference material that belongs in documentation, not in a CLI command. ARC-1 is an MCP server, not a configuration guide generator. Setup guides already cover client configuration. Maintaining config templates for 11+ MCP clients adds a maintenance burden that scales with the ecosystem — every new client version may change its config format.

---

### FEAT-27: Migration Analysis (ECC->S/4)
| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Effort** | S (1-2 days) |
| **Risk** | Low |
| **Usefulness** | Medium — custom code migration check |
| **Status** | Not started |
| **Source** | AWS ABAP Accelerator |

**What:** Run custom code migration checks to identify ECC code that needs changes for S/4HANA. AWS ABAP Accelerator has this as a key feature. Complements FEAT-06 (Cloud Readiness Assessment).

**Why:** S/4HANA migration is a major SAP customer initiative.

**Why not:** S/4HANA readiness is a subset of cloud readiness checks — `SAPLint` with the cloud preset already handles most migration warnings (deprecated statements, classic ABAP, etc.). SAP's Code Inspector (SCI) and ATC have dedicated S/4HANA migration checks that enterprises use formally in their migration projects. Organizations doing ECC->S/4 migrations won't rely on an LLM-driven tool for compliance — they use SAP's official readiness check tools with formal sign-off processes.

---

### FEAT-28: SAP Compatibility Hardening
| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Effort** | S (1-2 days total) |
| **Risk** | Low |
| **Usefulness** | Medium — prevents edge-case failures across SAP versions |
| **Status** | Not started |
| **Source** | Multiple competitor trackers |

**What:** A bundle of small compatibility fixes identified across all competitor trackers:
1. **ATC ciCheckFlavour workaround** — older SAP systems don't support the `ciCheckFlavour` parameter (dassian pattern)
2. **Stateful session header** — some ADT endpoints require `X-sap-adt-sessiontype: stateful` ([abap-adt-api eval](../compare/abap-adt-api/evaluations/issue-30-stateful-mode.md))
3. **Include lock parent resolution** — includes inherit parent's lock; verify FUGR/PROG includes lock correctly ([abap-adt-api eval](../compare/abap-adt-api/evaluations/issue-36-include-lock.md))
4. **Ignore syntax warnings on save** — syntax warnings should not block saves ([VSP eval](../compare/vibing-steampunk/evaluations/7fbfbba-ignore-warnings.md))
5. **Transport endpoint S/4 compat** — transport creation endpoint differs on S/4HANA 757+ ([VSP eval](../compare/vibing-steampunk/evaluations/ca02f47-transport-endpoint-compat.md))
6. **Auth headers on redirect** — SAP may redirect, and auth headers get stripped on cross-origin redirects. Verify undici/fetch behavior. ([VSP eval](../compare/vibing-steampunk/evaluations/27d4d7c-auth-redirect-stateful.md), added 2026-04-08)
7. **Lock handle 423 errors** — recurring issue in VSP (#91, #88, #78). Verify ARC-1 crud.ts handles 423 gracefully. ([VSP eval](../compare/vibing-steampunk/evaluations/issue-91-lock-handle-423.md), added 2026-04-08)

**Why:** Prevents real-world failures across SAP versions.

**Why not:** "7 compat fixes" is a bundle without clear scope — each item needs individual evaluation. Some items may already be handled (ARC-1 uses `withStatefulSession()` for lock sequences, undici handles cookies). Bundle approach suggests one-off patches rather than systematic compatibility handling. Version-specific workarounds add technical debt and conditional logic that's hard to test (requires access to each SAP version).

---

### FEAT-30: ABAP Cleaner Integration (Future)

| Field | Value |
|-------|-------|
| **Priority** | P3 |
| **Effort** | M (3-5 days) |
| **Risk** | Medium — adds Java 21 dependency, ~200MB Docker image increase |
| **Usefulness** | High for teams already using ABAP cleaner profiles |
| **Status** | Research complete, not started |

**What:** Optional integration with SAP's [ABAP cleaner](https://github.com/SAP/abap-cleaner) CLI (`abap-cleanerc`) for 100+ code cleanup rules with 469 configuration options. Runs as a pre-stage before abaplint in the lint/fix pipeline. Teams can mount their `.cfj` profile files to enforce company coding standards.

**Why:** Many SAP teams already maintain ABAP cleaner profiles (`.cfj` files) as their shared coding standard. Integrating this means LLM-generated code automatically conforms to the team's existing rules — no new rule configuration needed. ABAP cleaner handles transformations abaplint can't: READ TABLE -> table expressions, string concatenation -> string templates, FINAL declarations, advanced alignment (21 DDL/CDS-specific rules).

**Why not:** Adding a 200MB Java 21 runtime to a Node.js npm package increases distribution size dramatically. Docker image bloats from ~150MB to ~350MB. JVM boot time (1-2s) adds latency to every lint operation. `@abaplint/core` already covers most formatting and cleanup rules locally without external dependencies. Maintaining a polyglot pipeline (Java + Node.js) doubles the operational complexity. If ABAP Cleaner breaks on a Java update, ARC-1 is responsible for the debugging.

**Architecture:** Three-stage pipeline: ABAP cleaner (Java CLI, transforms) -> abaplint (TypeScript, lint+fix) -> pre-write gate (TypeScript, block/pass). ABAP cleaner is optional — if Java/JAR not found, skipped silently. CLI invoked via `child_process.execFile` with `--source` for inline processing (<128KB) or temp files for larger sources. Output captured from stdout.

**Key details from research:**
- CLI: `abap-cleaner --source "<ABAP>" --release "757" --profile "team.cfj"` -> cleaned source on stdout
- No stdin support — must use `--source` flag or `--sourcefile` with temp file
- No reliable exit codes (always 0) — error detection via stderr content
- Profile format: `.cfj` (JSON-like key-value with version header), `--profiledata` accepts inline content
- Release flag (`--release "757"`) maps to our existing `cachedFeatures.abapRelease`
- Docker: requires Java 21 + Eclipse RCP app (~200MB total). Suggest two image variants: `latest` (lean) and `with-cleaner` (full)
- Reference implementation: `vscode_abap_remote_fs/abapCleanerService.ts` wraps CLI with temp files + 30s timeout

**Config options (planned):**
- `SAP_ABAP_CLEANER_PATH` / `--abap-cleaner-path` — path to CLI binary
- `SAP_ABAP_CLEANER_PROFILE` / `--abap-cleaner-profile` — path to `.cfj` profile
- `SAP_ABAP_CLEANER_ENABLED` / `--abap-cleaner-enabled` — `auto` (default), `true`, `false`

---

### FEAT-31: Code Coverage from Unit Tests
| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Effort** | S (1-2 days) |
| **Risk** | Low |
| **Usefulness** | Medium — test quality assessment |
| **Status** | Not started |
| **Source** | [VSP eval](../compare/vibing-steampunk/evaluations/333f462-code-coverage.md) |

**What:** Return line-level code coverage metrics from ABAP unit test runs. VSP added `GetCodeCoverage` (commit 333f462, Apr 4). ARC-1's SAPDiagnose runs unit tests but returns pass/fail only, not coverage data.

**Why:** Coverage metrics help assess test quality and identify untested code paths.

**Why not:** ADT's unit test endpoints return pass/fail results, not coverage metrics — coverage data lives in ABAP Unit runtime (RSTSTC) and is only accessible via ABAP, not ADT REST. Line-level coverage for a 500-line class generates 500+ lines of output, bloating the LLM context window. LLMs don't optimize based on coverage — humans do. Coverage analysis is better handled offline (run tests locally, generate report, share with team).

---

### FEAT-32: Table Pagination / Offset
| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Effort** | XS (< 1 day) |
| **Risk** | Low |
| **Usefulness** | Medium — practical query improvement |
| **Status** | Not started |
| **Source** | [VSP eval](../compare/vibing-steampunk/evaluations/9fb6c8a-table-pagination.md) |

**What:** Add `offset` parameter for cursor-style pagination and `columns_only` for schema-only queries to SAPQuery table preview. VSP added these (commit 9fb6c8a, Apr 4), closing their issue #34. ARC-1 has `maxRows` but no offset.

**Why:** Pagination enables browsing larger tables and exploring data.

**Why not:** MCP is stateless per call — paginated queries require maintaining cursor state or session affinity that ARC-1 doesn't provide. LLMs fetch data once with a reasonable `maxRows` limit; "fetch rows 101-150" is an interactive UI pattern, not an LLM workflow. `$top=50` is usually sufficient for the LLM to understand the data shape. Adding offset introduces complexity for a rare use case.

---

### FEAT-33: CDS Impact Analysis
| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Effort** | S (1-2 days) |
| **Risk** | Low |
| **Usefulness** | Medium — increasingly important as S/4 moves logic into CDS |
| **Status** | Not started |
| **Source** | [VSP eval](../compare/vibing-steampunk/evaluations/6c67140-cds-impact.md) |

**What:** CDS-specific impact analysis: trace downstream consumers of a CDS view, get column-level metadata. VSP added CDS impact analysis and element info tools (commit 6c67140, Apr 4). Could extend SAPNavigate or SAPContext.

**Why:** CDS views are the foundation of S/4HANA — understanding downstream impact is critical before making changes.

**Why not:** `SAPContext` with AST-based dependency extraction already returns dependent views, associations, and consumers for CDS entities. ADT doesn't expose a "consumption graph" endpoint — full downstream tracing requires multiple queries or SQL against system tables. Comprehensive impact analysis spans multiple layers (CDS -> OData service -> Fiori app -> transactional programs), which is out of scope for a single MCP tool call.

---

### FEAT-34: i18n Translation Management
| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Effort** | M (3-5 days) |
| **Risk** | Low |
| **Usefulness** | Medium — multilingual ABAP development |
| **Status** | Not started |
| **Source** | [VSP eval](../compare/vibing-steampunk/evaluations/566f1f7-i18n-tools.md) |

**What:** Translation management tools: text elements, OTR texts, message class management, translation status, per-request language override. VSP added 7 translation tools (commit 566f1f7, Apr 5), closing their issue #40. ARC-1 has T100 message read and text elements read but not full management.

**Why:** Multilingual support is required for most enterprise SAP implementations.

**Why not:** i18n management is a niche domain requiring specialized SAP knowledge that LLMs don't have (translation workflows, OTR maintenance, text consistency checks). Text elements, OTR, and message classes are managed in different places with no unified ADT endpoint — building a tool requires hacking across fragmented APIs. Translation is usually managed by dedicated translators or compliance teams, not developers or LLMs. The feature adds tool complexity for a workflow that's better served by SAP's native SE63 transaction.

---

### FEAT-36: Type Information (SAPNavigate)
| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Effort** | S (1-2 days) |
| **Risk** | Medium — endpoint availability varies by SAP version |
| **Usefulness** | Medium-High — variable type resolution for LLM |
| **Status** | Deferred — endpoint not available on test system |
| **Source** | [ADT API Audit](research/complete/adt-api-audit-documentation-and-unused.md) |

**What:** `POST /sap/bc/adt/abapsource/typeinformation` returns the complete type of a variable/expression at a given source position. Tested on A4H 7.52 — returned 404. May be available on newer SAP NetWeaver/S/4HANA versions. Revisit when a newer test system is available.

**Why:** Type resolution helps LLMs understand variable usage without guessing.

**Why not:** LLMs can infer types from source context by tracing declarations, assignments, and method signatures — they don't need a SAP round-trip for this. The ADT endpoint returned 404 on the test system, suggesting limited availability. Even where available, the endpoint requires exact source position (line, column), which LLMs don't naturally produce. Type inference is what IDEs do with hover — LLMs are as good at this from reading source code.

---

### OPS-02: Health Check Enhancements
| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Effort** | XS (< 1 day) |
| **Risk** | Low |
| **Usefulness** | Medium — better monitoring |
| **Status** | Basic `/health` exists |

**What:** Enhanced health endpoint that checks SAP connectivity, returns version info, uptime, feature availability. Separate `/health` (load balancer, always fast) from `/health/deep` (includes SAP connectivity check).

**Why:** Better monitoring for production deployments.

**Why not:** Deep health checks (attempt to read TADIR, run syntax check) can hang if SAP is under load or the network is slow, making the monitoring tool itself unreliable. Kubernetes/Docker already have liveness/readiness probes that ARC-1 should use. If a deep health check fails, the behavior is unclear (reject all requests? partially? alert operator?) — simple connectivity checks ("can we reach SAP?") are sufficient and reliable.

---

### DOC-01: End-to-End Copilot Studio Setup Guide
| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Effort** | S (1-2 days) |
| **Risk** | Low |
| **Usefulness** | Very High — critical for adoption |
| **Status** | Partially done (oauth-jwt-setup.md updated with Copilot Studio section) |

**What:** Complete guide with screenshots covering:
1. Entra ID app registration (step-by-step)
2. BTP CF deployment (manifest, `cf push`, env vars)
3. Power Automate custom connector creation (Security tab configuration)
4. Copilot Studio agent creation with ARC-1 as MCP server
5. Common errors and fixes (troubleshooting table with all AADSTS errors)

**Why:** Critical for enterprise adoption. The primary use case (Copilot Studio) needs a clear guide.

**Why not:** Minimal. Documentation should always be done. The only risk is screenshots becoming outdated as Copilot Studio evolves, requiring periodic maintenance.

---

### DOC-02: Basis Admin Security Guide
| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Effort** | S (1-2 days) |
| **Risk** | Low |
| **Usefulness** | Very High — SAP Basis admins need clear guidance |
| **Status** | Not started |

**What:** Dedicated guide for SAP Basis administrators covering:
- What ARC-1 does and doesn't do (it's a proxy, not an ABAP runtime)
- SAP-side authorization: S_DEVELOP, ICF service activation for ADT
- Safety controls: read-only mode, allowed packages, operation filters
- How to create a restricted technical user for ARC-1 (minimal S_DEVELOP authorization)
- How to set up STRUST/CERTRULE for principal propagation
- Monitoring: where to check SAP security audit log (SM20) for ARC-1 activity
- How ARC-1's safety layer complements SAP's native authorization

**Why:** SAP Basis admins are the gatekeepers for enterprise adoption. They need clear, familiar guidance.

**Why not:** Minimal. Documentation targets a critical audience. The only consideration is that the guide must be reviewed by an actual Basis admin to ensure accuracy.

---

### DOC-03: SAP Community Blog Post
| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Effort** | S (1-2 days) |
| **Risk** | Low |
| **Usefulness** | High — visibility and adoption |
| **Status** | Draft exists ([Report 023](../reports/2025-12-05-023-arc1-for-abap-developers.md)) |

**What:** Publish on SAP Community: "ARC-1: Connecting SAP ABAP to Microsoft Copilot Studio via MCP" covering architecture, security model, and setup.

**Why:** SAP Community visibility drives adoption.

**Why not:** Marketing, not a feature. Better timing is after P1 + most P2 features are stable — ship the product first, then evangelize. One blog post in a sea of SAP Community content may not move the needle for adoption.

---

### FEAT-37: DCL (Access Control) Read/Write
| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Effort** | S (1-2 days) |
| **Risk** | Low |
| **Usefulness** | High — completes RAP development workflow |
| **Status** | Not started |
| **Source** | [sapcli comparison](../compare/09-sapcli.md) |

**What:** Add read and write support for CDS access control objects (DCL). sapcli uses the ADT basepath `/dcl/sources`. DCL objects are a mandatory part of RAP development — every CDS entity needs an access control to restrict data access.

**Current gap:** ARC-1 supports DDLS, DDLX, BDEF, SRVD, SRVB for RAP but is missing DCL, which breaks the RAP object creation workflow.

**Implementation:**
- Add `getDcl(name)` to `src/adt/client.ts` using `/sap/bc/adt/acm/dcl/sources/{name}/source/main`
- Add DCL to `objectBasePath()` and `sourceUrlForType()` in `src/adt/crud.ts`
- Add `buildCreateXml()` support for DCL in `src/adt/crud.ts`
- Add DCL to `SAPREAD_TYPES_ONPREM`, `SAPREAD_TYPES_BTP`, `SAPWRITE_TYPES_ONPREM`, `SAPWRITE_TYPES_BTP` in `src/handlers/tools.ts`
- Add unit tests with XML fixtures

---

### FEAT-38: ADT Service Discovery (MIME Negotiation)
| Field | Value |
|-------|-------|
| **Priority** | P0 |
| **Effort** | S (1-2 days) |
| **Risk** | Low |
| **Usefulness** | Very High — eliminates 415/406 content-type errors proactively |
| **Status** | Not started |
| **Source** | [sapcli comparison](../compare/09-sapcli.md), sapcli `sap/adt/discovery.py` |

**What:** Call `GET /sap/bc/adt/discovery` at startup to learn which MIME type versions each ADT endpoint supports. Cache the accepted Content-Type/Accept values per endpoint. Use correct headers from the start instead of guessing and retrying on 415/406.

**Why:** sapcli has done this since 2018 — it's the standard ADT pattern. ARC-1 currently uses reactive retry logic (FEAT-08) which adds latency and doesn't cover all edge cases. The discovery document tells you exactly what each endpoint accepts, eliminating guesswork.

**Why this is better than FEAT-08 alone:** FEAT-08 retries after failure (1 extra round-trip per mismatch). FEAT-38 probes once at startup and gets it right the first time for all subsequent requests. Combined approach: discovery at startup + FEAT-08 retry as fallback.

**Implementation:**
- Add `fetchDiscovery()` to `src/adt/http.ts` — parses `/sap/bc/adt/discovery` XML into a `Map<endpointPath, { accept: string[], contentType: string[] }>`
- Call during `AdtHttpClient` initialization (alongside CSRF fetch, which already hits `/sap/bc/adt/core/discovery`)
- Store in `AdtHttpClient` instance; cache in SQLite if caching enabled
- Before each request, look up endpoint in discovery map; use correct MIME types
- Fallback to current behavior if discovery fails or endpoint not in map
- Add to `src/adt/features.ts` as a feature probe

---

### FEAT-39: Transport Enhancements
| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Effort** | S (1-2 days) |
| **Risk** | Low |
| **Usefulness** | Medium — completes CTS lifecycle for LLM workflows |
| **Status** | ✅ Completed |
| **Source** | [sapcli comparison](../compare/09-sapcli.md) |

**What:** Extend SAPTransport with: delete transport/task, reassign owner, transport type selection (K/W/T), recursive release, and transport contents parsing. Subsumes FEAT-19.

**Implemented:**
- `deleteTransport()` with recursive flag (deletes unreleased tasks first)
- `reassignTransport()` with recursive flag (reassigns unreleased tasks first)
- `createTransport()` now accepts transport type parameter: K (Workbench), W (Customizing), T (Transport of Copies)
- `releaseTransportRecursive()` as new action (releases tasks before parent)
- Transport object parsing (`tm:abap_object`) in GET responses
- Fixed Accept header bugs in `getTransport()` and `releaseTransport()`
- All new operations gated by `checkTransport()` safety checks

**Deferred:** Transport types S (Development-Correction) and R (Repair) require specific CTS configuration that most systems lack.

---

### FEAT-40: FLP Launchpad Management (OData)
| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Effort** | M (3-5 days) |
| **Risk** | Medium — OData API, different from ADT REST |
| **Usefulness** | Very High — enterprise Fiori rollout automation |
| **Status** | Completed (2026-04-12) |
| **Source** | [sapcli comparison](../compare/09-sapcli.md), sapcli `sap/cli/flp.py` + `sap/odata/` |

**What:** Manage Fiori Launchpad configuration: catalogs, groups, target mappings, and tile assignments. Uses OData service `/sap/opu/odata/UI2/PAGE_BUILDER_CUST` (on-prem) or equivalent BTP API.

**Why:** Fiori Launchpad configuration is a major pain point in SAP projects. Automating catalog/group/tile setup via LLM saves hours of manual work per role. This is the kind of high-value enterprise automation that differentiates ARC-1 from developer-only tools.

**Implementation:**
- `src/adt/flp.ts` — OData client for PAGE_BUILDER_CUST with double-JSON tile config handling
- SAPManage actions: `flp_list_catalogs`, `flp_list_groups`, `flp_list_tiles`, `flp_create_catalog`, `flp_create_group`, `flp_create_tile`, `flp_add_tile_to_group`, `flp_delete_catalog`
- Feature-gated via `featureFlp` config (auto-probed at startup)
- Write ops use `OperationType.Workflow` — blocked by `readOnly: true`
- Graceful ASSERTION_FAILED handling for problematic catalogs

---

### FEAT-41: ABAP Unit Test Coverage (Statement-Level)
| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Effort** | S (1-2 days) |
| **Risk** | Low |
| **Usefulness** | High — enables test-driven ABAP development |
| **Status** | Not started |
| **Source** | [sapcli comparison](../compare/09-sapcli.md), sapcli `sap/adt/aunit.py` |

**What:** Fetch statement-level code coverage after running ABAP Unit tests. Uses `POST /sap/bc/adt/runtime/traces/coverage/measurements/{id}` with paginated `rel=next` follow-up for large result sets.

**Why:** Coverage data tells the LLM which lines are untested, enabling targeted test generation. sapcli and AWS Accelerator both have this. Currently ARC-1 runs tests but returns only pass/fail — no coverage metrics.

**Concern:** Coverage for a 500-line class generates 500+ lines of output. May need summarization (e.g., "85% covered, 12 uncovered lines: 45-48, 102-105, 200-204") rather than raw line-by-line data.

**Implementation:**
- Add `enableCoverage` parameter to `runUnitTests()` in `src/adt/devtools.ts`
- Post coverage measurement request, parse response with pagination
- Return summary + uncovered line ranges (not raw per-line data, to avoid context bloat)
- Integrate into SAPDiagnose or SAPRead `run_tests` action

---

### FEAT-42: ATC Output Formats
| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Effort** | XS (< 1 day) |
| **Risk** | Low |
| **Usefulness** | Medium — CI/CD integration |
| **Status** | Not started |
| **Source** | [sapcli comparison](../compare/09-sapcli.md) |

**What:** Format ATC check results as JUnit4 XML, checkstyle XML, or codeclimate JSON. Currently ARC-1 returns raw ATC results.

**Why:** Standard output formats enable integration with CI/CD pipelines (GitHub Actions, Jenkins, GitLab CI) and code quality dashboards.

**Implementation:**
- Add `format` parameter to ATC handler in `src/handlers/intent.ts` (`raw`, `junit4`, `checkstyle`, `codeclimate`)
- Formatter functions in new `src/adt/atc-formatters.ts`
- Default to current format for LLM consumption; optional structured formats for CI/CD

---

### FEAT-43: DDIC Auth & Misc Read (Authorization Fields, Feature Toggles)
| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Effort** | S (1-2 days) |
| **Risk** | Low |
| **Usefulness** | Medium — niche but useful for authorization analysis |
| **Status** | Not started |
| **Source** | [sapcli comparison](../compare/09-sapcli.md), sapcli commit `2ec4228` (Apr 2026) |

**What:** Add read support for Authorization Fields (`/sap/bc/adt/authorizationfields/{name}`, XML namespace `http://www.sap.com/iam/auth`), Feature Toggles (`/sap/bc/adt/sfw/featuretoggles`), and Enhancement Implementations (BAdI). sapcli recently added Authorization Fields (Apr 2026) and has had Feature Toggles since 2023.

**Why:** Authorization analysis is important for security audits. Feature toggles are used in SAP's switch framework for conditional features.

**Implementation:**
- Add `getAuthorizationField(name)` to `src/adt/client.ts`
- Add `getFeatureToggle(name)` to `src/adt/client.ts`
- Add both types to SAPRead handler
- XML parsing in `src/adt/xml-parser.ts` for the `auth:auth` namespace

---

### FEAT-44: TABL (Database Table) Create
| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Effort** | S (1-2 days) |
| **Risk** | Low |
| **Usefulness** | Very High — blocks RAP stack creation from scratch |
| **Status** | Completed (2026-04-14) |
| **Source** | [RAP project analysis](https://github.com/Xexer/abap_rap_blog), [SAP-samples/cloud-abap-rap](https://github.com/SAP-samples/cloud-abap-rap), [feature matrix](../compare/00-feature-matrix.md) |

**What:** Add create/update/delete support for traditional DDIC database tables (TABL) via SAPWrite. Tables are a prerequisite for CDS-based RAP development — root views reference persistent tables, and draft tables are required for managed BOs with draft.

**Current gap:** Closed in 2026-04-14 implementation.

**Competitor support:**
- **sapcli:** Full TABL CRUD via `POST /sap/bc/adt/ddic/tables/` + batch activation. XML serialization with `OrderedClassMembers` preserves element order.
- **vibing-steampunk:** CreateTable tool in Focused mode with batch activation.
- **fr0ster:** `HandlerCreate` routes to tables URL; auto-activates post-create (v5.0.7+).
- **dassian-adt:** `abap_create` with 16 type auto-mappings including TABL.

**Implementation:**
- Add `'TABL'` to `SAPWRITE_TYPES_ONPREM` and `SAPWRITE_TYPES_BTP` in `src/handlers/tools.ts`
- Add `'TABL'` to SAPWrite schema enums in `src/handlers/schemas.ts` (single + batch object schemas)
- Add TABL case to `buildCreateXml()` in `src/handlers/intent.ts` using `blue:blueSource` and `adtcore:type="TABL/DT"` (same shell pattern as BDEF)
- Keep TABL source-based (not DDIC metadata type): create shell with POST, then write source via `/source/main` using existing `safeUpdateSource` flow
- Keep content-type as `application/*` for create (same behavior as DDLS/SRVD)
- TABL requires activation after create (already supported via `SAPActivate`)
- Add unit tests for TABL create/update/delete/batch_create routing and create-XML output
- Add E2E lifecycle test (`tests/e2e/rap-write.e2e.test.ts`) for TABL create/read/activate/update/delete

---

### FEAT-45: DEVC (Package) Create
| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Effort** | S (1-2 days) |
| **Risk** | Low |
| **Usefulness** | High — blocks greenfield development workflows |
| **Status** | Not started |
| **Source** | [RAP project analysis](https://github.com/Xexer/abap_rap_blog), [SAP-samples/cloud-abap-rap](https://github.com/SAP-samples/cloud-abap-rap), [feature matrix](../compare/00-feature-matrix.md) |

**What:** Add package creation via SAPManage. Packages are the container for all ABAP development objects.

**Current state:** Implemented in SAPManage (`create_package`, `delete_package`) with ADT endpoint `/sap/bc/adt/packages`.

**Competitor support:**
- **sapcli:** `POST /sap/bc/adt/packages` with full XML body (name, description, superPackage, softwareComponent, transportLayer). Accepts explicit `corrNr` for transport.
- **vibing-steampunk:** CreatePackage tool in Focused mode. Note: package safety bypass bug #101 (SAP_ALLOWED_PACKAGES not enforced on create) — ARC-1 should avoid this.
- **fr0ster:** Generic `HandlerCreate` routes to packages URL.
- **dassian-adt:** `abap_create` with auto-derived software component + transport layer.

**Implementation:**
- Added `buildPackageXml()` (`pak:package` root, `DEVC/K`) in `src/adt/ddic-xml.ts`
- Added SAPManage actions: `create_package`, `delete_package`
- Added transport pre-flight guidance for non-local parent packages
- Enforced package allowlist on the parent package (`superPackage`)
- Implemented delete via lock/delete/unlock flow
- Updated schemas/tool definitions, tests, and docs/feature matrix

---

### FEAT-46: SRVB (Service Binding) Create
| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Effort** | S (1-2 days) |
| **Risk** | Low |
| **Usefulness** | Medium — completes RAP stack lifecycle (ARC-1 already has publish/unpublish) |
| **Status** | Complete (2026-04-14) |
| **Source** | [RAP project analysis](https://github.com/Xexer/abap_rap_blog), [SAP-samples/cloud-abap-rap](https://github.com/SAP-samples/cloud-abap-rap), [feature matrix](../compare/00-feature-matrix.md) |

**What:** Add SRVB object creation to SAPWrite. ARC-1 already reads SRVB and can publish/unpublish via SAPActivate.

**Implemented (2026-04-14):**
- Added `SRVB` to SAPWrite type enums and input schemas (on-prem + BTP).
- Added SRVB XML builder (`srvb:serviceBinding`) with `serviceDefinition`, `bindingType`, `category`, `version`.
- Added `buildCreateXml()` SRVB case and metadata-write routing (XML PUT update path, no `/source/main`).
- Added vendor content type for SRVB updates: `application/vnd.sap.adt.businessservices.servicebinding.v2+xml`.
- Added SAPWrite create response hint to run activation then `publish_srvb`.
- Added unit + E2E coverage for create/update/delete/batch_create and publish lifecycle.

**Competitor support (reference):**
- **sapcli:** Full SRVB CRUD via `POST /sap/bc/adt/businessservices/bindings/` with vendor-specific content type.
- **fr0ster:** `HandlerCreate` supports SRVB creation (v5.0.0+).
- **vibing-steampunk:** No create, only publish/unpublish.
- **dassian-adt:** No SRVB create.

**Note:** SRVB creation is now covered end-to-end; remaining RAP lifecycle gaps are DCL and TABL/package bootstrapping items (FEAT-37 / FEAT-44 / FEAT-45).

---

### FEAT-47: MSAG (Message Class) Read/Write
| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Effort** | S (1-2 days) |
| **Risk** | Low |
| **Usefulness** | Medium — used in RAP exception classes and validation messages |
| **Status** | Completed |
| **Source** | [SAP-samples/cloud-abap-rap](https://github.com/SAP-samples/cloud-abap-rap), [feature matrix](../compare/00-feature-matrix.md) |

**What:** Add read and write support for ABAP message classes (MSAG / T100). ARC-1 can already read T100 messages via `SAPRead type=MSAG` (message class listing), but cannot create message classes or add/update individual messages.

**Current gap:** Message classes are used in RAP for structured error messages in exception classes (`zdmo_cx_rap_generator` → `zdmo_cm_rap_gen_msg`). Without MSAG write, LLMs must use hardcoded text in RAISEs instead of proper message classes.

**Competitor support:**
- **sapcli:** Full message class CRUD. Read via `/sap/bc/adt/messageclass/{name}`, individual messages via `/sap/bc/adt/messageclass/{name}/messages/{number}`.
- **vibing-steampunk:** Message class read (T100 listing).
- **fr0ster:** Message class read via `adt-clients` factory.
- **dassian-adt:** No message class support.

**Implementation:**
- Add `MSAG` to `objectBasePath()` → `/sap/bc/adt/messageclass/`
- Add `MSAG` to `SAPWRITE_TYPES_ONPREM` and `SAPWRITE_TYPES_BTP`
- MSAG is a DDIC metadata type (XML-only, no source code)
- XML body includes message class name, description, and message entries (number, type, short text, long text)
- Add to `isDdicMetadataType()` for XML PUT updates
- Content-Type: likely `application/vnd.sap.adt.messageclass.v2+xml` (vendor-specific)

---

### FEAT-05: Code Refactoring (Rename, Extract Method)
| Field | Value |
|-------|-------|
| **Priority** | P3 |
| **Effort** | L (1-2 weeks) |
| **Risk** | Medium — complex ADT API interactions |
| **Usefulness** | Medium — valuable but complex |
| **Status** | Not started |

**What:** ADT supports code refactoring operations (rename symbol, extract method, change package). The marcellourbani/abap-adt-api TypeScript library implements these.

**Why:** Refactoring is a common developer workflow.

**Why not:** Massive implementation burden for marginal value — rename requires cross-system impact analysis (all callers, dynamic references); extract method requires parsing dependencies, detecting side effects, validating signatures. Both need multi-step ADT lock/unlock cycles with rollback semantics. LLMs are better at writing new methods than surgically extracting from existing ones — `SAPWrite edit_method` already lets the LLM replace a method body. Eclipse ADT and VS Code already have mature refactoring tools that humans prefer for this workflow.

**Competitive update (2026-04-08):** VSP added rename preview analysis (commit dcaa358, Apr 6). Shows what would change without performing the rename. abap-adt-api has full rename (3 methods).

---

### FEAT-29: P3 Backlog (Future / Niche)

The following features are tracked but not planned for near-term implementation. They are niche, complex, or not aligned with core principles.

| ID | Feature | Why deferred | Why not | Source | Effort |
|----|---------|-------------|---------|--------|--------|
| 29a | SSE transport | Most MCP clients use stdio or HTTP Streamable | Deprecated protocol; HTTP Streamable is the MCP standard | fr0ster | M |
| 29b | ABAP debugger (8+ tools) | Requires WebSocket + ZADT_VSP deployment | Massive scope, requires ABAP-side deployment (violates "no ABAP installation required" principle), niche use case for LLMs | VSP | L |
| 29c | Execute ABAP (IF_OO_ADT_CLASSRUN) | Security risk — needs careful safety gating | Fundamentally contradicts "safe defaults" principle — executing arbitrary ABAP from an LLM is the highest-risk operation possible | VSP, dassian | S |
| 29d | Call graph analysis (5 tools) | Useful but niche, complex | ADT doesn't expose call graphs directly; would need recursive where-used traversal (expensive, slow). SAPNavigate where-used covers the 80% case | VSP | M |
| 29e | UI5/Fiori BSP CRUD (7 tools) | Only relevant if UI5 detected | Out of scope — ARC-1 is ABAP ADT, not a UI5 deployment tool. BSP repository operations are fragile and version-specific | VSP | M |
| 29f | RFC connectivity (sap-rfc-lite) | Alternative to ADT HTTP, niche | Adds native binary dependency (N-API), breaks pure TypeScript promise, complex cross-platform compilation | fr0ster | M |
| 29g | Embeddable server mode | Library mode for CAP/Express embedding | Contradicts centralized gateway model — embedding in other apps creates unmanaged, unaudited instances | fr0ster | S |
| 29h | Lock registry with recovery | Persist lock state to disk for crash recovery | Over-engineering — SAP's own lock management (SM12) handles orphaned locks. ARC-1 uses `try/finally` for unlock, which is sufficient | fr0ster | M |
| 29i | Language attributes on creation | Multi-language object creation | Extremely niche — most ABAP objects are created in the system's default language | [abap-adt-api eval](../compare/abap-adt-api/evaluations/ffa43d7-language-attributes.md) | XS |
| 29j | Lua scripting / WASM compiler | VSP-unique experimental, not core MCP value | Experimental, not aligned with MCP standard, no enterprise demand | VSP | N/A |
| 29k | Dead code analysis | Method-level dead code via where-used | SAPNavigate where-used already provides the data; dead code determination is a heuristic that needs human judgment | [VSP eval](../compare/vibing-steampunk/evaluations/1ecafe7-dead-code-analysis.md) | S |
| 29l | Package health analysis | Aggregated test coverage + staleness + complexity | Composite metric without clear definition; each component (tests, where-used, complexity) is already available individually | [VSP eval](../compare/vibing-steampunk/evaluations/74efe5e-health-analysis.md) | M |
| 29m | Side effect / LUW classification | Classify methods by mutation profile | Requires runtime analysis or deep static analysis that ADT doesn't support; LLMs can infer side effects from reading the code | [VSP eval](../compare/vibing-steampunk/evaluations/11c2253-side-effects-luw.md) | M |
| 29n | Package boundary crossing | Architecture governance: cross-package call analysis | SAPNavigate where-used + package filter already covers this; dedicated tool adds marginal value over combining existing tools | [VSP eval](../compare/vibing-steampunk/evaluations/53fb790-boundary-crossing.md) | M |

---

### OPS-03: Multi-System Routing
| Field | Value |
|-------|-------|
| **Priority** | P3 |
| **Effort** | L (1-2 weeks) |
| **Risk** | Medium — significant architecture change |
| **Usefulness** | Medium — needed for enterprises with multiple SAP systems |
| **Status** | Not started |

**What:** Support multiple SAP systems from a single ARC-1 instance. Each MCP request includes a `sap_system_id` parameter. ARC-1 routes to the appropriate system based on configuration.

**Why:** Enterprises have multiple SAP systems (DEV, QAS, PRD, sandboxes).

**Why not:** Fundamentally changes the architecture — ARC-1 is a single-system gateway by design. Multi-system routing adds routing logic, session management per system, namespace separation, and tenant isolation complexity. If routing breaks, users from system A could theoretically access system B's data. Better handled at infrastructure level: run one ARC-1 per SAP system and use a load balancer or Kubernetes service mesh to route clients. This follows the 12-factor app pattern and keeps each instance simple and secure.

---

## Details: Completed

### SEC-01: Principal Propagation — Per-User SAP Authentication
| Field | Value |
|-------|-------|
| **Priority** | P0 |
| **Effort** | L (1-2 weeks: code wiring + SAP admin setup + testing) |
| **Risk** | Medium — requires SAP Basis admin (STRUST, CERTRULE, ICM profile) |
| **Usefulness** | Critical — enables per-user SAP authorization and audit trail |
| **Status** | Code complete (2026-03-27) — needs SAP-side setup (STRUST, CERTRULE, ICM) for end-to-end testing |

**Implemented (2026-03-27) — BTP Cloud Connector approach (SEC-02 merged into SEC-01):**
- `lookupDestinationWithUserToken()` in `src/adt/btp.ts` — calls Destination Service "Find Destination" API with `X-User-Token` header
- Per-request ADT client creation in `src/server/server.ts` — `createPerUserClient()` creates a fresh ADT client for each authenticated user
- `SAP-Connectivity-Authentication` header injection in `src/adt/http.ts` — carries SAML assertion to Cloud Connector
- `SAP_PP_ENABLED=true` config flag — opt-in for principal propagation
- Graceful fallback — if per-user lookup fails, falls back to shared service account
- No basic auth when PP active — username/password cleared, user identity from SAML assertion only
- 7 unit tests (5 BTP PP destination + 2 HTTP header injection)

**Architecture flow:**
1. User authenticates via XSUAA/OIDC -> JWT token
2. MCP SDK passes `authInfo.token` to tool handler
3. ARC-1 calls Destination Service with `X-User-Token: <jwt>` header
4. Destination Service generates per-user auth tokens (SAML assertion)
5. ADT client sends `SAP-Connectivity-Authentication` header via connectivity proxy
6. Cloud Connector generates X.509 cert -> CERTRULE -> SAP user
7. SAP enforces `S_DEVELOP` authorization per user

**SAP-side setup required (not yet done):**
1. BTP Destination: Change authentication from `BasicAuthentication` to `PrincipalPropagation`
2. Cloud Connector: Synchronize trust with BTP subaccount, set principal type to X.509
3. SAP backend: STRUST (import Cloud Connector CA), CERTRULE, ICM params
4. Subject pattern: Map `${email}` or `${user_name}` to SAP user ID

**References:**
- [SAP Help: Configuring Principal Propagation](https://help.sap.com/docs/connectivity/sap-btp-connectivity-cf/configuring-principal-propagation)
- [SAP Cloud SDK: On-Premise Connectivity](https://sap.github.io/cloud-sdk/docs/js/features/connectivity/on-premise)
- [lemaiwo/btp-sap-odata-to-mcp-server](https://github.com/lemaiwo/btp-sap-odata-to-mcp-server) — reference implementation

---

### SEC-02: BTP Cloud Connector Principal Propagation
| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Status** | Merged into SEC-01 (2026-03-27) — code complete, SAP-side setup pending |

**Merged:** SEC-02 was implemented as part of SEC-01. The BTP Cloud Connector approach was chosen over direct X.509 cert generation because it leverages existing BTP infrastructure and requires less code in ARC-1. See SEC-01 for implementation details.

---

### SEC-03: SAP Authorization Object Awareness (S_DEVELOP)
| Field | Value |
|-------|-------|
| **Status** | Subsumed by FEAT-16 (Error Intelligence) |

**Merged:** SEC-03's scope (parsing 403 authorization errors, mapping to S_DEVELOP objects, suggesting SU53/PFCG) is now part of FEAT-16 Error Intelligence, which covers all SAP error codes (403, 409, 423, 415) with actionable hints. See FEAT-16 for details.

---

### SEC-04: Audit Logging
| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Effort** | M (3-5 days) |
| **Status** | Complete (2026-04-01) — multi-sink audit system with BTP Audit Log Service |

**Implemented:**
- `src/server/audit.ts` — central audit logger with pluggable sinks
- `src/server/sinks/stderr.ts` — stderr sink (default)
- `src/server/sinks/file.ts` — file sink for persistent audit trail
- `src/server/sinks/btp-auditlog.ts` — BTP Audit Log Service sink (enterprise compliance)
- User identity (userName, email, clientId) logged with every tool call
- Elicitation events (confirmations, user choices) logged
- Structured logger with text/JSON output and sensitive field redaction

**References:**
- [OWASP: MCP Server Security - Logging](https://genai.owasp.org/resource/a-practical-guide-for-secure-mcp-server-development/)
- [Datadog: MCP Detection Rules](https://www.datadoghq.com/blog/mcp-detection-rules/)

---

### SEC-06: MCP Client Tool Restriction by User Role
| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Status** | Complete via scope enforcement (2026-03-27) |

**Implemented (2026-03-27):**
- `TOOL_SCOPES` map in `src/handlers/intent.ts` — each tool requires a scope (read/write/admin)
- Scope enforcement in `handleToolCall()` — checks `authInfo.scopes` before executing any tool
- `ListTools` filtering in `src/server/server.ts` — users only see tools they have scopes for
- XSUAA role collections (ARC-1 Viewer/Editor/Admin) map to scopes via `xs-security.json`
- Additive to safety system — both scope check AND safety check must pass
- Backward compatible — no authInfo (stdio, simple API key) = no scope enforcement
- 12 unit tests covering all scope enforcement scenarios

**How it works:**
- `read` scope -> SAPRead, SAPSearch, SAPQuery, SAPNavigate, SAPContext, SAPLint, SAPDiagnose (7 tools)
- `write` scope -> adds SAPWrite, SAPActivate, SAPManage (10 tools)
- `admin` scope -> adds SAPTransport (11 tools)
- XSUAA role collections assign scopes to users via BTP cockpit

**Why this matters for basis admins:**
- An SAP developer user (with full S_DEVELOP in Eclipse) can be restricted to read-only via AI
- The admin controls AI capabilities separately from SAP authorization
- **This is unique to ARC-1** — no other MCP server offers scope-based tool filtering

---

### SEC-07: XSUAA OAuth Proxy for MCP-Native Clients (Claude, Cursor, MCP Inspector)
| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Status** | Complete (2026-03-27) |

**Implemented:**
- MCP SDK's `ProxyOAuthServerProvider` proxies OAuth flow to XSUAA
- `@sap/xssec` v4.13+ for SAP-specific JWT validation (offline, JWKS cached)
- HTTP server refactored from `node:http` to Express 5 (required by MCP SDK auth)
- RFC 8414 discovery at `/.well-known/oauth-authorization-server`
- In-memory client store for dynamic client registration (RFC 7591)
- Chained token verifier: XSUAA -> Entra ID OIDC -> API key (all coexist)
- `xs-security.json` with read/write/admin scopes and 3 role collections
- XSUAA service instance created and bound on BTP CF
- Configuration: `SAP_XSUAA_AUTH=true` enables the proxy

**Files:**
- `src/server/xsuaa.ts` — OAuth provider, client store, chained verifier
- `src/server/http.ts` — Express-based HTTP server with auth routing
- `xs-security.json` — XSUAA service instance config
- `docs/xsuaa-setup.md` — Setup guide

**Reference:** Inspired by [lemaiwo/btp-sap-odata-to-mcp-server](https://github.com/lemaiwo/btp-sap-odata-to-mcp-server).

---

### SEC-08: OAuth Security Hardening (RFC 9700 Compliance)
| Field | Value |
|-------|-------|
| **Priority** | P0 |
| **Status** | Complete (2026-04-08) |

**Implemented (2026-04-08):**

Based on independent security review against RFC 9700 (reports/2026-04-08-001-oauth-security-review-verification.md):

- **F-01 (High):** Added `state` + PKCE (S256) to BTP browser OAuth flow — prevents authorization code injection and login CSRF
- **F-02 (High):** Bound OAuth callback server to `127.0.0.1` — prevents network-adjacent callback interception
- **F-04 (High):** Made `SAP_OIDC_AUDIENCE` mandatory when `SAP_OIDC_ISSUER` is set — prevents cross-service token confusion
- **F-10 (Medium):** HTML-escaped `error_description` in callback + added `Content-Security-Policy: default-src 'none'` headers
- **F-07 (Medium):** Replaced `exec()` with `execFile()` in browser opener — eliminates shell injection surface
- **F-05 (Medium):** Added `revokeToken` override to `XsuaaProxyOAuthProvider` — uses correct XSUAA credentials
- **F-06 (Medium):** Added redirect URI policy, 100-client cap, and 24h TTL to DCR `InMemoryClientStore`
- **F-08 (Low):** Added `requiredClaims: ['exp']` and configurable `SAP_OIDC_CLOCK_TOLERANCE` for JWT validation
- **Config validation:** `ppStrict=true` without `ppEnabled=true` now fails at startup

**Files:**
- `src/adt/oauth.ts` — state, PKCE, loopback binding, HTML escaping, execFile
- `src/server/http.ts` — requiredClaims, clockTolerance
- `src/server/xsuaa.ts` — revokeToken, DCR validation
- `src/server/config.ts` — startup validation (OIDC audience, PP strict)
- `docs/security-guide.md` — NEW consolidated security guide for operators

---

### FEAT-01: Where-Used Analysis (Usage References)
| Field | Value |
|-------|-------|
| **Status** | Complete (2026-04-04, PR #38) |

**Implemented:** Scope-based where-used analysis in SAPNavigate. Uses ADT endpoint `/sap/bc/adt/repository/informationsystem/usageReferences`. Supports filtering by scope (local, package, system-wide).

**References:**
- [Report 001: Feature Parity](../reports/2026-03-24-001-feature-parity-implementation.md) — Item #1

---

### FEAT-04: DDIC Object Support (Domains, Data Elements, DDLX)
| Field | Value |
|-------|-------|
| **Status** | Complete (2026-04-01) |

**Implemented:** Read support for domains (DOMA), data elements (DTEL), structures (STRU), CDS metadata extensions (DDLX), and transactions (TRAN) in SAPRead. Structured metadata output with type info, labels, value tables, search help. Write support for DDLS, DDLX, BDEF, SRVD via SAPWrite (plus DOMA/DTEL metadata writes completed under FEAT-13).

---

### FEAT-35: Class Hierarchy (SAPNavigate)
| Field | Value |
|-------|-------|
| **Status** | Complete |
| **Source** | [ADT API Audit](research/complete/adt-api-audit-documentation-and-unused.md) |

**What:** Added `hierarchy` action to SAPNavigate. Returns superclass, implemented interfaces, and subclasses for a given ABAP class. Implemented via SQL queries against SEOMETAREL table (the ADT `/hierarchy` endpoint returned 404 on the test system). Includes SQL injection prevention via regex whitelist on class names.

---

### OPS-01: Structured JSON Logging
| Field | Value |
|-------|-------|
| **Status** | Complete — `src/server/logger.ts` + `src/server/audit.ts` with multi-sink output |

**Implemented:** Structured logger with text/JSON output, sensitive field redaction. Multi-sink audit system (stderr, file, BTP Audit Log Service). User identity from OIDC JWT in all log entries.

---

### OPS-04: GitHub Actions CI/CD Pipeline
| Field | Value |
|-------|-------|
| **Status** | Complete |

**Implemented:**
- `.github/workflows/test.yml` — lint + typecheck + unit tests (Node 22/24) on every push/PR, integration + E2E on `main` and internal PRs, plus reliability-summary aggregation
- `.github/workflows/docker.yml` — multi-platform Docker build (amd64/arm64) to GHCR on tags + manual dispatch
- `.github/workflows/release.yml` — npm publish with provenance on version tags

---

### CLEAN-01: Go Code Removal
| Field | Value |
|-------|-------|
| **Status** | Complete — all Go source removed (cmd/, internal/, pkg/, go.mod, go.sum, Makefile) |

---

### CLEAN-02: CLI Surface
| Field | Value |
|-------|-------|
| **Status** | Complete — minimal CLI: `arc1 search`, `arc1 source`, `arc1 lint`, `arc1 serve` |

---

### STRAT-01: TypeScript Migration
| Field | Value |
|-------|-------|
| **Status** | Complete (2026-03-26) |

**What was done:**
- Full Go -> TypeScript migration in a single session
- Custom ADT HTTP client (axios-based, CSRF lifecycle, cookie persistence, session isolation)
- 11 intent-based tools ported with identical behavior
- Safety system ported (read-only, package filter, operation filter, transport guard)
- HTTP Streamable transport with per-request server isolation (Copilot Studio compatible)
- API key + OIDC/JWT authentication (jose library)
- BTP Destination Service integration (VCAP_SERVICES parsing, destination lookup, connectivity proxy)
- `@abaplint/core` integration (replaces custom Go ABAP lexer with full abaplint rules)
- `better-sqlite3` + in-memory cache (replaces Go CGO/SQLite)
- 320 unit tests + 28 integration tests (vitest)
- CI/CD: lint + typecheck + tests (Node 22/24), integration + E2E reliability telemetry, Docker multi-arch, npm publish
- Go source code removed (47K lines deleted)

**Migration report:** See `reports/2026-03-26-001-typescript-migration-plan.md`

---

## Current State (v0.5.0 — TypeScript)

| Area | Status |
|------|--------|
| TypeScript Migration | Complete — Go code removed, pure TypeScript |
| Core MCP Server | 11 intent-based tools + hyperfocused mode (1 tool), HTTP Streamable + stdio |
| Safety System | Read-only, package filter (default: `$TMP`), operation filter, transport guard, dry-run |
| Input Validation | Zod v4 runtime validation for all MCP tool inputs (v0.5.0) |
| Phase 1: API Key Auth | `ARC1_API_KEY` Bearer token + multi-key profiles |
| Phase 2: OAuth/OIDC (Entra ID) | JWT validation via `jose` library, tested with Copilot Studio |
| Phase 4: BTP CF Deployment | Docker on CF with Destination Service + Cloud Connector |
| BTP Destination Service | Auto-resolves SAP credentials from BTP Destination at startup |
| BTP Connectivity Proxy | Routes through Cloud Connector with JWT Proxy-Authorization |
| BTP ABAP Environment | OAuth 2.0 browser login, direct connectivity |
| ABAP Linter | `@abaplint/core` with system-aware cloud/on-prem presets + pre-write validation |
| Docker Image | Multi-platform (amd64/arm64), GHCR `ghcr.io/marianfoo/arc-1` |
| CI/CD | GitHub Actions: lint + typecheck + unit tests (Node 22/24), integration + E2E on `main`/internal PRs, reliability summary job |
| XSUAA OAuth Proxy | MCP SDK ProxyOAuthServerProvider + @sap/xssec JWT validation |
| Authorization Model | Two-dimensional: scopes (read/write/admin) x roles (viewer/developer) x safety config |
| Audit Logging | User identity in tool call logs, BTP Audit Log sink, file sink |
| MCP Elicitation | Interactive parameter collection for destructive ops |
| Dynamic Client Registration | /register endpoint for MCP clients (RFC 7591) |
| Principal Propagation | Per-user ADT client via BTP Destination Service + Cloud Connector |
| OAuth Security | RFC 9700 compliance: state+PKCE, loopback binding, audience validation (v0.5.0) |
| Hyperfocused Mode | Single `SAP` tool (~200 tokens) — competitive parity with VSP |
| Method-Level Surgery | `edit_method` in SAPWrite, `list_methods`/`get_method` in SAPContext (95% token reduction) |
| Runtime Diagnostics | SAPDiagnose — short dumps (ST22), ABAP profiler traces |
| DDIC Completeness | Structures, domains, data elements, DDLX, transactions, BOR objects, T100 messages |
| RAP CRUD | DDLS, DDLX, BDEF, SRVD, SRVB write |
| Context Compression | SAPContext with AST-based dependency extraction (7-30x reduction) |
| Where-Used Analysis | Scope-based where-used in SAPNavigate (#38) |
| Class Hierarchy | SAPNavigate hierarchy action via SEOMETAREL SQL |
| Object Caching | SQLite + memory cache with on-demand + pre-warmer support (#31) |
| LLM Search UX | Auto-transliteration, field-name hints, cache indicators |
| HTTP Client | Native fetch + undici (replaced axios) (#35) |
| Test Coverage | 1,300+ unit + ~150 integration + ~60 E2E + 28 BTP integration + 5 BTP smoke tests (vitest); coverage telemetry is informational |
| Documentation | Architecture, auth guides, Docker guide, setup phases, security guide |

---

## Previously Completed (Summary)

| Phase | Description | Status |
|-------|-------------|--------|
| Go v1.x-v2.32 | ADT client, 40+ tools, CRUD, debugging, WebSocket, Lua scripting | Complete (Go) |
| Enterprise Rename | vsp -> ARC-1, 11 intent-based tools | Complete |
| Auth Phase 1: API Key | `ARC1_API_KEY` Bearer token | Complete |
| Auth Phase 2: OAuth/OIDC | Entra ID JWT validation via `jose` library | Complete |
| Auth Phase 4: BTP CF | Docker on CF with Destination Service + Cloud Connector | Complete |
| TypeScript Migration | Full Go -> TypeScript port, Go code removed | Complete (2026-03-26) |
| CI/CD Pipeline | GitHub Actions: lint, typecheck, tests (Node 22/24), integration + E2E on main/internal PRs, Docker, npm publish | Complete |
| Copilot Studio E2E | OAuth + MCP + BTP Destination + Cloud Connector -> SAP data | Complete |
| XSUAA OAuth Proxy | SEC-07: MCP SDK auth + @sap/xssec, Express 5, 3 auth modes coexist | Complete (2026-03-27) |
| Scope Enforcement | SEC-06: Per-tool scope checks, ListTools filtering, 12 tests | Complete (2026-03-27) |
| Audit Logging | SEC-04: Multi-sink audit (stderr, file, BTP Audit Log Service) | Complete (2026-04-01) |
| Dynamic Client Registration | RFC 7591 /register endpoint for MCP clients | Complete (2026-03-27) |
| Principal Propagation | SEC-01+SEC-02: Per-user ADT client via BTP Dest Service + Cloud Connector | Code complete (2026-03-27) |
| Hyperfocused Mode | Single `SAP` tool (~200 tokens) — competitive parity with VSP | Complete (2026-04-01) |
| Method-Level Surgery | `edit_method`, `list_methods`, `get_method` — 95% token reduction | Complete (2026-04-01) |
| Runtime Diagnostics | SAPDiagnose — short dumps (ST22), ABAP profiler traces | Complete (2026-04-01) |
| DDIC Completeness | FEAT-04: DOMA, DTEL, STRU, DDLX, TRAN, BOR, T100, variants | Complete (2026-04-01) |
| DDIC Domain/Data Element Write | FEAT-13: DOMA/DTEL create, update, delete, batch_create in SAPWrite | Complete (2026-04-12) |
| RAP CRUD | DDLS/DDLX/BDEF/SRVD/SRVB write, batch activation | Complete (2026-04-14) |
| Context Compression | SAPContext with AST-based dependency extraction (7-30x reduction) | Complete (2026-04-01) |
| MCP Elicitation | Interactive confirmations for destructive operations | Complete (2026-04-01) |
| BTP ABAP Environment | OAuth 2.0 browser login, direct BTP connectivity | Complete (2026-04-01) |
| Where-Used Analysis | FEAT-01: Scope-based where-used in SAPNavigate | Complete (2026-04-04, PR #38) |
| Enhanced Abaplint | System-aware cloud/on-prem presets, pre-write validation, auto-fix | Complete (2026-04-04, PR #37) |
| Object Caching | SQLite + memory cache with on-demand + pre-warmer support | Complete (2026-04-04, PR #31) |
| HTTP Client Migration | Replaced axios with native fetch + undici | Complete (2026-04-04, PR #35) |
| Two-Dimensional Auth | Scopes x roles x safety config, SEC-06 expanded | Complete (2026-04-07, PR #48) |
| Zod v4 Validation | Runtime input validation for all MCP tool inputs | Complete (2026-04-08, PR #52) |
| OAuth Security (RFC 9700) | SEC-08: state+PKCE, loopback binding, audience validation | Complete (2026-04-08, PR #51) |
| AFF Structured Class Read | `SAPRead(format="structured")` — JSON with metadata + decomposed includes | Complete (2026-04-08) |
| AFF Batch Object Creation | `SAPWrite(action="batch_create")` — multi-object create+activate in one call | Complete (2026-04-08) |
| AFF Schema Validation | Bundled AFF JSON schemas, pre-create metadata validation | Complete (2026-04-08) |

---

## Competitive Landscape

> **Detailed tracking**: See [`compare/`](../compare/) for per-commit and per-issue evaluations of key competitors.

| Competitor | Language | Tools | Auth | Safety | Deployment | Key Advantage |
|-----------|---------|-------|------|--------|------------|---------------|
| **ARC-1** | TypeScript | 11 intent-based + hyperfocused | API Key, OIDC, XSUAA, PP | Read-only, pkg filter, op filter, 2D auth (scopes+roles+safety) | Docker, BTP CF, npm | Per-user PP, scope-based tools, 3 auth modes, safety, 1,500+ tests across unit/integration/E2E |
| **vibing-steampunk** | Go 1.24 | 1-99+ (3 modes) | Basic, Cookie | Op filter, pkg filter, transport guard | Go binary (9 platforms) | 242 stars, **Streamable HTTP (v2.38.0)**, native parser, massive feature sprint (i18n, gCTS, API release state, version history, code coverage) |
| **fr0ster/mcp-abap-adt** | TypeScript | 287 (4 tiers) | 9 providers (incl. TLS, SAML, Device Flow) | Exposition tiers | npm `@mcp-abap-adt/core` | Most tools, most auth options, embeddable, RFC, multi-system |
| SAP ABAP Add-on MCP | ABAP | ~10 | SAP native | SAP authorization | Runs inside SAP | No proxy needed, SAP-native auth |
| lemaiwo/btp-sap-odata-to-mcp-server | TypeScript | ~10 | XSUAA OAuth proxy | XSUAA roles | BTP CF (MTA) | XSUAA OAuth proxy, principal propagation |
| dassian-adt / abap-mcpb | JavaScript | 25+ | Basic, Browser login | MCP elicitation | Node.js / MCPB | Error intelligence, batch activation, find_definition, edit_method (Apr sprint) |
| AWS ABAP Accelerator | Python | ~15 | OAuth, X.509 | Basic | AWS Lambda | Cloud readiness assessment, migration |

**ARC-1 differentiators (no other project has all of these):**
1. **Intent-based routing** — 11 tools vs 25-287, simplest LLM decision surface
2. **Principal propagation** — per-user SAP authentication via BTP Destination Service + Cloud Connector
3. **Two-dimensional authorization** — scopes (read/write/admin) x roles x safety config, with per-tool filtering
4. **Three auth modes coexist** — XSUAA OAuth + Entra ID OIDC + API key on the same endpoint
5. **Comprehensive safety system** — read-only, package filter, operation filter, transport guard, dry-run — additive to scopes
6. **Multi-sink audit logging** — stderr + file + BTP Audit Log Service
7. **Context compression + method-level surgery** — AST-based 7-30x + 95% method-level reduction
8. **MCP elicitation** — interactive confirmations for destructive operations
9. **1,500+ automated tests** with CI on Node 22/24, integration/E2E reliability telemetry, and BTP smoke lane
10. **npm + Docker + release-please** — most professional distribution pipeline
11. **RFC 9700 OAuth security** — state + PKCE, loopback binding, audience validation

**Key competitive threats** (tracked in [`compare/`](../compare/)):
1. **vibing-steampunk** (242 stars) — community favorite. **Major threat escalation (Apr 2026)**: massive sprint added Streamable HTTP, API release state, i18n (7 tools), gCTS (10 tools), version history, code coverage, dead code analysis, rename preview, health analysis, CDS impact. Still lacks enterprise auth/safety but rapidly closing feature gaps. ~40 commits in 6 days.
2. **fr0ster** (v4.8.7, 85+ releases in 5 months) — closest enterprise competitor. 9 auth providers, TLS, RFC, embeddable. Search TSV format optimization. Watch for convergence on enterprise features.
3. **dassian-adt** — newly active (Apr 2026): batch activation, find_definition, edit_method, BDEF creation. No safety system is a concern but rapid iteration.
4. **btp-odata-mcp** (119 stars) — different category (OData) but high adoption. Could expand into ADT territory.

---

## Key References

### Internal Reports
- [Enterprise Copilot Studio Plan](../reports/2026-03-23-001-enterprise-copilot-studio-plan.md)
- [Feature Parity Analysis](../reports/2026-03-24-001-feature-parity-implementation.md)
- [Enterprise Bridge Gap Analysis](../reports/2026-03-24-002-enterprise-bridge-gap-analysis.md)
- [Enterprise Auth Research](../reports/2026-03-25-001-enterprise-auth-research.md)
- [Centralized Auth Architecture](../reports/2026-03-25-003-centralized-mcp-auth-architecture.md)
- [BTP Deployment Report](../reports/2026-03-25-001-btp-copilot-studio-deployment.md)

### External References & Implementations
- [lemaiwo/btp-sap-odata-to-mcp-server](https://github.com/lemaiwo/btp-sap-odata-to-mcp-server) — TypeScript MCP server with XSUAA OAuth proxy, BTP Destination Service, principal propagation
- [MCP Specification — Authorization](https://modelcontextprotocol.io/specification/2025-03-26/basic/authorization)
- [RFC 9728 — OAuth Protected Resource Metadata](https://datatracker.ietf.org/doc/html/rfc9728)
- [OWASP Secure MCP Server Development Guide](https://genai.owasp.org/resource/a-practical-guide-for-secure-mcp-server-development/)
- [SAP Help: Principal Propagation](https://help.sap.com/docs/connectivity/sap-btp-connectivity-cf/configuring-principal-propagation)
- [SAP Help: S_DEVELOP Authorization Object](https://help.sap.com/docs/SAP_Solution_Manager/fd3c83ed48684640a18ac05c8ae4d016/4fa00d670cff44a5958237334a88af84.html)
- [Microsoft: Copilot Studio Custom Connectors](https://learn.microsoft.com/en-us/microsoft-copilot-studio/advanced-connectors)

---

*This roadmap is a living document. Priorities may shift based on community feedback and enterprise requirements.*
