# Cross-Project Feature Matrix

A comprehensive comparison of all SAP ADT/MCP projects against ARC-1.

_Last updated: 2026-03-30_

## Legend
- ✅ = Supported
- ⚠️ = Partial / Limited
- ❌ = Not supported
- N/A = Not applicable

---

## 1. Core Architecture

| Feature | ARC-1 | vibing-steampunk | mcp-abap-abap-adt-api | mcp-abap-adt (mario) | AWS Accelerator | fr0ster | btp-odata-mcp | dassian-adt |
|---------|-------|-----------------|----------------------|---------------------|-----------------|---------|---------------|-------------|
| Language | TypeScript | Go | TypeScript | TypeScript | Python | TypeScript | TypeScript | TypeScript |
| Tool count | 11 intent-based | 1-122 (3 modes) | ~95 | 13 | 15 | 287 (4 levels) | 3 (hierarchical) | 25+ |
| ADT client | Custom (axios) | Custom (Go) | abap-adt-api | Custom (axios) | Custom (aiohttp) | Custom (axios) | SAP Cloud SDK | abap-adt-api |
| npm package | ✅ `arc-1` | ❌ (binary) | ❌ | ❌ | ❌ | ✅ `@mcp-abap-adt/core` | ❌ | ❌ |
| Docker image | ✅ ghcr.io | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ⚠️ Dockerfile |
| Active development | ✅ | ✅ Very | ❌ Dormant | ❌ Dormant | ✅ | ✅ Very | ⚠️ Moderate | ✅ Very New |

## 2. MCP Transport

| Transport | ARC-1 | vibing-steampunk | mcp-abap-abap-adt-api | mcp-abap-adt (mario) | AWS Accelerator | fr0ster | btp-odata-mcp | dassian-adt |
|-----------|-------|-----------------|----------------------|---------------------|-----------------|---------|---------------|-------------|
| stdio | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ |
| HTTP Streamable | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |
| SSE | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ⚠️ | ❌ |

## 3. Authentication

| Auth Method | ARC-1 | vibing-steampunk | mcp-abap-abap-adt-api | mcp-abap-adt (mario) | AWS Accelerator | fr0ster | btp-odata-mcp | dassian-adt |
|-------------|-------|-----------------|----------------------|---------------------|-----------------|---------|---------------|-------------|
| Basic Auth | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| Cookie-based | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| API Key (MCP) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| OIDC/JWT (MCP) | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ |
| XSUAA OAuth | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ |
| Principal Propagation | ✅ | ❌ | ❌ | ❌ | ✅ (X.509) | ✅ | ✅ | ❌ |
| SAML | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ |
| X.509 Certificates | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Device Flow (OIDC) | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| Browser login page | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ |

## 4. Safety & Security

| Safety Feature | ARC-1 | vibing-steampunk | mcp-abap-abap-adt-api | mcp-abap-adt (mario) | AWS Accelerator | fr0ster | btp-odata-mcp | dassian-adt |
|----------------|-------|-----------------|----------------------|---------------------|-----------------|---------|---------------|-------------|
| Read-only mode | ✅ | ✅ | ❌ | N/A (read-only) | ❌ | ⚠️ exposition | ❌ | ❌ |
| Op whitelist/blacklist | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Package restrictions | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Block free SQL | ✅ | ✅ | ❌ | ❌ | N/A | ❌ | ❌ | ❌ |
| Transport gating | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Dry-run mode | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Audit logging | ✅ | ❌ | ❌ | ❌ | ✅ (CloudWatch) | ❌ | ❌ | ❌ |
| Input sanitization | ✅ | ✅ | ❌ | ⚠️ | ✅ | ✅ | ✅ | ✅ |
| MCP elicitation | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |

## 5. ABAP Read Operations

