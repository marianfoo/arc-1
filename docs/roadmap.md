# ARC-1 Roadmap

**Last Updated:** 2026-04-08
**Project:** ARC-1 (ABAP Relay Connector) — MCP Server for SAP ABAP Systems
**Repository:** https://github.com/marianfoo/arc-1

---

## Vision

Every other SAP MCP server today runs on the developer's local machine — unmanaged, unaudited, with whatever permissions the developer happens to have. There is no admin oversight, no token budget control, no audit trail, and no way to restrict what an LLM can do to an SAP system.

**ARC-1 is different.** It is a **centralized, admin-controlled MCP gateway** deployed on BTP Cloud Foundry or a company server (Docker). One instance per SAP system, serving multiple users. The admin controls which tools are exposed, which packages can be touched, and whether writes are allowed — before any LLM request reaches SAP.

### Core Design Principles

1. **Centralized admin control** — ARC-1 runs as a managed service, not on developer laptops. Admins configure safety gates (read-only, package allowlists, operation filters, SQL blocking, transport guards) per instance. Every tool call is audited with user identity. Developers and LLMs operate within guardrails set by the organization — not by individual choice.

2. **Per-user SAP identity** — Principal propagation maps each MCP user to their own SAP user via BTP Destination Service + Cloud Connector. SAP's native authorization (S_DEVELOP, package checks) applies per user. No shared service accounts, no credential leakage. The LLM acts with exactly the permissions the SAP user has — nothing more.

3. **Token-efficient tool design** — 11 intent-based tools (~5K schema tokens) instead of 200+ individual endpoints. This isn't just cleaner — it's the difference between working and not working on mid-tier LLMs (GPT-4o-mini, Gemini Flash, Copilot Studio). Hyperfocused mode reduces to 1 tool (~200 tokens). Method-level surgery and context compression (7-30x) keep responses within tight context windows.

4. **BTP-native deployment** — Designed for SAP BTP Cloud Foundry with Destination Service, Cloud Connector, XSUAA OAuth, and BTP Audit Log Service. Also deployable as Docker on any server. Local stdio mode is supported for development and testing, but the production target is always a centralized instance.

5. **Multi-client, vendor-neutral** — Works with any MCP-compatible client: Claude Code/Desktop, Microsoft Copilot Studio, VS Code (GitHub Copilot), Gemini CLI, Cursor, and others. The same ARC-1 instance serves all of them. Three auth modes coexist (XSUAA + OIDC/Entra ID + API key) so different client types connect through the same gateway.

6. **Safe defaults, opt-in power** — Read-only by default. Free SQL blocked by default. No write operations until the admin explicitly enables them. This inverts the model of every other MCP server where everything is allowed until someone thinks to restrict it.

---

## Current State (v0.5.0 — TypeScript)

