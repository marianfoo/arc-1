# Cross-Project Feature Matrix

A comprehensive comparison of all SAP ADT/MCP projects against ARC-1.

_Last updated: 2026-04-01_

## Legend
- ✅ = Supported
- ⚠️ = Partial / Limited
- ❌ = Not supported
- N/A = Not applicable

---

## 1. Core Architecture

| Feature | ARC-1 | vibing-steampunk | mcp-abap-abap-adt-api | mcp-abap-adt (mario) | AWS Accelerator | fr0ster | btp-odata-mcp | dassian-adt / abap-mcpb |
|---------|-------|-----------------|----------------------|---------------------|-----------------|---------|---------------|------------------------|
| Language | TypeScript | Go 1.24 | TypeScript | TypeScript | Python 3.12 | TypeScript | TypeScript | JavaScript (compiled TS) |
| Tool count | 11 intent-based | 1-99 (3 modes) | ~15 | 13 | 15 | 287 (4 tiers) | 3 (hierarchical) | 25 |
| ADT client | Custom (axios) | Custom (Go) | abap-adt-api | Custom (axios) | Custom (aiohttp) | Custom (axios) | SAP Cloud SDK | abap-adt-api |
| npm package | ✅ `arc-1` | ❌ (binary) | ❌ | ❌ | ❌ | ✅ `@mcp-abap-adt/core` | ❌ | ❌ (MCPB) |
| Docker image | ✅ ghcr.io | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Stars | — | 242 | 109 | 103 | 29 | 26 | 119 | 0 (new) |
| Active development | ✅ | ✅ Very (v2.32.0) | ❌ Dormant (Jan 2025) | ❌ Dormant | ⚠️ Stale (Jan 2025) | ✅ Very (v4.7.1) | ⚠️ Moderate | ✅ New (Mar 2026) |
| Release count | — | 32+ | — | — | — | 83 (5 months) | — | 1 |
| NPM monthly downloads | — | N/A | — | — | — | 3,625 | — | N/A |

## 2. MCP Transport

| Transport | ARC-1 | vibing-steampunk | mcp-abap-abap-adt-api | mcp-abap-adt (mario) | AWS Accelerator | fr0ster | btp-odata-mcp | dassian-adt / abap-mcpb |
|-----------|-------|-----------------|----------------------|---------------------|-----------------|---------|---------------|------------------------|
| stdio | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ |
| HTTP Streamable | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |
| SSE | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ⚠️ | ❌ |
| TLS/HTTPS | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ (v4.6.0) | ❌ | ❌ |

## 3. Authentication

| Auth Method | ARC-1 | vibing-steampunk | mcp-abap-abap-adt-api | mcp-abap-adt (mario) | AWS Accelerator | fr0ster | btp-odata-mcp | dassian-adt / abap-mcpb |
|-------------|-------|-----------------|----------------------|---------------------|-----------------|---------|---------------|------------------------|
| Basic Auth | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| Cookie-based | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| API Key (MCP) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| OIDC/JWT (MCP) | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ |
| XSUAA OAuth | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ |
| BTP Service Key | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| Principal Propagation | ✅ | ❌ | ❌ | ❌ | ✅ (X.509) | ✅ | ✅ | ❌ |
| SAML | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ |
| X.509 Certificates | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Device Flow (OIDC) | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| Browser login page | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ |
| Auth providers total | 4 | 2 | 1 | 1 | 5+ | 9 | 2 | 2 |

## 4. Safety & Security

| Safety Feature | ARC-1 | vibing-steampunk | mcp-abap-abap-adt-api | mcp-abap-adt (mario) | AWS Accelerator | fr0ster | btp-odata-mcp | dassian-adt / abap-mcpb |
|----------------|-------|-----------------|----------------------|---------------------|-----------------|---------|---------------|------------------------|
| Read-only mode | ✅ | ✅ | ❌ | N/A (read-only) | ❌ | ⚠️ exposition tiers | ❌ | ❌ |
| Op whitelist/blacklist | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Package restrictions | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Block free SQL | ✅ | ✅ | ❌ | ❌ | N/A | ❌ | ❌ | ❌ |
| Transport gating | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Dry-run mode | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Audit logging | ✅ | ❌ | ❌ | ❌ | ✅ (CloudWatch) | ❌ | ❌ | ❌ |
| Input sanitization | ✅ (Zod) | ✅ | ❌ | ⚠️ | ✅ (defusedxml) | ✅ (Zod) | ✅ (Zod) | ⚠️ |
| MCP elicitation | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ (7 flows) |
| Try-finally lock safety | ✅ | ✅ | ❌ | N/A | ✅ | ✅ (v4.5.0) | N/A | ⚠️ (abap-adt-api) |
| MCP scope system (OAuth) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

