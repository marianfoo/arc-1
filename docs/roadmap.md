# ARC-1 Roadmap

**Last Updated:** 2026-03-26
**Project:** ARC-1 (ABAP Relay Connector) — MCP Server for SAP ABAP Systems
**Repository:** https://github.com/marianfoo/arc-1

---

## Vision

ARC-1 is a **TypeScript MCP server** that connects SAP ABAP systems to AI-powered clients. It serves as a secure bridge between:

- **SAP Systems** (on-premise via direct connection or Cloud Connector, BTP Cloud Foundry)
- **AI Clients** (Microsoft Copilot Studio, Claude Code/Desktop, VS Code, Gemini CLI, and any MCP-compatible client)

The core design principles are:
1. **Security first** — read-only by default, per-user SAP authorization, admin-controlled tool surface
2. **npm package + Docker** — `npx arc-1` or `ghcr.io/marianfoo/arc-1`, Node.js 20+
3. **Intent-based tools** — 11 tools with rich descriptions, optimized for mid-tier LLMs
4. **Dual deployment** — local (stdio) for developers, HTTP Streamable for enterprise/cloud

---

## Current State (v3.0.0-alpha.1 — TypeScript)

| Area | Status |
|------|--------|
| TypeScript Migration | ✅ Complete — Go code removed, pure TypeScript |
| Core MCP Server | ✅ 11 intent-based tools, HTTP Streamable + stdio |
| Safety System | ✅ Read-only, package filter, operation filter, transport guard |
| Phase 1: API Key Auth | ✅ `ARC1_API_KEY` / `VSP_API_KEY` Bearer token |
| Phase 2: OAuth/OIDC (Entra ID) | ✅ JWT validation via `jose` library, tested with Copilot Studio |
| Phase 4: BTP CF Deployment | ✅ Docker on CF with Destination Service + Cloud Connector |
| BTP Destination Service | ✅ Auto-resolves SAP credentials from BTP Destination at startup |
| BTP Connectivity Proxy | ✅ Routes through Cloud Connector with JWT Proxy-Authorization |
| ABAP Linter | ✅ `@abaplint/core` integration (full abaplint rules) |
| Docker Image | ✅ Multi-platform (amd64/arm64), GHCR `ghcr.io/marianfoo/arc-1` |
| CI/CD | ✅ GitHub Actions: lint + typecheck + unit tests (Node 20/22) + integration tests |
| XSUAA OAuth Proxy | ✅ MCP SDK ProxyOAuthServerProvider + @sap/xssec JWT validation |
| Test Coverage | ✅ 339 unit tests + 28 integration tests (vitest) |
| Documentation | ✅ Architecture, auth guides, Docker guide, setup phases |
| Phase 3: Principal Propagation | 🔧 Needs porting to TypeScript + SAP-side setup |

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
| **Status** | Needs TypeScript implementation (was in Go `pkg/adt/principal_propagation.go`) |

**What:** When a user authenticates via Entra ID OAuth, ARC-1 generates an ephemeral X.509 certificate (CN=SAP_USERNAME, 5-min validity), signed by a trusted CA. SAP's CERTRULE maps the certificate to the actual SAP user. Every ADT call runs as that user, with SAP's native S_DEVELOP authorization enforced.

**Why this matters:**
- Currently all Copilot Studio users share one SAP service account — SAP audit log shows the technical user, not who actually did it
- With principal propagation, SAP enforces its own authorization (S_DEVELOP, package restrictions) per user
- Zero SAP credentials stored anywhere (only CA key, which goes in Key Vault / secrets manager)
- Required for any enterprise that needs to differentiate "AI user accessed system" vs "developer used Eclipse"

**Implementation:**
1. Wire Phase 2 OIDC middleware to extract username from JWT `preferred_username` claim
2. Map OIDC username → SAP username (via mapping file or email prefix extraction)
3. Generate ephemeral X.509 cert per request (needs TypeScript implementation)
4. Create per-user ADT HTTP client with ephemeral cert
5. SAP admin: Import CA cert in STRUST, configure CERTRULE, set ICM params, restart ICM

**Testing:**
- Unit: Mock cert generation, verify CN/validity/signing
- Integration: Two different OIDC users → two different SAP users → verify audit log shows correct user

