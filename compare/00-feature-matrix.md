# Cross-Project Feature Matrix

A comprehensive comparison of all SAP ADT/MCP projects against ARC-1.

_Last updated: 2026-04-04_

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
| Active development | ✅ | ✅ Very (v2.32.0+) | ❌ Dormant (Jan 2025) | ❌ Dormant | ⚠️ Stale (Jan 2025) | ✅ Very (v4.8.1) | ⚠️ Moderate | ✅ New (Mar 2026) |
| Release count | — | 32+ | — | — | — | 85+ (5 months) | — | 1 |
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
| Service bindings (SRVB) | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ | N/A | ❌ |
| Tables (DDIC) | ✅ | ✅ | ✅ | ✅ | ⚠️ | ✅ | N/A | ✅ |
| Table contents | ✅ | ✅ | ✅ | ⚠️ Z-service | ❌ | ✅ | N/A | ✅ |
| Packages (DEVC) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | N/A | ✅ |
| Metadata ext (DDLX) | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | N/A | ❌ |
| Structures | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | N/A | ❌ |
| Domains | ✅ | ❌ | ✅ | ⚠️ | ❌ | ✅ | N/A | ❌ |
| Data elements | ✅ | ❌ | ✅ | ⚠️ | ❌ | ✅ | N/A | ❌ |
| Enhancements | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | N/A | ❌ |
| Transactions | ✅ | ✅ | ❌ | ✅ | ❌ | ✅ | N/A | ❌ |
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
| Batch activate | ✅ | ✅ | ✅ | ❌ | ✅ (with dep resolution) | ✅ | N/A | ❌ |
| Lock/unlock | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | N/A | ✅ |
| EditSource (surgical) | ✅ (edit_method) | ✅ | ❌ | ❌ | ❌ | ❌ | N/A | ❌ |
| CloneObject | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | N/A | ❌ |
| Execute ABAP | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ | N/A | ✅ |
| RAP CRUD (BDEF, SRVD, DDLX, SRVB) | ✅ (DDLS, DDLX, BDEF, SRVD write) | ⚠️ (some) | ❌ | ❌ | ✅ (BDEF, SRVD, SRVB) | ✅ (all incl. DDLX) | N/A | ❌ |
| Type auto-mappings (CLAS→CLAS/OC) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | N/A | ✅ |
| Create test class | ❌ | ✅ | ❌ | ❌ | ✅ | ✅ | N/A | ❌ |

## 7. Code Intelligence

| Feature | ARC-1 | vibing-steampunk | mcp-abap-abap-adt-api | mcp-abap-adt (mario) | AWS Accelerator | fr0ster | btp-odata-mcp | dassian-adt / abap-mcpb |
|---------|-------|-----------------|----------------------|---------------------|-----------------|---------|---------------|------------------------|
| Find definition | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | N/A | ❌ |
| Find references | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | N/A | ✅ |
| Code completion | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | N/A | ❌ |
| Context compression | ✅ (SAPContext, 7-30x) | ✅ (auto, 7-30x) | ❌ | ❌ | ❌ | ❌ | N/A | ❌ |
| Method-level surgery | ✅ (95% reduction) | ✅ (95% reduction) | ❌ | ❌ | ❌ | ❌ | N/A | ❌ |
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
| Short dumps (ST22) | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | N/A | ✅ |
| ABAP profiler traces | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | N/A | ❌ |
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
| Schema token cost | ~200 (hyperfocused) / ~moderate (11 tools) | ~200 (hyperfocused) / ~14K (focused) / ~40K (expert) | ~high (287 tools) |
| Context compression | ✅ SAPContext (7-30x) | ✅ Auto-append (7-30x) | ❌ |
| Method-level surgery | ✅ (95% source reduction) | ✅ (95% source reduction) | ❌ |
| Hyperfocused mode (1 tool) | ✅ (~200 tokens) | ✅ (~200 tokens) | ❌ |
| Compact/intent mode | ✅ (11 intent tools) | N/A | ✅ (22 compact tools) |

## 13. Testing & Quality

