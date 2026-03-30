# DassianInc/dassian-adt

> **Repository**: https://github.com/DassianInc/dassian-adt
> **Language**: TypeScript | **License**: MIT | **Stars**: New
> **Status**: Very New/Active (created 2026-03-27, 13 commits, daily updates)
> **Relationship**: Fork of mario-andreschak's wrapper, rewritten with elicitation and validation

---

## Project Overview

A 3-day-old rewrite building on the `abap-adt-api` library (v7.1.2 by Marcello Urbani) with 25+ tools. Key differentiator: heavy use of **MCP elicitation** for interactive parameter collection (package selection, transport numbers, delete confirmation), extensive error intelligence with self-correction hints, and a unique `abap_run` tool for direct ABAP execution.

Backed by Dassian Inc. (commercial entity). MIT licensed but includes Azure enterprise deployment guides.

## Architecture

```
src/
  server.ts          # MCP server setup (stdio + HTTP)
  handlers/
    BaseHandler.ts   # Input validation, session recovery, error formatting
    SourceHandlers   # get/set source, function group bulk
    ObjectHandlers   # CRUD, search, activation
    RunHandlers      # ABAP execution via IF_OO_ADT_CLASSRUN
    TransportHandlers # CTS operations
    DataHandlers     # SQL queries, table contents
    QualityHandlers  # Syntax check, ATC, where-used
    GitHandlers      # gCTS repos, pull
    SystemHandlers   # login, health, dumps, raw HTTP
```

All handlers delegate to `abap-adt-api` v7.1.2.

## Tool Inventory (25+ tools)

### Source (3)
| Tool | Description |
|------|-------------|
| `abap_get_source` | Read source code by name + type |
| `abap_set_source` | Write with auto lock/unlock, transport elicitation |
| `abap_get_function_group` | Fetch ALL includes + FMs in one call (parallel fetch) |

### Object (5)
| Tool | Description |
|------|-------------|
| `abap_create` | Create objects (16 type auto-mappings, package elicitation) |
| `abap_delete` | Delete with elicitation confirmation for non-$TMP |
| `abap_activate` | Activate with inactive-dependents elicitation |
| `abap_search` | Wildcard search |
| `abap_object_info` | Metadata (package, transport layer, active/inactive) |

### Run (1)
| Tool | Description |
|------|-------------|
| `abap_run` | Create temp class → execute via IF_OO_ADT_CLASSRUN → capture output → cleanup |

### Transport (6)
transport_create, transport_assign, transport_release (with elicitation), transport_list, transport_info, transport_contents

### Data (2)
| Tool | Description |
|------|-------------|
| `abap_query` | Free SQL via ADT freestyle data preview |
| `abap_table` | Table/CDS contents (auto-routes LIKE/BETWEEN to freestyle) |

### Quality (3)
abap_syntax_check, abap_atc_run (with ciCheckFlavour workaround), abap_where_used (with optional snippets)

### Git (2)
git_repos (gCTS), git_pull

### System (4)
login, healthcheck, abap_get_dump (ST22), raw_http (arbitrary ADT requests)

## Authentication

| Method | Supported |
|--------|-----------|
| Basic Auth (stdio) | Yes -- shared SAP_USER/SAP_PASSWORD |
| Per-user browser login (HTTP) | Yes -- /login page, session-based |
| Shared service account (HTTP) | Yes -- env var credentials |
| OIDC/OAuth/JWT | **No** |
| BTP | **No** |
| API Key | **No** |

## Safety/Security

**No safety system.** No read-only mode, no operation filtering, no package restrictions, no SQL blocking. All 25+ tools always available including `raw_http` (arbitrary ADT HTTP calls).

**MCP elicitation** provides UX guardrails (confirmation for delete, transport release) but no hard blocks.

**Error intelligence**: classifies SAP errors, provides actionable hints (SM12 for locks, SPAU for upgrades).

## Transport (MCP Protocol)

