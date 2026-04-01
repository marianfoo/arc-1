# oisee/vibing-steampunk (Upstream)

> **Repository**: https://github.com/oisee/vibing-steampunk
> **Language**: Go 1.24 | **License**: MIT | **Stars**: 242
> **Status**: Very Active (v2.32.0, daily commits in March 2026)
> **Relationship**: ARC-1's upstream/origin — forked and rewritten in TypeScript

---

## Project Overview

The original Go implementation of a SAP ADT-to-MCP bridge. Provides 99 tools in Expert mode (54 in Focused), with a unique "Hyperfocused" single-tool mode (~200 tokens). Includes a native Go ABAP parser/linter (ported from abaplint), Lua scripting engine, DSL/workflow automation, and experimental WASM/LLVM-to-ABAP compilation. Distributed as a single Go binary via GoReleaser (9 platforms).

Community favorite with 242 stars — highest of any SAP MCP server.

## Architecture

- **Monolithic Go binary** with embedded assets (ABAP sources, abapGit ZIP, SQLite)
- `cmd/vsp/` — CLI (Cobra), `internal/mcp/` — MCP server with 20+ handler files
- `pkg/adt/` — ADT HTTP client, `pkg/abaplint/` — native Go ABAP lexer/parser (3.5M tokens/sec)
- `pkg/ctxcomp/` — context compression, `pkg/scripting/` — Lua engine (50+ bindings)
- `pkg/dsl/` — YAML workflows, `pkg/llvm2abap/` — LLVM IR to ABAP transpiler
- `embedded/abap/` — ABAP classes deployed to SAP (ZADT_VSP handler)

## Tool Inventory (3 operational modes)

| Mode | Tools | Token Cost | Use Case |
|------|-------|-----------|----------|
| Hyperfocused | 1 universal `SAP(action, target, params)` | ~200 tokens | Maximum token efficiency |
| Focused (default) | 54 essential tools | ~14K tokens | Typical development |
| Expert | 99 tools (full set) | ~40K tokens | Advanced/low-level operations |

### Focused Mode (54 tools)
**Unified:** GetSource, WriteSource
**Search:** SearchObject, GrepObjects
**Read:** GetFunctionGroup, GetTable, GetTableContents, GetStructure, GetPackage, GetTransaction, GetTypeInfo, GetCDSDependencies, RunQuery
**System:** GetSystemInfo, GetInstalledComponents
**Analysis:** GetCallGraph
**Dev:** SyntaxCheck, ActivatePackage, RunUnitTests, RunATCCheck, CompareSource, CloneObject, GetClassInfo, CreateTable, CreatePackage
**CRUD:** LockObject, UnlockObject
**Edit:** EditSource (surgical string replacement with syntax check)
**File:** ImportFromFile, ExportToFile
**Code Intel:** FindDefinition, FindReferences
**Debugging:** GetDumps, GetDump
**Profiler:** ListTraces, GetTrace
**SQL Trace:** GetSQLTraceState, ListSQLTraces
**Git:** GitTypes, GitExport
**Install:** InstallZADTVSP, InstallAbapGit, ListDependencies
**Reports:** RunReport, RunReportAsync, GetAsyncResult, GetVariants, GetTextElements, SetTextElements

### Expert Mode adds 45 more tools
GrepObject, GrepPackage, GetProgram, GetClass, GetInterface, GetFunction, GetInclude, GetObjectStructure, GetCallersOf, GetCalleesOf, AnalyzeCallGraph, CompareCallGraphs, TraceExecution, GetATCCustomizing, CreateObject, UpdateSource, DeleteObject, PublishServiceBinding, UnpublishServiceBinding, GetClassInclude, CreateTestInclude, UpdateClassInclude, WriteProgram, WriteClass, CreateAndActivateProgram, CreateClassWithTests, DeployFromFile, SaveToFile, RenameObject, CodeCompletion, PrettyPrint, GetPrettyPrinterSettings, SetPrettyPrinterSettings, GetTypeHierarchy, CreateTransport, GetTransportInfo, ReleaseTransport, GetUserTransports, GetInactiveObjects, ExecuteABAP

### CLI Mode (28 non-MCP commands)
query, grep, graph, deps, lint, parse, compile, plus more — usable without MCP client.

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
| TLS | **No** |

## Supported AI Agents (8)

Gemini CLI, Claude Code, GitHub Copilot, OpenAI Codex, Qwen Code, OpenCode, Goose, Mistral Vibe

## March 2026 Release Sprint

| Version | Date | Key Feature |
|---------|------|-------------|
| **v2.32.0** | Mar 22 | "Full Stack ABAP" — Native ABAP parser/linter (91 statements, 8 rules, 100% accuracy), 28 CLI commands, WASM self-host compiler, Lua scripting (50+ bindings) |
| **v2.30.0** | Mar 20 | WASM-to-ABAP AOT compiler (QuickJS: 1,410 functions → 101K lines ABAP), TS-to-Go transpiler, unified 5-layer code intelligence |
| **v2.29.0** | Mar 19 | Token efficiency sprint — hyperfocused mode (~200 tokens), context compression (7-30x), method-level surgery (95% reduction) |
| **v2.27.0** | Mar 1 | Documentation overhaul, 8 AI agent configs, reviewer guide |
| **v2.26.0** | Feb 4 | Package validation fix for local packages ($TMP) |
| **v2.24.0** | Feb 3 | Transportable edits safety feature |
| **v2.22.0** | Feb 1 | Transport fixes, proxy support, MoveObject tool |
| **v2.21.0** | Jan 6 | Method-level source operations (95% token reduction) |

