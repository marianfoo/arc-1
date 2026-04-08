# DassianInc/dassian-adt → albanleong/abap-mcpb

> **Original**: https://github.com/DassianInc/dassian-adt (may be private/removed)
> **Successor**: https://github.com/albanleong/abap-mcpb (created 2026-03-31, MCPB format)
> **Language**: TypeScript / JavaScript | **License**: MIT | **Stars**: 0 (abap-mcpb, very new)
> **Status**: Active — evolved from dassian-adt v2.0 into MCPB format for Claude Desktop
> **Relationship**: Fork of mario-andreschak's wrapper → dassian rewrite → MCPB repackaging

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

| Feature | Priority | Effort | Status (2026-04-02) |
|---------|----------|--------|---------------------|
| `abap_run` (execute ABAP via IF_OO_ADT_CLASSRUN) | Medium | 2d | Not implemented -- needs safety design |
| `abap_get_function_group` (bulk parallel fetch) | Medium | 1d | Not implemented |
| `raw_http` escape hatch | Low | 0.5d | Not implemented -- security concern |
| gCTS integration (git_repos, git_pull) | Low | 2d | Feature flag exists, no tools |
| ~~Elicitation for destructive ops (7 flows)~~ | ~~High~~ | ~~1d~~ | ~~IMPLEMENTED -- src/server/elicit.ts~~ |
| Transport contents (E071 objects list) | Medium | 0.5d | Not implemented |
| Transport assign (no-op save cycle) | Medium | 1d | Not implemented |
| 16 type auto-mappings (CLAS→CLAS/OC, etc.) | Low | 0.5d | Not implemented |
| FUGR metadata-only transport assignment | Low | 1d | Not implemented |
| ATC ciCheckFlavour workaround | Low | 0.5d | Not implemented |
| SAP-domain error hints (SM12, SPAU, L-prefix) | High | 1d | Partial -- basic HTTP hints exist, no SAP-domain |
| ~~Session auto-recovery (withSession wrapper)~~ | ~~Medium~~ | ~~0.5d~~ | ~~IMPLEMENTED -- CSRF refresh + stateful sessions~~ |
| Smart redirect hints (wrong param detection) | Low | 0.5d | Not implemented |
| Per-user browser login page (HTTP mode) | Low | 2d | Not needed -- OIDC/XSUAA covers this |
| AI self-test prompt (scripts/ai-selftest.md) | Low | 0.5d | Not implemented |

See [08-dassian-adt-feature-gap.md](08-dassian-adt-feature-gap.md) for detailed gap analysis with implementation recommendations.

## Features ARC-1 Has That This Project Lacks

Safety system (read-only, op filter, pkg filter, SQL blocking), OIDC/JWT auth, BTP support (Destination Service, PP, Cloud Connector), API key auth, abaplint, caching (SQLite + memory), audit logging, intent-based routing (11 vs 25 tools), code intelligence (find def/refs/completion), npm distribution, Docker image, 707+ unit tests vs 163, MCP elicitation with audit, context compression (SAPContext 7-30x), method-level surgery (95% reduction), hyperfocused mode (~200 tokens), DDLX/SRVB/DOMA/DTEL read, batch activation, MCP scope system (OAuth).

---

## Changelog & Relevance Tracker

| Date | Change | Relevant? | Action for ARC-1 | Status |
|------|--------|-----------|-------------------|--------|
| 2026-04-05 | fix(data): skip decodeQueryResult crash on null DATE columns | Low | Verify ARC-1 RunQuery handles null dates | Evaluated |
| 2026-04-03 | feat: abap_set_class_include tool + session-sticky lock/write/unlock | Medium | Verify ARC-1 crud.ts class include writes | Evaluated |
| 2026-04-03 | fix: batch activation bypass for library array issue | Low | ARC-1 has own batch activation | -- |
| 2026-04-03 | fix: DEVC auto-derives software component + transport layer | Low | ARC-1 package creation handles this differently | -- |
| 2026-04-02 | feat: BDEF creation + STRU type support + abap_edit_method + compact mode | Medium | BDEF create: ARC-1 has. Edit method: ARC-1 has method surgery. | Evaluated |
| 2026-04-01 | MCP quality-of-life: elicitation recovery, batch activation, ATC variant fallback | Low | ARC-1 elicitation already more complete | -- |
| 2026-04-02 | Gap analysis updated (autoclosed PR report) | Yes | See 08-dassian-adt-feature-gap.md | Done |
| 2026-03-30 | abap_where_used tool, abap_atc_run fix | Yes | Review where-used implementation | TODO |
| 2026-03-28 | README cleanup | No | -- | -- |
| 2026-03-27 | Initial commit (v2.0) | Yes | Elicitation patterns reviewed -- ARC-1 now has elicitation | Done |
| | | | | |

## abap-mcpb (Successor — March 31, 2026)

albanleong/abap-mcpb packages dassian-adt v2.0 as an **MCPB** (MCP Bundle) for Claude Desktop. Key differences:
- **Zero build step** — MCPB format with form-based configuration
- **Per-tool permissions** — Claude Desktop's native authorization UI
- **Same 25 tools** as dassian-adt
- 2 files customized from dassian-adt: QualityHandlers.js (enhanced ATC), index.js (error handling)
- Single commit, no releases yet — very early stage

_Last updated: 2026-04-08_
