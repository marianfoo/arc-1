# fr0ster/mcp-abap-adt

> **Repository**: https://github.com/fr0ster/mcp-abap-adt
> **Language**: TypeScript | **License**: MIT | **Stars**: 26
> **Status**: Very Active (v4.7.1, 83 releases in 5 months, 765 commits)
> **NPM**: `@mcp-abap-adt/core` — 3,625 monthly downloads
> **Relationship**: Independent TypeScript ADT MCP server with most advanced auth system

---

## Project Overview

A multi-package monorepo MCP server for SAP ADT with 287 tools organized across 4 exposition tiers (read-only 52, high-level 113, low-level 122, compact 22). Features the most comprehensive authentication system of any project (9 providers including SAML, OIDC device flow, token exchange). Strict interface isolation via separate npm packages.

Key differentiator: "AI Pairing, Not Vibing (AIPNV)" philosophy — positioned as pair programming assistant, not autopilot.

## Architecture

Multi-package ecosystem with 7+ npm packages under `@mcp-abap-adt` scope:

| Package | Purpose | NPM Monthly |
|---------|---------|-------------|
| `@mcp-abap-adt/core` | Main MCP server, composition root | 3,625 |
| `@mcp-abap-adt/adt-clients` | Builder-first ABAP object CRUD (449 commits in own repo) | 5,074 |
| `@mcp-abap-adt/auth-broker` | Token orchestration (cache → refresh → browser flow) | 1,051 |
| `@mcp-abap-adt/connection` | HTTP transport (CSRF, cookies, sessions) | — |
| `@mcp-abap-adt/logger` | Pino-based structured logging | — |
| `@mcp-abap-adt/configurator` | Auto-config for 11 MCP clients (`mcp-conf` CLI) | — |
| `@mcp-abap-adt/sap-rfc-lite` | Lightweight RFC (replaces archived node-rfc, v4.7.0) | — |

Design principles: Interface-Only Communication (IOC), Dependency Inversion, single composition root.

### Companion Repos
- **fr0ster/mcp-abap-adt-clients** — 449 commits, ADT client library with batch operations, lock registry, WebSocket facade
- **fr0ster/mcp-abap-adt-auth-broker** — JWT authentication broker for multi-destination token management

## Tool Inventory (287 tools across 4 tiers)

### Read-Only Tier (52 tools)
ReadClass, ReadProgram, ReadInterface, ReadDomain, ReadDataElement, ReadStructure, ReadTable, ReadView, ReadFunctionGroup, ReadFunctionModule, ReadBehaviorDefinition, ReadBehaviorImplementation, ReadMetadataExtension, ReadServiceDefinition, ReadServiceBinding, ReadPackage, GetProgFullCode, GetInclude, GetIncludesList, GetPackageContents, SearchObject, GetObjectsByType, GetObjectsList, GetWhereUsed, GetObjectInfo, GetObjectStructure, GetObjectNodeFromCache, GetAbapAST, GetAbapSemanticAnalysis, GetAbapSystemSymbols, GetAdtTypes, GetInactiveObjects, GetSession, GetSqlQuery, GetTransaction, GetTypeInfo, DescribeByList, GetTransport, ListTransports, GetEnhancements, GetEnhancementSpot, GetEnhancementImpl, RuntimeListDumps, RuntimeGetDumpById, RuntimeAnalyzeDump, RuntimeListProfilerTraceFiles, RuntimeGetProfilerTraceData, RuntimeAnalyzeProfilerTrace, RuntimeCreateProfilerTraceParameters, RuntimeRunClassWithProfiling, RuntimeRunProgramWithProfiling

### High-Level Tier (113 tools)
Full CRUD with automatic lock/activate for 16+ object types: Classes (including local definitions, types, macros, test classes), Programs, Interfaces, Domains, Data Elements, Structures, Tables, Views (CDS), Function Groups/Modules, Service Definitions/Bindings, Behavior Definitions/Implementations, Metadata Extensions (DDLX), Packages, Transports, Unit Tests (ABAP + CDS)

### Low-Level Tier (122 tools)
Fine-grained per-operation-per-object: Lock/Unlock/Check/Activate/Validate/Create/Update/Delete + generic variants