| Transport | Supported |
|-----------|-----------|
| stdio | Yes (default) |
| HTTP Streamable | Yes (configurable port/path) |
| SSE | **No** |

## Testing

163 unit tests (Jest): URL builder, error classification, input validation. Integration test scaffold exists. AI self-test prompt in `scripts/ai-selftest.md`.

## Dependencies

@modelcontextprotocol/sdk ^1.28.0, abap-adt-api ^7.1.2, dotenv ^16.4.7
Dev: jest ^29.7.0, ts-jest ^29.2.5

## Known Issues

| Issue | Description | Relevant to ARC-1? |
|-------|-------------|-------------------|
| No safety system | AI can do anything including raw HTTP | ARC-1's safety system is a major differentiator |
| No caching | Every request hits SAP | ARC-1 has SQLite + memory |
| No linting | No abaplint | ARC-1 has abaplint integration |
| No BTP | No Destination Service, no PP | ARC-1 has full BTP support |
| abap-adt-api workarounds | Several bypass the library | Validate ARC-1's custom HTTP handles edge cases |
| raw_http | Unrestricted ADT HTTP | Potential security concern |
| .DS_Store committed | macOS metadata in git | N/A |

---

## Features This Project Has That ARC-1 Lacks

| Feature | Priority | Effort | Place in ARC-1 or mcp-sap-docs? |
|---------|----------|--------|--------------------------------|
| `abap_run` (execute ABAP via IF_OO_ADT_CLASSRUN) | Medium | 2d | ARC-1 -- with safety gating |
| `abap_get_function_group` (bulk parallel fetch) | High | 1d | ARC-1 -- reduces round trips |
| `raw_http` escape hatch | Low | 0.5d | ARC-1 -- only with safety gating |
| gCTS integration (git_repos, git_pull) | Medium | 2d | ARC-1 -- if gCTS feature detected |
| Elicitation for destructive ops (7 flows) | High | 1d | ARC-1 -- already have elicitation |
| Transport contents (E071 objects list) | Medium | 0.5d | ARC-1 -- extend SAPTransport |
| 16 type auto-mappings (CLAS→CLAS/OC, etc.) | High | 0.5d | ARC-1 -- improve SAPWrite UX |
| FUGR metadata-only transport assignment | Medium | 1d | ARC-1 -- avoids inactive versions |
| ATC ciCheckFlavour workaround | High | 0.5d | ARC-1 -- robustness for older systems |
| Error intelligence with self-correction hints | High | 1d | ARC-1 -- improve error messages |
| Session auto-recovery (withSession wrapper) | Medium | 0.5d | ARC-1 -- verify session handling |
| Smart redirect hints (wrong param detection) | Medium | 0.5d | ARC-1 -- improve tool UX |
| Per-user browser login page (HTTP mode) | Low | 2d | ARC-1 -- OIDC already covers this |
| AI self-test prompt (scripts/ai-selftest.md) | Medium | 0.5d | ARC-1 -- test harness idea |

## Features ARC-1 Has That This Project Lacks

Safety system (read-only, op filter, pkg filter, SQL blocking), OIDC/JWT auth, BTP support (Destination Service, PP, Cloud Connector), API key auth, abaplint, caching (SQLite + memory), audit logging, intent-based routing (11 vs 25 tools), code intelligence (find def/refs/completion), npm distribution, Docker image, 320+ unit tests vs 163.

---

## Changelog & Relevance Tracker

| Date | Change | Relevant? | Action for ARC-1 | Status |
|------|--------|-----------|-------------------|--------|
| 2026-03-30 | abap_where_used tool, abap_atc_run fix | Yes | Review where-used implementation | TODO |
| 2026-03-28 | README cleanup | No | -- | -- |
| 2026-03-27 | Initial commit (v2.0) | Yes | Full review of elicitation patterns | TODO |
| | | | | |

_Last updated: 2026-03-30_
