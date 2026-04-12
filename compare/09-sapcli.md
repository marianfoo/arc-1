# jfilak/sapcli

> **Repository**: https://github.com/jfilak/sapcli
> **Language**: Python 3.10+ | **License**: Apache-2.0 | **Stars**: 77 | **Forks**: 28
> **Status**: Very active — last commit 2026-04-09, 488 commits by primary author
> **Type**: CLI tool (not MCP), CI/CD-focused ABAP development automation

---

## Project Overview

sapcli is a **Python 3 command-line interface** for SAP ABAP development, primarily targeting the ADT REST API. Created in 2018 by Jakub Filak, it's one of the oldest open-source ADT clients and focuses on **CI/CD automation**: running unit tests, ATC checks, managing transports, deploying via abapGit, and round-tripping ABAP objects to/from filesystem in abapGit format.

Not an MCP server — it's a traditional CLI tool with argparse-based subcommands. Designed for scripting and pipeline use, not LLM integration. However, it has the **deepest ADT API coverage** of any non-SAP open-source project and several mature patterns worth studying.

## Architecture

```
sap/
  adt/              # ADT REST API client layer
    core.py         # Connection class (HTTP, CSRF, sessions)
    objects.py      # ADTObject base class (all types inherit)
    annotations.py  # XML-to-object mapper (metaclass + decorators)
    marshalling.py  # XML serialization/deserialization
    programs.py     # PROG, INCL
    oo.py           # CLAS, INTF
    function.py     # FUGR, FUMO
    datadefinition.py  # DDLS, DCL, SRVD, SRVB
    businessobj.py  # BDEF
    package.py      # DEVC
    dataelement.py  # DTEL
    structure.py    # STRU
    table.py        # TABL
    checks.py       # Syntax check, ATC
    aunit.py        # ABAP Unit tests + coverage
    activation.py   # Mass activation
    cts.py          # CTS transport management
    search.py       # Quick object search
    whereused.py    # Where-used analysis
    abapgit.py      # abapGit ADT plugin API
    discovery.py    # ADT service discovery (MIME version negotiation)
    errors.py       # Typed error hierarchy
    enhancement_implementation.py  # BAdI, enhancements
    feature_toggle.py  # Feature toggle management
  cli/              # CLI command groups (one file per group)
    core.py         # CommandGroup pattern
    __init__.py     # Command registry
    _entry.py       # Entry point, connection dispatch
    program.py, classs.py, interface.py, ddl.py, dcl.py, bdef.py
    package.py, aunit.py, atc.py, cts.py, gcts.py
    checkout.py     # Export to filesystem (abapGit format)
    checkin.py      # Import from filesystem
    datapreview.py  # Free SQL
    abap.py         # Run ABAP snippets, search, system info
    rap.py          # Publish service bindings
    bsp.py          # BSP applications
    flp.py          # Fiori Launchpad
    startrfc.py     # RFC function modules
    user.py         # User management
    strust.py       # SSL certificate management
    activation.py   # Mass activation
    config.py       # kubeconfig-style configuration
  rest/             # Generic REST (gCTS)
  rfc/              # RFC via PyRFC (optional)
  odata/            # OData client (BSP, FLP)
  platform/         # DDIC builders, abapGit format, language codes
  config.py         # kubeconfig-style YAML config
  flp/              # Fiori Launchpad service/builder
```

**Key design patterns:**

1. **ADTObject base class**: All ABAP types inherit from `ADTObject`. Each declares `OBJTYPE` as `ADTObjectType(code, basepath, xmlns, mimetype, ...)`. CRUD is uniform across all types.

2. **XML-to-Object mapper**: Custom annotation system via Python metaclasses (`OrderedClassMembers`) and decorators (`@xml_attribute`, `@xml_element`). Preserves XML element order during round-trip serialization. Most sophisticated XML→Python mapping in any open-source ADT client.

3. **CommandGroup pattern**: Each CLI module defines a `CommandGroup` subclass. Commands registered via `@CommandGroup.command()` + `@CommandGroup.argument()` decorators. Four connection types: ADT, REST, RFC, OData.

4. **Connection abstraction**: Separate connection classes per protocol — ADT (HTTP+CSRF), REST (gCTS), OData (BSP/FLP), RFC (PyRFC). Each has its own auth and session management.

## Tool Inventory (28+ command groups)

