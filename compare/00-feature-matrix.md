# Cross-Project Feature Matrix

A comprehensive comparison of all SAP ADT/MCP projects against ARC-1.

_Last updated: 2026-04-12 (added sapcli column, post fr0ster v5.0.0 feed tools analysis)_

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
| Tool count | 11 intent-based | 1-99 (3 modes) | ~15 | 13 | 15 | 287 (4 tiers) | 3 (hierarchical) | 25 | 28+ CLI commands (not MCP) |
| ADT client | Custom (undici/fetch) | Custom (Go) | abap-adt-api | Custom (axios) | Custom (aiohttp) | Custom (axios) | SAP Cloud SDK | abap-adt-api | Custom (requests) |
| npm package | ✅ `arc-1` | ❌ (binary) | ❌ | ❌ | ❌ | ✅ `@mcp-abap-adt/core` | ❌ | ❌ (MCPB) | N/A (Python, git install) |
| Docker image | ✅ ghcr.io | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Stars | — | 242 | 109 | 103 | 29 | 26 | 119 | 0 (new) | 77 |
| Active development | ✅ | ✅ Very (v2.39.0+) | ❌ Dormant (Jan 2025) | ❌ Dormant | ⚠️ Stale (Jan 2025) | ✅ Very (v4.8.7) | ⚠️ Moderate | ✅ New (Mar 2026) | ✅ Very (since 2018) |
| Release count | — | 32+ | — | — | — | 85+ (5 months) | — | 1 | rolling "latest" |
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
| XSUAA OAuth | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ |
| BTP Service Key | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Principal Propagation | ✅ | ❌ | ❌ | ❌ | ✅ (X.509) | ✅ | ✅ | ❌ | ❌ |
| SAML | ❌ | ✅ (v2.39.0+, PR #97) | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
| X.509 Certificates | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Device Flow (OIDC) | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Browser login page | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ | ❌ |
| Auth providers total | 4 | 2 | 1 | 1 | 5+ | 9 | 2 | 2 | 1 (Basic) |

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
| MCP elicitation | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ (7 flows) | N/A |
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
| Enhancements | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | N/A | ❌ | ✅ (BAdI/enhancement impl) |
| Transactions | ✅ | ✅ | ❌ | ✅ | ❌ | ✅ | N/A | ❌ | ❌ |
| Free SQL | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | N/A | ✅ | ✅ |
| System info / components | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | N/A | ❌ | ✅ |
| BOR business objects | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | N/A | ❌ | ❌ |
| Messages (T100) | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | N/A | ❌ | ❌ |
| Text elements | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | N/A | ❌ | ❌ |
| Variants | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | N/A | ❌ | ❌ |
| Structured class decomposition (metadata + includes) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | N/A | ❌ | ✅ (locals_def/imp/test/macros) |
| GetProgFullCode (include traversal) | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | N/A | ❌ | ❌ |

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
| RAP CRUD (BDEF, SRVD, DDLX, SRVB) | ✅ (DDLS, DDLX, BDEF, SRVD write) | ⚠️ (some) | ❌ | ❌ | ✅ (BDEF, SRVD, SRVB) | ✅ (all incl. DDLX) | N/A | ❌ | ⚠️ (DDLS, DCL, BDEF write; SRVB publish) |
| Multi-object batch creation | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | N/A | ❌ | ❌ |
| AFF schema validation (pre-create) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | N/A | ❌ | ❌ |
| Type auto-mappings (CLAS→CLAS/OC) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | N/A | ✅ | ✅ (ADTObjectType) |
| Create test class | ❌ | ✅ | ❌ | ❌ | ✅ | ✅ | N/A | ❌ | ✅ (class write test_classes) |

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
| CDS dependencies | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | N/A | ❌ | ❌ |

## 8. Code Quality

| Feature | ARC-1 | vibing-steampunk | mcp-abap-abap-adt-api | mcp-abap-adt (mario) | AWS Accelerator | fr0ster | btp-odata-mcp | dassian-adt / abap-mcpb | sapcli |
|---------|-------|-----------------|----------------------|---------------------|-----------------|---------|---------------|------------------------|--------|
| Syntax check | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | N/A | ✅ | ✅ |
| ATC checks | ✅ | ✅ | ✅ | ❌ | ✅ (with summary) | ❌ | N/A | ✅ (severity grouping) | ✅ (checkstyle/codeclimate) |
| abaplint (local offline) | ✅ | ✅ (native Go port, 8 rules) | ❌ | ❌ | ❌ | ❌ | N/A | ❌ | ❌ |
| Unit tests | ✅ | ✅ | ✅ | ❌ | ✅ (with coverage) | ✅ | N/A | ❌ | ✅ (with coverage + JUnit4/sonar) |
| CDS unit tests | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | N/A | ❌ | ❌ |
| API release state (clean core) | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | N/A | ❌ | ❌ |
| Fix proposals | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | N/A | ❌ | ❌ |
| PrettyPrint | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | N/A | ❌ | ❌ |
| Migration analysis | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | N/A | ❌ | ❌ |

## 9. Transport / CTS

| Feature | ARC-1 | vibing-steampunk | mcp-abap-abap-adt-api | mcp-abap-adt (mario) | AWS Accelerator | fr0ster | btp-odata-mcp | dassian-adt / abap-mcpb | sapcli |
|---------|-------|-----------------|----------------------|---------------------|-----------------|---------|---------------|------------------------|--------|
| List transports | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | N/A | ✅ | ✅ (-r/-rr/-rrr detail) |
| Create transport | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | N/A | ✅ | ✅ (5 types: K/W/T/S/R) |
| Release transport | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | N/A | ✅ | ✅ (recursive) |
| Transport contents | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | N/A | ✅ | ✅ (-rrr objects) |
| Transport assign | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | N/A | ✅ | ✅ (reassign owner) |
| Transport gating | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | N/A | ❌ | ❌ |
| Inactive objects list | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ | N/A | ❌ | ✅ |

## 10. Diagnostics & Runtime

| Feature | ARC-1 | vibing-steampunk | mcp-abap-abap-adt-api | mcp-abap-adt (mario) | AWS Accelerator | fr0ster | btp-odata-mcp | dassian-adt / abap-mcpb | sapcli |
|---------|-------|-----------------|----------------------|---------------------|-----------------|---------|---------------|------------------------|--------|
| Short dumps (ST22) | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | N/A | ✅ | ❌ |
| ABAP profiler traces | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | N/A | ❌ | ❌ |
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
| Feature auto-detection | ✅ (6 probes) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ (ADT discovery/MIME) |
| Caching (SQLite) | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| UI5/Fiori BSP | ❌ | ⚠️ (3 read-only; 4 write tools disabled — ADT filestore returns 405) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ (OData upload/download) |
| abapGit/gCTS | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | N/A | ✅ | ✅ (full gCTS + checkout/checkin) |
| BTP Destination Service | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ |
| Cloud Connector proxy | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| Multi-system support | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ | ✅ (kubeconfig contexts) |
| OData bridge | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ (BSP, FLP via OData) |
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
| Error intelligence (hints) | ⚠️ (LLM hints) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ (typed error hierarchy) |

## 12. Token Efficiency

| Feature | ARC-1 | vibing-steampunk | fr0ster | sapcli |
|---------|-------|-----------------|---------|--------|
| Schema token cost | ~200 (hyperfocused) / ~moderate (11 tools) | ~200 (hyperfocused) / ~14K (focused) / ~40K (expert) | ~high (287 tools) | N/A (CLI) |
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
1. **vibing-steampunk** (242 stars) — Community favorite. Now has Streamable HTTP (v2.38.0), SAML SSO (v2.39.0+, PR #97). Massive Apr sprint: i18n, gCTS, API release state, version history, code coverage, health analysis, rename preview, dead code analysis, package safety hardening. Now defaults to hyperfocused mode (1 tool). Still lacks BTP OAuth / Destination Service but adding auth options.
2. **fr0ster** (v5.0.1, 90+ releases) — Closest enterprise competitor. 289 tools, 9 auth providers, TLS, RFC, embeddable. v5.0.0 added unified feed tools (SM02, gateway errors), adt-clients 4.0 factory API. Complex multi-repo but ambitious.
3. **btp-odata-mcp** (119 stars) — Different category (OData not ADT) but high adoption. Could expand into ADT territory.

### Key Gaps to Close

**Closed gaps:**
- ~~Diagnostics~~ → ST22 + profiler traces (SAPDiagnose)
- ~~RAP completeness~~ → DDLX/SRVB read, DDLS/DDLX/BDEF/SRVD write, batch activation
- ~~DDIC completeness~~ → STRU, DOMA, DTEL, TRAN read
- ~~Token efficiency~~ → method-level surgery, hyperfocused mode, context compression

**P0 — production blockers:**
- ~~415/406 content-type auto-retry (SAP version compatibility)~~ — ✅ Implemented: one-retry negotiation fallback in `src/adt/http.ts`, endpoint-specific CTS media types, lock `corrNr` auto-propagation. fr0ster v4.5.0 added per-endpoint header caching (P3 optimization ARC-1 doesn't need yet). [Deep dive](fr0ster/evaluations/v4.5.0-release-deep-dive.md)
- ADT service discovery / MIME negotiation (FEAT-38) — probe once at startup, eliminate 415/406 guesswork
- 401 session timeout auto-retry (centralized gateway idle)
- ~~TLS/HTTPS for HTTP Streamable~~ — downgraded to P3: most deployments use reverse proxy (BTP gorouter, nginx, K8s Ingress)

**P1 — high-value gaps:**
- Where-Used analysis, fix proposals
- DDIC write (DOMA/DTEL), namespace encoding audit, error intelligence
- Type auto-mappings, function group bulk fetch
- Documentation (Copilot Studio guide, Basis Admin guide)

**P2+ — future gaps:**
- System messages (SM02) — AI agent situational awareness. fr0ster v5.0.0 added this.
- Gateway error log (IWFND) — OData/Gateway debugging with source code + call stack. fr0ster v5.0.0, on-prem only.
- SQL traces, PrettyPrint, inactive objects, transport contents, source versions
- Cloud readiness assessment, gCTS/abapGit, enhancement framework
- Multi-system routing, rate limiting

**Not planned (intentional):**
- ABAP debugger (WebSocket + ZADT_VSP), execute ABAP (security risk), Lua scripting (VSP-unique)
