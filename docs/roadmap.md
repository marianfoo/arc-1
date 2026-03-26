# ARC-1 Roadmap

**Last Updated:** 2026-03-26
**Project:** ARC-1 (ABAP Relay Connector) — MCP Server for SAP ABAP Systems
**Repository:** https://github.com/marianfoo/arc-1

---

## Vision

ARC-1 is a **Go-native MCP server** that connects SAP ABAP systems to AI-powered clients. It serves as a secure bridge between:

- **SAP Systems** (on-premise via direct connection or Cloud Connector, BTP Cloud Foundry)
- **AI Clients** (Microsoft Copilot Studio, Claude Code/Desktop, VS Code, Gemini CLI, and any MCP-compatible client)

The core design principles are:
1. **Security first** — read-only by default, per-user SAP authorization, admin-controlled tool surface
2. **Single binary, zero dependencies** — Go binary, no Node.js/Python/Java runtime
3. **Intent-based tools** — 11 tools with rich descriptions, optimized for mid-tier LLMs
4. **Dual deployment** — local (stdio) for developers, HTTP Streamable for enterprise/cloud

---

## Current State (v2.32)

| Area | Status |
|------|--------|
| Core MCP Server | ✅ 11 intent-based tools, HTTP Streamable + stdio |
| Safety System | ✅ Read-only, package filter, operation filter, transport guard |
| Phase 1: API Key Auth | ✅ Implemented and deployed |
| Phase 2: OAuth/OIDC (Entra ID) | ✅ Implemented, tested end-to-end with Copilot Studio |
| Phase 4: BTP CF Deployment | ✅ Docker on CF with Destination Service + Cloud Connector |
| Phase 3: Principal Propagation | 🔧 Code exists, needs SAP-side setup + end-to-end testing |
| Native ABAP Lexer/Linter | ✅ Go port of abaplint, 8 lint rules |
| abapGit Integration | ✅ WebSocket-based, 158 object types |
| Docker Image | ✅ Multi-platform (amd64/arm64), GHCR published |
| Documentation | ✅ Architecture, auth guides, Docker guide, setup phases |

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
| **Status** | Code exists (`pkg/adt/principal_propagation.go`), needs end-to-end wiring |

**What:** When a user authenticates via Entra ID OAuth, ARC-1 generates an ephemeral X.509 certificate (CN=SAP_USERNAME, 5-min validity), signed by a trusted CA. SAP's CERTRULE maps the certificate to the actual SAP user. Every ADT call runs as that user, with SAP's native S_DEVELOP authorization enforced.

**Why this matters:**
- Currently all Copilot Studio users share one SAP service account — SAP audit log shows the technical user, not who actually did it
- With principal propagation, SAP enforces its own authorization (S_DEVELOP, package restrictions) per user
- Zero SAP credentials stored anywhere (only CA key, which goes in Key Vault / secrets manager)
- Required for any enterprise that needs to differentiate "AI user accessed system" vs "developer used Eclipse"

**Implementation:**
1. Wire Phase 2 OIDC middleware to extract username from JWT `preferred_username` claim
2. Map OIDC username → SAP username (via mapping file or email prefix extraction)
3. Generate ephemeral X.509 cert per request (already in `principal_propagation.go`)
4. Create per-user ADT HTTP client with ephemeral cert (already in `ForUser()`)
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
| **Status** | Basic logging exists (verbose mode), needs structured format |

**What:** Structured JSON audit log for every MCP tool call, including:
- Timestamp, correlation ID (MCP session ID)
- Authenticated user (from OIDC token)
- Tool name, action, target object
- SAP user used (service account or propagated user)
- Result (success/error), duration
- Client info (from MCP initialize)

**Implementation:**
- Replace ad-hoc `log.Printf` with structured logger (Go `slog` package, zero dependencies)
- Add correlation ID from MCP session headers
- Add user context from OIDC middleware
- Support log output to stderr (default), file, or syslog
- Field-level redaction for sensitive data (passwords, tokens)

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
- Go stdlib `golang.org/x/time/rate` (single dependency, well-maintained)
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
| **Status** | Not started |