### Source CRUD
| Command | Objects | Operations |
|---------|---------|------------|
| `program` | PROG | read, write, create, activate |
| `include` | INCL | read, write, create |
| `class` | CLAS | read, write, create, activate (incl. locals_def, locals_imp, test_classes, macros) |
| `interface` | INTF | read, write, create, activate |
| `functiongroup` | FUGR | read, write |
| `functionmodule` | FUMO | read, write (auto-resolves parent group) |
| `ddl` | DDLS | read, write, create |
| `dcl` | DCL | read, write |
| `bdef` | BDEF | read, write |

### DDIC & Auth (Read-only metadata)
| Command | Objects |
|---------|---------|
| `dataelement` | DTEL |
| `structure` | STRU |
| `table` | TABL |
| `authorizationfield` | AUTH (read, where-used, activate — new Apr 2026) |

### DevOps / Quality
| Command | Description |
|---------|-------------|
| `aunit` | Run ABAP Unit tests with coverage; output: human, JUnit4, sonar |
| `atc` | Run ATC checks; output: human, checkstyle, codeclimate |
| `activation` | Mass activate objects |
| `rap` | Publish service bindings |

### Transport (CTS)
| Command | Description |
|---------|-------------|
| `cts create` | Create transport/task (Workbench/K, Customizing/W, ToC/T, DevCorr/S, Repair/R) |
| `cts release` | Release transport/task (with recursive option) |
| `cts delete` | Delete transport/task (with recursive option) |
| `cts reassign` | Change owner (with recursive) |
| `cts list` | List transports (-r/-rr/-rrr for detail levels, incl. objects) |

### abapGit / gCTS
| Command | Description |
|---------|-------------|
| `checkout` | Export objects to filesystem in abapGit XML format |
| `checkin` | Import objects from filesystem to SAP |
| `gcts` | Full gCTS lifecycle: clone/pull/checkout/branches/config/activities/tasks |

### Data / SQL
| Command | Description |
|---------|-------------|
| `datapreview` | Free SQL via ADT freestyle data preview |

### ABAP Utilities
| Command | Description |
|---------|-------------|
| `abap run` | Execute arbitrary ABAP via temp IF_OO_ADT_CLASSRUN class |
| `abap find` | Quick object search with type/max-results |
| `abap systeminfo` | System information |

### External Systems (RFC / OData)
| Command | Description |
|---------|-------------|
| `startrfc` | Execute arbitrary RFC function modules |
| `user` | Create/read/modify SAP users |
| `strust` | SSL certificate management |
| `bsp` | BSP application management (upload/download/list) |
| `flp` | Fiori Launchpad (catalogs, groups, tile config) |

### Configuration
| Command | Description |
|---------|-------------|
| `config` | kubeconfig-style YAML: connections, users, contexts, switching |

## Authentication

| Method | Supported |
|--------|-----------|
| HTTP Basic Auth | ✅ (requests.HTTPBasicAuth) |
| CSRF token management | ✅ (auto-fetch, auto-refresh on 403) |
| Session management | ✅ (requests.Session, keep-alive) |
| kubeconfig YAML | ✅ (named connections/users/contexts) |
| Custom CA certificate | ✅ (ssl_server_cert config) |
| Skip TLS verification | ✅ (SAP_SSL_VERIFY=no) |
| RFC authentication | ✅ (PyRFC, user/pass or SNC) |
| OAuth / XSUAA | ❌ |
| BTP Destination Service | ❌ |
| Principal Propagation | ❌ |
| OIDC / JWT | ❌ |
| API Key | ❌ |

**Strictly on-premise.** No BTP cloud support whatsoever.

## Safety/Security

**No safety system.** No read-only mode, no operation filtering, no package restrictions, no SQL blocking. All commands always available. Designed as a developer/CI tool, not a managed service.

## Transport (Protocol)

Not applicable — sapcli is a CLI tool, not an MCP server. No stdio/HTTP/SSE transport. Communicates directly with SAP via HTTP.

## Testing

| Aspect | Details |
|--------|---------|
| Framework | Python `unittest` (not pytest) |
| Test files | ~90 files in `test/unit/` |
| Coverage | Tracked via codecov |
| Mock infra | Custom `Connection` mock in `test/unit/mock.py` — records HTTP requests, returns pre-configured responses |
| Fixtures | XML fixtures in `test/unit/fixtures_*.py` (one per module) |
| System tests | `test/system/` — shell scripts for live SAP integration |
| CI | GitHub Actions with codecov |
| Pattern | Each `sap/adt/foo.py` → `test/unit/test_sap_adt_foo.py` |

## Dependencies

**Runtime (minimal):**
- `requests >= 2.20.0` — HTTP client
- `pyodata >= 1.7.0` — OData client
- `PyYAML >= 6.0.1` — Config files
- `PyRFC` — Optional RFC connectivity