## 5. ABAP Read Operations

| Read Feature | ARC-1 | vibing-steampunk | mcp-abap-abap-adt-api | mcp-abap-adt (mario) | AWS Accelerator | fr0ster | btp-odata-mcp | dassian-adt / abap-mcpb |
|-------------|-------|-----------------|----------------------|---------------------|-----------------|---------|---------------|------------------------|
| Programs (PROG) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | N/A | ✅ |
| Classes (CLAS) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | N/A | ✅ |
| Interfaces (INTF) | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | N/A | ✅ |
| Function modules (FUNC) | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | N/A | ✅ |
| Function groups (FUGR) | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | N/A | ✅ (bulk) |
| Includes (INCL) | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | N/A | ✅ |
| CDS views (DDLS) | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | N/A | ✅ |
| Behavior defs (BDEF) | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ | N/A | ✅ |
| Service defs (SRVD) | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | N/A | ✅ |
| Service bindings (SRVB) | ❌ | ✅ | ❌ | ❌ | ✅ | ✅ | N/A | ❌ |
| Tables (DDIC) | ✅ | ✅ | ✅ | ✅ | ⚠️ | ✅ | N/A | ✅ |
| Table contents | ✅ | ✅ | ✅ | ⚠️ Z-service | ❌ | ✅ | N/A | ✅ |
| Packages (DEVC) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | N/A | ✅ |
| Metadata ext (DDLX) | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | N/A | ❌ |
| Structures | ❌ | ✅ | ✅ | ✅ | ❌ | ✅ | N/A | ❌ |
| Domains | ❌ | ❌ | ✅ | ⚠️ | ❌ | ✅ | N/A | ❌ |
| Data elements | ❌ | ❌ | ✅ | ⚠️ | ❌ | ✅ | N/A | ❌ |
| Enhancements | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | N/A | ❌ |
| Transactions | ❌ | ✅ | ❌ | ✅ | ❌ | ✅ | N/A | ❌ |
| Free SQL | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | N/A | ✅ |
| System info / components | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | N/A | ❌ |
| BOR business objects | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | N/A | ❌ |
| Messages (T100) | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | N/A | ❌ |
| Text elements | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | N/A | ❌ |
| Variants | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | N/A | ❌ |
| GetProgFullCode (include traversal) | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | N/A | ❌ |

## 6. Write / CRUD Operations

| Write Feature | ARC-1 | vibing-steampunk | mcp-abap-abap-adt-api | mcp-abap-adt (mario) | AWS Accelerator | fr0ster | btp-odata-mcp | dassian-adt / abap-mcpb |
|--------------|-------|-----------------|----------------------|---------------------|-----------------|---------|---------------|------------------------|
| Create objects | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | N/A | ✅ |
| Update source | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | N/A | ✅ |
| Delete objects | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | N/A | ✅ |
| Activate | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | N/A | ✅ |
| Batch activate | ⚠️ (single-call capable) | ✅ | ✅ | ❌ | ✅ (with dep resolution) | ✅ | N/A | ❌ |
| Lock/unlock | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | N/A | ✅ |
| EditSource (surgical) | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | N/A | ❌ |
| CloneObject | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | N/A | ❌ |
| Execute ABAP | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ | N/A | ✅ |
| RAP CRUD (BDEF, SRVD, DDLX, SRVB) | ❌ | ⚠️ (some) | ❌ | ❌ | ✅ (BDEF, SRVD, SRVB) | ✅ (all incl. DDLX) | N/A | ❌ |
| Type auto-mappings (CLAS→CLAS/OC) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | N/A | ✅ |
| Create test class | ❌ | ✅ | ❌ | ❌ | ✅ | ✅ | N/A | ❌ |