| Read Feature | ARC-1 | vibing-steampunk | mcp-abap-abap-adt-api | mcp-abap-adt (mario) | AWS Accelerator | fr0ster | btp-odata-mcp | dassian-adt |
|-------------|-------|-----------------|----------------------|---------------------|-----------------|---------|---------------|-------------|
| Programs | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | N/A | ✅ |
| Classes | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | N/A | ✅ |
| Interfaces | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | N/A | ✅ |
| Function modules | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | N/A | ✅ |
| Includes | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | N/A | ✅ |
| CDS views (DDLS) | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | N/A | ✅ |
| Behavior defs (BDEF) | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ | N/A | ✅ |
| Service defs (SRVD) | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | N/A | ✅ |
| Tables (DDIC) | ✅ | ✅ | ✅ | ✅ | ⚠️ | ✅ | N/A | ✅ |
| Table contents | ✅ | ✅ | ✅ | ⚠️ Z-service | ❌ | ✅ | N/A | ✅ |
| Packages | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | N/A | ✅ |
| Metadata ext (DDLX) | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | N/A | ❌ |
| Structures | ❌ | ✅ | ✅ | ✅ | ❌ | ✅ | N/A | ❌ |
| Domains | ❌ | ❌ | ✅ | ⚠️ fallback | ❌ | ✅ | N/A | ❌ |
| Data elements | ❌ | ❌ | ✅ | ⚠️ fallback | ❌ | ✅ | N/A | ❌ |
| Enhancements | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | N/A | ❌ |
| Transactions | ❌ | ✅ | ❌ | ✅ | ❌ | ✅ | N/A | ❌ |
| Free SQL | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | N/A | ✅ |

## 6. Write / CRUD Operations

| Write Feature | ARC-1 | vibing-steampunk | mcp-abap-abap-adt-api | mcp-abap-adt (mario) | AWS Accelerator | fr0ster | btp-odata-mcp | dassian-adt |
|--------------|-------|-----------------|----------------------|---------------------|-----------------|---------|---------------|-------------|
| Create objects | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | N/A | ✅ |
| Update source | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | N/A | ✅ |
| Delete objects | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | N/A | ✅ |
| Activate | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | N/A | ✅ |
| Batch activate | ❌ | ✅ | ✅ | ❌ | ✅ | ✅ | N/A | ❌ |
| Lock/unlock | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | N/A | ✅ |
| EditSource (surgical) | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | N/A | ❌ |
| CloneObject | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | N/A | ❌ |
| Execute ABAP | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | N/A | ✅ |

## 7. Code Intelligence

| Feature | ARC-1 | vibing-steampunk | mcp-abap-abap-adt-api | mcp-abap-adt (mario) | AWS Accelerator | fr0ster | btp-odata-mcp | dassian-adt |
|---------|-------|-----------------|----------------------|---------------------|-----------------|---------|---------------|-------------|
| Find definition | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | N/A | ❌ |
| Find references | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | N/A | ✅ |
| Code completion | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | N/A | ❌ |
| Context compression | ⚠️ SAPContext | ✅ Auto | ❌ | ❌ | ❌ | ❌ | N/A | ❌ |
| ABAP AST | ❌ | ✅ (lexer) | ❌ | ❌ | ❌ | ✅ | N/A | ❌ |
| Semantic analysis | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | N/A | ❌ |
| Call graph | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | N/A | ❌ |

## 8. Code Quality

| Feature | ARC-1 | vibing-steampunk | mcp-abap-abap-adt-api | mcp-abap-adt (mario) | AWS Accelerator | fr0ster | btp-odata-mcp | dassian-adt |
|---------|-------|-----------------|----------------------|---------------------|-----------------|---------|---------------|-------------|
| Syntax check | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | N/A | ✅ |
| ATC checks | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ | N/A | ✅ |
| abaplint (local) | ✅ | ❌ (Go lexer) | ❌ | ❌ | ❌ | ❌ | N/A | ❌ |
| Unit tests | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | N/A | ❌ |
| Fix proposals | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | N/A | ❌ |
| PrettyPrint | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | N/A | ❌ |
| Refactoring | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | N/A | ❌ |

## 9. Transport / CTS