**What:** MCP clients like Claude Desktop, Cursor, and MCP Inspector perform OAuth2 authorization code flow using RFC 8414 discovery (`/.well-known/oauth-authorization-server`). They expect all OAuth endpoints to live at the MCP server's own URL. But XSUAA's authorize/token endpoints are on a different domain and don't understand MCP-specific OAuth parameters. ARC-1 needs to proxy the OAuth flow.

**The problem (learned from [lemaiwo/btp-sap-odata-to-mcp-server](https://github.com/lemaiwo/btp-sap-odata-to-mcp-server)):**
- MCP clients discover OAuth via `/.well-known/oauth-authorization-server` on the MCP server
- MCP clients send `redirect_uri` pointing back to themselves (e.g., `http://localhost:6274/...` for MCP Inspector, `cursor://...` for Cursor)
- XSUAA only accepts redirect URIs registered in `xs-security.json` — it cannot dynamically accept MCP client redirect URIs
- PKCE `code_challenge` parameters from MCP clients are not forwarded through XSUAA's redirect chain

**Solution — OAuth Proxy Pattern (6 endpoints):**
1. `/.well-known/oauth-authorization-server` — RFC 8414 metadata pointing to ARC-1's own `/oauth/*` endpoints (not XSUAA's)
2. `GET /oauth/authorize` — Receives MCP client's OAuth request, stores `redirect_uri` + `state` + `code_challenge` in memory, redirects browser to XSUAA's real authorize endpoint with ARC-1's `/oauth/callback` as redirect_uri
3. `GET /oauth/callback` — Receives authorization code from XSUAA, retrieves stored MCP state, redirects back to MCP client's original `redirect_uri`
4. `POST /oauth/token` — Exchanges authorization code with XSUAA for tokens (pass-through)
5. `POST /oauth/client-registration` — RFC 7591 static client registration returning XSUAA `clientid`/`clientsecret`
6. `/.well-known/oauth-protected-resource` — RFC 9728 metadata (already implemented)

**Key configuration (xs-security.json redirect URIs):**
```json
{
  "redirect-uris": [
    "https://*.cfapps.*.hana.ondemand.com/**",
    "https://claude.ai/api/mcp/auth_callback",
    "http://localhost:6274/**",
    "cursor://anysphere.cursor-retrieval/**"
  ]
}
```

**Why this is separate from SEC-01/SEC-02:** SEC-01 and SEC-02 use Entra ID as the IdP (works for Copilot Studio). SEC-07 uses BTP XSUAA as the IdP (works for Claude Desktop, Cursor, MCP Inspector, and any MCP client that supports RFC 8414 discovery). Both can coexist — ARC-1 would detect which IdP issued the token based on the issuer URL.

**vs. current Copilot Studio approach:** Copilot Studio uses a custom Power Automate connector with direct Entra ID OAuth — it doesn't use MCP's RFC 8414 discovery. So the current Phase 2 Entra ID approach works for Copilot Studio. SEC-07 is needed for native MCP clients that use the MCP spec's built-in OAuth discovery.

**Reference implementation:** [lemaiwo/btp-sap-odata-to-mcp-server](https://github.com/lemaiwo/btp-sap-odata-to-mcp-server) — TypeScript implementation with `@sap/xssec` for JWT validation, in-memory state store with 10-min expiry, dual destination pattern (technical user for discovery, user JWT for execution).

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

**What:** Run ATC checks with ABAP Cloud check variant to assess whether code is cloud-ready. Combined with the native ABAP linter (already in `pkg/abaplint/`), provide a comprehensive clean core compliance report.

**Why:** AWS ABAP Accelerator has this as a key feature. No other MCP server combines ATC cloud checks with a native Go-based linter.

---

## 🏗️ Infrastructure & Operations

### OPS-01: Structured JSON Logging
| Field | Value |
|-------|-------|
| **Priority** | 🟠 P1 |
| **Effort** | S (1–2 days) |
| **Risk** | Low |
| **Usefulness** | High — required for cloud-native operations |
| **Status** | Not started |

**What:** Replace `log.Printf` with Go `slog` structured logging. JSON output for cloud deployments (CF, Kubernetes), text output for local dev. Include correlation IDs, user context, timing.

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
| **Effort** | S (1–2 days) |
| **Risk** | Low |
| **Usefulness** | High — automated testing and image publishing |
| **Status** | Manual build and push |

**What:** GitHub Actions workflow for:
- Run `go test ./...` on every PR
- Build and push Docker image on every tag (`v*`)
- Multi-platform builds (amd64 + arm64)
- SBOM generation for supply chain security

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

### CLEAN-01: Remove Experimental Packages
| Field | Value |
|-------|-------|
| **Priority** | 🟡 P2 |
| **Effort** | M (3–5 days) |
| **Risk** | Low — no functional regressions, all experimental |
| **Usefulness** | Medium — smaller binary, clearer codebase |
| **Status** | Not started |

**What:** Remove packages that were experimental and aren't needed for the enterprise connector:
- `pkg/wasmcomp/` (WASM self-hosting experiment, ~4K LOC)
- `pkg/ts2abap/` (TypeScript→Go transpiler, ~900 LOC)
- `pkg/scripting/` (Lua scripting engine, ~500 LOC)
- `internal/lsp/` (LSP server experiment, ~960 LOC)

**Keep:**
- `pkg/abaplint/` — native ABAP lexer, used for clean core checking
- `pkg/ctxcomp/` — context compression, used for large codebase analysis
- `pkg/cache/` — caching, used for Docker/cloud deployments
- `pkg/dsl/` — fluent API, used internally

---

### CLEAN-02: Reduce CLI Surface
| Field | Value |
|-------|-------|
| **Priority** | 🟢 P3 |
| **Effort** | S (1–2 days) |
| **Risk** | Low |
| **Usefulness** | Low — CLI is secondary to MCP server |
| **Status** | Not started |

**What:** Keep minimal CLI for debugging/admin: `arc1 config`, `arc1 search`, `arc1 source`. Remove DevOps CLI commands (compile, execute, deploy, lint, parse, graph, deps, query, grep).

---

## Prioritized Execution Order

### Phase A: Enterprise Security (Weeks 1–3)
1. **SEC-04** Audit Logging (P1, S)
2. **OPS-01** Structured JSON Logging (P1, S)
3. **SEC-01** Principal Propagation end-to-end (P0, L)
4. **DOC-02** Basis Admin Security Guide (P1, S)

### Phase B: Feature Completeness (Weeks 4–6)
5. **FEAT-01** Where-Used Analysis (P1, XS)
6. **FEAT-02** API Release Status (P1, S)
7. **DOC-01** End-to-End Copilot Studio Guide (P1, S)
8. **OPS-04** GitHub Actions CI/CD (P2, S)

### Phase C: Enterprise Hardening (Weeks 7–10)
9. **SEC-07** XSUAA OAuth Proxy for Claude/Cursor/MCP Inspector (P1, L)
10. **SEC-02** BTP Cloud Connector Principal Propagation (P1, M)
11. **SEC-05** Rate Limiting (P2, S)
12. **SEC-06** Tool Restriction by User Role (P2, M)
13. **SEC-03** S_DEVELOP Authorization Awareness (P2, S)

### Decision Point: Go vs TypeScript Rewrite (Week 10)
- Evaluate **STRAT-01** based on Phase A–C learnings and customer/community feedback
- If BTP-native is the primary target → start TypeScript rewrite
- If local-first is equally important → continue Go

### Phase D: Advanced Features (Weeks 11+)
14. **FEAT-06** Cloud Readiness Assessment (P2, M)
15. **FEAT-03** Enhancement Framework (P2, M)
16. **FEAT-04** DDIC Object Support (P2, M)
17. **CLEAN-01** Remove Experimental Packages (P2, M)
18. **OPS-03** Multi-System Routing (P3, L)
19. **FEAT-05** Code Refactoring (P3, L)

---

## Competitive Landscape

| Competitor | Language | Tools | Auth | Safety | Deployment | Key Advantage |
|-----------|---------|-------|------|--------|------------|---------------|
| **ARC-1** | Go | 11 intent-based | API Key, OAuth/OIDC, Principal Propagation | Read-only, pkg filter, op filter, transport guard | Docker, BTP CF, local | Single binary, native linter, safety system, HTTP Streamable |
| SAP ABAP Add-on MCP | ABAP | ~10 | SAP native | SAP authorization | Runs inside SAP | No proxy needed, SAP-native auth |
| lemaiwo/btp-sap-odata-to-mcp-server | TypeScript | ~10 | XSUAA OAuth proxy | XSUAA roles | BTP CF (MTA) | XSUAA OAuth proxy, SAP Cloud SDK, principal propagation via Destination Service |
| mario-andreschak/mcp-abap-adt | TypeScript | ~20 | Basic | None | Node.js | Uses established abap-adt-api library |
| AWS ABAP Accelerator | Python | ~15 | OAuth | Basic | AWS Lambda | Cloud readiness assessment, migration |
| SAP Joule for Developers | SAP-internal | N/A | SAP | SAP | BAS/ADT | SAP's own AI, trained on ABAP LLM |
| GitHub Copilot for ABAP | N/A | N/A | GitHub | N/A | Eclipse plugin | Inline completions, chat |

**ARC-1 differentiators:**
1. Only Go single-binary (no runtime dependencies)
2. Only one with comprehensive safety system (read-only, package filter, operation filter, transport guard)
3. Only one with native ABAP lexer/linter (no network call needed)
4. Only one with HTTP Streamable transport (Copilot Studio compatible)
5. Only one with principal propagation for per-user SAP auth via external IdP
6. Only one with intent-based tool design optimized for mid-tier LLMs (11 tools vs 20+)

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

## 🔄 Strategic: TypeScript Rewrite Evaluation

### STRAT-01: Evaluate TypeScript/Node.js Rewrite
| Field | Value |
|-------|-------|
| **Priority** | 🟡 P2 (evaluate now, decide after Phase B) |
| **Effort** | XL (4–8 weeks for full rewrite) |
| **Risk** | High — major effort, but mitigated by existing test suite |
| **Usefulness** | Very High if it enables better BTP integration and ecosystem alignment |
| **Status** | Under evaluation |

**Context:** Multiple signals suggest TypeScript might be a better fit for ARC-1's enterprise connector role:
- Wouter Lemaire (BTP expert) recommended converting to TypeScript/Node.js
- The reference XSUAA MCP proxy ([lemaiwo/btp-sap-odata-to-mcp-server](https://github.com/lemaiwo/btp-sap-odata-to-mcp-server)) is TypeScript
- The established ADT client library ([marcellourbani/abap-adt-api](https://github.com/niclas-niclas/abap-adt-api)) is TypeScript with 5+ years of maturity
- SAP's official MCP SDK support, BTP buildpacks, and `@sap/xssec` + `@sap-cloud-sdk/*` are all Node.js-first
- The `@modelcontextprotocol/sdk` has first-class TypeScript support with `StreamableHTTPServerTransport`

**Arguments FOR TypeScript rewrite:**

| Advantage | Impact |
|-----------|--------|
| **SAP Cloud SDK** (`@sap-cloud-sdk/connectivity`, `@sap-cloud-sdk/http-client`) | Destination Service, principal propagation, multi-system routing — all built-in, zero custom code |
| **@sap/xssec** | XSUAA JWT validation, security context, role checking — battle-tested library |
| **@sap/xsenv** | VCAP_SERVICES parsing — one-liner instead of custom Go code |
| **MCP SDK** (`@modelcontextprotocol/sdk`) | StreamableHTTPServerTransport, session management, tool registration — official SDK |
| **abap-adt-api** | 200+ ADT operations already implemented, including refactoring, enhancements, DDIC — years of edge case handling |
| **BTP buildpack** | `nodejs_buildpack` is native on BTP CF — no Docker image needed |
| **Community** | SAP developer community is overwhelmingly TypeScript/JavaScript |
| **AI tooling** | Claude, Copilot, etc. generate better TypeScript than Go for SAP-adjacent code |

**Arguments AGAINST TypeScript rewrite:**

| Disadvantage | Impact |
|-------------|--------|
| **Runtime dependency** | Node.js runtime required (not a single binary) |
| **Native ABAP lexer** | `pkg/abaplint/` is a Go port — would need to use the original TypeScript `@abaplint/core` (which is larger but more complete) |
| **Safety system** | 25+ unit tests, operation filtering, package restrictions — all need porting |
| **250+ unit tests** | All need rewriting (but TypeScript test frameworks are mature) |
| **CGO/SQLite cache** | Would switch to better-sqlite3 or drop SQLite (in-memory only) |
| **Performance** | Go is faster for CPU-bound work (lexer), but MCP is I/O-bound (HTTP to SAP) — negligible difference |
| **Effort** | 4–8 weeks of focused work |

**Rewrite strategy (if decided):**

1. **Week 1–2: Foundation** — Set up TypeScript project with `@modelcontextprotocol/sdk`, Express, `@sap/xssec`, `@sap-cloud-sdk/connectivity`. Implement MCP server skeleton with HTTP Streamable transport, health endpoint, XSUAA OAuth proxy.

2. **Week 3–4: ADT Client** — Either wrap `abap-adt-api` or port key operations from Go. The 11 intent-based tools need: GetSource, SearchObject, WriteSource, SyntaxCheck, Activate, FindDefinition, FindReferences, RunQuery, GetTableContents, GetCallGraph, GetSystemInfo, GetFeatures, plus safety checks.

3. **Week 5–6: Safety + Auth** — Port safety system (read-only, operation filter, package filter). Wire XSUAA auth, Entra ID auth, principal propagation via SAP Cloud SDK.

4. **Week 7–8: Testing + Deploy** — Port unit tests, integration tests. MTA deployment to BTP CF. Docker image for non-BTP deployments.

**Decision criteria:**
- If BTP + XSUAA + SAP Cloud SDK integration is the primary deployment target → **TypeScript is significantly easier** (weeks of custom Go code replaced by one-line SDK calls)
- If single-binary local deployment for developers remains equally important → **Keep Go** (or maintain both)
- If the `abap-adt-api` library covers 80%+ of needed ADT operations → **TypeScript saves months** of ADT endpoint implementation

**Recommendation:** Complete Phase A and B in Go first (they're nearly done). Then evaluate based on customer feedback whether BTP-native deployment or local-first deployment is more important. If BTP wins, start TypeScript rewrite. If local-first wins, keep Go.

---

## Previously Completed (v1.x–v2.32)

These phases from the original roadmap are **completed** and form the foundation:

| Phase | Description | Status |
|-------|-------------|--------|
| Phase 1: Foundation | ADT client, MCP server, CRUD, syntax check, activation | ✅ Complete |
| Phase 2: Code Intelligence | Find def/refs, call graph, CDS deps, RAP OData E2E | ✅ Complete |
| Phase 3: Debugging & Diagnostics | External debugger, short dumps, profiler, SQL traces | ✅ Complete |
| Phase 4: Advanced Analysis | Transport mgmt, UI5/BSP, AMDP debugger, WebSocket | ✅ Complete |
| Phase 5: TAS-Style Debugging | Lua scripting, variable history, checkpoints, replay | ✅ Complete |
| Enterprise Rename | vsp → ARC-1, 11 intent-based tools | ✅ Complete |
| Auth Phase 1: API Key | VSP_API_KEY header validation | ✅ Complete |
| Auth Phase 2: OAuth/OIDC | Entra ID JWT validation, RFC 9728 metadata | ✅ Complete |
| Auth Phase 4: BTP CF | Docker deployment, Destination Service, Cloud Connector | ✅ Complete |

---

*This roadmap is a living document. Priorities may shift based on community feedback and enterprise requirements.*