### Compact Tier (22 tools)
Unified by `object_type` parameter: HandlerCreate, HandlerGet, HandlerUpdate, HandlerDelete, HandlerActivate, HandlerLock, HandlerUnlock, HandlerValidate, HandlerCheckRun, HandlerTransportCreate, HandlerUnitTestRun/Status/Result, HandlerCdsUnitTestStatus/Result, HandlerDumpList/View, HandlerProfileList/Run/View, HandlerServiceBindingListTypes/Validate

## Authentication (9 Providers — Most Advanced)

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

- **Exposition control**: Limit active tool tiers (read-only, high-level, low-level, compact)
- **try-finally unlock**: Fixed in v4.5.0 — prevents lock leaks
- **Sensitive data redaction** in logs (Pino)
- **Session isolation**: HTTP/SSE = fresh connections per-request
- **`--unsafe` flag**: Controls file-based vs in-memory session persistence
- **SAP_SYSTEM_TYPE**: On-premise vs cloud tool availability
- **Lock registry**: Persistent `.locks/active-locks.json` with CLI recovery tools
- **No read-only flag or op filtering** like ARC-1 — relies on exposition control only

## Transport (MCP Protocol)

| Transport | Supported |
|-----------|-----------|
| stdio | Yes (default) |
| HTTP Streamable | Yes (`--http-port`) |
| SSE | Yes (`--sse-port`) |
| TLS/HTTPS | Yes (v4.6.0: `--tls-cert`, `--tls-key`, `--tls-ca`) |

## Configuration

- CLI args, environment variables, YAML config files
- `--mcp=<destination>`: service key selection
- `--auth-broker`: force auth-broker usage
- `--connection-type`: http or rfc
- Health endpoint: `GET /mcp/health` (v4.3.0)
- Configurator: `mcp-conf --client cline --name abap --mcp TRIAL`

## Testing

- Jest (unit + integration)
- Integration tests by handler tier and object type
- YAML test config (`test-config.yaml`)
- Global setup/teardown for lifecycle
- Test helpers: HighTester, LowTester, LambdaTester
- Husky + lint-staged pre-commit hooks (v4.5.2)

## Dependencies

Runtime: @modelcontextprotocol/sdk ^1.27.1, axios ^1.13.6, fast-xml-parser ^5.4.2, xml-js ^1.6.11, pino ^10.1.0, js-yaml ^4.1.1, zod ^4.3.6
Optional: @mcp-abap-adt/sap-rfc-lite (replaces archived node-rfc, v4.7.0)
Dev: Biome, Jest, TypeScript, Express, Husky

## Release History (Major Milestones)

| Version | Date | Key Changes |
|---------|------|-------------|
| v4.7.0-4.7.1 | Apr 1, 2026 | Replaced archived `node-rfc` with `@mcp-abap-adt/sap-rfc-lite` |
| v4.6.0 | Mar 31, 2026 | HTTPS/TLS support for MCP server |
| v4.5.0-4.5.2 | Mar 26-27, 2026 | try-finally lock fix, RAG-optimized descriptions, auth priority fix |
| v4.4.0 | Mar 22, 2026 | Tool descriptions enriched for embedding-based discovery |
| v4.3.0 | Mar 19, 2026 | `/mcp/health` endpoint, improved request logging |
| v4.0.0-4.1.1 | Mar 13, 2026 | Major version bump (v3→v4) |
| v3.x | Mar 3-6, 2026 | Short-lived (3 releases) |
| v2.x | Dec 30, 2025 - Feb 23, 2026 | ~20 releases |
| v1.1.0 | Nov 21, 2025 | First release |

**Total: 83 releases in ~5 months. Average: ~4 releases/week.**

## Known Issues

| Issue | Description | Relevant to ARC-1? |
|-------|-------------|-------------------|
| #22 | Lock leak — try-catch instead of try-finally for unlock | **Resolved** — ARC-1 already uses try-finally |
| #22, #23, #25 | 415 Content-Type errors — SAP needs specific Accept/Content-Type | **Yes** — add 415 retry logic |
| #24 | SAP_JWT_TOKEN overrides SAP_AUTH_TYPE | Yes — check env var priority |
| #7 | 409 conflict not propagated to LLM | Yes — ensure conflict errors are clear |
| #13 | Check runs fail with non-EN languages | Yes — verify language handling |
| BTP Cloud | Data preview may not work | Yes — document BTP limitations |