## 7. Code Intelligence

| Feature | ARC-1 | vibing-steampunk | mcp-abap-abap-adt-api | mcp-abap-adt (mario) | AWS Accelerator | fr0ster | btp-odata-mcp | dassian-adt / abap-mcpb |
|---------|-------|-----------------|----------------------|---------------------|-----------------|---------|---------------|------------------------|
| Find definition | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | N/A | ❌ |
| Find references | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | N/A | ✅ |
| Code completion | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | N/A | ❌ |
| Context compression | ✅ (SAPContext, 7-30x) | ✅ (auto, 7-30x) | ❌ | ❌ | ❌ | ❌ | N/A | ❌ |
| Method-level surgery | ❌ | ✅ (95% reduction) | ❌ | ❌ | ❌ | ❌ | N/A | ❌ |
| ABAP AST / parser | ⚠️ (abaplint for lint) | ✅ (native Go port) | ❌ | ❌ | ❌ | ✅ | N/A | ❌ |
| Semantic analysis | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | N/A | ❌ |
| Call graph analysis | ❌ | ✅ (5 tools) | ❌ | ❌ | ❌ | ❌ | N/A | ❌ |
| Type hierarchy | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | N/A | ❌ |
| CDS dependencies | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | N/A | ❌ |

## 8. Code Quality

| Feature | ARC-1 | vibing-steampunk | mcp-abap-abap-adt-api | mcp-abap-adt (mario) | AWS Accelerator | fr0ster | btp-odata-mcp | dassian-adt / abap-mcpb |
|---------|-------|-----------------|----------------------|---------------------|-----------------|---------|---------------|------------------------|
| Syntax check | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | N/A | ✅ |
| ATC checks | ✅ | ✅ | ✅ | ❌ | ✅ (with summary) | ❌ | N/A | ✅ (severity grouping) |
| abaplint (local offline) | ✅ | ✅ (native Go port, 8 rules) | ❌ | ❌ | ❌ | ❌ | N/A | ❌ |
| Unit tests | ✅ | ✅ | ✅ | ❌ | ✅ (with coverage) | ✅ | N/A | ❌ |
| CDS unit tests | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | N/A | ❌ |
| Fix proposals | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | N/A | ❌ |
| PrettyPrint | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | N/A | ❌ |
| Migration analysis | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | N/A | ❌ |

## 9. Transport / CTS

| Feature | ARC-1 | vibing-steampunk | mcp-abap-abap-adt-api | mcp-abap-adt (mario) | AWS Accelerator | fr0ster | btp-odata-mcp | dassian-adt / abap-mcpb |
|---------|-------|-----------------|----------------------|---------------------|-----------------|---------|---------------|------------------------|
| List transports | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | N/A | ✅ |
| Create transport | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | N/A | ✅ |
| Release transport | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | N/A | ✅ |
| Transport contents | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | N/A | ✅ |
| Transport assign | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | N/A | ✅ |
| Transport gating | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | N/A | ❌ |
| Inactive objects list | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ | N/A | ❌ |

## 10. Diagnostics & Runtime

| Feature | ARC-1 | vibing-steampunk | mcp-abap-abap-adt-api | mcp-abap-adt (mario) | AWS Accelerator | fr0ster | btp-odata-mcp | dassian-adt / abap-mcpb |
|---------|-------|-----------------|----------------------|---------------------|-----------------|---------|---------------|------------------------|
| Short dumps (ST22) | ❌ | ✅ | ✅ | ❌ | ❌ | ✅ | N/A | ✅ |
| ABAP profiler traces | ❌ | ✅ | ✅ | ❌ | ❌ | ✅ | N/A | ❌ |
| SQL traces | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | N/A | ❌ |
| ABAP debugger | ❌ | ✅ (8 tools) | ✅ | ❌ | ❌ | ❌ | N/A | ❌ |
| AMDP/HANA debugger | ❌ | ✅ (7 tools) | ❌ | ❌ | ❌ | ❌ | N/A | ❌ |
| Execute with profiling | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | N/A | ❌ |

## 11. Advanced Features

