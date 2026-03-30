# oisee/vibing-steampunk (Upstream)

> **Repository**: https://github.com/oisee/vibing-steampunk
> **Language**: Go 1.24 | **License**: MIT | **Stars**: ~235
> **Status**: Very Active (daily commits, v2.32.0 as of 2026-03-22)
> **Relationship**: ARC-1's upstream/origin -- forked and rewritten in TypeScript

---

## Project Overview

The original Go implementation of a SAP ADT-to-MCP bridge. Provides ~122 tools in Expert mode, with a unique "Hyperfocused" single-tool mode. Includes an embedded ABAP lexer, Lua scripting engine, DSL/workflow automation, and experimental WASM/LLVM-to-ABAP compilation. Distributed as a single Go binary via GoReleaser (9 platforms).

## Architecture

- **Monolithic Go binary** with embedded assets (ABAP sources, abapGit ZIP, SQLite)
- `cmd/vsp/` -- CLI (Cobra), `internal/mcp/` -- MCP server with 20+ handler files
- `pkg/adt/` -- ADT HTTP client, `pkg/abaplint/` -- native Go ABAP lexer (48 token types)
- `pkg/ctxcomp/` -- context compression, `pkg/scripting/` -- Lua engine, `pkg/dsl/` -- YAML workflows
- `pkg/llvm2abap/` -- LLVM IR to ABAP transpiler (experimental)
- `embedded/abap/` -- ABAP classes deployed to SAP (ZADT_VSP handler)

## Tool Inventory (~122 tools, 3 operational modes)

| Mode | Tools | Token Cost |
|------|-------|-----------|
| Hyperfocused | 1 universal `SAP(action, target, params)` | ~200 tokens |
| Focused (default) | ~81 essential tools | ~14K tokens |
| Expert | ~122 tools (full set) | ~40K tokens |

### Read Operations
GetProgram, GetClass, GetInterface, GetFunction, GetTable, GetTableContents, GetStructure, GetPackage, GetMessages, GetTransaction, GetTypeInfo, GetCDSDependencies, RunQuery

### Search
SearchObject, GrepObject, GrepPackage, GrepObjects, GrepPackages

### Code Intelligence
FindDefinition, FindReferences, CodeCompletion, GetContext, GetTypeHierarchy, GetClassComponents

### Development Tools
SyntaxCheck, Activate, ActivatePackage, RunUnitTests, RunATCCheck, GetATCCustomizing, PrettyPrint, Get/SetPrettyPrinterSettings, GetInactiveObjects, ExecuteABAP

### CRUD
LockObject, UnlockObject, UpdateSource, CreateObject, CreatePackage, CreateTable, DeleteObject, CompareSource, CloneObject, GetUserTransports, GetTransportInfo

### Class-Specific
GetClassInclude, CreateTestInclude, UpdateClassInclude, PublishServiceBinding, UnpublishServiceBinding

### Composite Workflows
WriteProgram, WriteClass, CreateAndActivateProgram, CreateClassWithTests, EditSource (surgical string replacement)

### File I/O
DeployFromFile, SaveToFile, ImportFromFile, ExportToFile, RenameObject

### Call Graph / Analysis
GetCallGraph, GetCallersOf, GetCalleesOf, AnalyzeCallGraph, CompareCallGraphs, GetObjectStructure, TraceExecution

### ABAP Debugger (8 tools)
DebuggerListen, DebuggerAttach, DebuggerDetach, DebuggerStep, DebuggerGetStack, DebuggerGetVariables, SetBreakpoint, GetBreakpoints, DeleteBreakpoint

### AMDP/HANA Debugger (7 tools)
AMDPDebuggerStart/Resume/Stop/Step, AMDPGetVariables, AMDPSet/GetBreakpoints

### Diagnostics
ListDumps, GetDump, ListTraces, GetTrace, GetSQLTraceState, ListSQLTraces

### Transport/CTS
ListTransports, GetTransport, CreateTransport, ReleaseTransport, DeleteTransport

### UI5/Fiori BSP (7 tools)
UI5ListApps, UI5GetApp, UI5GetFileContent, UI5UploadFile, UI5DeleteFile, UI5CreateApp, UI5DeleteApp

### Git/abapGit
GitTypes, GitExport

### Reports
RunReport, RunReportAsync, GetAsyncResult, GetVariants, GetTextElements, SetTextElements

### Installation/Deploy
InstallZADTVSP, ListDependencies, InstallAbapGit, InstallDummyTest, DeployZip

### System
GetSystemInfo, GetInstalledComponents, GetConnectionInfo, GetFeatures, GetAbapHelp, CallRFC, MoveObject

## Authentication

| Method | Supported |
|--------|-----------|
| Basic Auth | Yes |
| Cookie-based (Netscape format) | Yes |
| OIDC/OAuth/JWT | **No** |
| BTP Destination Service | **No** |
| Principal Propagation | **No** |
| API Key (MCP endpoint) | **No** |

## Safety System

