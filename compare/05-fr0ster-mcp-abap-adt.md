# fr0ster/mcp-abap-adt

> **Repository**: https://github.com/fr0ster/mcp-abap-adt
> **Language**: TypeScript | **License**: MIT | **Stars**: ~25
> **Status**: Very Active (10+ commits in last 4 days, v4.5.2)
> **Relationship**: Independent TypeScript ADT MCP server with most advanced auth system

---

## Project Overview

A multi-package monorepo MCP server for SAP ADT with 287 tools organized across 4 exposition levels (read-only, high-level, low-level, compact). Features the most comprehensive authentication system of any project (9 providers including SAML, OIDC device flow, token exchange). Strict interface isolation via separate npm packages.

Key differentiator: "AI Pairing, Not Vibing (AIPNV)" philosophy -- positioned as pair programming assistant, not autopilot.

## Architecture

Multi-package monorepo with strict interface isolation:

| Package | Purpose |
|---------|---------|
| `@mcp-abap-adt/interfaces` | Type contracts, zero dependencies |
| `@mcp-abap-adt/logger` | Pino-based structured logging |
| `@mcp-abap-adt/header-validator` | HTTP header auth parsing/prioritization |
| `@mcp-abap-adt/auth-stores` | Service key + session persistence |
| `@mcp-abap-adt/auth-broker` | Token orchestration (cache → refresh → browser flow) |
| `@mcp-abap-adt/auth-providers` | 9 concrete token providers |
| `@mcp-abap-adt/connection` | HTTP transport (CSRF, cookies, sessions) |
| `@mcp-abap-adt/adt-clients` | Builder-first ABAP object CRUD |
| `@mcp-abap-adt/core` | Main MCP server, composition root |
| `@mcp-abap-adt/proxy` | Standalone auth proxy for BTP |
| `@mcp-abap-adt/configurator` | Auto-config for 11 MCP clients |

Design principles: Interface-Only Communication (IOC), Dependency Inversion, single composition root.

## Tool Inventory (287 tools across 4 levels)

### Read-Only Group (52 tools)
ReadClass, ReadProgram, ReadInterface, ReadDomain, ReadDataElement, ReadStructure, ReadTable, ReadView, ReadFunctionGroup, ReadFunctionModule, ReadBehaviorDefinition, ReadBehaviorImplementation, ReadMetadataExtension, ReadServiceDefinition, ReadServiceBinding, ReadPackage, GetProgFullCode, GetInclude, GetIncludesList, GetPackageContents, SearchObject, GetObjectsByType, GetObjectsList, GetWhereUsed, GetObjectInfo, GetObjectStructure, GetObjectNodeFromCache, GetAbapAST, GetAbapSemanticAnalysis, GetAbapSystemSymbols, GetAdtTypes, GetInactiveObjects, GetSession, GetSqlQuery, GetTransaction, GetTypeInfo, DescribeByList, GetTransport, ListTransports, GetEnhancements, GetEnhancementSpot, GetEnhancementImpl, RuntimeListDumps, RuntimeGetDumpById, RuntimeAnalyzeDump, RuntimeListProfilerTraceFiles, RuntimeGetProfilerTraceData, RuntimeAnalyzeProfilerTrace, RuntimeCreateProfilerTraceParameters, RuntimeRunClassWithProfiling, RuntimeRunProgramWithProfiling

### High-Level Group (113 tools)
Full CRUD with automatic lock/activate for 16+ object types: Classes (including local definitions, types, macros, test classes), Programs, Interfaces, Domains, Data Elements, Structures, Tables, Views (CDS), Function Groups/Modules, Service Definitions/Bindings, Behavior Definitions/Implementations, Metadata Extensions (DDLX), Packages, Transports, Unit Tests (ABAP + CDS)

### Low-Level Group (122 tools)
Fine-grained per-operation-per-object: Lock/Unlock/Check/Activate/Validate/Create/Update/Delete + generic variants

### Compact Group (22 tools)
Unified by `object_type` parameter: HandlerCreate, HandlerGet, HandlerUpdate, HandlerDelete, HandlerActivate, HandlerLock, HandlerUnlock, HandlerValidate, HandlerCheckRun, HandlerTransportCreate, HandlerUnitTestRun/Status/Result, HandlerCdsUnitTestStatus/Result, HandlerDumpList/View, HandlerProfileList/Run/View, HandlerServiceBindingListTypes/Validate

## Authentication (9 Providers -- Most Advanced)

| Provider | Flow |
|----------|------|
| AuthorizationCodeProvider | Browser-based BTP OAuth2 |
| ClientCredentialsProvider | Machine-to-machine |
| DeviceFlowProvider | Devices without browsers |
| OidcBrowserProvider | Generic OIDC browser flow |
| OidcDeviceFlowProvider | OIDC device flow |
| OidcPasswordProvider | OIDC resource owner password |
| OidcTokenExchangeProvider | OIDC token exchange |
| Saml2BearerProvider | SAML2 bearer assertion |
| Saml2PureProvider | Pure SAML2 flow |

### Header-Based Auth Priority
| Priority | Method | Headers |
|----------|--------|---------|
| 4 (highest) | SAP Destination | `x-sap-destination` |
| 3 | MCP Destination + JWT | `x-mcp-destination` + `x-sap-auth-type=jwt` |
| 2 | Direct JWT | `x-sap-jwt-token` |
| 1 | Basic Auth | `x-sap-login` + `x-sap-password` |