| Feature | ARC-1 | vibing-steampunk | mcp-abap-abap-adt-api | mcp-abap-adt (mario) | AWS Accelerator | fr0ster | btp-odata-mcp | dassian-adt / abap-mcpb |
|---------|-------|-----------------|----------------------|---------------------|-----------------|---------|---------------|------------------------|
| Feature auto-detection | ✅ (6 probes) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Caching (SQLite) | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| UI5/Fiori BSP | ❌ | ✅ (7 tools) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| abapGit/gCTS | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | N/A | ✅ |
| BTP Destination Service | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ |
| Cloud Connector proxy | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| Multi-system support | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ |
| OData bridge | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| Lua scripting engine | ❌ | ✅ (50+ bindings) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| WASM-to-ABAP compiler | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| MCP client configurator | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ (11 clients) | ❌ | ❌ |
| CLI mode (non-MCP) | ❌ | ✅ (28 commands) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Health endpoint | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ (v4.3.0) | ❌ | ✅ |
| RFC connectivity | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ (sap-rfc-lite) | ❌ | ❌ |
| MCPB one-click install | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Lock registry / recovery | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| Batch HTTP operations | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ (multipart/mixed) | ❌ | ❌ |
| RAG-optimized tool descriptions | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ (v4.4.0) | ❌ | ❌ |
| Embeddable server (library mode) | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| Error intelligence (hints) | ⚠️ (LLM hints) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |

## 12. Token Efficiency

| Feature | ARC-1 | vibing-steampunk | fr0ster |
|---------|-------|-----------------|---------|
| Schema token cost | ~moderate (11 tools) | ~200 (hyperfocused) / ~14K (focused) / ~40K (expert) | ~high (287 tools) |
| Context compression | ✅ SAPContext (7-30x) | ✅ Auto-append (7-30x) | ❌ |
| Method-level surgery | ❌ | ✅ (95% source reduction) | ❌ |
| Hyperfocused mode (1 tool) | ❌ | ✅ (~200 tokens) | ❌ |
| Compact/intent mode | ✅ (11 intent tools) | N/A | ✅ (22 compact tools) |

## 13. Testing & Quality

| Metric | ARC-1 | vibing-steampunk | mcp-abap-abap-adt-api | mcp-abap-adt (mario) | AWS Accelerator | fr0ster | btp-odata-mcp | dassian-adt / abap-mcpb |
|--------|-------|-----------------|----------------------|---------------------|-----------------|---------|---------------|------------------------|
| Unit tests | 546+ | 222 | 0 | 0 | 0 | Yes (Jest) | 0 | 163 |
| Integration tests | ✅ (on-prem + BTP) | ✅ | ❌ | 13 (live SAP) | ❌ | ✅ | ❌ | ⚠️ scaffold |
| CI/CD | ✅ (release-please) | ✅ (GoReleaser) | ❌ | ❌ | ❌ | ⚠️ (Husky + lint-staged) | ❌ | ❌ |
| Input validation | Zod v3 | Custom | Untyped | Untyped | Pydantic | Zod v4 | Zod | Manual |
| Linter | Biome | — | — | — | — | Biome | — | — |

---

## Priority Action Items for ARC-1

Based on verified codebase analysis (2026-04-01) and competitive landscape:

### 🔴 Critical — Competitive Gaps (implement soon)

| # | Feature | Why | Competition | Effort |
|---|---------|-----|-------------|--------|
| 1 | **Short dump analysis (ST22)** | Currently ❌ — listed as ✅ in old matrix was WRONG. VSP, fr0ster, dassian all have it. Basic diagnostic capability gap. | VSP, fr0ster, dassian | 1d |
| 2 | **DDLX/Metadata Extension read** | fr0ster is the only one with it. Critical for RAP development workflows. | fr0ster | 1d |
| 3 | **Content-Type 415 auto-retry** | Robustness fix learned from fr0ster issue #22/#23. SAP systems vary in Accept/Content-Type expectations. | fr0ster | 0.5d |
| 4 | **Batch activation with dependency resolution** | AWS Accelerator has the most robust implementation. Essential for RAP stacks (DDLS→BDEF→SRVD→SRVB chain). | AWS, fr0ster, VSP | 2d |
| 5 | **TLS/HTTPS for HTTP Streamable** | fr0ster added in v4.6.0. Required for production enterprise deployments without reverse proxy. | fr0ster | 1d |