| Area | Status |
|------|--------|
| TypeScript Migration | ✅ Complete — Go code removed, pure TypeScript |
| Core MCP Server | ✅ 11 intent-based tools + hyperfocused mode (1 tool), HTTP Streamable + stdio |
| Safety System | ✅ Read-only, package filter, operation filter, transport guard, dry-run |
| Input Validation | ✅ Zod v4 runtime validation for all MCP tool inputs (v0.5.0) |
| Phase 1: API Key Auth | ✅ `ARC1_API_KEY` Bearer token + multi-key profiles |
| Phase 2: OAuth/OIDC (Entra ID) | ✅ JWT validation via `jose` library, tested with Copilot Studio |
| Phase 4: BTP CF Deployment | ✅ Docker on CF with Destination Service + Cloud Connector |
| BTP Destination Service | ✅ Auto-resolves SAP credentials from BTP Destination at startup |
| BTP Connectivity Proxy | ✅ Routes through Cloud Connector with JWT Proxy-Authorization |
| BTP ABAP Environment | ✅ OAuth 2.0 browser login, direct connectivity |
| ABAP Linter | ✅ `@abaplint/core` with system-aware cloud/on-prem presets + pre-write validation |
| Docker Image | ✅ Multi-platform (amd64/arm64), GHCR `ghcr.io/marianfoo/arc-1` |
| CI/CD | ✅ GitHub Actions: lint + typecheck + unit tests (Node 20/22) + integration tests |
| XSUAA OAuth Proxy | ✅ MCP SDK ProxyOAuthServerProvider + @sap/xssec JWT validation |
| Authorization Model | ✅ Two-dimensional: scopes (read/write/admin) × roles (viewer/developer) × safety config |
| Audit Logging | ✅ User identity in tool call logs, BTP Audit Log sink, file sink |
| MCP Elicitation | ✅ Interactive parameter collection for destructive ops |
| Dynamic Client Registration | ✅ /register endpoint for MCP clients (RFC 7591) |
| Principal Propagation | ✅ Per-user ADT client via BTP Destination Service + Cloud Connector |
| OAuth Security | ✅ RFC 9700 compliance: state+PKCE, loopback binding, audience validation (v0.5.0) |
| Hyperfocused Mode | ✅ Single `SAP` tool (~200 tokens) — competitive parity with VSP |
| Method-Level Surgery | ✅ `edit_method` in SAPWrite, `list_methods`/`get_method` in SAPContext (95% token reduction) |
| Runtime Diagnostics | ✅ SAPDiagnose — short dumps (ST22), ABAP profiler traces |
| DDIC Completeness | ✅ Structures, domains, data elements, DDLX, transactions, BOR objects, T100 messages |
| RAP CRUD | ✅ DDLS, DDLX, BDEF, SRVD write + SRVB read |
| Context Compression | ✅ SAPContext with AST-based dependency extraction (7-30x reduction) |
| Where-Used Analysis | ✅ Scope-based where-used in SAPNavigate (#38) |
| Object Caching | ✅ SQLite + memory cache with on-demand + pre-warmer support (#31) |
| HTTP Client | ✅ Native fetch + undici (replaced axios) (#35) |
| Test Coverage | ✅ 1,104 unit tests + 28 BTP integration tests (vitest) |
| Documentation | ✅ Architecture, auth guides, Docker guide, setup phases, security guide |

---

## Roadmap Items

### Priority Legend

| Priority | Meaning |
|----------|---------|
| 🔴 P0 | Critical — blocks enterprise adoption |
| 🟠 P1 | High — significant value, should do next |
| 🟡 P2 | Medium — nice to have, plan for later |
| 🟢 P3 | Low — future consideration |

### Effort Legend

| Effort | Meaning |
|--------|---------|
| XS | < 1 day |
| S | 1–2 days |
| M | 3–5 days |
| L | 1–2 weeks |
| XL | 2–4 weeks |

---

## 🔐 Security & Authentication

### SEC-01: Principal Propagation — Per-User SAP Authentication
| Field | Value |
|-------|-------|
| **Priority** | 🔴 P0 |
| **Effort** | L (1–2 weeks: code wiring + SAP admin setup + testing) |
| **Risk** | Medium — requires SAP Basis admin (STRUST, CERTRULE, ICM profile) |
| **Usefulness** | Critical — enables per-user SAP authorization and audit trail |
| **Status** | ✅ Code complete (2026-03-27) — needs SAP-side setup (STRUST, CERTRULE, ICM) for end-to-end testing |

**Implemented (2026-03-27) — BTP Cloud Connector approach (SEC-02 merged into SEC-01):**
- `lookupDestinationWithUserToken()` in `src/adt/btp.ts` — calls Destination Service "Find Destination" API with `X-User-Token` header
- Per-request ADT client creation in `src/server/server.ts` — `createPerUserClient()` creates a fresh ADT client for each authenticated user
- `SAP-Connectivity-Authentication` header injection in `src/adt/http.ts` — carries SAML assertion to Cloud Connector
- `SAP_PP_ENABLED=true` config flag — opt-in for principal propagation
- Graceful fallback — if per-user lookup fails, falls back to shared service account
- No basic auth when PP active — username/password cleared, user identity from SAML assertion only
- 7 unit tests (5 BTP PP destination + 2 HTTP header injection)

**Architecture flow:**
1. User authenticates via XSUAA/OIDC → JWT token
2. MCP SDK passes `authInfo.token` to tool handler
3. ARC-1 calls Destination Service with `X-User-Token: <jwt>` header
4. Destination Service generates per-user auth tokens (SAML assertion)
5. ADT client sends `SAP-Connectivity-Authentication` header via connectivity proxy
6. Cloud Connector generates X.509 cert → CERTRULE → SAP user
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
| **Priority** | 🟠 P1 |
| **Effort** | — |
| **Risk** | — |
| **Usefulness** | High — enables per-user auth when ARC-1 runs on BTP CF |
| **Status** | ✅ Merged into SEC-01 (2026-03-27) — code complete, SAP-side setup pending |

**Merged:** SEC-02 was implemented as part of SEC-01. The BTP Cloud Connector approach was chosen over direct X.509 cert generation because it leverages existing BTP infrastructure and requires less code in ARC-1. See SEC-01 for implementation details.

---

### SEC-03: SAP Authorization Object Awareness (S_DEVELOP)
| Field | Value |
|-------|-------|
| **Priority** | — |
| **Effort** | — |
| **Risk** | — |
| **Usefulness** | — |
| **Status** | ✅ Subsumed by FEAT-16 (Error Intelligence) |

**Merged:** SEC-03's scope (parsing 403 authorization errors, mapping to S_DEVELOP objects, suggesting SU53/PFCG) is now part of FEAT-16 Error Intelligence, which covers all SAP error codes (403, 409, 423, 415) with actionable hints. See FEAT-16 for details.

---

### SEC-04: Audit Logging
| Field | Value |
|-------|-------|
| **Priority** | 🟠 P1 |
| **Effort** | M (3–5 days) |
| **Risk** | Low |
| **Usefulness** | High — required for enterprise compliance |
| **Status** | ✅ Complete (2026-04-01) — multi-sink audit system with BTP Audit Log Service |

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

### SEC-05: Rate Limiting
| Field | Value |
|-------|-------|
| **Priority** | 🟡 P2 |
| **Effort** | S (1–2 days) |
| **Risk** | Low |
| **Usefulness** | Medium — prevents runaway AI loops from overwhelming SAP |
| **Status** | Not started |

**What:** Token bucket rate limiter per MCP session, configurable via env var. Prevents an AI agent in a retry loop from generating thousands of SAP API calls per minute.

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

### SEC-06: MCP Client Tool Restriction by User Role
| Field | Value |
|-------|-------|
| **Priority** | 🟡 P2 |
| **Effort** | M (3–5 days) |
| **Risk** | Medium — needs careful design |
| **Usefulness** | High — differentiates AI usage from Eclipse/ADT usage |
| **Status** | ✅ Complete via scope enforcement (2026-03-27) |

**Implemented (2026-03-27):**
- `TOOL_SCOPES` map in `src/handlers/intent.ts` — each tool requires a scope (read/write/admin)
- Scope enforcement in `handleToolCall()` — checks `authInfo.scopes` before executing any tool
- `ListTools` filtering in `src/server/server.ts` — users only see tools they have scopes for
- XSUAA role collections (ARC-1 Viewer/Editor/Admin) map to scopes via `xs-security.json`
- Additive to safety system — both scope check AND safety check must pass
- Backward compatible — no authInfo (stdio, simple API key) = no scope enforcement
- 12 unit tests covering all scope enforcement scenarios

**How it works:**
- `read` scope → SAPRead, SAPSearch, SAPQuery, SAPNavigate, SAPContext, SAPLint, SAPDiagnose (7 tools)
- `write` scope → adds SAPWrite, SAPActivate, SAPManage (10 tools)
- `admin` scope → adds SAPTransport (11 tools)
- XSUAA role collections assign scopes to users via BTP cockpit

**Why this matters for basis admins:**
- An SAP developer user (with full S_DEVELOP in Eclipse) can be restricted to read-only via AI
- The admin controls AI capabilities separately from SAP authorization
- **This is unique to ARC-1** — no other MCP server offers scope-based tool filtering

---

### SEC-07: XSUAA OAuth Proxy for MCP-Native Clients (Claude, Cursor, MCP Inspector)
| Field | Value |
|-------|-------|
| **Priority** | 🟠 P1 |
| **Effort** | L (1–2 weeks) |
| **Risk** | Medium — requires careful OAuth flow implementation |
| **Usefulness** | Very High — enables Claude Desktop, Cursor, MCP Inspector to connect via BTP XSUAA |
| **Status** | ✅ Complete (2026-03-27) |

**Implemented:**
- MCP SDK's `ProxyOAuthServerProvider` proxies OAuth flow to XSUAA
- `@sap/xssec` v4.13+ for SAP-specific JWT validation (offline, JWKS cached)
- HTTP server refactored from `node:http` to Express 5 (required by MCP SDK auth)
- RFC 8414 discovery at `/.well-known/oauth-authorization-server`
- In-memory client store for dynamic client registration (RFC 7591)
- Chained token verifier: XSUAA → Entra ID OIDC → API key (all coexist)
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
| **Priority** | 🔴 P0 |
| **Effort** | M (3–5 days) |
| **Risk** | Low — security improvements only, no breaking changes |
| **Usefulness** | Critical — closes RFC 9700 compliance gaps in OAuth flows |
| **Status** | ✅ Complete (2026-04-08) |

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

## 🔧 Features & Tools

### FEAT-01: Where-Used Analysis (Usage References)
| Field | Value |
|-------|-------|
| **Priority** | — |
| **Effort** | — |
| **Risk** | — |
| **Usefulness** | — |
| **Status** | ✅ Complete (2026-04-04, PR #38) |

**Implemented:** Scope-based where-used analysis in SAPNavigate. Uses ADT endpoint `/sap/bc/adt/repository/informationsystem/usageReferences`. Supports filtering by scope (local, package, system-wide).

**References:**
- [Report 001: Feature Parity](../reports/2026-03-24-001-feature-parity-implementation.md) — Item #1

---

### FEAT-02: API Release Status Tool (Clean Core)
| Field | Value |
|-------|-------|
| **Priority** | 🔴 P0 |
| **Effort** | S (1–2 days) |
| **Risk** | Low |
| **Usefulness** | Very High — critical for S/4HANA Cloud and clean core compliance |
| **Status** | Not started |
| **Source** | [VSP eval](../compare/vibing-steampunk/evaluations/7270ad7-api-release-state.md) |

**What:** Check whether an SAP object (class, function module, table, CDS view) is released, deprecated, or internal. Returns the API release state (C1 Released, C2 Deprecated, Not Released) and the recommended successor.

**Why:** Every S/4HANA Cloud / BTP ABAP customer needs to check if their code uses only released APIs. This is a "must have" for any AI copilot helping with ABAP Cloud development.

**Competitive urgency (2026-04-08):** VSP added `GetAPIReleaseState` (commit 7270ad7, Apr 5). ARC-1 is now the only major project without this. **Upgraded from P1 to P0.**

---

### FEAT-03: Enhancement Framework (BAdI/Enhancement Spot)
| Field | Value |
|-------|-------|
| **Priority** | 🟡 P2 |
| **Effort** | M (3–5 days) |
| **Risk** | Low |
| **Usefulness** | Medium — important for customization scenarios |
| **Status** | Not started |

**What:** Read enhancement spots, BAdI definitions, and enhancement implementations. Uses ADT endpoints `/sap/bc/adt/enhancements/*`.

---

### FEAT-04: DDIC Object Support (Domains, Data Elements, DDLX)
| Field | Value |
|-------|-------|
| **Priority** | — |
| **Effort** | — |
| **Risk** | — |
| **Usefulness** | — |
| **Status** | ✅ Complete (2026-04-01) |

**Implemented:** Read support for domains (DOMA), data elements (DTEL), structures (STRU), CDS metadata extensions (DDLX), and transactions (TRAN) in SAPRead. Structured metadata output with type info, labels, value tables, search help. Write support for DDLS, DDLX, BDEF, SRVD via SAPWrite.

---

### FEAT-05: Code Refactoring (Rename, Extract Method)
| Field | Value |
|-------|-------|
| **Priority** | 🟢 P3 |
| **Effort** | L (1–2 weeks) |
| **Risk** | Medium — complex ADT API interactions |
| **Usefulness** | Medium — valuable but complex |
| **Status** | Not started |

**What:** ADT supports code refactoring operations (rename symbol, extract method, change package). The marcellourbani/abap-adt-api TypeScript library implements these.

**Competitive update (2026-04-08):** VSP added rename preview analysis (commit dcaa358, Apr 6). Shows what would change without performing the rename. abap-adt-api has full rename (3 methods).

---

### FEAT-06: Cloud Readiness Assessment
| Field | Value |
|-------|-------|
| **Priority** | 🟡 P2 |
| **Effort** | M (3–5 days) |
| **Risk** | Low |
| **Usefulness** | High — unique differentiator for S/4HANA migration |
| **Status** | Not started |

**What:** Run ATC checks with ABAP Cloud check variant to assess whether code is cloud-ready. Combined with the enhanced abaplint integration (system-aware cloud/on-prem presets, pre-write validation, auto-fix), provide a comprehensive clean core compliance report.

**Why:** AWS ABAP Accelerator has this as a key feature. ARC-1 combines ATC cloud checks with `@abaplint/core` for offline linting.

**Current state (partially implemented):**
- ✅ System-aware abaplint presets (BTP cloud vs on-prem) with auto-detection from SAP_BASIS release
- ✅ Pre-write lint validation blocks cloud_types/strict_sql/obsolete_statement violations on BTP
- ✅ Auto-fix via `lint_and_fix` action (keyword_case, obsolete_statement, etc.)
- ✅ Custom rule overrides via `--abaplint-config` or per-call `rules` parameter
- ⬜ ATC Cloud check variant integration (server-side, complements offline abaplint)
- ⬜ Combined cloud readiness report (ATC + abaplint findings merged)
- ⬜ API release state check (see FEAT-02, **now P0** — VSP has this since Apr 5)

---

### FEAT-07: TLS/HTTPS for HTTP Streamable Transport
| Field | Value |
|-------|-------|
| **Priority** | 🔴 P0 |
| **Effort** | S (1–2 days) |
| **Risk** | Low |
| **Usefulness** | High — required for production enterprise deployments without reverse proxy |
| **Status** | Not started |
| **Source** | [fr0ster tracker: TLS evaluation](../compare/fr0ster/evaluations/tls-https-support.md) |

**What:** Add native TLS support to the HTTP Streamable transport. fr0ster added this in v4.6.0 with `--tls-cert`/`--tls-key` flags. Currently ARC-1 requires a reverse proxy (nginx, CF router) for HTTPS.

**Why:** Enterprise customers deploying outside BTP CF (e.g., on VMs, Kubernetes) need HTTPS without an external proxy. fr0ster's implementation shows the pattern: load cert/key files, create `https.Server` instead of `http.Server`.

**Implementation:**
- Add `SAP_TLS_CERT` / `SAP_TLS_KEY` env vars (and `--tls-cert` / `--tls-key` CLI flags)
- In `src/server/http.ts`, conditionally create `https.createServer()` when cert/key are provided
- Auto-detect port 443 vs 8080 based on TLS mode

---

### FEAT-08: Content-Type 415/406 Auto-Retry
| Field | Value |
|-------|-------|
| **Priority** | 🔴 P0 |
| **Effort** | XS (< 1 day) |
| **Risk** | Low |
| **Usefulness** | High — robustness fix for SAP system variations |
| **Status** | Not started |
| **Source** | [fr0ster tracker: 415 evaluation](../compare/fr0ster/evaluations/415-content-type-retry.md), [VSP tracker: issue #9](../compare/vibing-steampunk/evaluations/issue-9-transport-accept-header.md) |

**What:** SAP systems vary in Accept/Content-Type expectations across versions and endpoint types. When a request gets 415 (Unsupported Media Type) or 406 (Not Acceptable), automatically retry with alternative Content-Type headers.

**Why:** Both fr0ster (issue #22/#23) and VSP (issue #9) hit this on transport endpoints. It's a common SAP ADT compatibility issue across system versions. A transparent retry in `src/adt/http.ts` would handle it for all endpoints.

**Implementation:**
- In `src/adt/http.ts`, intercept 415/406 responses
- Retry with `Accept: application/xml` → `Accept: */*` (or vice versa)
- Retry with `Content-Type: application/xml` → `text/plain` for transport endpoints
- Max 1 retry, log the fallback

---

### FEAT-09: SQL Trace Monitoring
| Field | Value |
|-------|-------|
| **Priority** | 🟡 P2 |
| **Effort** | S (1–2 days) |
| **Risk** | Low |
| **Usefulness** | Medium — performance diagnostics |
| **Status** | Not started |
| **Source** | [Feature matrix #17](../compare/00-feature-matrix.md) |

**What:** Read SQL trace state, list SQL traces, analyze trace results. Uses ADT endpoints `/sap/bc/adt/runtime/traces/sql/*`. VSP has `GetSQLTraceState`, `ListSQLTraces`.

**Why:** Completes the diagnostics story alongside short dumps and profiler traces. Useful for AI-assisted performance analysis.

---

### FEAT-10: PrettyPrint (Code Formatting)
| Field | Value |
|-------|-------|
| **Priority** | 🟡 P2 |
| **Effort** | XS (< 1 day) |
| **Risk** | Low |
| **Usefulness** | Medium — code formatting via ADT API |
| **Status** | Not started |
| **Source** | [Feature matrix #14](../compare/00-feature-matrix.md) |

**What:** Format ABAP source code via ADT's PrettyPrint API. VSP and mcp-abap-abap-adt-api have this. Also includes get/set PrettyPrinter settings.

---

### FEAT-11: Inactive Objects List
| Field | Value |
|-------|-------|
| **Priority** | 🟡 P2 |
| **Effort** | XS (< 1 day) |
| **Risk** | Low |
| **Usefulness** | Medium — development workflow improvement |
| **Status** | Not started |
| **Source** | [Feature matrix #19](../compare/00-feature-matrix.md) |

**What:** List inactive objects system-wide. VSP and fr0ster both have this. Uses `/sap/bc/adt/activation/inactive`.

---

### FEAT-12: Fix Proposals / Auto-Fix from ATC
| Field | Value |
|-------|-------|
| **Priority** | 🟠 P1 |
| **Effort** | S (1–2 days) |
| **Risk** | Low |
| **Usefulness** | High — safer than LLM-guessed fixes |
| **Status** | Not started |
| **Source** | [abap-adt-api eval](../compare/abap-adt-api/evaluations/issue-37-quickfix.md) |

**What:** When ATC or syntax check finds an issue, SAP's fix proposal API (`/sap/bc/adt/quickfixes`) suggests the exact correction. Expose this via SAPDiagnose or SAPWrite so the LLM can apply verified fixes instead of guessing.

**Why:** Far safer than having the LLM guess the fix. Directly supports **safe defaults** and **token efficiency** — the LLM gets the exact fix without trial-and-error. The `abap-adt-api` library implements `fixProposals` and `fixEdits`.

---

### FEAT-13: DDIC Domain/Data Element Write
| Field | Value |
|-------|-------|
| **Priority** | 🟠 P1 |
| **Effort** | S (1–2 days) |
| **Risk** | Low |
| **Usefulness** | High — completes AI-assisted data modeling |
| **Status** | Not started |
| **Source** | [abap-adt-api eval](../compare/abap-adt-api/evaluations/646bb9b-dtel-doma-write.md) |

**What:** ARC-1 reads DOMA/DTEL but can't write properties or fixed values. The `abap-adt-api` library (v7.1.1) added `createDomainDefinition`, `createDataElement`, and `createStructure` with full property support. Add write support for these in SAPWrite.

**Why:** Blocks full AI-assisted data modeling workflows. A developer asking the LLM to "create a domain ZSTATUS with values A=Active, I=Inactive" currently can't be fulfilled end-to-end.

---

### FEAT-14: 401 Session Timeout Auto-Retry
| Field | Value |
|-------|-------|
| **Priority** | 🔴 P0 |
| **Effort** | XS (< 1 day) |
| **Risk** | Low |
| **Usefulness** | High — prevents mid-conversation failures |
| **Status** | Not started |
| **Source** | [VSP eval](../compare/vibing-steampunk/evaluations/d73460a-401-auto-retry.md) |

**What:** After idle, SAP returns 401. ARC-1 handles CSRF 403 refresh but may not handle 401 session timeout. Add silent re-authentication and retry on 401 in `src/adt/http.ts`.

**Why:** Mid-conversation failures are disruptive to LLM workflows. VSP (#32) and `abap-adt-api` both handle this. A centralized gateway that stays idle between user requests will hit this frequently.

---

### FEAT-15: Namespace URL Encoding Audit
| Field | Value |
|-------|-------|
| **Priority** | 🟠 P1 |
| **Effort** | XS (< 1 day) |
| **Risk** | Low |
| **Usefulness** | High — prevents hard-to-debug failures |
| **Status** | Not started |
| **Source** | [VSP eval](../compare/vibing-steampunk/evaluations/59b4b90-namespace-url-encoding.md), [VSP eval](../compare/vibing-steampunk/evaluations/6d1f00a-namespace-syntax-check.md) |

**What:** Namespaced objects (`/NAMESPACE/CLASS`) fail if `/` is not correctly encoded in ADT URLs. VSP hit this in issues #18, #52. Audit all `encodeURIComponent` usage in `src/adt/client.ts` and `src/adt/http.ts`.

---

### FEAT-16: Error Intelligence (Actionable Hints)
| Field | Value |
|-------|-------|
| **Priority** | 🟠 P1 |
| **Effort** | S (1–2 days) |
| **Risk** | Low |
| **Usefulness** | High — directly improves admin control and LLM UX |
| **Status** | Not started |
| **Source** | Dassian pattern, Roadmap SEC-03 |

**What:** When SAP returns common errors (409 locked, 423 enqueued, 403 auth, 415 content type), return actionable hints: "Object locked by user X — check SM12", "Authorization failed — check SU53/PFCG", "Transport required — check SE09". Subsumes SEC-03 (S_DEVELOP awareness).

**Why:** Supports **centralized admin control** — admins and LLMs get clear guidance instead of raw SAP error HTML. Dassian does this well with its error intelligence pattern.

---

### FEAT-17: Type Auto-Mappings for SAPWrite
| Field | Value |
|-------|-------|
| **Priority** | 🟠 P1 |
| **Effort** | XS (< 1 day) |
| **Risk** | Low |
| **Usefulness** | Medium — reduces LLM confusion |
| **Status** | Not started |
| **Source** | Dassian pattern |

**What:** Auto-map friendly type codes to ADT internal codes: `CLAS` → `CLAS/OC`, `INTF` → `INTF/OI`, `PROG` → `PROG/P`, etc. LLMs shouldn't need to know ADT's internal type code suffixes.

**Why:** Supports **token efficiency** — reduces failed create attempts where the LLM guesses the wrong type code.

---

### FEAT-18: Function Group Bulk Fetch
| Field | Value |
|-------|-------|
| **Priority** | 🟠 P1 |
| **Effort** | S (1–2 days) |
| **Risk** | Low |
| **Usefulness** | High — significant token/round-trip savings |
| **Status** | Not started |
| **Source** | Dassian pattern |

**What:** Fetch ALL includes and function modules of a function group in one call, instead of N sequential requests. Returns combined source with clear delimiters.

**Why:** Supports **token efficiency** — a function group with 20 FMs currently requires 20+ round trips. One bulk call reduces latency and simplifies the LLM's context.

---

### FEAT-19: Transport Contents (E071 List)
| Field | Value |
|-------|-------|
| **Priority** | 🟡 P2 |
| **Effort** | XS (< 1 day) |
| **Risk** | Low |
| **Usefulness** | Medium — show objects inside a transport request |
| **Status** | Not started |
| **Source** | Dassian pattern, abap-adt-api |

**What:** List the objects (E071 entries) contained in a transport request. Both dassian and abap-adt-api support this. Useful for reviewing what an LLM has changed before release.

---

### FEAT-20: Source Version / Revision History
| Field | Value |
|-------|-------|
| **Priority** | 🟡 P2 |
| **Effort** | S (1–2 days) |
| **Risk** | Low |
| **Usefulness** | Medium — version comparison, rollback context |
| **Status** | Not started |
| **Source** | [abap-adt-api eval](../compare/abap-adt-api/evaluations/d3c6940-source-versions.md), [VSP eval](../compare/vibing-steampunk/evaluations/dd06202-version-history.md) |

**What:** Load specific versions of ABAP source, compare active vs inactive, view revision history. The `abap-adt-api` library (v6.0.0) added `loadSourceVersion` and `sourceVersions`. Enables "show me what changed" and rollback workflows.

**Competitive update (2026-04-08):** VSP added 3 version history tools (commit dd06202, Apr 2): list versions, compare versions, get specific version. Both VSP and abap-adt-api now have this.

---

### FEAT-21: ABAP Documentation (F1 Help)
| Field | Value |
|-------|-------|
| **Priority** | 🟡 P2 |
| **Effort** | XS (< 1 day) |
| **Risk** | Low |
| **Usefulness** | Medium — LLM fetches real docs instead of hallucinating |
| **Status** | Not started |
| **Source** | [abap-adt-api eval](../compare/abap-adt-api/evaluations/7d5c653-abap-documentation.md), VSP |

**What:** Fetch official ABAP keyword documentation (F1 help) via ADT API. The `abap-adt-api` library (v7.1.0) added `abapDocumentation`. Lets the LLM look up correct syntax instead of guessing.

---

### FEAT-22: gCTS/abapGit Integration
| Field | Value |
|-------|-------|
| **Priority** | 🟡 P2 |
| **Effort** | M (3–5 days) |
| **Risk** | Low |
| **Usefulness** | Medium — Git-based ABAP workflows |
| **Status** | Not started |
| **Source** | Dassian, [VSP eval](../compare/vibing-steampunk/evaluations/81cce41-gcts-tools.md), abap-adt-api |

**What:** List Git repositories, pull changes, check repo status. Multiple competitors have this (VSP, dassian, abap-adt-api). Enables Git-based ABAP development workflows.

**Competitive update (2026-04-08):** VSP added 10 gCTS tools (commit 81cce41, Apr 5): repo management, branch operations, commit history, pull/push. Closes VSP issue #39. Three competitors now have gCTS (VSP, dassian, abap-adt-api).

---

### FEAT-23: GetProgFullCode (Include Traversal)
| Field | Value |
|-------|-------|
| **Priority** | 🟡 P2 |
| **Effort** | S (1–2 days) |
| **Risk** | Low |
| **Usefulness** | Medium — reduces round trips for programs with includes |
| **Status** | Not started |
| **Source** | fr0ster |

**What:** Fetch a program with all its includes resolved into a single response. fr0ster has `GetProgFullCode`. Reduces N+1 round trips when reading programs with many includes.

---

### FEAT-24: CompareSource (Diff)
| Field | Value |
|-------|-------|
| **Priority** | 🟡 P2 |
| **Effort** | S (1–2 days) |
| **Risk** | Low |
| **Usefulness** | Medium — diff two versions of source |
| **Status** | Not started |
| **Source** | VSP |

**What:** Diff two versions of ABAP source (active vs inactive, or across transports). VSP has `CompareSource`. Useful for code review workflows.

---

### FEAT-25: CDS Unit Tests
| Field | Value |
|-------|-------|
| **Priority** | 🟡 P2 |
| **Effort** | S (1–2 days) |
| **Risk** | Low |
| **Usefulness** | Medium — CDS test-driven development |
| **Status** | Not started |
| **Source** | fr0ster |

**What:** Create, run, and check CDS unit tests. fr0ster is the only project with this capability. Enables AI-assisted CDS development with test coverage.

---

### FEAT-26: MCP Client Config Snippets
| Field | Value |
|-------|-------|
| **Priority** | 🟡 P2 |
| **Effort** | S (1–2 days) |
| **Risk** | Low |
| **Usefulness** | Medium — great onboarding UX |
| **Status** | Not started |
| **Source** | [fr0ster eval](../compare/fr0ster/evaluations/5f975fe-mcp-client-configurator.md) |

**What:** `arc-1 config --client claude` prints ready-to-paste MCP client configuration. fr0ster supports 11 clients. Lowers the barrier to first connection.

---

### FEAT-27: Migration Analysis (ECC→S/4)
| Field | Value |
|-------|-------|
| **Priority** | 🟡 P2 |
| **Effort** | S (1–2 days) |
| **Risk** | Low |
| **Usefulness** | Medium — custom code migration check |
| **Status** | Not started |
| **Source** | AWS ABAP Accelerator |

**What:** Run custom code migration checks to identify ECC code that needs changes for S/4HANA. AWS ABAP Accelerator has this as a key feature. Complements FEAT-06 (Cloud Readiness Assessment).

---

### FEAT-28: SAP Compatibility Hardening
| Field | Value |
|-------|-------|
| **Priority** | 🟡 P2 |
| **Effort** | S (1–2 days total) |
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

---

### FEAT-29: P3 Backlog (Future / Niche)

The following features are tracked but not planned for near-term implementation. They are niche, complex, or not aligned with core principles.

| ID | Feature | Why deferred | Source | Effort |
|----|---------|-------------|--------|--------|
| 29a | SSE transport | Most MCP clients use stdio or HTTP Streamable | fr0ster | M |
| 29b | ABAP debugger (8+ tools) | Requires WebSocket + ZADT_VSP deployment | VSP | L |
| 29c | Execute ABAP (IF_OO_ADT_CLASSRUN) | Security risk — needs careful safety gating | VSP, dassian | S |
| 29d | Call graph analysis (5 tools) | Useful but niche, complex | VSP | M |
| 29e | UI5/Fiori BSP CRUD (7 tools) | Only relevant if UI5 detected | VSP | M |
| 29f | RFC connectivity (sap-rfc-lite) | Alternative to ADT HTTP, niche | fr0ster | M |
| 29g | Embeddable server mode | Library mode for CAP/Express embedding | fr0ster | S |
| 29h | Lock registry with recovery | Persist lock state to disk for crash recovery | fr0ster | M |
| 29i | Language attributes on creation | Multi-language object creation | [abap-adt-api eval](../compare/abap-adt-api/evaluations/ffa43d7-language-attributes.md) | XS |
| 29j | Lua scripting / WASM compiler | VSP-unique experimental, not core MCP value | VSP | N/A |
| 29k | Dead code analysis | Method-level dead code via where-used | [VSP eval](../compare/vibing-steampunk/evaluations/1ecafe7-dead-code-analysis.md) | S |
| 29l | Package health analysis | Aggregated test coverage + staleness + complexity | [VSP eval](../compare/vibing-steampunk/evaluations/74efe5e-health-analysis.md) | M |
| 29m | Side effect / LUW classification | Classify methods by mutation profile | [VSP eval](../compare/vibing-steampunk/evaluations/11c2253-side-effects-luw.md) | M |
| 29n | Package boundary crossing | Architecture governance: cross-package call analysis | [VSP eval](../compare/vibing-steampunk/evaluations/53fb790-boundary-crossing.md) | M |

---

### FEAT-31: Code Coverage from Unit Tests
| Field | Value |
|-------|-------|
| **Priority** | 🟡 P2 |
| **Effort** | S (1–2 days) |
| **Risk** | Low |
| **Usefulness** | Medium — test quality assessment |
| **Status** | Not started |
| **Source** | [VSP eval](../compare/vibing-steampunk/evaluations/333f462-code-coverage.md) |

**What:** Return line-level code coverage metrics from ABAP unit test runs. VSP added `GetCodeCoverage` (commit 333f462, Apr 4). ARC-1's SAPDiagnose runs unit tests but returns pass/fail only, not coverage data.

---

### FEAT-32: Table Pagination / Offset
| Field | Value |
|-------|-------|
| **Priority** | 🟡 P2 |
| **Effort** | XS (< 1 day) |
| **Risk** | Low |
| **Usefulness** | Medium — practical query improvement |
| **Status** | Not started |
| **Source** | [VSP eval](../compare/vibing-steampunk/evaluations/9fb6c8a-table-pagination.md) |

**What:** Add `offset` parameter for cursor-style pagination and `columns_only` for schema-only queries to SAPQuery table preview. VSP added these (commit 9fb6c8a, Apr 4), closing their issue #34. ARC-1 has `maxRows` but no offset.

---

### FEAT-33: CDS Impact Analysis
| Field | Value |
|-------|-------|
| **Priority** | 🟡 P2 |
| **Effort** | S (1–2 days) |
| **Risk** | Low |
| **Usefulness** | Medium — increasingly important as S/4 moves logic into CDS |
| **Status** | Not started |
| **Source** | [VSP eval](../compare/vibing-steampunk/evaluations/6c67140-cds-impact.md) |

**What:** CDS-specific impact analysis: trace downstream consumers of a CDS view, get column-level metadata. VSP added CDS impact analysis and element info tools (commit 6c67140, Apr 4). Could extend SAPNavigate or SAPContext.

---

### FEAT-34: i18n Translation Management
| Field | Value |
|-------|-------|
| **Priority** | 🟡 P2 |
| **Effort** | M (3–5 days) |
| **Risk** | Low |
| **Usefulness** | Medium — multilingual ABAP development |
| **Status** | Not started |
| **Source** | [VSP eval](../compare/vibing-steampunk/evaluations/566f1f7-i18n-tools.md) |

**What:** Translation management tools: text elements, OTR texts, message class management, translation status, per-request language override. VSP added 7 translation tools (commit 566f1f7, Apr 5), closing their issue #40. ARC-1 has T100 message read and text elements read but not full management.

---

## 🏗️ Infrastructure & Operations

### OPS-01: Structured JSON Logging
| Field | Value |
|-------|-------|
| **Priority** | — |
| **Effort** | — |
| **Risk** | — |
| **Usefulness** | — |
| **Status** | ✅ Complete — `src/server/logger.ts` + `src/server/audit.ts` with multi-sink output |

**Implemented:** Structured logger with text/JSON output, sensitive field redaction. Multi-sink audit system (stderr, file, BTP Audit Log Service). User identity from OIDC JWT in all log entries.

---

### OPS-02: Health Check Enhancements
| Field | Value |
|-------|-------|
| **Priority** | 🟡 P2 |
| **Effort** | XS (< 1 day) |
| **Risk** | Low |
| **Usefulness** | Medium — better monitoring |
| **Status** | Basic `/health` exists |

**What:** Enhanced health endpoint that checks SAP connectivity, returns version info, uptime, feature availability. Separate `/health` (load balancer, always fast) from `/health/deep` (includes SAP connectivity check).

---

### OPS-03: Multi-System Routing
| Field | Value |
|-------|-------|
| **Priority** | 🟢 P3 |
| **Effort** | L (1–2 weeks) |
| **Risk** | Medium — significant architecture change |
| **Usefulness** | Medium — needed for enterprises with multiple SAP systems |
| **Status** | Not started |

**What:** Support multiple SAP systems from a single ARC-1 instance. Each MCP request includes a `sap_system_id` parameter. ARC-1 routes to the appropriate system based on configuration.

---

### OPS-04: GitHub Actions CI/CD Pipeline
| Field | Value |
|-------|-------|
| **Priority** | 🟡 P2 |
| **Effort** | — |
| **Risk** | — |
| **Usefulness** | High — automated testing and image publishing |
| **Status** | ✅ Complete |

**Implemented:**
- `.github/workflows/test.yml` — lint + typecheck + unit tests (Node 20/22) on every push/PR, integration tests on main
- `.github/workflows/docker.yml` — multi-platform Docker build (amd64/arm64) to GHCR on tags + manual dispatch
- `.github/workflows/release.yml` — npm publish with provenance on version tags

---

## 📖 Documentation & Ecosystem

### DOC-01: End-to-End Copilot Studio Setup Guide
| Field | Value |
|-------|-------|
| **Priority** | 🟠 P1 |
| **Effort** | S (1–2 days) |
| **Risk** | Low |
| **Usefulness** | Very High — critical for adoption |
| **Status** | Partially done (oauth-jwt-setup.md updated with Copilot Studio section) |

**What:** Complete guide with screenshots covering:
1. Entra ID app registration (step-by-step)
2. BTP CF deployment (manifest, `cf push`, env vars)
3. Power Automate custom connector creation (Security tab configuration)
4. Copilot Studio agent creation with ARC-1 as MCP server
5. Common errors and fixes (troubleshooting table with all AADSTS errors)

---

### DOC-02: Basis Admin Security Guide
| Field | Value |
|-------|-------|
| **Priority** | 🟠 P1 |
| **Effort** | S (1–2 days) |
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

---

### DOC-03: SAP Community Blog Post
| Field | Value |
|-------|-------|
| **Priority** | 🟡 P2 |
| **Effort** | S (1–2 days) |
| **Risk** | Low |
| **Usefulness** | High — visibility and adoption |
| **Status** | Draft exists ([Report 023](../reports/2025-12-05-023-arc1-for-abap-developers.md)) |

**What:** Publish on SAP Community: "ARC-1: Connecting SAP ABAP to Microsoft Copilot Studio via MCP" covering architecture, security model, and setup.

---

## 🧹 Code Cleanup & Technical Debt

### CLEAN-01: Go Code Removal
| Field | Value |
|-------|-------|
| **Priority** | — |
| **Effort** | — |
| **Risk** | — |
| **Usefulness** | — |
| **Status** | ✅ Complete — all Go source removed (cmd/, internal/, pkg/, go.mod, go.sum, Makefile) |

---

### CLEAN-02: CLI Surface
| Field | Value |
|-------|-------|
| **Priority** | — |
| **Effort** | — |
| **Risk** | — |
| **Usefulness** | — |
| **Status** | ✅ Complete — minimal CLI: `arc1 search`, `arc1 source`, `arc1 lint`, `arc1 serve` |

---

## Prioritized Execution Order

> Priorities are assigned based on which [core design principle](#core-design-principles) a feature serves. Sourced from 3 competitor trackers ([fr0ster](../compare/fr0ster/overview.md), [VSP](../compare/vibing-steampunk/overview.md), [abap-adt-api](../compare/abap-adt-api/overview.md)) and the [cross-project feature matrix](../compare/00-feature-matrix.md).

### Phase A: Production Blockers (P0)
1. **FEAT-02** API Release Status / Clean Core (S) — **upgraded from P1**: VSP now has this (Apr 5), ARC-1 is the only major project without it
2. **FEAT-08** Content-Type 415/406 Auto-Retry (XS) — both fr0ster and VSP hit this
3. **FEAT-14** 401 Session Timeout Auto-Retry (XS) — centralized gateway idles between requests
4. **FEAT-07** TLS/HTTPS for HTTP Streamable (S) — enterprise deployments without reverse proxy
5. **FEAT-15** Namespace URL Encoding Audit (XS) — silent failures for namespaced objects

### Phase B: Core Value Features (P1)
6. **FEAT-17** Type Auto-Mappings for SAPWrite (XS) — eliminate LLM type code confusion
7. **FEAT-12** Fix Proposals / Auto-Fix (S) — safer than LLM-guessed fixes
8. **FEAT-16** Error Intelligence (S) — actionable hints for SAP errors (subsumes SEC-03)
9. **FEAT-13** DDIC Domain/Data Element Write (S) — complete data modeling workflow
10. **FEAT-18** Function Group Bulk Fetch (S) — token/round-trip savings
11. **DOC-01** Copilot Studio Setup Guide (S) — critical for enterprise adoption
12. **DOC-02** Basis Admin Security Guide (S) — admin audience needs clear guidance

### Phase C: ADT Feature Parity (P2) — Quick Wins
13. **FEAT-32** Table Pagination / Offset (XS) — VSP has this, practical improvement
14. **FEAT-10** PrettyPrint (XS) — code formatting, VSP and abap-adt-api have it
15. **FEAT-11** Inactive Objects List (XS) — development workflow
16. **FEAT-19** Transport Contents (XS) — review objects before release
17. **FEAT-21** ABAP Documentation / F1 Help (XS) — real docs instead of hallucination
18. **FEAT-28** SAP Compatibility Hardening (S) — 7 compat fixes bundled (expanded Apr 8)
19. **OPS-02** Health Check Enhancements (XS) — `/health/deep` with SAP connectivity check

### Phase D: ADT Feature Parity (P2) — Larger Items
20. **FEAT-09** SQL Trace Monitoring (S) — completes diagnostics story
21. **SEC-05** Rate Limiting (S) — prevent runaway AI loops
22. **FEAT-20** Source Version / Revision History (S) — version comparison, rollback (VSP + abap-adt-api have it)
23. **FEAT-31** Code Coverage from Unit Tests (S) — VSP has this (Apr 4)
24. **FEAT-33** CDS Impact Analysis (S) — VSP has this (Apr 4)
25. **FEAT-24** CompareSource / Diff (S) — code review workflows
26. **FEAT-26** MCP Client Config Snippets (S) — onboarding UX
27. **FEAT-25** CDS Unit Tests (S) — CDS test-driven development
28. **FEAT-23** GetProgFullCode / Include Traversal (S) — reduce round trips
29. **FEAT-27** Migration Analysis ECC→S/4 (S) — custom code migration
30. **FEAT-06** Cloud Readiness Assessment (M) — ATC cloud checks + abaplint
31. **FEAT-03** Enhancement Framework / BAdI (M) — customization scenarios
32. **FEAT-22** gCTS/abapGit Integration (M) — Git-based ABAP workflows (VSP has 10 tools now)
33. **FEAT-34** i18n Translation Management (M) — VSP has 7 tools (Apr 5)
34. **OPS-03** Multi-System Routing (L) — one instance → multiple SAP systems
35. **DOC-03** SAP Community Blog Post (S) — visibility and adoption
36. **FEAT-30** ABAP Cleaner Integration (M) — optional Java-based code cleanup (see below)

### FEAT-30: ABAP Cleaner Integration (Future)

| Field | Value |
|-------|-------|
| **Priority** | 🟢 P3 |
| **Effort** | M (3–5 days) |
| **Risk** | Medium — adds Java 21 dependency, ~200MB Docker image increase |
| **Usefulness** | High for teams already using ABAP cleaner profiles |
| **Status** | Research complete, not started |

**What:** Optional integration with SAP's [ABAP cleaner](https://github.com/SAP/abap-cleaner) CLI (`abap-cleanerc`) for 100+ code cleanup rules with 469 configuration options. Runs as a pre-stage before abaplint in the lint/fix pipeline. Teams can mount their `.cfj` profile files to enforce company coding standards.

**Why:** Many SAP teams already maintain ABAP cleaner profiles (`.cfj` files) as their shared coding standard. Integrating this means LLM-generated code automatically conforms to the team's existing rules — no new rule configuration needed. ABAP cleaner handles transformations abaplint can't: READ TABLE → table expressions, string concatenation → string templates, FINAL declarations, advanced alignment (21 DDL/CDS-specific rules).

**Architecture:** Three-stage pipeline: ABAP cleaner (Java CLI, transforms) → abaplint (TypeScript, lint+fix) → pre-write gate (TypeScript, block/pass). ABAP cleaner is optional — if Java/JAR not found, skipped silently. CLI invoked via `child_process.execFile` with `--source` for inline processing (<128KB) or temp files for larger sources. Output captured from stdout.

**Key details from research:**
- CLI: `abap-cleaner --source "<ABAP>" --release "757" --profile "team.cfj"` → cleaned source on stdout
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

### Phase E: New Capabilities from Competitor Sprint (P2–P3)
33. **FEAT-31** Code Coverage from Unit Tests (S) — VSP added line-level coverage metrics
34. **FEAT-32** Table Pagination / Offset (XS) — VSP added offset + columns_only to table contents
35. **FEAT-33** CDS Impact Analysis (S) — VSP added downstream consumer tracing for CDS views
36. **FEAT-34** i18n Translation Management (M) — VSP added 7 translation tools

### Phase F: Future / Niche (P3)
37. **FEAT-05** Code Refactoring (L) — rename, extract method, change package
38. **FEAT-29** P3 Backlog — see [FEAT-29 table](#feat-29-p3-backlog-future--niche) for SSE, debugger, execute ABAP, call graph, UI5/BSP, RFC, embeddable server, lock registry, language attributes

---

## Competitive Landscape

> **Detailed tracking**: See [`compare/`](../compare/) for per-commit and per-issue evaluations of key competitors.

| Competitor | Language | Tools | Auth | Safety | Deployment | Key Advantage |
|-----------|---------|-------|------|--------|------------|---------------|
| **ARC-1** | TypeScript | 11 intent-based + hyperfocused | API Key, OIDC, XSUAA, PP | Read-only, pkg filter, op filter, 2D auth (scopes+roles+safety) | Docker, BTP CF, npm | Per-user PP, scope-based tools, 3 auth modes, safety, 1,104 tests |
| **vibing-steampunk** | Go 1.24 | 1-99+ (3 modes) | Basic, Cookie | Op filter, pkg filter, transport guard | Go binary (9 platforms) | 242 stars, **Streamable HTTP (v2.38.0)**, native parser, massive feature sprint (i18n, gCTS, API release state, version history, code coverage) |
| **fr0ster/mcp-abap-adt** | TypeScript | 287 (4 tiers) | 9 providers (incl. TLS, SAML, Device Flow) | Exposition tiers | npm `@mcp-abap-adt/core` | Most tools, most auth options, embeddable, RFC, multi-system |
| SAP ABAP Add-on MCP | ABAP | ~10 | SAP native | SAP authorization | Runs inside SAP | No proxy needed, SAP-native auth |
| lemaiwo/btp-sap-odata-to-mcp-server | TypeScript | ~10 | XSUAA OAuth proxy | XSUAA roles | BTP CF (MTA) | XSUAA OAuth proxy, principal propagation |
| dassian-adt / abap-mcpb | JavaScript | 25+ | Basic, Browser login | MCP elicitation | Node.js / MCPB | Error intelligence, batch activation, find_definition, edit_method (Apr sprint) |
| AWS ABAP Accelerator | Python | ~15 | OAuth, X.509 | Basic | AWS Lambda | Cloud readiness assessment, migration |

**ARC-1 differentiators (no other project has all of these):**
1. **Intent-based routing** — 11 tools vs 25-287, simplest LLM decision surface
2. **Principal propagation** — per-user SAP authentication via BTP Destination Service + Cloud Connector
3. **Two-dimensional authorization** — scopes (read/write/admin) × roles × safety config, with per-tool filtering
4. **Three auth modes coexist** — XSUAA OAuth + Entra ID OIDC + API key on the same endpoint
5. **Comprehensive safety system** — read-only, package filter, operation filter, transport guard, dry-run — additive to scopes
6. **Multi-sink audit logging** — stderr + file + BTP Audit Log Service
7. **Context compression + method-level surgery** — AST-based 7-30x + 95% method-level reduction
8. **MCP elicitation** — interactive confirmations for destructive operations
9. **1,104 automated tests** with CI on Node 20/22, BTP integration tests
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

## 🔄 TypeScript Migration — Complete

### STRAT-01: TypeScript Migration
| Field | Value |
|-------|-------|
| **Priority** | — |
| **Status** | ✅ Complete (2026-03-26) |

**What was done:**
- Full Go → TypeScript migration in a single session
- Custom ADT HTTP client (axios-based, CSRF lifecycle, cookie persistence, session isolation)
- 11 intent-based tools ported with identical behavior
- Safety system ported (read-only, package filter, operation filter, transport guard)
- HTTP Streamable transport with per-request server isolation (Copilot Studio compatible)
- API key + OIDC/JWT authentication (jose library)
- BTP Destination Service integration (VCAP_SERVICES parsing, destination lookup, connectivity proxy)
- `@abaplint/core` integration (replaces custom Go ABAP lexer with full abaplint rules)
- `better-sqlite3` + in-memory cache (replaces Go CGO/SQLite)
- 320 unit tests + 28 integration tests (vitest)
- CI/CD: lint + typecheck + tests (Node 20/22), Docker multi-arch, npm publish
- Go source code removed (47K lines deleted)

**Migration report:** See `reports/2026-03-26-001-typescript-migration-plan.md`

---

## Previously Completed

| Phase | Description | Status |
|-------|-------------|--------|
| Go v1.x–v2.32 | ADT client, 40+ tools, CRUD, debugging, WebSocket, Lua scripting | ✅ Complete (Go) |
| Enterprise Rename | vsp → ARC-1, 11 intent-based tools | ✅ Complete |
| Auth Phase 1: API Key | `ARC1_API_KEY` Bearer token | ✅ Complete |
| Auth Phase 2: OAuth/OIDC | Entra ID JWT validation via `jose` library | ✅ Complete |
| Auth Phase 4: BTP CF | Docker on CF with Destination Service + Cloud Connector | ✅ Complete |
| TypeScript Migration | Full Go → TypeScript port, Go code removed | ✅ Complete (2026-03-26) |
| CI/CD Pipeline | GitHub Actions: lint, typecheck, tests (Node 20/22), Docker, npm publish | ✅ Complete |
| Copilot Studio E2E | OAuth + MCP + BTP Destination + Cloud Connector → SAP data | ✅ Complete |
| XSUAA OAuth Proxy | SEC-07: MCP SDK auth + @sap/xssec, Express 5, 3 auth modes coexist | ✅ Complete (2026-03-27) |
| Scope Enforcement | SEC-06: Per-tool scope checks, ListTools filtering, 12 tests | ✅ Complete (2026-03-27) |
| Audit Logging | SEC-04: Multi-sink audit (stderr, file, BTP Audit Log Service) | ✅ Complete (2026-04-01) |
| Dynamic Client Registration | RFC 7591 /register endpoint for MCP clients | ✅ Complete (2026-03-27) |
| Principal Propagation | SEC-01+SEC-02: Per-user ADT client via BTP Dest Service + Cloud Connector | ✅ Code complete (2026-03-27) |
| Hyperfocused Mode | Single `SAP` tool (~200 tokens) — competitive parity with VSP | ✅ Complete (2026-04-01) |
| Method-Level Surgery | `edit_method`, `list_methods`, `get_method` — 95% token reduction | ✅ Complete (2026-04-01) |
| Runtime Diagnostics | SAPDiagnose — short dumps (ST22), ABAP profiler traces | ✅ Complete (2026-04-01) |
| DDIC Completeness | FEAT-04: DOMA, DTEL, STRU, DDLX, TRAN, BOR, T100, variants | ✅ Complete (2026-04-01) |
| RAP CRUD | DDLS/DDLX/BDEF/SRVD write, SRVB read, batch activation | ✅ Complete (2026-04-01) |
| Context Compression | SAPContext with AST-based dependency extraction (7-30x reduction) | ✅ Complete (2026-04-01) |
| MCP Elicitation | Interactive confirmations for destructive operations | ✅ Complete (2026-04-01) |
| BTP ABAP Environment | OAuth 2.0 browser login, direct BTP connectivity | ✅ Complete (2026-04-01) |
| Where-Used Analysis | FEAT-01: Scope-based where-used in SAPNavigate | ✅ Complete (2026-04-04, PR #38) |
| Enhanced Abaplint | System-aware cloud/on-prem presets, pre-write validation, auto-fix | ✅ Complete (2026-04-04, PR #37) |
| Object Caching | SQLite + memory cache with on-demand + pre-warmer support | ✅ Complete (2026-04-04, PR #31) |
| HTTP Client Migration | Replaced axios with native fetch + undici | ✅ Complete (2026-04-04, PR #35) |
| Two-Dimensional Auth | Scopes × roles × safety config, SEC-06 expanded | ✅ Complete (2026-04-07, PR #48) |
| Zod v4 Validation | Runtime input validation for all MCP tool inputs | ✅ Complete (2026-04-08, PR #52) |
| OAuth Security (RFC 9700) | SEC-08: state+PKCE, loopback binding, audience validation | ✅ Complete (2026-04-08, PR #51) |

---

*This roadmap is a living document. Priorities may shift based on community feedback and enterprise requirements.*