---

## Features This Project Has That ARC-1 Lacks

| Feature | Priority | Effort | Notes |
|---------|----------|--------|-------|
| **9 auth providers** (SAML, OIDC device flow, etc.) | Low | 5d+ | Only if enterprise demand |
| **TLS/HTTPS for MCP server** | Critical | 1d | Required for production without reverse proxy |
| **sap-rfc-lite** (RFC connectivity) | Low | 3d | Alternative to ADT HTTP |
| **Auto-configurator** for 11 MCP clients | High | 2d | Great onboarding UX |
| **SSE transport** | Medium | 2d | If clients need it |
| **Runtime profiling** (execute + profile) | Medium | 2d | Extend SAPDiagnose |
| **Runtime dump analysis** (list + analyze) | Critical | 1d | Basic diagnostic gap |
| **ABAP AST parsing** (JSON syntax tree) | Medium | 3d | Could enhance code intelligence |
| **Semantic analysis + system symbols** | Medium | 3d | Advanced code intel |
| **Enhancement discovery** (spots + implementations) | Medium | 2d | Useful for customization |
| **CDS unit testing** (create/run/check) | Medium | 1d | Extend SAPDiagnose |
| **Embeddable server** (EmbeddableMcpServer) | Low | 1d | SDK/library use case |
| **GetProgFullCode** (recursive includes) | High | 1d | Reduces round trips |
| **Content-Type 415 auto-retry** | Critical | 0.5d | Robustness improvement |
| **Compact mode** (22 tools) | Low | 2d | ARC-1 already has intent-based |
| **RAG-optimized tool descriptions** | Medium | 1d | Improve embedding discoverability |
| **DDLX/Metadata Extension** (read + CRUD) | Critical | 1d | RAP completeness |
| **Health check endpoint** | — | — | ARC-1 already has /health |
| **Lock registry with crash recovery** | Low | 2d | Persistent lock state |
| **Batch HTTP operations** (multipart/mixed) | Medium | 2d | Reduces SAP round trips |
| **Service Binding read/CRUD** | High | 1d | RAP completeness |

## Features ARC-1 Has That This Project Lacks

- abaplint integration (local offline linting)
- SQLite caching
- Read-only mode + op filtering + package filtering + SQL blocking + transport gating + dry-run
- MCP scope system (OAuth scope-gated tools)
- BTP Destination Service (built-in, not just service keys)
- Principal propagation (per-user SAP identity)
- Cloud Connector proxy
- Audit logging (BTP Audit Log sink)
- MCP elicitation (interactive parameter collection)
- Intent-based routing (11 vs 287 tools — simpler LLM decision surface)
- npm `arc-1` package + Docker image
- Context compression (SAPContext with depth control)
- BOR business objects read
- Messages (T100) read
- release-please CI/CD pipeline

---

## Changelog & Relevance Tracker

| Date | Change | Relevant? | Action for ARC-1 | Status |
|------|--------|-----------|-------------------|--------|
| 2026-04-01 | v4.7.0-4.7.1 — sap-rfc-lite replaces node-rfc | No | ARC-1 uses HTTP only | — |
| 2026-03-31 | v4.6.0 — TLS/HTTPS support | **Critical** | Add TLS support for HTTP Streamable | TODO |
| 2026-03-27 | v4.5.2 — Content-Type negotiation fixes | **Yes** | Add 415 retry logic to ARC-1 HTTP | TODO |
| 2026-03-26 | v4.5.0 — Lock leak fix (try-finally) | Resolved | ARC-1 already uses try-finally | Done |
| 2026-03-26 | RAG-optimized tool descriptions | Maybe | Review tool description quality | TODO |
| 2026-03-25 | Auth priority fix | Yes | Verify env var priority in ARC-1 | TODO |
| 2026-03-22 | v4.4.0 — Embedding-optimized descriptions | Maybe | Review for adoption | TODO |
| 2026-03-19 | v4.3.0 — /mcp/health endpoint | No | ARC-1 already has /health | — |
| 2026-03-13 | v4.0.0 — Major version bump | Review | Check for breaking changes | TODO |

_Last updated: 2026-04-01_