### 🟠 High Priority — Significant Value

| # | Feature | Why | Competition | Effort |
|---|---------|-----|-------------|--------|
| 6 | **Structures (STRU) read support** | Currently ❌. VSP, fr0ster, mario, mcp-abap-abap-adt-api all have it. Basic DDIC gap. | VSP, fr0ster, mario | 1d |
| 7 | **Transaction code read** | Currently ❌. VSP and fr0ster have it. Useful for navigation context. | VSP, fr0ster | 0.5d |
| 8 | **Service binding (SRVB) read/CRUD** | Missing from SAPRead. Needed for complete RAP stack support. AWS & fr0ster have it. | AWS, fr0ster, VSP | 1d |
| 9 | **EditSource (surgical string replacement)** | VSP's killer feature for token efficiency — 95% source reduction for single-method edits. | VSP | 2d |
| 10 | **Function group bulk fetch** | Dassian fetches ALL includes + FMs in one call. Reduces LLM round trips significantly. | dassian | 1d |
| 11 | **Error intelligence with self-correction hints** | Dassian provides actionable SAP error hints (SM12 for locks, SPAU for upgrades). ARC-1 has basic LLM hints but not comprehensive. | dassian | 1d |
| 12 | **GetProgFullCode (recursive include discovery)** | fr0ster-unique feature. Fetches program with all includes resolved. Reduces round trips for complex programs. | fr0ster | 1d |
| 13 | **Type auto-mappings for SAPWrite** | CLAS→CLAS/OC, INTF→INTF/OI, etc. Dassian maps 16 types. Improves create UX. | dassian | 0.5d |

### 🟡 Medium Priority — Nice to Have

| # | Feature | Why | Competition | Effort |
|---|---------|-----|-------------|--------|
| 14 | **PrettyPrint** | Code formatting via ADT. VSP and mcp-abap-abap-adt-api have it. | VSP | 1d |
| 15 | **gCTS/abapGit integration** | Git repos list + pull. Dassian and VSP have it. | dassian, VSP | 2d |
| 16 | **ABAP profiler traces** | Runtime performance diagnostics. VSP and fr0ster have it. | VSP, fr0ster | 2d |
| 17 | **SQL trace support** | Performance diagnostics. VSP has it. | VSP | 1d |
| 18 | **CDS unit tests** | fr0ster-unique. Create/run/check CDS unit tests. | fr0ster | 1d |
| 19 | **Inactive objects list** | Show what's inactive system-wide. VSP and fr0ster have it. | VSP, fr0ster | 0.5d |
| 20 | **Transport contents (E071 list)** | Show objects inside a transport. mcp-abap-abap-adt-api and dassian have it. | dassian | 0.5d |
| 21 | **MCP client auto-configurator** | fr0ster's `mcp-conf` CLI for 11 MCP clients. Great onboarding UX. | fr0ster | 2d |
| 22 | **Multi-system support** | Connect to multiple SAP systems. AWS, fr0ster, btp-odata-mcp have it. | AWS, fr0ster | 3d |
| 23 | **ATC ciCheckFlavour workaround** | Older system compatibility for ATC. Dassian found the fix. | dassian | 0.5d |
| 24 | **Migration analysis tool** | Custom code migration check (ECC→S/4). AWS-unique. | AWS | 1d |
| 25 | **CompareSource** | Diff two versions. VSP has it. | VSP | 1d |
| 26 | **Domain/Data element read** | DDIC completeness. fr0ster and mcp-abap-abap-adt-api have it. | fr0ster | 1d |

### 🟢 Low Priority — Niche / Future