**Dev:** pytest, coverage, pylint, flake8, mypy

Notable: uses Python's built-in `xml.sax` + `xml.etree.ElementTree` for XML — no third-party XML library. Intentionally minimal dependency footprint.

## ADT Endpoints Used

The most comprehensive open-source ADT endpoint coverage:

**Object CRUD (via ADTObject base):**
- `GET/POST/PUT/DELETE /sap/bc/adt/{basepath}/{name}` — metadata CRUD
- `GET/PUT /sap/bc/adt/{basepath}/{name}/source/main` — source read/write
- `POST ...?_action=LOCK/UNLOCK` — object locking

**Object-specific basepaths:**
- `/programs/programs`, `/programs/includes` — PROG, INCL
- `/oo/classes`, `/oo/interfaces` — CLAS, INTF
- `/ddic/ddl/sources`, `/dcl/sources` — CDS DDL, DCL
- `/ddic/srvd/sources` — SRVD
- `/businessservices/bindings` — SRVB (incl. `/publishjobs`)
- `/functions/groups`, `/functions/groups/{group}/fmodules` — FUGR, FUMO
- `/packages` — DEVC
- `/ddic/tables`, `/ddic/structures`, `/ddic/dataelements` — DDIC
- `/sfw/featuretoggles` — Feature toggles
- `/enhancements/implementations` — Enhancement implementations
- `/authorizationfields` — Authorization Fields (new Apr 2026)

**Quality:**
- `POST /sap/bc/adt/abapunit/testruns` — ABAP Unit
- `POST /sap/bc/adt/runtime/traces/coverage/measurements/{id}` — Test coverage
- `GET /sap/bc/adt/atc/customizing` + `POST .../atc/runs` + `GET .../atc/worklists/{id}` — ATC
- `POST /sap/bc/adt/checks/syntaxCheck` — Syntax check

**Intelligence:**
- `POST /sap/bc/adt/repository/informationsystem/usageReferences/scope` — Where-used scope
- `POST /sap/bc/adt/repository/informationsystem/usageReferences` — Where-used search
- `GET /sap/bc/adt/repository/informationsystem/search` — Quick search

**Transport:**
- `GET/POST/DELETE /sap/bc/adt/cts/transportrequests` — CTS CRUD
- `POST .../transportrequests/{number}/newreleasejobs` — Release
- `GET /sap/bc/adt/inactivectsobjects` — Inactive objects list

**Workbench:**
- `POST /sap/bc/adt/activation` — Mass activation
- `POST /sap/bc/adt/oo/classrun/{name}` — Execute IF_OO_ADT_CLASSRUN
- `POST /sap/bc/adt/datapreview/freestyle` — Free SQL
- `GET /sap/bc/adt/discovery` — Service discovery (MIME version negotiation)
- `GET /sap/bc/adt/system/info` — System info

**gCTS:**
- `/sap/bc/cts_abapvcs/repository` — gCTS CRUD, clone, pull, branches, config

**OData:**
- `/sap/opu/odata/UI5/ABAP_REPOSITORY_SRV` — BSP apps
- `/sap/opu/odata/UI2/PAGE_BUILDER_CUST` — FLP customization

## Known Issues / Limitations

| Issue | Description | Relevant to ARC-1? |
|-------|-------------|-------------------|
| No BTP/Cloud | Basic auth only, no OAuth/XSUAA/PP | ARC-1 already covers this |
| No MCP protocol | CLI only, no LLM integration | Different category |
| No safety system | No read-only, no op filter | ARC-1 has this |
| No caching | Every operation hits SAP | ARC-1 has SQLite + memory |
| No async | Synchronous `requests` throughout | ARC-1 uses async undici |
| Not on PyPI | Install from git only | ARC-1 is on npm |
| No audit logging | No structured audit trail | ARC-1 has this |
| SAX XML parsing | Complex custom mapper, hard to extend | ARC-1 uses fast-xml-parser |

---

## Features This Project Has That ARC-1 Lacks