**References:**
- [Report 006: Phase 3 Principal Propagation](../reports/2026-03-25-006-phase3-principal-propagation.md)
- [SAP Help: Configuring Principal Propagation](https://help.sap.com/docs/connectivity/sap-btp-connectivity-cf/configuring-principal-propagation)
- [docs/enterprise-auth.md Section 5](enterprise-auth.md#5-oidc-token-validation--principal-propagation)

---

### SEC-02: BTP Cloud Connector Principal Propagation
| Field | Value |
|-------|-------|
| **Priority** | 🟠 P1 |
| **Effort** | M (3–5 days) |
| **Risk** | Medium — depends on Cloud Connector configuration |
| **Usefulness** | High — enables per-user auth when ARC-1 runs on BTP CF |
| **Status** | Not started |

**What:** When ARC-1 is deployed on BTP CF, forward the Entra ID user identity through the Cloud Connector to SAP on-premise using BTP's built-in principal propagation mechanism. The BTP Destination would use `Authentication: PrincipalPropagation` instead of `BasicAuthentication`.

**How it differs from SEC-01:** SEC-01 generates certs directly in ARC-1. SEC-02 uses BTP's Destination Service + Cloud Connector to propagate the user identity — the Cloud Connector generates the short-lived certificate. Less code in ARC-1, but requires more BTP/Cloud Connector configuration.

**SAP-side setup:**
1. Cloud Connector: Synchronize trust with BTP subaccount, set principal type to X.509
2. SAP backend: STRUST (import Cloud Connector CA), CERTRULE, ICM params
3. BTP Destination: Change authentication from BasicAuthentication to PrincipalPropagation
4. Subject pattern: Map `${email}` or `${user_name}` to SAP user ID

**References:**
- [SAP Help: Principal Propagation via Cloud Connector](https://help.sap.com/docs/connectivity/sap-btp-connectivity-cf/configuring-principal-propagation)
- [SAP Community: Setting Up Principal Propagation Step by Step](https://community.sap.com/t5/technology-blog-posts-by-sap/setting-up-principal-propagation/ba-p/13510251)

---

### SEC-03: SAP Authorization Object Awareness (S_DEVELOP)
| Field | Value |
|-------|-------|
| **Priority** | 🟡 P2 |
| **Effort** | S (1–2 days) |
| **Risk** | Low |
| **Usefulness** | Medium — better error messages, admin guidance |
| **Status** | Not started |

**What:** When SAP returns a 403/authorization error on an ADT call, ARC-1 should detect the S_DEVELOP authorization object failure and return a helpful message explaining which authorization is missing (e.g., "User DEVELOPER lacks S_DEVELOP authorization for ACTVT=02 (Change) on OBJTYPE=PROG in DEVCLASS=$TMP").

**Why:** Currently ADT returns generic HTML 403 pages. A developer or admin troubleshooting "why can't the AI create a program?" gets no actionable guidance. This is especially important when principal propagation is active and different users have different SAP authorization profiles.

**Implementation:**
- Parse the ADT error response XML for authorization object details
- Map SAP authorization error codes to human-readable messages
- Include in tool error responses: what authorization is needed, which transaction to check (SU53, PFCG)

**References:**
- [SAP Help: S_DEVELOP Authorization Object](https://help.sap.com/docs/SAP_Solution_Manager/fd3c83ed48684640a18ac05c8ae4d016/4fa00d670cff44a5958237334a88af84.html)

---

### SEC-04: Audit Logging
| Field | Value |
|-------|-------|
| **Priority** | 🟠 P1 |
| **Effort** | M (3–5 days) |
| **Risk** | Low |
| **Usefulness** | High — required for enterprise compliance |
| **Status** | Structured logger exists (`ts-src/server/logger.ts`), needs correlation ID + user context |

**What:** Structured JSON audit log for every MCP tool call, including:
- Timestamp, correlation ID (MCP session ID)
- Authenticated user (from OIDC token)
- Tool name, action, target object
- SAP user used (service account or propagated user)
- Result (success/error), duration
- Client info (from MCP initialize)

**Implementation:**
- Structured logger already exists (`ts-src/server/logger.ts`) with text/JSON output and field redaction
- Add correlation ID from MCP session headers
- Add user context from OIDC middleware (JWT `sub`/`preferred_username`)
- Support log output to stderr (default), file, or syslog

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
| **Status** | Concept only |

**What:** Allow admins to define which MCP tools are available based on the authenticated user's role or group membership. This enables the enterprise use case: "AI users can only read, but the same SAP user in Eclipse can write."

**How it could work:**
- OIDC tokens contain group/role claims (e.g., Entra ID groups: `arc1-readers`, `arc1-writers`)
- ARC-1 checks group membership from JWT and applies tool restrictions:
  - `arc1-readers`: Only SAPRead, SAPSearch, SAPQuery, SAPContext, SAPNavigate
  - `arc1-writers`: All tools
  - `arc1-admins`: All tools + SAPManage
- This is **independent** of SAP's S_DEVELOP — it restricts what the AI agent can attempt, while SAP enforces what the SAP user can actually do

**Configuration:**
```bash
SAP_OIDC_READER_GROUPS="arc1-readers,sap-viewers"
SAP_OIDC_WRITER_GROUPS="arc1-writers,sap-developers"
```

**Why this matters for basis admins:**
- An SAP developer user (with full S_DEVELOP authorization in Eclipse) could be restricted to read-only when using AI
- The admin controls the AI's capabilities separately from SAP authorization
- Provides a "safety net" that doesn't exist when the same user uses Eclipse directly
- **This is unique to ARC-1** — no other MCP server or SAP AI tool offers this level of AI-specific access control

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
- `ts-src/server/xsuaa.ts` — OAuth provider, client store, chained verifier
- `ts-src/server/http.ts` — Express-based HTTP server with auth routing
- `xs-security.json` — XSUAA service instance config
- `docs/phase5-xsuaa-setup.md` — Setup guide

**Reference:** Inspired by [lemaiwo/btp-sap-odata-to-mcp-server](https://github.com/lemaiwo/btp-sap-odata-to-mcp-server).

---

## 🔧 Features & Tools

### FEAT-01: Where-Used Analysis (Usage References)
| Field | Value |
|-------|-------|
| **Priority** | 🟠 P1 |
| **Effort** | XS (< 1 day) |
| **Risk** | Low |
| **Usefulness** | Very High — most requested missing feature |
| **Status** | Not started |

**What:** Find all references to an ABAP object across the system. Uses ADT endpoint `/sap/bc/adt/repository/informationsystem/usageReferences`.

**Why:** Currently ARC-1 has `FindReferences` (code intelligence, position-based), but not the repository-wide "Where-Used" analysis that every ABAP developer uses daily.

**References:**
- [Report 001: Feature Parity](../reports/2026-03-24-001-feature-parity-implementation.md) — Item #1

---

### FEAT-02: API Release Status Tool (Clean Core)
| Field | Value |
|-------|-------|
| **Priority** | 🟠 P1 |
| **Effort** | S (1–2 days) |
| **Risk** | Low |
| **Usefulness** | Very High — critical for S/4HANA Cloud and clean core compliance |
| **Status** | Not started |

**What:** Check whether an SAP object (class, function module, table, CDS view) is released, deprecated, or internal. Returns the API release state (C1 Released, C2 Deprecated, Not Released) and the recommended successor.

**Why:** Every S/4HANA Cloud / BTP ABAP customer needs to check if their code uses only released APIs. This is a "must have" for any AI copilot helping with ABAP Cloud development. The buettnerjulian/abap-adt-mcp competitor already has this.

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
| **Priority** | 🟡 P2 |
| **Effort** | M (3–5 days) |
| **Risk** | Low |
| **Usefulness** | Medium — needed for full data model management |
| **Status** | Not started |

**What:** CRUD operations for DDIC domains, data elements, and CDS metadata extensions (DDLX). Uses ADT endpoints `/sap/bc/adt/ddic/domains`, `/sap/bc/adt/ddic/dataelements`, `/sap/bc/adt/ddic/ddlx/sources`.

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

---

### FEAT-06: Cloud Readiness Assessment
| Field | Value |
|-------|-------|
| **Priority** | 🟡 P2 |
| **Effort** | M (3–5 days) |
| **Risk** | Low |
| **Usefulness** | High — unique differentiator for S/4HANA migration |
| **Status** | Not started |

**What:** Run ATC checks with ABAP Cloud check variant to assess whether code is cloud-ready. Combined with the ABAP linter (`@abaplint/core` integration in `ts-src/lint/lint.ts`), provide a comprehensive clean core compliance report.

**Why:** AWS ABAP Accelerator has this as a key feature. ARC-1 combines ATC cloud checks with `@abaplint/core` for offline linting.

---

## 🏗️ Infrastructure & Operations

### OPS-01: Structured JSON Logging
| Field | Value |
|-------|-------|
| **Priority** | 🟠 P1 |
| **Effort** | XS (< 1 day) |
| **Risk** | Low |
| **Usefulness** | High — required for cloud-native operations |
| **Status** | ✅ Mostly complete — `ts-src/server/logger.ts` with text/JSON output, field redaction |

**What:** Structured logging is implemented (`ts-src/server/logger.ts`). Remaining: add correlation IDs from MCP session, add user context from OIDC JWT, configure JSON vs text via env var.

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
| **Status** | Partially done (phase2-oauth-setup.md updated with Copilot Studio section) |

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

### Phase A: Enterprise Security (Next)
1. **SEC-04** Audit Logging — add correlation ID + user context to existing logger (P1, XS)
2. **SEC-01** Principal Propagation — port to TypeScript, end-to-end testing (P0, L)
3. **DOC-02** Basis Admin Security Guide (P1, S)

### Phase B: Feature Completeness
4. **FEAT-01** Where-Used Analysis (P1, XS)
5. **FEAT-02** API Release Status (P1, S)
6. **DOC-01** End-to-End Copilot Studio Guide (P1, S)

### Phase C: Enterprise Hardening
7. **SEC-02** BTP Cloud Connector Principal Propagation (P1, M)
8. **SEC-05** Rate Limiting (P2, S)
9. **SEC-06** Tool Restriction by User Role (P2, M)
10. **SEC-03** S_DEVELOP Authorization Awareness (P2, S)

### Phase D: Advanced Features
12. **FEAT-06** Cloud Readiness Assessment (P2, M)
13. **FEAT-03** Enhancement Framework (P2, M)
14. **FEAT-04** DDIC Object Support (P2, M)
15. **OPS-03** Multi-System Routing (P3, L)
16. **FEAT-05** Code Refactoring (P3, L)

---

## Competitive Landscape

| Competitor | Language | Tools | Auth | Safety | Deployment | Key Advantage |
|-----------|---------|-------|------|--------|------------|---------------|
| **ARC-1** | TypeScript | 11 intent-based | API Key, OIDC, XSUAA OAuth proxy | Read-only, pkg filter, op filter, transport guard | Docker, BTP CF, npm | Safety system, BTP integration, XSUAA + OIDC + API key coexistence, 367 tests |
| SAP ABAP Add-on MCP | ABAP | ~10 | SAP native | SAP authorization | Runs inside SAP | No proxy needed, SAP-native auth |
| lemaiwo/btp-sap-odata-to-mcp-server | TypeScript | ~10 | XSUAA OAuth proxy | XSUAA roles | BTP CF (MTA) | XSUAA OAuth proxy, SAP Cloud SDK, principal propagation via Destination Service |
| mario-andreschak/mcp-abap-adt | TypeScript | ~20 | Basic | None | Node.js | Uses established abap-adt-api library |
| AWS ABAP Accelerator | Python | ~15 | OAuth | Basic | AWS Lambda | Cloud readiness assessment, migration |
| SAP Joule for Developers | SAP-internal | N/A | SAP | SAP | BAS/ADT | SAP's own AI, trained on ABAP LLM |
| GitHub Copilot for ABAP | N/A | N/A | GitHub | N/A | Eclipse plugin | Inline completions, chat |

**ARC-1 differentiators:**
1. Comprehensive safety system (read-only, package filter, operation filter, transport guard) — no other MCP server has this
2. BTP-native deployment with Destination Service + Cloud Connector integration
3. `@abaplint/core` integration for offline ABAP linting (no SAP round-trip needed)
4. HTTP Streamable transport with per-request server isolation (Copilot Studio compatible)
5. Intent-based tool design optimized for mid-tier LLMs (11 tools vs 20+)
6. 348 automated tests (320 unit + 28 integration) with CI on Node 20/22

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
| Auth Phase 1: API Key | `ARC1_API_KEY` / `VSP_API_KEY` Bearer token | ✅ Complete |
| Auth Phase 2: OAuth/OIDC | Entra ID JWT validation via `jose` library | ✅ Complete |
| Auth Phase 4: BTP CF | Docker on CF with Destination Service + Cloud Connector | ✅ Complete |
| TypeScript Migration | Full Go → TypeScript port, 348 tests, Go code removed | ✅ Complete (2026-03-26) |
| CI/CD Pipeline | GitHub Actions: lint, typecheck, tests (Node 20/22), Docker, npm publish | ✅ Complete |
| Copilot Studio E2E | OAuth + MCP + BTP Destination + Cloud Connector → SAP data | ✅ Complete |
| XSUAA OAuth Proxy | SEC-07: MCP SDK auth + @sap/xssec, Express 5, 3 auth modes coexist | ✅ Complete (2026-03-27) |

---

*This roadmap is a living document. Priorities may shift based on community feedback and enterprise requirements.*