## Testing

- 222 unit tests
- Integration tests require live SAP
- Benchmark tests for context compression
- GoReleaser CI for 9 platforms

## Dependencies

mcp-go v0.17.0, Cobra, Viper, go-sqlite3, godotenv, yaml.v3, Gopher-Lua, WebSocket library

## Community Presence

- Listed on MCP Store, LobeHub MCP directory
- SAP Community blog: "Try Vibing Steampunk to generate ABAP" (setup guide)
- SAP Community: "The Future of SAP ABAP Based Systems with AI: Why MCP Servers Matter"
- Medium: "Vibe Steam Punk (VSP) for ABAP Cloud, Mac & Claude" (Warren Eiserman, Feb 2026)
- Referenced in: "Claude Code via MCP: Poor man's Joule, or a practical tool"

## Known Issues

| Issue | Description | Relevant to ARC-1? |
|-------|-------------|-------------------|
| #79 | Session not found — needs stateless ADT sessions | Yes — handle session errors gracefully |
| #78 | 423 lock handle errors on ECC 6.0 EHP7 | Yes — test lock handling on older systems |
| #77 | No browser-based SSO authentication | ARC-1 already has OIDC |
| #76 | Call graph fallback broken for namespaced objects | If implementing call graphs |
| #75 | InstallZADTVSP not idempotent on ABAP 758 trial | N/A (ARC-1 doesn't deploy ABAP) |
| #74 | Missing CDS metadata extension (DDLX/EX) | Yes — add DDLX support |
| #56 | Unable to create new programs | Yes — verify create operations |

---

## Features ARC-1 Has That Upstream Lacks

| Feature | Notes |
|---------|-------|
| HTTP Streamable transport | Multi-user, web-deployable |
| OIDC/JWT authentication | Enterprise SSO |
| BTP Destination Service | Cloud-native SAP connectivity |
| BTP ABAP Environment (OAuth 2.0) | Direct BTP connection |
| Principal Propagation | Per-user SAP auth |
| API Key auth | Simple MCP endpoint protection |
| MCP scope system (OAuth) | Scope-gated tool access |
| Audit logging | BTP Audit Log sink |
| MCP elicitation | Interactive parameter collection |
| npm/Docker distribution | Easy installation |
| XSUAA OAuth proxy | BTP-native OAuth |
| Cloud Connector support | On-prem via BTP |

## Features Upstream Has That ARC-1 Lacks

| Feature | Priority | Effort | Notes |
|---------|----------|--------|-------|
| **Hyperfocused mode** (1 tool, ~200 tokens) | Medium | 2d | Token optimization for simple tasks |
| **Method-level surgery** (EditSource) | High | 2d | 95% source reduction for single-method edits |
| **Native ABAP parser/linter** (Go port, 8 rules) | Low | N/A | ARC-1 uses @abaplint/core (same source) |
| **ABAP debugger** (8 tools) | Low | 5d | Requires ZADT_VSP deployment |
| **AMDP/HANA debugger** (7 tools) | Low | 5d | Requires WebSocket + ZADT_VSP |
| **Lua scripting engine** (50+ bindings) | Low | N/A | Not core MCP value |
| **WASM-to-ABAP compiler** | Low | N/A | Experimental |
| **Call graph analysis** (5 tools) | Medium | 3d | Useful for code understanding |
| **Short dump analysis** (ST22) | Critical | 1d | Basic diagnostic capability |
| **ABAP profiler traces** | Medium | 2d | Runtime performance diagnostics |
| **SQL trace monitoring** | Medium | 1d | Performance diagnostics |
| **Report execution** (RunReport, async) | Medium | 3d | Requires WebSocket |
| **ExecuteABAP** | Low | 2d | Security risk, needs safety gating |
| **UI5/Fiori BSP CRUD** (7 tools) | Medium | 3d | If UI5 feature detected |
| **Git/abapGit export** | Medium | 2d | If abapGit feature detected |
| **PrettyPrint** (code formatting) | Medium | 1d | Via ADT API |
| **CompareSource** (diff) | Medium | 1d | Source comparison |
| **CloneObject** | Low | 1d | Copy object to new name |
| **CLI mode** (28 commands, no MCP) | Low | N/A | Different distribution model |
| **GetAbapHelp** (F1 documentation) | Medium | 0.5d | ABAP keyword help |
| **Structures read** | High | 1d | Basic DDIC gap |
| **Transactions read** | High | 0.5d | Navigation context |
| **Type hierarchy** | Medium | 1d | OO navigation |
| **CDS dependencies** | Medium | 1d | CDS navigation |
| **Inactive objects list** | Medium | 0.5d | Development workflow |

---

## Changelog & Relevance Tracker

| Date | Upstream Change | Relevant? | Action for ARC-1 | Status |
|------|----------------|-----------|-------------------|--------|
| 2026-03-29 | LLVM-to-ABAP transpiler improvements | No | N/A | — |
| 2026-03-22 | v2.32.0 — Native ABAP parser/linter, 28 CLI commands | Review | Parser: no (same abaplint). CLI: no. | — |
| 2026-03-20 | v2.30.0 — WASM Compiler + TS Transpiler | No | N/A | — |
| 2026-03-19 | v2.29.0 — Hyperfocused mode, method-level surgery | Yes | Review for token optimization | TODO |
| 2026-03-01 | v2.27.0 — 8 AI agent configs | Maybe | Review agent config patterns | TODO |
| 2026-02-03 | v2.24.0 — Transportable edits safety | No | ARC-1 already has this | — |

_Last updated: 2026-04-01_