| Metric | ARC-1 | vibing-steampunk | mcp-abap-abap-adt-api | mcp-abap-adt (mario) | AWS Accelerator | fr0ster | btp-odata-mcp | dassian-adt / abap-mcpb |
|--------|-------|-----------------|----------------------|---------------------|-----------------|---------|---------------|------------------------|
| Unit tests | 707+ | 222 | 0 | 0 | 0 | Yes (Jest) | 0 | 163 |
| Integration tests | ✅ (on-prem + BTP) | ✅ | ❌ | 13 (live SAP) | ❌ | ✅ | ❌ | ⚠️ scaffold |
| CI/CD | ✅ (release-please) | ✅ (GoReleaser) | ❌ | ❌ | ❌ | ⚠️ (Husky + lint-staged) | ❌ | ❌ |
| Input validation | Zod v3 | Custom | Untyped | Untyped | Pydantic | Zod v4 | Zod | Manual |
| Linter | Biome | — | — | — | — | Biome | — | — |

---

## Priority Action Items for ARC-1

Based on verified codebase analysis, 3 competitor trackers ([fr0ster](fr0ster/overview.md), [VSP](vibing-steampunk/overview.md), [abap-adt-api](abap-adt-api/overview.md)), and alignment with [core design principles](../docs/roadmap.md#core-design-principles).

_Last reviewed: 2026-04-04_

### How priorities are assigned

| Principle | If a feature supports this, it gets... |
|-----------|---------------------------------------|
| Centralized admin control | P0–P1 (core value) |
| Per-user SAP identity | P0–P1 (core value) |
| Token-efficient tool design | P1 (directly improves LLM UX) |
| BTP-native deployment | P0–P1 (production blocker) |
| Multi-client, vendor-neutral | P1 (broadens adoption) |
| Safe defaults, opt-in power | P0–P1 (trust enabler) |
| General ADT feature parity | P2 (nice to have) |
| Niche / experimental | P3 (future) |

### ✅ Recently Completed (closed gaps)

| Feature | Closed When | Principle Served |
|---------|------------|-----------------|
| Short dump analysis (ST22) | PR #24 | Admin control (diagnostics) |
| ABAP profiler traces | PR #24 | Admin control (diagnostics) |
| DDLX/Metadata Extension read | PR #22 | ADT parity |
| Batch activation | PR #22 | ADT parity |
| Structures, domains, data elements, transactions read | PR #22 | ADT parity |
| Service binding (SRVB) read | PR #22 | ADT parity |
| RAP CRUD (DDLS, DDLX, BDEF, SRVD write) | PR #22 | ADT parity |
| EditSource / method-level surgery | PR #23 | Token efficiency |
| Hyperfocused mode | PR #23 | Token efficiency |
| Context compression (SAPContext) | PR #23 | Token efficiency |

### 🔴 P0 — Production Blockers

Items that block enterprise customers from deploying ARC-1 in production.

| # | Feature | Why | Sources | Effort |
|---|---------|-----|---------|--------|
| 1 | **Content-Type 415/406 auto-retry** | SAP systems vary in Accept/Content-Type expectations across versions. Both fr0ster (#22/#23) and VSP (#9) hit this. A transparent retry in `src/adt/http.ts` fixes an entire class of SAP compatibility issues. | [fr0ster eval](fr0ster/evaluations/415-content-type-retry.md), [VSP eval](vibing-steampunk/evaluations/issue-9-transport-accept-header.md) | **0.5d** |
| 2 | **TLS/HTTPS for HTTP Streamable** | Required for production deployments without a reverse proxy. fr0ster added in v4.6.0. Enterprises deploying on VMs/Kubernetes need HTTPS natively. Directly supports **BTP-native deployment** principle. | [fr0ster eval](fr0ster/evaluations/tls-https-support.md) | **1d** |
| 3 | **401 session timeout auto-retry** | After idle, SAP returns 401. VSP (#32) and abap-adt-api both handle this. ARC-1 handles CSRF 403 but may not handle 401. A silent re-auth + retry prevents mid-conversation failures. | [VSP eval](vibing-steampunk/evaluations/d73460a-401-auto-retry.md) | **0.5d** |

### 🟠 P1 — High Priority (significant value, next to implement)

Items that directly serve one or more core design principles.

| # | Feature | Principle(s) | Why | Sources | Effort |
|---|---------|-------------|-----|---------|--------|
| 4 | **Where-Used Analysis** | Token efficiency | Most requested missing feature. Repository-wide usage references — every ABAP developer uses this daily. | Roadmap FEAT-01 | **XS** |
| 5 | **API Release Status (Clean Core)** | Safe defaults | Critical for S/4HANA Cloud — check if objects are released, deprecated, or internal. Must-have for ABAP Cloud compliance. | Roadmap FEAT-02 | **S** |
| 6 | **Fix proposals / auto-fix from ATC** | Token efficiency, safe defaults | When ATC finds an issue, SAP's fix proposal API suggests the exact correction. Far safer than having the LLM guess the fix. | [abap-adt-api eval](abap-adt-api/evaluations/issue-37-quickfix.md) | **S** |
| 7 | **DDIC domain/data element write** | ADT parity (high impact) | ARC-1 reads DOMA/DTEL but can't write properties or fixed values. Blocks full AI-assisted data modeling workflows. | [abap-adt-api eval](abap-adt-api/evaluations/646bb9b-dtel-doma-write.md) | **S** |
| 8 | **Namespace URL encoding audit** | Safe defaults | Namespaced objects (/NAMESPACE/CLASS) fail in both VSP (#18, #52) and fr0ster. Audit all `encodeURIComponent` usage. | [VSP eval](vibing-steampunk/evaluations/59b4b90-namespace-url-encoding.md), [VSP eval](vibing-steampunk/evaluations/6d1f00a-namespace-syntax-check.md) | **0.5d** |
| 9 | **Function group bulk fetch** | Token efficiency | Fetch ALL includes + FMs in one call instead of N round trips. Directly reduces context window usage. | Dassian pattern | **1d** |
| 10 | **Error intelligence (actionable hints)** | Admin control, safe defaults | When SAP returns 409/423/403, return actionable hints (SM12 for locks, SU53 for auth, SPAU for upgrades). Dassian does this well. | Dassian pattern, Roadmap SEC-03 | **1d** |
| 11 | **Type auto-mappings for SAPWrite** | Token efficiency | CLAS→CLAS/OC, INTF→INTF/OI, etc. LLM doesn't need to know ADT internal type codes. | Dassian pattern | **0.5d** |
| 12 | **Copilot Studio setup guide** | Multi-client | Complete end-to-end guide with screenshots. Critical for enterprise adoption. | Roadmap DOC-01 | **S** |
| 13 | **Basis Admin security guide** | Centralized admin control | Admins need clear guidance on SAP-side setup (S_DEVELOP, STRUST, safety controls). | Roadmap DOC-02 | **S** |

### 🟡 P2 — Medium Priority (nice to have, planned)

| # | Feature | Why | Sources | Effort |
|---|---------|-----|---------|--------|
| 14 | **PrettyPrint** | Code formatting via ADT API. VSP and abap-adt-api have it. | VSP, abap-adt-api | **XS** |
| 15 | **Inactive objects list** | Show what's inactive system-wide. Development workflow. | VSP, fr0ster | **XS** |
| 16 | **SQL trace monitoring** | Completes diagnostics story (dumps + profiler + SQL traces). | VSP | **S** |
| 17 | **Transport contents (E071 list)** | Show objects inside a transport. | dassian, abap-adt-api | **XS** |
| 18 | **MCP client config snippets** | `arc-1 config --client claude` prints config. Great onboarding UX. | [fr0ster eval](fr0ster/evaluations/5f975fe-mcp-client-configurator.md) | **1d** |
| 19 | **Source version / revision history** | Load specific version of source, compare active vs inactive. | [abap-adt-api eval](abap-adt-api/evaluations/d3c6940-source-versions.md) | **S** |
| 20 | **ABAP Documentation (F1 help)** | LLM can fetch official ABAP keyword docs instead of hallucinating syntax. | [abap-adt-api eval](abap-adt-api/evaluations/7d5c653-abap-documentation.md), VSP | **XS** |
| 21 | **Cloud readiness assessment** | ATC cloud check variant + abaplint for clean core compliance. AWS has this. | Roadmap FEAT-06, AWS | **M** |
| 22 | **Rate limiting** | Prevent runaway AI loops from overwhelming SAP. | Roadmap SEC-05 | **S** |
| 23 | **gCTS/abapGit integration** | Git repos list + pull. | dassian, VSP | **M** |
| 24 | **CDS unit tests** | Create/run/check CDS unit tests. fr0ster-unique. | fr0ster | **S** |
| 25 | **ATC ciCheckFlavour workaround** | Older system compatibility for ATC. | dassian | **XS** |
| 26 | **Stateful session header** | Some ADT endpoints require `X-sap-adt-sessiontype: stateful`. | [abap-adt-api eval](abap-adt-api/evaluations/issue-30-stateful-mode.md) | **XS** |
| 27 | **Include lock parent resolution** | Includes inherit parent's lock — verify FUGR/PROG includes lock correctly. | [abap-adt-api eval](abap-adt-api/evaluations/issue-36-include-lock.md) | **XS** |
| 28 | **Ignore syntax warnings on save** | VSP #33 — syntax warnings blocking saves. Check if ARC-1 has same issue. | [VSP eval](vibing-steampunk/evaluations/7fbfbba-ignore-warnings.md) | **XS** |
| 29 | **Transport endpoint S/4 compat** | Transport creation endpoint differs on S/4HANA 757. | [VSP eval](vibing-steampunk/evaluations/ca02f47-transport-endpoint-compat.md) | **XS** |
| 30 | **Enhancement framework (BAdI)** | Read enhancement spots, BAdI definitions. | fr0ster, Roadmap FEAT-03 | **M** |
| 31 | **GetProgFullCode (include traversal)** | Fetch program with all includes resolved. Reduces round trips. | fr0ster | **S** |
| 32 | **CompareSource (diff)** | Diff two versions of source. | VSP | **S** |
| 33 | **Multi-system routing** | One instance → multiple SAP systems. Architecture change. | AWS, fr0ster, Roadmap OPS-03 | **L** |
| 34 | **Migration analysis (ECC→S/4)** | Custom code migration check. | AWS | **S** |

### 🟢 P3 — Low Priority (future / niche)

| # | Feature | Why | Sources | Effort |
|---|---------|-----|---------|--------|
| 35 | SSE transport | fr0ster has it. Most MCP clients use stdio or HTTP Streamable. | fr0ster | M |
| 36 | ABAP debugger (8+ tools) | Requires WebSocket + ZADT_VSP deployment. Complex. | VSP | L |
| 37 | Execute ABAP (IF_OO_ADT_CLASSRUN) | Security risk — needs careful safety gating. | VSP, dassian | S |
| 38 | Call graph analysis | Useful but niche. VSP has 5 tools. | VSP | M |
| 39 | UI5/Fiori BSP CRUD | Only relevant if UI5 detected. VSP has 7 tools. | VSP | M |
| 40 | RFC connectivity (sap-rfc-lite) | Alternative to ADT HTTP. Niche. | fr0ster | M |
| 41 | Embeddable server mode | fr0ster's EmbeddableMcpServer for CAP/Express. | fr0ster | S |
| 42 | Lock registry with recovery | Persist lock state to disk for crash recovery. | fr0ster | M |
| 43 | Code refactoring (rename, extract method, change package) | Complex ADT refactoring APIs. Valuable but heavy. | [abap-adt-api eval](abap-adt-api/evaluations/460200a-extract-method.md) | L |
| 44 | Language attributes on object creation | Multi-language object creation. | [abap-adt-api eval](abap-adt-api/evaluations/ffa43d7-language-attributes.md) | XS |
| 45 | Lua scripting / WASM compiler | VSP-unique experimental. Not core MCP value. | VSP | N/A |

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
2. **fr0ster** (v4.8.1, 85+ releases) — Closest enterprise competitor. 287 tools, 9 auth providers, TLS, RFC, embeddable. Complex multi-repo but ambitious.
3. **btp-odata-mcp** (119 stars) — Different category (OData not ADT) but high adoption. Could expand into ADT territory.

### Key Gaps to Close

**Closed gaps:**
- ~~Diagnostics~~ → ST22 + profiler traces (SAPDiagnose)
- ~~RAP completeness~~ → DDLX/SRVB read, DDLS/DDLX/BDEF/SRVD write, batch activation
- ~~DDIC completeness~~ → STRU, DOMA, DTEL, TRAN read
- ~~Token efficiency~~ → method-level surgery, hyperfocused mode, context compression

**P0 — production blockers:**
- 415/406 content-type auto-retry (SAP version compatibility)
- 401 session timeout auto-retry (centralized gateway idle)
- TLS/HTTPS for HTTP Streamable (enterprise deployment without reverse proxy)

**P1 — high-value gaps:**
- Where-Used analysis, API release status (clean core), fix proposals
- DDIC write (DOMA/DTEL), namespace encoding audit, error intelligence
- Type auto-mappings, function group bulk fetch
- Documentation (Copilot Studio guide, Basis Admin guide)

**P2+ — future gaps:**
- SQL traces, PrettyPrint, inactive objects, transport contents, source versions
- Cloud readiness assessment, gCTS/abapGit, enhancement framework
- Multi-system routing, rate limiting

**Not planned (intentional):**
- ABAP debugger (WebSocket + ZADT_VSP), execute ABAP (security risk), Lua scripting (VSP-unique)