Same architecture as ARC-1 (ARC-1 inherited this design):
- 13 operation type codes: R, S, Q, F, C, U, D, A, T, L, I, W, X
- ReadOnly, BlockFreeSQL, AllowedOps/DisallowedOps, AllowedPackages
- EnableTransports, TransportReadOnly, AllowedTransports, AllowTransportableEdits
- DryRun mode
- Pre-configured profiles: Default (read-only), Development, Unrestricted

## Transport (MCP Protocol)

| Transport | Supported |
|-----------|-----------|
| stdio | Yes (only) |
| HTTP Streamable | **No** |
| SSE | **No** |

## Testing

- 222 unit tests
- Integration tests require live SAP
- Benchmark tests for context compression
- GoReleaser CI for 9 platforms

## Dependencies

mcp-go v0.17.0, Cobra, Viper, go-sqlite3, godotenv, yaml.v3, Gopher-Lua, WebSocket library

## Known Issues

| Issue | Description | Relevant to ARC-1? |
|-------|-------------|-------------------|
| #79 | Session not found -- needs stateless ADT sessions | Yes -- ARC-1 should handle session errors gracefully |
| #78 | 423 lock handle errors on ECC 6.0 EHP7 | Yes -- test lock handling on older systems |
| #77 | No browser-based SSO authentication | ARC-1 already has OIDC |
| #76 | Call graph fallback broken for namespaced objects | If implementing call graphs |
| #75 | InstallZADTVSP not idempotent on ABAP 758 trial | N/A (ARC-1 doesn't deploy ABAP) |
| #74 | Missing CDS metadata extension (DDLX/EX) | Yes -- add DDLX support |
| #56 | Unable to create new programs | Yes -- verify create operations |
| #55 | RunReport fails in APC context | N/A unless implementing reports |
| stdio only | No HTTP/SSE transport | ARC-1 already has HTTP Streamable |

---

## Features ARC-1 Has That Upstream Lacks

| Feature | Notes |
|---------|-------|
| HTTP Streamable transport | Multi-user, web-deployable |
| OIDC/JWT authentication | Enterprise SSO |
| BTP Destination Service | Cloud-native SAP connectivity |
| Principal Propagation | Per-user SAP auth |
| API Key auth | Simple MCP endpoint protection |
| Audit logging | BTP Audit Log sink |
| MCP elicitation | Interactive parameter collection |
| npm/Docker distribution | Easy installation |
| XSUAA OAuth proxy | BTP-native OAuth |

## Features Upstream Has That ARC-1 Lacks

| Feature | Priority | Effort | Place in ARC-1 or mcp-sap-docs? |
|---------|----------|--------|--------------------------------|
| Hyperfocused mode (1 tool) | Medium | 2d | ARC-1 -- token optimization |
| Context compression (auto-append deps) | High | 3d | ARC-1 -- already have SAPContext |
| Method-level surgery (EditSource) | High | 2d | ARC-1 -- surgical edits reduce tokens |
| ABAP debugger (8 tools) | Low | 5d | ARC-1 -- requires ZADT_VSP deployment |
| AMDP/HANA debugger (7 tools) | Low | 5d | ARC-1 -- requires WebSocket + ZADT_VSP |
| Lua scripting engine | Low | N/A | Not for ARC-1 |
| DSL/Workflow engine | Low | N/A | Not for ARC-1 |
| Call graph analysis | Medium | 3d | ARC-1 -- useful for code understanding |
| Short dump analysis | High | 1d | ARC-1 -- already in SAPDiagnose |
| SQL trace monitoring | Medium | 1d | ARC-1 -- extend SAPDiagnose |
| Report execution | Medium | 3d | ARC-1 -- requires WebSocket |
| ExecuteABAP | Low | 2d | ARC-1 -- security risk, needs safety |
| UI5/Fiori BSP CRUD | Medium | 3d | ARC-1 -- if UI5 feature detected |
| Git/abapGit export | Medium | 2d | ARC-1 -- if abapGit feature detected |
| PrettyPrint | Medium | 1d | ARC-1 -- add to SAPWrite |
| CompareSource | Medium | 1d | ARC-1 -- add to SAPRead |
| CloneObject | Low | 1d | ARC-1 -- add to SAPWrite |
| EditSource surgical edits | High | 2d | ARC-1 -- reduces token usage significantly |
| Tool group disabling (letter codes) | Low | 0.5d | ARC-1 already has allowedOps/disallowedOps |
| WASM/LLVM compilation | Low | N/A | Not for ARC-1 (experimental) |
| GetAbapHelp | Medium | 0.5d | mcp-sap-docs -- documentation tool |
| CallRFC | Low | 3d | ARC-1 -- requires WebSocket + ZADT_VSP |

---

## Changelog & Relevance Tracker

| Date | Upstream Change | Relevant? | Action for ARC-1 | Status |
|------|----------------|-----------|-------------------|--------|
| 2026-03-29 | LLVM-to-ABAP transpiler improvements | No | N/A | -- |
| 2026-03-22 | v2.32.0 "Full Stack ABAP" release | Review | Check for new ADT endpoints | TODO |
| 2026-03-20 | WASM Compiler + TS Transpiler | No | N/A | -- |
| 2026-03-19 | Token Efficiency Sprint (v2.29.0) | Yes | Review context compression changes | TODO |
| | | | | |

_Last updated: 2026-03-30_