### Token Lifecycle
AuthBroker: cache → refresh_token → browser OAuth2 → typed error. Automatic 401/403 retry.

## Safety/Security

- **Exposition control**: Limit active tool groups (read-only, high-level, low-level, compact)
- **try-finally unlock**: Fixed in v4.5.0 -- prevents lock leaks (was try-catch before)
- **Sensitive data redaction** in logs
- **Session isolation**: HTTP/SSE = fresh connections per-request
- **`--unsafe` flag**: Controls file-based vs in-memory session persistence
- **SAP_SYSTEM_TYPE**: On-premise vs cloud tool availability
- **No read-only flag or op filtering** like ARC-1 -- relies on exposition control

## Transport (MCP Protocol)

| Transport | Supported |
|-----------|-----------|
| stdio | Yes (default) |
| HTTP Streamable | Yes (--http-port) |
| SSE | Yes (--sse-port) |

## Testing

- Jest (unit + integration)
- Integration tests by handler level and object type
- YAML test config (`test-config.yaml`)
- Global setup/teardown for lifecycle
- Test helpers: HighTester, LowTester, LambdaTester

## Dependencies

Runtime: @modelcontextprotocol/sdk ^1.27.1, axios ^1.13.6, fast-xml-parser ^5.4.2, xml-js ^1.6.11, pino ^10.1.0, js-yaml ^4.1.1, zod ^4.3.6
Optional: node-rfc ^3.3.1 (SAP RFC)
Dev: Biome, Jest, TypeScript, Express, Husky

## Known Issues (All Resolved)

| Issue | Description | Relevant to ARC-1? |
|-------|-------------|-------------------|
| #22 | Lock leak -- try-catch instead of try-finally for unlock | **Critical** -- verify ARC-1 uses try-finally |
| #22, #23, #25 | 415 Content-Type errors -- SAP needs specific Accept/Content-Type | Yes -- verify content-type handling |
| #24 | SAP_JWT_TOKEN overrides SAP_AUTH_TYPE | Yes -- check env var priority |
| #7 | 409 conflict not propagated to LLM | Yes -- ensure conflict errors are clear |
| #13 | Check runs fail with non-EN languages | Yes -- verify language handling |
| BTP Cloud | Data preview may not work | Yes -- document BTP limitations |

---

## Features This Project Has That ARC-1 Lacks

| Feature | Priority | Effort | Place in ARC-1 or mcp-sap-docs? |
|---------|----------|--------|--------------------------------|
| 9 auth providers (SAML, OIDC device flow, etc.) | Low | 5d+ | ARC-1 -- only if enterprise demand |
| Standalone auth proxy for BTP | Low | 3d | ARC-1 -- BTP PP already covers this |
| Auto-configurator for 11 MCP clients | High | 2d | ARC-1 -- great UX improvement |
| SSE transport | Medium | 2d | ARC-1 -- if clients need it |
| Runtime profiling (execute + profile) | Medium | 2d | ARC-1 -- extend SAPDiagnose |
| Runtime dump analysis | High | 1d | ARC-1 -- already partially in SAPDiagnose |
| ABAP AST parsing (JSON syntax tree) | Medium | 3d | ARC-1 -- could enhance code intelligence |
| Semantic analysis + system symbols | Medium | 3d | ARC-1 -- advanced code intel |
| Enhancement discovery | Medium | 2d | ARC-1 -- useful for customization |
| CDS unit testing | Medium | 1d | ARC-1 -- extend SAPLint |
| RFC connection (node-rfc) | Low | 3d | ARC-1 -- optional dependency |
| Embeddable server | Low | 1d | ARC-1 -- SDK use case |
| GetProgFullCode (includes traversal) | High | 1d | ARC-1 -- reduces round trips |
| Content-Type negotiation (415 auto-retry) | High | 0.5d | ARC-1 -- robustness improvement |
| Compact mode (22 tools) | Medium | 2d | ARC-1 -- already have intent-based |
| RAG-optimized tool descriptions | Medium | 1d | ARC-1 -- improve discoverability |
| DDLX/Metadata Extension support | High | 1d | ARC-1 -- add to SAPRead |
| Health check endpoint | Low | 0.5d | ARC-1 -- already have /health |

## Features ARC-1 Has That This Project Lacks

abaplint integration, SQLite caching, read-only mode + op filtering + package filtering, BTP Destination Service (built-in), principal propagation (built-in), audit logging (BTP Audit Log), MCP elicitation, intent-based routing (11 vs 287 tools), npm `arc-1` package, Docker image.

---

## Changelog & Relevance Tracker

| Date | Change | Relevant? | Action for ARC-1 | Status |
|------|--------|-----------|-------------------|--------|
| 2026-03-27 | v4.5.2 -- Content-Type negotiation fixes | **Yes** | Add 415 retry logic to ARC-1 HTTP | TODO |
| 2026-03-26 | Lock leak fix (try-finally) | **Critical** | Verify ARC-1 uses try-finally for all unlocks | TODO |
| 2026-03-26 | RAG-optimized tool descriptions | Maybe | Review tool description quality | TODO |
| 2026-03-25 | Auth priority fix | Yes | Verify env var priority in ARC-1 | TODO |
| 2026-03-24 | Husky pre-commit hooks | No | ARC-1 already uses Biome | -- |
| | | | | |

_Last updated: 2026-03-30_