| Feature | Priority | Effort | Status (2026-04-10) |
|---------|----------|--------|---------------------|
| `abap run` (execute ABAP via IF_OO_ADT_CLASSRUN) | Medium | 2d | Not implemented — needs safety design (also in dassian-adt, vibing-steampunk) |
| checkout/checkin in abapGit format (filesystem round-trip) | Medium | 3d | Not implemented — enables Git workflows without abapGit on server |
| gCTS integration (full lifecycle: clone/pull/branches/config) | Low | 3d | Not implemented — feature flag exists |
| ABAP Unit test coverage (statement-level, paginated) | High | 1d | Not implemented — currently runs tests but no coverage data |
| ATC output formats (JUnit4, sonar, checkstyle, codeclimate) | Medium | 1d | Not implemented — ATC results are raw |
| Where-used with configurable scope (per-object-type filtering) | Medium | 0.5d | Partial — ARC-1 has where-used but scope config may differ |
| ADT service discovery / MIME version negotiation | High | 1d | Not implemented — would solve 415/406 compatibility issues |
| Function module auto-group-resolution | Low | 0.5d | Not implemented — must know FUGR name |
| Mass activation with inactive objects list | Medium | 0.5d | Partial — batch activation exists, but no inactive objects query |
| Transport type selection (K/W/T/S/R) | Low | 0.5d | Not implemented — always creates Workbench requests |
| Transport reassign (change owner) | Low | 0.5d | Not implemented |
| Transport recursive release (tasks first) | Low | 0.5d | Not implemented |
| Transport detail levels (-r/-rr/-rrr objects) | Medium | 0.5d | Partial — transport contents not fully exposed |
| BSP application management (upload/download/list) | Low | 2d | Not implemented — different from ADT |
| FLP customization (catalogs, groups, tiles) | Low | 2d | Not implemented — OData-based |
| Feature toggle management | Low | 1d | Not implemented |
| Enhancement implementation / BAdI read | Low | 1d | Not implemented |
| kubeconfig-style multi-connection config | N/A | — | Not applicable — ARC-1 uses env vars / CLI flags |
| System info endpoint | Medium | 0.5d | Partial — system type detection exists but no full systeminfo |
| Class include granularity (locals_def, locals_imp, test_classes, macros) | Medium | 1d | Partial — structured class decomposition exists but write granularity differs |
| Service binding publish | Medium | 0.5d | Not implemented — SRVB read exists but no publish job |

## Features ARC-1 Has That This Project Lacks

MCP protocol (LLM integration), safety system (read-only, op filter, pkg filter, SQL blocking), BTP support (XSUAA, Destination Service, PP, Cloud Connector), API key / OIDC / JWT auth, audit logging, caching (SQLite + memory), intent-based routing (11 tools), context compression (SAPContext 7-30x), method-level surgery (95% reduction), hyperfocused mode (~200 tokens), Zod input validation, MCP elicitation, MCP scope system (OAuth), abaplint integration, AFF schema validation, npm distribution, Docker image, HTTP Streamable transport, multi-client support.

---

## Applicable Improvements for ARC-1

### High Priority — Direct improvements

1. **ADT Service Discovery / MIME Version Negotiation** (`sap/adt/discovery.py`)
   - sapcli calls `GET /sap/bc/adt/discovery` at startup to learn which MIME type versions the system supports
   - This would **directly solve ARC-1's P0 415/406 content-type auto-retry issue** — instead of guessing and retrying, probe once and cache
   - **Files to modify**: `src/adt/http.ts`, `src/adt/features.ts`
   - **Pattern**: Fetch discovery doc → parse accepted MIME types per endpoint → cache → use correct Content-Type headers

2. **ABAP Unit Test Coverage** (`sap/adt/aunit.py`)
   - sapcli fetches coverage via `POST /sap/bc/adt/runtime/traces/coverage/measurements/{id}` with paginated `rel=next` follow-up
   - Statement-level coverage granularity
   - **Files to modify**: `src/adt/devtools.ts`, `src/handlers/intent.ts`

3. **ATC Output Formats** (`sap/cli/atc.py`)
   - JUnit4, sonar, checkstyle, codeclimate formatters for ATC results
   - Useful for CI/CD integration and structured error reporting to LLMs
   - **Files to modify**: `src/adt/devtools.ts` or new formatter module

### Medium Priority — Feature adoption

4. **Where-Used Scope Configuration** (`sap/adt/whereused.py`)
   - Two-step: `get_scope()` fetches default scope config from ADT, then `get_where_used()` with per-object-type filtering
   - ARC-1's where-used may be simpler — verify scope handling matches
   - **Files to check**: `src/adt/codeintel.ts`

5. **Service Binding Publish** (`sap/cli/rap.py`)
   - `POST /sap/bc/adt/businessservices/bindings/{name}/publishjobs` endpoint
   - ARC-1 reads SRVB but doesn't publish — important for RAP workflow completeness
   - **Files to modify**: `src/adt/devtools.ts`, `src/handlers/intent.ts`

6. **Inactive Objects List** (`sap/adt/activation.py`)
   - `GET /sap/bc/adt/inactivectsobjects` — shows what needs activation
   - Useful for LLMs to understand activation state before/after writes
   - **Files to modify**: `src/adt/client.ts`, `src/handlers/intent.ts`

