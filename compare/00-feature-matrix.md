# Cross-Project Feature Matrix

A comprehensive comparison of all SAP ADT/MCP projects against ARC-1.

_Last updated: 2026-04-17 (FEAT-20 implemented: VERSIONS/VERSION_SOURCE SAPRead support; FEAT-10 implemented: ADT PrettyPrint + formatter settings via SAPLint; FEAT-49 implemented: object → transport reverse lookup via `SAPTransport(action="history")`; FEAT-33 implemented: CDS impact analysis via `SAPContext(action="impact")`; FEAT-43 implemented: AUTH/FTG2/ENHO SAPRead support; PR #134 merged 2026-04-16: SKTD read/write (Knowledge Transfer Documents); COMPAT-01 fixed 2026-04-16: `lockObject()` now guards on `MODIFICATION_SUPPORT=false`; COMPAT-02 fixed 2026-04-16: CSRF HEAD 403 fallback to GET in `http.ts`; COMPAT-03 already fixed 2026-04-15 in PR #130 (`9b0601c`) via V4 SRVB publish endpoint support; fr0ster v6.1.0 and dassian-adt deep analysis updates retained)_

## Legend
- ✅ = Supported
- ⚠️ = Partial / Limited
- ❌ = Not supported
- N/A = Not applicable

---

## 1. Core Architecture

| Feature | ARC-1 | vibing-steampunk | mcp-abap-abap-adt-api | mcp-abap-adt (mario) | AWS Accelerator | fr0ster | btp-odata-mcp | dassian-adt / abap-mcpb | sapcli |
|---------|-------|-----------------|----------------------|---------------------|-----------------|---------|---------------|------------------------|--------|
| Language | TypeScript | Go 1.24 | TypeScript | TypeScript | Python 3.12 | TypeScript | TypeScript | JavaScript (compiled TS) | Python 3.10+ |
| Tool count | 11 intent-based | 1-99 (3 modes) | ~15 | 13 | 15 | 316 (4 tiers) | 3 (hierarchical) | 53 | 28+ CLI commands (not MCP) |
| ADT client | Custom (undici/fetch) | Custom (Go) | abap-adt-api | Custom (axios) | Custom (aiohttp) | Custom (axios) | SAP Cloud SDK | abap-adt-api | Custom (requests) |
| npm package | ✅ `arc-1` | ❌ (binary) | ❌ | ❌ | ❌ | ✅ `@mcp-abap-adt/core` | ❌ | ❌ (MCPB) | N/A (Python, git install) |
| Docker image | ✅ ghcr.io | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Stars | — | 279 | 109 | 103 | 33 | 35 | 120 | 33 | 79 |
| Active development | ✅ | ✅ Very (v2.39+) | ❌ Dormant (Jan 2025) | ❌ Dormant | ⚠️ Stale (Mar 2026) | ✅ Very (v6.1.0) | ⚠️ Dormant (Jan 2026) | ⚠️ Stable (53 tools, no commits since Apr 14) | ✅ Very (since 2018) |
| Release count | — | 32+ | — | — | — | 95+ (5 months) | — | rolling | rolling "latest" |
| NPM monthly downloads | — | N/A | — | — | — | 3,625 | — | N/A | N/A |

## 2. MCP Transport

| Transport | ARC-1 | vibing-steampunk | mcp-abap-abap-adt-api | mcp-abap-adt (mario) | AWS Accelerator | fr0ster | btp-odata-mcp | dassian-adt / abap-mcpb | sapcli |
|-----------|-------|-----------------|----------------------|---------------------|-----------------|---------|---------------|------------------------|--------|
| stdio | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | N/A (CLI) |
| HTTP Streamable | ✅ | ✅ (v2.38.0) | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | N/A |
| SSE | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ⚠️ | ❌ | N/A |
| TLS/HTTPS | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ (v4.6.0) | ❌ | ❌ | N/A |

## 3. Authentication

| Auth Method | ARC-1 | vibing-steampunk | mcp-abap-abap-adt-api | mcp-abap-adt (mario) | AWS Accelerator | fr0ster | btp-odata-mcp | dassian-adt / abap-mcpb | sapcli |
|-------------|-------|-----------------|----------------------|---------------------|-----------------|---------|---------------|------------------------|--------|
| Basic Auth | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| Cookie-based | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ (requests.Session) |
| API Key (MCP) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | N/A |
| OIDC/JWT (MCP) | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ |
| XSUAA OAuth | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ (Apr 2026) | ❌ |
| BTP Service Key | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Principal Propagation | ✅ | ❌ | ❌ | ❌ | ✅ (X.509) | ✅ | ✅ | ❌ | ❌ |
| MCP OAuth 2.0 per-user | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ (Apr 2026) | ❌ |
| SAML | ❌ | ✅ (v2.39.0+, PR #97) | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
| X.509 Certificates | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Device Flow (OIDC) | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Browser login page | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ | ❌ |
| Auth providers total | 4 | 2 | 1 | 1 | 5+ | 9 | 2 | 4 | 1 (Basic) |

## 4. Safety & Security

| Safety Feature | ARC-1 | vibing-steampunk | mcp-abap-abap-adt-api | mcp-abap-adt (mario) | AWS Accelerator | fr0ster | btp-odata-mcp | dassian-adt / abap-mcpb | sapcli |
|----------------|-------|-----------------|----------------------|---------------------|-----------------|---------|---------------|------------------------|--------|
| Read-only mode | ✅ | ✅ | ❌ | N/A (read-only) | ❌ | ⚠️ exposition tiers | ❌ | ❌ | ❌ |
| Op whitelist/blacklist | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Package restrictions | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Block free SQL | ✅ | ✅ | ❌ | ❌ | N/A | ❌ | ❌ | ❌ | ❌ |
| Transport gating | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Dry-run mode | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Audit logging | ✅ | ❌ | ❌ | ❌ | ✅ (CloudWatch) | ❌ | ❌ | ❌ | ❌ |
| Input sanitization | ✅ (Zod) | ✅ | ❌ | ⚠️ | ✅ (defusedxml) | ✅ (Zod) | ✅ (Zod) | ⚠️ | ⚠️ (argparse) |
| MCP elicitation | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ (10+ flows) | N/A |
| Try-finally lock safety | ✅ | ✅ | ❌ | N/A | ✅ | ✅ (v4.5.0) | N/A | ⚠️ (abap-adt-api) | ✅ |
| MCP scope system (OAuth) | ✅ (2D: scopes+roles+safety) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | N/A |

## 5. ABAP Read Operations

| Read Feature | ARC-1 | vibing-steampunk | mcp-abap-abap-adt-api | mcp-abap-adt (mario) | AWS Accelerator | fr0ster | btp-odata-mcp | dassian-adt / abap-mcpb | sapcli |
|-------------|-------|-----------------|----------------------|---------------------|-----------------|---------|---------------|------------------------|--------|
| Programs (PROG) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | N/A | ✅ | ✅ |
| Classes (CLAS) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | N/A | ✅ | ✅ (incl. locals, test) |
| Interfaces (INTF) | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | N/A | ✅ | ✅ |
| Function modules (FUNC) | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | N/A | ✅ | ✅ (auto-group) |
| Function groups (FUGR) | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | N/A | ✅ (bulk) | ✅ |
| Includes (INCL) | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | N/A | ✅ | ✅ |
| CDS views (DDLS) | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | N/A | ✅ | ✅ |
| Behavior defs (BDEF) | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ | N/A | ✅ | ✅ |
| Service defs (SRVD) | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | N/A | ✅ | ✅ |
| Service bindings (SRVB) | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ | N/A | ❌ | ✅ |
| Tables (DDIC) | ✅ | ✅ | ✅ | ✅ | ⚠️ | ✅ | N/A | ✅ | ✅ |
| Table contents | ✅ | ✅ | ✅ | ⚠️ Z-service | ❌ | ✅ | N/A | ✅ | ✅ (freestyle SQL) |
| Packages (DEVC) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | N/A | ✅ | ✅ |
| Metadata ext (DDLX) | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | N/A | ❌ | ❌ |
| Structures | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | N/A | ❌ | ✅ |
| Domains | ✅ | ❌ | ✅ | ⚠️ | ❌ | ✅ | N/A | ❌ | ⚠️ (PR #149 in progress) |
| Data elements | ✅ | ❌ | ✅ | ⚠️ | ❌ | ✅ | N/A | ❌ | ✅ |
| Enhancements (BAdI/ENHO) | ✅ (`GET /sap/bc/adt/enhancements/enhoxhb/{name}`) | ❌ | ❌ | ❌ | ❌ | ✅ (on-prem only; `GET /sap/bc/adt/programs/programs/{name}/source/main/enhancements/elements` + `GET /sap/bc/adt/enhancements/enhsxsb/{spot}`) | N/A | ❌ | ✅ (BAdI/enhancement impl) |
| Authorization fields (AUTH) | ✅ (`GET /sap/bc/adt/aps/iam/auth/{name}`) | ❌ | ❌ | ❌ | ❌ | ❌ | N/A | ❌ | ✅ (`GET /sap/bc/adt/aps/iam/auth/{name}`) |
| Feature toggles (FTG2) | ✅ (states only, `GET /sap/bc/adt/sfw/featuretoggles/{name}/states`) | ❌ | ❌ | ❌ | ❌ | ❌ | N/A | ❌ | ✅ (states + toggle/check/validate) |
| Source version history | ✅ (`VERSIONS` list + `VERSION_SOURCE` fetch via `GET {sourceUrl}/versions` Atom feed) | ✅ (3 tools: list/compare/get) | ✅ (`revisions()` + `getObjectSource(url, {version})`) | ❌ | ❌ | ❌ | N/A | ✅ (`abap_get_revisions` list-only) | ❌ |
| Transactions | ✅ | ✅ | ❌ | ✅ | ❌ | ✅ | N/A | ❌ | ❌ |
| Free SQL | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | N/A | ✅ | ✅ |
| System info / components | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | N/A | ❌ | ✅ |
| BOR business objects | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | N/A | ❌ | ❌ |
| Messages (T100) | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | N/A | ❌ | ❌ |
| Text elements | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | N/A | ❌ | ❌ |
| Variants | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | N/A | ❌ | ❌ |
| Structured class decomposition (metadata + includes) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | N/A | ❌ | ✅ (locals_def/imp/test/macros) |
| GetProgFullCode (include traversal) | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ (on-prem only; `GET /sap/bc/adt/repository/nodestructure?objecttype=PROG/P&objectname={name}` + recursive INCL fetch) | N/A | ❌ | ❌ |
| SKTD (Knowledge Transfer Documents) | ✅ (merged PR #134 2026-04-16; `GET/PUT/POST /sap/bc/adt/documentation/ktd/documents/`) | ❌ | ❌ | ❌ | ❌ | ❌ | N/A | ❌ | ❌ |

## 6. Write / CRUD Operations

| Write Feature | ARC-1 | vibing-steampunk | mcp-abap-abap-adt-api | mcp-abap-adt (mario) | AWS Accelerator | fr0ster | btp-odata-mcp | dassian-adt / abap-mcpb | sapcli |
|--------------|-------|-----------------|----------------------|---------------------|-----------------|---------|---------------|------------------------|--------|
| Create objects | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | N/A | ✅ | ✅ |
| Update source | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | N/A | ✅ | ✅ |
| Delete objects | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | N/A | ✅ | ❌ |
| Activate | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | N/A | ✅ | ✅ |
| Batch activate | ✅ | ✅ | ✅ | ❌ | ✅ (with dep resolution) | ✅ | N/A | ✅ (v2.0, Apr 2026) | ✅ (mass activation) |
| Lock/unlock | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | N/A | ✅ | ✅ |
| EditSource (surgical) | ✅ (edit_method) | ✅ | ❌ | ❌ | ❌ | ❌ | N/A | ✅ (edit_method, Apr 2026) | ❌ |
| CloneObject | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | N/A | ❌ | ❌ |
| Execute ABAP | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ | N/A | ✅ | ✅ (abap run) |
| RAP CRUD (BDEF, SRVD, DDLX, SRVB) | ✅ (DDLS, DDLX, DCLS, BDEF, SRVD, SRVB write) | ⚠️ (some) | ❌ | ❌ | ✅ (BDEF, SRVD, SRVB) | ✅ (all incl. DDLX) | N/A | ⚠️ (BDEF create, SRVB publish) | ⚠️ (DDLS, DCL, BDEF write; SRVB publish) |
| Domain write (DOMA) | ✅ | ❌ | ✅ | ❌ | ❌ | ✅ | N/A | ❌ | ✅ (PR #149 merged) |
| Data element write (DTEL) | ✅ | ❌ | ✅ | ❌ | ❌ | ✅ | N/A | ❌ | ✅ |
| Multi-object batch creation | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | N/A | ❌ | ❌ |
| AFF schema validation (pre-create) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | N/A | ❌ | ❌ |
| Type auto-mappings (CLAS→CLAS/OC) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | N/A | ✅ | ✅ (ADTObjectType) |
| Create test class | ❌ | ✅ | ❌ | ❌ | ✅ | ✅ | N/A | ✅ (abap_create_test_include) | ✅ (class write test_classes) |
| Table write (TABL) | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | N/A | ✅ | ✅ |
| Package create (DEVC) | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | N/A | ✅ | ✅ |
| Service binding create (SRVB) | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ | N/A | ❌ | ✅ |
| Message class write (MSAG) | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | N/A | ❌ | ✅ |
| DCL write (DCLS) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | N/A | ❌ | ✅ |
| SKTD write (Knowledge Transfer Docs) | ✅ (merged PR #134 2026-04-16; base64 Markdown in XML envelope; create requires refObjectType) | ❌ | ❌ | ❌ | ❌ | ❌ | N/A | ❌ | ❌ |

## 7. Code Intelligence

| Feature | ARC-1 | vibing-steampunk | mcp-abap-abap-adt-api | mcp-abap-adt (mario) | AWS Accelerator | fr0ster | btp-odata-mcp | dassian-adt / abap-mcpb | sapcli |
|---------|-------|-----------------|----------------------|---------------------|-----------------|---------|---------------|------------------------|--------|
| Find definition | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | N/A | ✅ (Apr 2026) | ❌ |
| Find references | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | N/A | ✅ | ✅ (where-used with scope) |
| Code completion | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | N/A | ❌ | ❌ |
| Context compression | ✅ (SAPContext, 7-30x) | ✅ (auto, 7-30x) | ❌ | ❌ | ❌ | ❌ | N/A | ❌ | ❌ |
| Method-level surgery | ✅ (95% reduction) | ✅ (95% reduction) | ❌ | ❌ | ❌ | ❌ | N/A | ❌ | ❌ |
| ABAP AST / parser | ⚠️ (abaplint for lint) | ✅ (native Go port) | ❌ | ❌ | ❌ | ✅ | N/A | ❌ | ❌ |
| Semantic analysis | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | N/A | ❌ | ❌ |
| Call graph analysis | ❌ | ✅ (5 tools) | ❌ | ❌ | ❌ | ❌ | N/A | ❌ | ❌ |
| Type hierarchy | ✅ (via SQL) | ✅ | ❌ | ❌ | ❌ | ❌ | N/A | ❌ | ❌ |
| CDS dependencies | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | N/A | ❌ | ❌ |

## 8. Code Quality

| Feature | ARC-1 | vibing-steampunk | mcp-abap-abap-adt-api | mcp-abap-adt (mario) | AWS Accelerator | fr0ster | btp-odata-mcp | dassian-adt / abap-mcpb | sapcli |
|---------|-------|-----------------|----------------------|---------------------|-----------------|---------|---------------|------------------------|--------|
| Syntax check | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | N/A | ✅ | ✅ |
| ATC checks | ✅ | ✅ | ✅ | ❌ | ✅ (with summary) | ❌ | N/A | ✅ (severity grouping) | ✅ (checkstyle/codeclimate) |
| abaplint (local offline) | ✅ | ✅ (native Go port, 8 rules) | ❌ | ❌ | ❌ | ❌ | N/A | ❌ | ❌ |
| Unit tests | ✅ | ✅ | ✅ | ❌ | ✅ (with coverage) | ✅ | N/A | ✅ (Apr 2026) | ✅ (with coverage + JUnit4/sonar) |
| CDS unit tests | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | N/A | ❌ | ❌ |
| API release state (clean core) | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | N/A | ❌ | ❌ |
| Fix proposals | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | N/A | ✅ (Apr 2026) | ❌ |
| PrettyPrint | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | N/A | ✅ (Apr 2026) | ❌ |
| Migration analysis | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | N/A | ❌ | ❌ |

## 9. Transport / CTS

| Feature | ARC-1 | vibing-steampunk | mcp-abap-abap-adt-api | mcp-abap-adt (mario) | AWS Accelerator | fr0ster | btp-odata-mcp | dassian-adt / abap-mcpb | sapcli |
|---------|-------|-----------------|----------------------|---------------------|-----------------|---------|---------------|------------------------|--------|
| List transports | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | N/A | ✅ | ✅ (-r/-rr/-rrr detail) |
| Create transport | ✅ (K/W/T) | ✅ | ✅ | ❌ | ❌ | ✅ | N/A | ✅ | ✅ (5 types: K/W/T/S/R) |
| Release transport | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | N/A | ✅ | ✅ (recursive) |
| Recursive release | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | N/A | ❌ | ✅ (recursive) |
| Delete transport | ✅ (recursive) | ❌ | ❌ | ��� | ❌ | ❌ | N/A | ❌ | ✅ |
| Transport contents | ⚠️ (forward lookup: `SAPTransport get`) | ❌ | ✅ | ❌ | ❌ | ❌ | N/A | ✅ | ✅ (-rrr objects) |
| Object → transport reverse lookup | ✅ (history action) | ❌ | ⚠️ (URI resolve only) | ❌ | ❌ | ❌ | N/A | ⚠️ (URI resolve only) | ❌ |
| Transport assign | ✅ (reassign owner) | ❌ | ❌ | ❌ | ❌ | ❌ | N/A | ✅ | ✅ (reassign owner) |
| Transport gating | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | N/A | ❌ | ❌ |
| Inactive objects list | ✅ | ✅ | ��� | ❌ | ❌ | ✅ | N/A | ❌ | ✅ |

## 10. Diagnostics & Runtime

| Feature | ARC-1 | vibing-steampunk | mcp-abap-abap-adt-api | mcp-abap-adt (mario) | AWS Accelerator | fr0ster | btp-odata-mcp | dassian-adt / abap-mcpb | sapcli |
|---------|-------|-----------------|----------------------|---------------------|-----------------|---------|---------------|------------------------|--------|
| Short dumps (ST22) | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | N/A | ✅ | ❌ |
| ABAP profiler traces | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | N/A | ✅ (8 tools: list/params/config/hit-list/statements/db-access/delete×2) | ❌ |
| System messages (SM02) | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ (v5.0.0) | N/A | ❌ | ❌ |
| Gateway error log (IWFND) | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ (v5.0.0, on-prem) | N/A | ❌ | ❌ |
| ADT feed reader (unified) | ⚠️ (dumps+traces) | ❌ | ❌ | ❌ | ❌ | ✅ (v5.0.0, 5 types) | N/A | ❌ | ❌ |
| SQL traces | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | N/A | ❌ | ❌ |
| ABAP debugger | ❌ | ✅ (8 tools) | ✅ | ❌ | ❌ | ❌ | N/A | ❌ | ❌ |
| AMDP/HANA debugger | ❌ | ✅ (7 tools) | ❌ | ❌ | ❌ | ❌ | N/A | ❌ | ❌ |
| Execute with profiling | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | N/A | ❌ | ❌ |

## 11. Advanced Features

| Feature | ARC-1 | vibing-steampunk | mcp-abap-abap-adt-api | mcp-abap-adt (mario) | AWS Accelerator | fr0ster | btp-odata-mcp | dassian-adt / abap-mcpb | sapcli |
|---------|-------|-----------------|----------------------|---------------------|-----------------|---------|---------------|------------------------|--------|
| Feature auto-detection | ✅ (7 probes + ADT discovery/MIME) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ (ADT discovery/MIME) |
| Caching (SQLite) | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| UI5/Fiori BSP | ❌ | ⚠️ (3 read-only; 4 write tools disabled — ADT filestore returns 405) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ (OData upload/download) |
| abapGit/gCTS | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | N/A | ✅ | ✅ (full gCTS + checkout/checkin) |
| BTP Destination Service | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ |
| Cloud Connector proxy | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| Multi-system support | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ (SAP UI Landscape XML, Apr 2026) | ✅ (kubeconfig contexts) |
| OData bridge | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ (BSP, FLP via OData) |
| Lua scripting engine | ❌ | ✅ (50+ bindings) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| WASM-to-ABAP compiler | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| MCP client configurator | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ (11 clients) | ❌ | ❌ | ❌ |
| CLI mode (non-MCP) | ❌ | ✅ (28 commands) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ (28+ commands, primary mode) |
| Health endpoint | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ (v4.3.0) | ❌ | ✅ | ❌ |
| RFC connectivity | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ (sap-rfc-lite) | ❌ | ❌ | ✅ (PyRFC, optional) |
| MCPB one-click install | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| Lock registry / recovery | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Batch HTTP operations | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ (multipart/mixed) | ❌ | ❌ | ❌ |
| RAG-optimized tool descriptions | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ (v4.4.0) | ❌ | ❌ | ❌ |
| Embeddable server (library mode) | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Error intelligence (hints) | ✅ (SAP-domain classification) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ (extensive) | ✅ (typed error hierarchy) |

## 12. Token Efficiency

| Feature | ARC-1 | vibing-steampunk | fr0ster | sapcli |
|---------|-------|-----------------|---------|--------|
| Schema token cost | ~200 (hyperfocused) / ~moderate (11 tools) | ~200 (hyperfocused) / ~14K (focused) / ~40K (expert) | ~high (303 tools) | N/A (CLI) |
| Context compression | ✅ SAPContext (7-30x) | ✅ Auto-append (7-30x) | ❌ | N/A |
| Method-level surgery | ✅ (95% source reduction) | ✅ (95% source reduction) | ❌ | N/A |
| Hyperfocused mode (1 tool) | ✅ (~200 tokens) | ✅ (~200 tokens) | ❌ | N/A |
| Compact/intent mode | ✅ (11 intent tools) | N/A | ✅ (22 compact tools) | N/A |

## 13. Testing & Quality

| Metric | ARC-1 | vibing-steampunk | mcp-abap-abap-adt-api | mcp-abap-adt (mario) | AWS Accelerator | fr0ster | btp-odata-mcp | dassian-adt / abap-mcpb | sapcli |
|--------|-------|-----------------|----------------------|---------------------|-----------------|---------|---------------|------------------------|--------|
| Unit tests | 1315 | 222 | 0 | 0 | 0 | Yes (Jest) | 0 | 163 | ~90 files (unittest) |
| Integration tests | ✅ (on-prem CI + BTP scheduled smoke) | ✅ | ❌ | 13 (live SAP) | ❌ | ✅ | ❌ | ⚠️ scaffold | ✅ (shell scripts) |
| CI/CD | ✅ (release-please + reliability telemetry) | ✅ (GoReleaser) | ❌ | ❌ | ❌ | ⚠️ (Husky + lint-staged) | ❌ | ❌ | ✅ (GitHub Actions + codecov) |
| Input validation | Zod v4 | Custom | Untyped | Untyped | Pydantic | Zod v4 | Zod | Manual | argparse |
| Linter | Biome | — | — | — | — | Biome | — | — | pylint + flake8 + mypy |

---

## Priority Action Items

> All prioritized items with evaluation details are maintained in the [roadmap](../docs/roadmap.md#prioritized-execution-order). The feature matrix tables above are the source of truth for _what exists_; the roadmap is the source of truth for _what to build next and why_.

---

## Corrections from Previous Matrix (2026-03-30)

The following items were incorrectly marked in the previous version and have since been updated:

| Item | 2026-03-30 | 2026-04-01 | 2026-04-02 | Reason |
|------|-----------|-----------|-----------|--------|
| ARC-1 Short dumps (ST22) | ✅ (wrong) | ❌ | ✅ | Implemented in PR #24 (SAPDiagnose dumps action) |
| ARC-1 ABAP profiler | ✅ (wrong) | ❌ | ✅ | Implemented in PR #24 (SAPDiagnose traces action) |
| ARC-1 SQL traces | ✅ (wrong) | ❌ | ❌ | Still not implemented |
| ARC-1 DDLX read | — | ❌ | ✅ | Implemented in PR #22 |
| ARC-1 SRVB read | — | ❌ | ✅ | Implemented in PR #22 |
| ARC-1 Batch activation | — | ⚠️ | ✅ | Implemented in PR #22 |
| ARC-1 RAP CRUD | — | ❌ | ✅ | DDLS/DDLX/BDEF/SRVD write in PR #22 |
| VSP tool count | 1-122 | 1-99 (54 focused, 99 expert per README_TOOLS.md) | Updated from actual tool documentation |
| fr0ster version | v4.5.2 | v4.7.1 → v4.8.1 | Updated to current release (85+ releases) |
| fr0ster TLS support | not listed | ✅ (v4.6.0) | New feature added Mar 31 |
| fr0ster sap-rfc-lite | not listed | ✅ (v4.7.0) | Replaced archived node-rfc |
| dassian column name | dassian-adt | dassian-adt / abap-mcpb | Successor repo albanleong/abap-mcpb created Mar 31 |
| VSP abaplint | ❌ (Go lexer) | ✅ (native Go port, 8 rules) | v2.32.0 added native linter |
| VSP HTTP Streamable | ❌ | ✅ (v2.38.0, mcp-go v0.47.0) | ARC-1 no longer unique on HTTP transport |
| VSP version | v2.32.0 | v2.39.0+ | Massive feature sprint Apr 2-8 (40+ commits) |
| fr0ster version | v4.8.1 | v4.8.7 | Continued iteration |
| fr0ster version | v4.8.7 | v5.0.8 (303 tools) | v5.0.7: 14 activation tools (+14), post-merge naming fix in v5.0.8 |
| fr0ster version | v5.0.8 (303 tools) | v5.1.1 (316 tools) | v5.1.0: 13 Check handlers, Node 22 minimum, stdio log fix, CSRF fix |
| fr0ster version | v5.1.1 (316 tools) | v6.1.0 (~320 tools) | v5.2.0: SRVD/SRVB activate + ServiceBindingVariant. v6.0.0 BREAKING: RuntimeListDumps removed, dump reads via RuntimeListFeeds; UpdateInterface BTP corrNr fix. v6.1.0: RFC decoupled from legacy. |
| dassian-adt | 0 stars, 25 tools, no OAuth | 33 stars, 53 tools, OAuth/XSUAA, multi-system | Explosive growth: 28 new tools, OAuth, multi-system in 2 weeks. No new commits since Apr 14. |
| dassian-adt transport tool count | 6 | 9 | Deep analysis: +transport_set_owner, +transport_add_user, +transport_delete in TransportHandlers.ts |
| dassian-adt trace tools | (unlisted) | 8 (TraceHandlers.ts) | Full profiler workflow: list/params/config/hit-list/statements/db-access/delete/delete-config |
| dassian-adt test include | ❌ | ✅ abap_create_test_include | TestHandlers.ts confirmed in deep analysis 2026-04-16 |
| VSP stars | 273 | 279 | New issues: 103 (SAProuter support), 104 (CSRF HEAD 403 on S/4HANA public cloud) |
| fr0ster stars | 29 | 35 | v6.1.0 |
| sapcli stars | 77 | 79 | PR #149 merged (domain support), PR #147 (auth fields), HTTP refactor |
| VSP lock-handle bug | ⚠️ (ongoing 423 errors) | ✅ (22517d4 — modificationSupport guard) | Root cause fixed in VSP; ARC-1 aligned with COMPAT-01 fix on 2026-04-16 (`lockObject` now checks `MODIFICATION_SUPPORT`/`modificationSupport`). |
| VSP version | v2.39.0+ | v2.40.0+ (Apr 13-15 sprint) | cr-config-audit CLI tools, RecoverFailedCreate primitive, lock-handle fix |
| S/4HANA Public Cloud CSRF | not tracked | ✅ fixed 2026-04-16 | VSP issue #104 confirmed the HEAD incompatibility. ARC-1 now retries CSRF fetch with GET when HEAD returns 403. |
| ARC-1 V4 SRVB publish endpoint | not tracked | ✅ fixed 2026-04-15 (PR #130) | `publishServiceBinding()`/`unpublishServiceBinding()` now use resolved binding type (`odatav2`/`odatav4`) instead of hardcoded v2. |
| ARC-1 SKTD (Knowledge Transfer Documents) | ❌ | ✅ (merged PR #134 2026-04-16) | PR #134 by lemaiwo — full SKTD read/write: `GET/PUT/POST /sap/bc/adt/documentation/ktd/documents/`, base64-decoded Markdown, create requires refObjectType, update preserves server-side metadata. |
| GetProgFullCode (include traversal) availability | ✅ fr0ster | ✅ fr0ster (on-prem only) | fr0ster v6.1.0 deep analysis: uses `GET /sap/bc/adt/repository/nodestructure?objecttype=PROG/P&objectname={name}` + recursive include fetch. NOT available on BTP Cloud (missing node API). |
| fr0ster Enhancements endpoint | noted | documented | fr0ster deep analysis: `GET /sap/bc/adt/programs/programs/{name}/source/main/enhancements/elements` (base64-encoded source, on-prem only); enhancement spot: `GET /sap/bc/adt/enhancements/enhsxsb/{spotName}`; on-prem only. |
| dassian-adt deep analysis | partial | complete | 2026-04-16 deep dive: 9 transport tools (was 6), 8 trace tools, abap_run endpoint `POST /sap/bc/adt/oo/classrun/{name}`, multi-system `sap_system_id` injection, OAuth self-hosted AS with PKCE. New folder: compare/dassian-adt/ |

---

## Competitive Positioning Summary

### ARC-1 Unique Strengths (no other project has all of these)
1. **Intent-based routing** — 11 tools vs 25-303. Simplest LLM decision surface.
2. **Declarative safety system** — Read-only, op filter, pkg filter, SQL blocking, transport gating, dry-run. Most comprehensive.
3. **MCP scope system** — OAuth scope-gated tool access (read/write/admin).
4. **BTP ABAP Environment** — Full OAuth 2.0 browser login, direct connectivity.
5. **Principal propagation** — Per-user SAP identity via Destination Service.
6. **MCP elicitation** — Interactive parameter collection for destructive ops.
7. **Audit logging** — BTP Audit Log sink for compliance.
8. **Context compression** — AST-based dependency extraction with depth control.
9. **npm + Docker + release-please** — Most professional distribution pipeline.

### Biggest Competitive Threats
1. **vibing-steampunk** (279 stars) — Community favorite. Has Streamable HTTP (v2.38.0), SAML SSO (PR #97). Massive Apr sprint: i18n, gCTS, API release state, version history, code coverage, health analysis, rename preview, dead code analysis, package safety hardening, RecoverFailedCreate primitive. Defaults to hyperfocused mode (1 tool). Open issues: OAuth2 BTP request (#99), recurring lock handle bugs (fix in 22517d4), CSRF HEAD 403 on S/4HANA public cloud (#104), SAProuter support (#103).
2. **fr0ster** (v6.1.0, 100+ releases, 35 stars) — Closest enterprise competitor. ~320 tools, 9 auth providers, TLS, RFC, embeddable. v6.0.0 BREAKING: simplified dump API + fixed UpdateInterface on BTP (corrNr bug — not applicable to ARC-1 due to centralized safeUpdateSource). v6.1.0: RFC decoupled from legacy system type. ARC-1 has already aligned on V4 SRVB publish endpoint support (PR #130, 2026-04-15).
3. **dassian-adt** (33 stars, 53 tools) — Stabilized after explosive April sprint (0 → 33 stars, 25 → 53 tools in 2 weeks). OAuth/XSUAA/multi-system/per-user auth all added. Deep analysis (2026-04-16): 9 transport tools, 8 trace tools, abap_create_test_include confirmed. Still no new commits since Apr 14. Lacks: safety system, BTP Destination/PP, caching, linting.
4. **SAP Joule / Official ABAP MCP Server** — SAP announced Q2 2026 GA for ABAP Cloud Extension for VS Code with built-in agentic AI. Initial scope: RAP UI service development. Will reshape landscape — community servers become complementary.
5. **btp-odata-mcp** (120 stars) — Different category (OData not ADT). Dormant since Jan 2026. High stars but no recent development.

### Key Gaps to Close

**Closed gaps:**
- ~~Diagnostics~~ → ST22 + profiler traces (SAPDiagnose)
- ~~RAP completeness~~ → DDLX/SRVB read, DDLS/DDLX/BDEF/SRVD write, batch activation
- ~~DDIC completeness~~ → STRU, DOMA, DTEL, TRAN read
- ~~Token efficiency~~ → method-level surgery, hyperfocused mode, context compression

**Recently merged:**
- ~~**SKTD (Knowledge Transfer Documents)**~~ — **✅ Merged PR #134 (2026-04-16)** by lemaiwo. Full read/write for Markdown docs attached to ABAP objects. Unique to ARC-1 among all competitors.

**P0 — production blockers:**
- ~~415/406 content-type auto-retry (SAP version compatibility)~~ — ✅ Implemented. [Deep dive](fr0ster/evaluations/v4.5.0-release-deep-dive.md)
- ~~ADT service discovery / MIME negotiation (FEAT-38)~~ — ✅ completed 2026-04-14
- ~~401 session timeout auto-retry (centralized gateway idle)~~ — ✅ Implemented in `src/adt/http.ts`
- ~~TLS/HTTPS for HTTP Streamable~~ — downgraded to P3: most deployments use reverse proxy
- ~~**modificationSupport guard in lockObject()**~~ — ✅ fixed 2026-04-16 in `src/adt/crud.ts`. Lock responses with explicit `MODIFICATION_SUPPORT=false`/`modificationSupport=false` now fail early with actionable 423 guidance. [Eval](vibing-steampunk/evaluations/22517d4-lock-handle-bug-class.md)
- ~~**CSRF HEAD fallback for S/4HANA Public Cloud**~~ — ✅ fixed 2026-04-16 in `src/adt/http.ts`. CSRF fetch now retries with GET when HEAD returns 403. [Eval](vibing-steampunk/evaluations/22517d4-lock-handle-bug-class.md) / VSP issue #104
- ~~**V4 SRVB publish endpoint bug**~~ — ✅ fixed 2026-04-15 in PR #130 (`9b0601c`). Publish/unpublish now respect resolved service binding type (`odatav2`/`odatav4`). [Eval](fr0ster/evaluations/51781d3-srvd-srvb-activate-variant.md)
- ~~**BTP transport omission in safeUpdateSource()**~~ — **Likely NOT applicable.** ARC-1's centralized `safeUpdateSource()` already uses `transport ?? (lock.corrNr || undefined)` for all types — fr0ster's bug was per-handler (only `UpdateInterface` was missing it). Verify with BTP INTF update integration test. [Eval](fr0ster/evaluations/c2b8006-dump-simplify-updateintf-fix.md)

**P1 — high-value gaps:**
- Where-Used analysis, fix proposals
- ~~DDIC write (DOMA/DTEL)~~, ~~namespace encoding audit~~, error intelligence
- Type auto-mappings, function group bulk fetch
- Documentation (Copilot Studio guide, Basis Admin guide)

**P2+ — future gaps:**
- System messages (SM02) — AI agent situational awareness. fr0ster v5.0.0 added this.
- Gateway error log (IWFND) — OData/Gateway debugging with source code + call stack. fr0ster v5.0.0, on-prem only.
- SQL traces, PrettyPrint, transport contents, source versions
- Cloud readiness assessment, gCTS/abapGit, enhancement framework
- Multi-system routing, rate limiting
- Dynpro (screen) metadata — ADT endpoint `/sap/bc/adt/programs/programs/<PROG>/dynpros` (abap-adt-api #44)
- RecoverFailedCreate — partial-create recovery on 5xx (VSP f00356a)

**Not planned (intentional):**
- ABAP debugger (WebSocket + ZADT_VSP), execute ABAP (security risk), Lua scripting (VSP-unique)