| Feature | ARC-1 | vibing-steampunk | mcp-abap-abap-adt-api | mcp-abap-adt (mario) | AWS Accelerator | fr0ster | btp-odata-mcp | dassian-adt |
|---------|-------|-----------------|----------------------|---------------------|-----------------|---------|---------------|-------------|
| List transports | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | N/A | ✅ |
| Create transport | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | N/A | ✅ |
| Release transport | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | N/A | ✅ |
| Transport contents | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | N/A | ✅ |
| Transport gating | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | N/A | ❌ |

## 10. Diagnostics

| Feature | ARC-1 | vibing-steampunk | mcp-abap-abap-adt-api | mcp-abap-adt (mario) | AWS Accelerator | fr0ster | btp-odata-mcp | dassian-adt |
|---------|-------|-----------------|----------------------|---------------------|-----------------|---------|---------------|-------------|
| Short dumps (ST22) | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | N/A | ✅ |
| ABAP profiler | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | N/A | ❌ |
| SQL traces | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | N/A | ❌ |
| ABAP debugger | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | N/A | ❌ |

## 11. Advanced Features

| Feature | ARC-1 | vibing-steampunk | mcp-abap-abap-adt-api | mcp-abap-adt (mario) | AWS Accelerator | fr0ster | btp-odata-mcp | dassian-adt |
|---------|-------|-----------------|----------------------|---------------------|-----------------|---------|---------------|-------------|
| Feature auto-detection | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Caching (SQLite) | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| UI5/Fiori BSP | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| abapGit/gCTS | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | N/A | ✅ |
| BTP Destination Service | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ |
| Cloud Connector | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| Multi-system | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ |
| OData bridge | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| Lua scripting | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| MCP client configurator | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |

## 12. Testing & Quality

| Metric | ARC-1 | vibing-steampunk | mcp-abap-abap-adt-api | mcp-abap-adt (mario) | AWS Accelerator | fr0ster | btp-odata-mcp | dassian-adt |
|--------|-------|-----------------|----------------------|---------------------|-----------------|---------|---------------|-------------|
| Unit tests | 320+ | 222 | 0 | 0 | 0 | Yes (Jest) | 0 | 163 |
| Integration tests | ✅ | ✅ | ❌ | 13 (live SAP) | ❌ | ✅ | ❌ | ⚠️ scaffold |
| CI/CD | ✅ | ✅ (GoReleaser) | ❌ | ❌ | ❌ | ⚠️ Husky | ❌ | ❌ |
| Input validation | Zod | Custom | Untyped | Untyped | Pydantic | Zod | Zod | Manual |

---

## Priority Action Items for ARC-1

Based on this analysis, the highest-impact features to adopt:

### Critical (implement soon)
1. **Lock leak verification** -- ensure all lock/unlock uses try-finally (learned from fr0ster #22)
2. **Content-Type 415 retry** -- auto-retry with different Accept/Content-Type on 415 (fr0ster #22/#23)
3. **Batch activation** -- activate multiple objects with dependency resolution (AWS, fr0ster)
4. **DDLX/Metadata Extension support** -- add to SAPRead (fr0ster)

### High Priority
5. **Function group bulk fetch** -- parallel fetch all includes+FMs (dassian-adt)
6. **EditSource (surgical edits)** -- string replacement with syntax check (vibing-steampunk)
7. **Error intelligence** -- actionable SAP error hints (dassian-adt)
8. **ATC ciCheckFlavour workaround** -- older system compatibility (dassian-adt)
9. **Type auto-mappings** -- CLAS→CLAS/OC etc. for SAPWrite (dassian-adt)
10. **Refactoring tools** -- extract method, rename (mcp-abap-abap-adt-api)

### Medium Priority
11. **MCP client auto-configurator** -- setup script for Claude/Cursor/etc. (fr0ster)
12. **Runtime profiling** -- execute with profiler (fr0ster)
13. **gCTS integration** -- git repos and pull (dassian-adt, vibing-steampunk)
14. **Multi-system support** -- connect to multiple SAP systems (AWS, fr0ster)
15. **PrettyPrint** -- ABAP code formatting (vibing-steampunk, mcp-abap-abap-adt-api)