7. **Transport Contents / Detail Levels** (`sap/adt/cts.py`)
   - Recursive transport query shows objects in each task (E071 objects list)
   - **Files to modify**: `src/adt/transport.ts`

8. **Class Include Write Granularity** (`sap/adt/oo.py`)
   - sapcli supports writing to specific class includes: `locals_def`, `locals_imp`, `test_classes`, `macros`
   - Each has its own source URL: `/source/main`, `/includes/definitions`, `/includes/implementations`, `/includes/testclasses`
   - **Files to check**: `src/adt/crud.ts` — verify ARC-1's write handles these include types

### Low Priority — Nice-to-have / Future

9. **Execute ABAP (IF_OO_ADT_CLASSRUN)** — Also in dassian-adt and vibing-steampunk. Needs safety gate design.

10. **abapGit Checkout/Checkin Format** — Filesystem round-trip enables Git workflows. Could be useful for batch export/import.

11. **gCTS Integration** — Full lifecycle management. Lower priority since abapGit is more common.

12. **Function Module Auto-Group-Resolution** — UX improvement: search for FM name → resolve parent FUGR → fetch.

### Testing Insights

13. **XML Fixture Pattern** — sapcli's approach of separate `fixtures_*.py` files per module is similar to ARC-1's `tests/fixtures/xml/` but more systematic. Every ADT response has a corresponding fixture.

14. **Connection Mock** — sapcli's `test/unit/mock.py` records all HTTP requests and returns pre-configured responses. Similar to ARC-1's `mock-fetch.ts` but more structured (Request/Response named tuples with helper methods).

15. **System Tests** — `test/system/` contains shell scripts for live SAP integration testing. ARC-1 could adopt a similar approach for smoke tests.

### Documentation Insights

16. **Per-Command Documentation** — sapcli has `doc/commands/*.md` with one file per command group (28 files). ARC-1 could benefit from per-tool documentation beyond the CLAUDE.md reference.

17. **AGENTS.md** — sapcli has an AGENTS.md for AI assistants. Pattern already adopted by ARC-1.

### Error Handling Insights

18. **Typed Error Hierarchy** — sapcli's `ADTError` parses SAP XML exception format and maps `type` IDs to specific Python exceptions (`ExceptionResourceAlreadyExists`, `ExceptionResourceNotFound`, etc.). ARC-1's `AdtApiError` could benefit from similar classification for better LLM hints.

19. **Connection Error Friendliness** — `ADTConnectionError` provides human-friendly messages for Errno 5/111 (connection refused). ARC-1's `AdtNetworkError` could add similar hint text.

---

## Changelog & Relevance Tracker

| Date | Change | Relevant? | Action for ARC-1 | Status |
|------|--------|-----------|-------------------|--------|
| 2026-04-11 | `c20d795` **Major refactor**: extracted HTTP/CSRF/auth into shared `sap/http/` module (`HTTPClient` class). Prep for pluggable auth (SSO). 763-line test file. | Medium | Watch for SSO/OAuth patterns. Architecture mirrors ARC-1's `src/adt/http.ts`. | Evaluated |
| 2026-04-11 | `45b6228` CI fix: `fetch-depth: 0` for wheel version from git rev-list. Co-authored by Claude Sonnet 4.6. | No | — | — |
| 2026-04-10 | `2ec4228` **New object type: Authorization Fields** (`authorizationfield` command). Read, where-used, activate. ADT endpoint: `/sap/bc/adt/authorizationfields/{name}`, XML namespace `http://www.sap.com/iam/auth`. | Medium | New ADT endpoint — could add to ARC-1's SAPRead for auth object analysis. | TODO |
| 2026-04-11 | Issue #149 (OPEN): **Domain support** (DOMA) being added — create/delete disabled pending testing. | Low | ARC-1 already has DOMA read via `src/adt/client.ts`. Verify same endpoint used. | TODO |
| 2026-04-09 | doc fixes | No | — | — |
| 2026-04-07 | Windows install docs, GitHub CI updates | No | — | — |
| 2026-03-31 | Added `abap find` command | Low | ARC-1 has SAPSearch | — |
| 2026-03-28 | kubeconfig-style YAML config with CRUD subcommands | No | Different design (CLI vs MCP) | — |
| 2026-03-23 | Function module auto-group-resolution | Low | Could adopt pattern | TODO |
| 2018-2025 | Mature ADT client with 488+ commits | Yes | Study ADT endpoint patterns | Reference |

_Last updated: 2026-04-11_