| # | Feature | Why | Competition | Effort |
|---|---------|-----|-------------|--------|
| 27 | SSE transport | fr0ster has it. Most MCP clients use stdio or HTTP. | fr0ster | 2d |
| 28 | ABAP debugger | VSP has 8 tools. Requires complex WebSocket + ZADT_VSP deployment. | VSP | 5d |
| 29 | Execute ABAP (IF_OO_ADT_CLASSRUN) | VSP and dassian have it. Security risk — needs careful safety gating. | VSP, dassian | 2d |
| 30 | Lua scripting / WASM compiler | VSP-unique experimental features. Not core MCP value. | VSP | N/A |
| 31 | Call graph analysis | VSP has 5 tools. Useful but niche. | VSP | 3d |
| 32 | UI5/Fiori BSP CRUD | VSP has 7 tools. Only relevant if UI5 detected. | VSP | 3d |
| 33 | RFC connectivity | fr0ster uses sap-rfc-lite. Alternative to ADT HTTP. | fr0ster | 3d |
| 34 | Embeddable server mode | fr0ster's EmbeddableMcpServer for CAP/Express integration. | fr0ster | 1d |
| 35 | MCPB packaging | Dassian's zero-build Claude Desktop format. | dassian | 1d |
| 36 | Lock registry with recovery | fr0ster persists lock state to disk for crash recovery. | fr0ster | 2d |
| 37 | RAG-optimized tool descriptions | fr0ster rewrote descriptions for embedding/vector search. | fr0ster | 1d |
| 38 | GetAbapHelp (F1 documentation) | VSP can retrieve ABAP keyword help. | VSP | 0.5d |
| 39 | Enhancement discovery | fr0ster can find enhancement spots/implementations. | fr0ster | 2d |

---

## Corrections from Previous Matrix (2026-03-30)

The following items were incorrectly marked in the previous version:

| Item | Old Value | Corrected Value | Reason |
|------|-----------|----------------|--------|
| ARC-1 Short dumps (ST22) | ✅ | ❌ | No dump-related methods exist in codebase |
| ARC-1 ABAP profiler | ✅ | ❌ | No profiler/trace support in codebase |
| ARC-1 SQL traces | ✅ | ❌ | No SQL trace functionality in codebase |
| VSP tool count | 1-122 | 1-99 (54 focused, 99 expert per README_TOOLS.md) | Updated from actual tool documentation |
| fr0ster version | v4.5.2 | v4.7.1 | Updated to current release |
| fr0ster TLS support | not listed | ✅ (v4.6.0) | New feature added Mar 31 |
| fr0ster sap-rfc-lite | not listed | ✅ (v4.7.0) | Replaced archived node-rfc |
| dassian column name | dassian-adt | dassian-adt / abap-mcpb | Successor repo albanleong/abap-mcpb created Mar 31 |
| VSP abaplint | ❌ (Go lexer) | ✅ (native Go port, 8 rules) | v2.32.0 added native linter |

---

## Competitive Positioning Summary

### ARC-1 Unique Strengths (no other project has all of these)
1. **Intent-based routing** — 11 tools vs 25-287. Simplest LLM decision surface.
2. **Declarative safety system** — Read-only, op filter, pkg filter, SQL blocking, transport gating, dry-run. Most comprehensive.
3. **MCP scope system** — OAuth scope-gated tool access (read/write/admin).
4. **BTP ABAP Environment** — Full OAuth 2.0 browser login, direct connectivity.
5. **Principal propagation** — Per-user SAP identity via Destination Service.
6. **MCP elicitation** — Interactive parameter collection for destructive ops.
7. **Audit logging** — BTP Audit Log sink for compliance.
8. **Context compression** — AST-based dependency extraction with depth control.
9. **npm + Docker + release-please** — Most professional distribution pipeline.

### Biggest Competitive Threats
1. **vibing-steampunk** (242 stars) — Community favorite. Hyperfocused mode, method-level surgery, native parser, WASM compiler. Lacks BTP/enterprise auth but developer-loved.
2. **fr0ster** (v4.7.1, 83 releases) — Closest enterprise competitor. 287 tools, 9 auth providers, TLS, RFC, embeddable. Complex multi-repo but ambitious.
3. **btp-odata-mcp** (119 stars) — Different category (OData not ADT) but high adoption. Could expand into ADT territory.

### Key Gaps to Close
- **Diagnostics**: ARC-1 has zero runtime diagnostics (no dumps, no profiler, no traces). Every active competitor has at least dumps.
- **RAP completeness**: Missing DDLX, SRVB, batch activation with dependency resolution. fr0ster leads here.
- **DDIC completeness**: Missing structures, domains, data elements, transactions. fr0ster leads.
- **Token efficiency**: SAPContext is good but lacks method-level surgery (VSP) and hyperfocused mode (VSP).
