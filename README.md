# ARC-1 — SAP ADT MCP Server

**ARC-1** (pronounced _arc one_ [ɑːrk wʌn]) — Enterprise-ready MCP server for SAP ABAP systems. Secure by default, deployable to BTP or on-premise, and hardened with large unit/integration/E2E test coverage.

ARC-1 connects AI assistants (Claude, GitHub Copilot, Copilot Studio, and any MCP client) to SAP systems via the [ADT REST API](https://help.sap.com/docs/abap-cloud/abap-development-tools-user-guide/about-abap-development-tools). It ships as an [npm package](https://www.npmjs.com/package/arc-1) and [Docker image](https://github.com/marianfoo/arc-1/pkgs/container/arc-1).



**[Full Documentation](https://marianfoo.github.io/arc-1/)** | **[Setup Guide](https://marianfoo.github.io/arc-1/setup-guide/)** | **[Tool Reference](https://marianfoo.github.io/arc-1/tools/)**

## Why ARC-1?

Built for organizations that need AI-assisted SAP development with guardrails. Inspired by the pioneering work of [abap-adt-api](https://github.com/marcellourbani/abap-adt-api), [mcp-abap-adt](https://github.com/mario-andreschak/mcp-abap-adt), and [vibing-steampunk](https://github.com/oisee/vibing-steampunk) — ARC-1 adds what's needed to run in production:

### Security & Admin Controls

- **Safe by default** — read-only, no free SQL, no table preview, no transports out of the box. Use `--profile developer` or explicit flags to enable capabilities
- **Operation allowlists/denylists** — control exactly which operation types (read, write, search, query, activate, transport) are permitted
- **Package restrictions** — limit AI write operations (create, update, delete) to specific packages with wildcards (`--allowed-packages "Z*,$TMP"`). Read operations are not restricted by package — use SAP's native authorization for read-level access control
- **Data access control** — enable table data preview (`--block-data=false`) or free-form SQL (`--block-free-sql=false`)
- **Transport safety** — require transport assignments, restrict to specific transports, or make transports read-only. Update/delete operations auto-use the lock correction number when no explicit transport is provided
- **Safety profiles** — preconfigured roles: `viewer`, `viewer-data`, `viewer-sql`, `developer`, `developer-data`, `developer-sql`
- **Writes restricted to `$TMP` when enabled** — only local/throwaway objects; writing to transportable packages requires explicit `--allowed-packages`

### Authentication

- **API key** — simple Bearer token for internal deployments
- **OIDC / JWT** — Entra ID, Keycloak, or any OpenID Connect provider
- **OAuth 2.0** — browser-based login for BTP ABAP Environment
- **XSUAA** — SAP BTP native auth with automatic token proxy for MCP clients
- **Principal Propagation** — per-user identity forwarded through Cloud Connector (every SAP action runs as the actual user, not a technical account)

### BTP Cloud Foundry Deployment

Deploy ARC-1 as a Cloud Foundry app on SAP BTP with full platform integration:

- **Destination Service** — connect to SAP systems via managed destinations
- **Cloud Connector** — reach on-premise systems through the connectivity proxy
- **Principal Propagation** — user identity forwarded end-to-end via X.509 certificates
- **XSUAA OAuth proxy** — MCP clients authenticate via standard OAuth, ARC-1 handles the BTP token exchange
- **Audit logging** — structured events to stderr, file, or BTP Audit Log Service

### Token Efficiency

- **11 intent-based tools** (~5K schema tokens) instead of 200+ individual tools — keeps the LLM's context window small
- **Method-level read/edit** — read or update a single class method, not the whole source (up to 20x fewer tokens)
- **Context compression** — `SAPContext` returns public API contracts of all dependencies in one call (7-30x compression)

### Built-in Object Caching

- **Automatic source caching** — every SAP object read is cached in memory (stdio) or SQLite (http-streamable). Repeated reads return instantly without calling SAP.
- **Dependency graph caching** — `SAPContext` dep resolution keyed by source hash; unchanged objects skip all ADT calls on subsequent runs.
- **Pre-warmer** — start with `ARC1_CACHE_WARMUP=true` to pre-index all custom objects at startup, enabling reverse dependency lookup (`SAPContext(action="usages")`).
- **Write invalidation** — when `SAPWrite` modifies an object, its cache entry is automatically dropped; next read fetches fresh source.

See **[docs/caching.md](docs/caching.md)** for full documentation.

### Testing

- **1,367+ unit tests** (`53` unit test files, mocked HTTP)
- **~160 integration tests** against live SAP systems, with explicit skip reasons when credentials or fixtures are missing
- **~70 E2E tests** that execute real MCP tool calls against a running ARC-1 server and live SAP system
- **CRUD lifecycle and BTP smoke lanes** included (`test:integration:crud`, `test:integration:btp:smoke`)
- **CI matrix** on Node `22` and `24`; integration + E2E run on `push` to `main` and internal PRs
- **Reliability telemetry + coverage** published as informational CI signals (non-blocking)

### Tools Refined for Real-World Usage

The 11 tools are designed from real LLM interaction feedback:

| Tool | What it does |
|------|-------------|
| **SAPRead** | Read ABAP source, table data, CDS views, metadata extensions (DDLX), service bindings (SRVB), message classes, BOR objects, deployed UI5/Fiori apps (BSP, BSP_DEPLOY), plus on-prem metadata reads for authorization fields (`AUTH`), feature toggles (`FTG2`), and enhancement implementations (`ENHO`). Structured format for classes returns metadata + decomposed includes as JSON |
| **SAPSearch** | Object search + full-text source code search across the system |
| **SAPWrite** | Create/update/delete ABAP source and DDIC metadata with automatic lock/unlock (PROG, CLAS, INTF, FUNC, INCL, DDLS, DDLX, BDEF, SRVD, DOMA, DTEL). Batch creation for multi-object workflows (e.g., RAP stack or domain+data element in one call) |
| **SAPActivate** | Activate ABAP objects — single or batch (essential for RAP stacks). Publish/unpublish OData service bindings (SRVB) |
| **SAPNavigate** | Go-to-definition, find references, code completion |
| **SAPQuery** | Execute ABAP SQL with table-not-found suggestions |
| **SAPTransport** | CTS transport management (list, create, release) |
| **SAPContext** | Compressed dependency context — one call replaces N SAPRead calls |
| **SAPLint** | Local ABAP lint (system-aware presets, auto-fix, pre-write validation) |
| **SAPDiagnose** | Syntax check, ABAP Unit tests, ATC code quality, short dumps, profiler traces |
| **SAPManage** | Feature probing — detect what the system supports before acting |

Tool definitions automatically adapt to the target system (BTP vs on-premise), removing unavailable types and adjusting descriptions so the LLM never attempts unsupported operations.

### Feature Detection

ARC-1 probes the SAP system at startup and adapts its behavior:

- Detects HANA, abapGit, RAP/CDS, AMDP, UI5, and transport availability
- Auto-detects BTP vs on-premise systems
- Maps SAP_BASIS release to the correct ABAP language version
- Each feature can be forced on/off or left on auto-detect

## Quick Start

```bash
npx arc-1@latest --url https://your-sap-host:44300 --user YOUR_USER
```

For Docker, BTP deployment, client configuration (Claude Desktop, Claude Code, VS Code, Copilot Studio), and all authentication methods, see the **[Setup Guide](https://marianfoo.github.io/arc-1/setup-guide/)**.

## Documentation

Full documentation is available at **[marianfoo.github.io/arc-1](https://marianfoo.github.io/arc-1/)**.

| Guide | Description |
|-------|-------------|
| [Setup Guide](https://marianfoo.github.io/arc-1/setup-guide/) | Deployment options, auth methods, client configuration |
| [Tool Reference](https://marianfoo.github.io/arc-1/tools/) | Complete reference for all 11 tools |
| [Architecture](https://marianfoo.github.io/arc-1/architecture/) | System architecture with diagrams |
| [Docker Guide](https://marianfoo.github.io/arc-1/docker/) | Docker deployment reference |
| [Enterprise Auth](https://marianfoo.github.io/arc-1/enterprise-auth/) | All authentication methods |
| [BTP Deployment](https://marianfoo.github.io/arc-1/phase4-btp-deployment/) | Cloud Foundry deployment on SAP BTP |
| [AI Usage Patterns](https://marianfoo.github.io/arc-1/mcp-usage/) | Agent workflow patterns and best practices |

## Development

```bash
npm ci && npm run build && npm test
```

See [CLAUDE.md](CLAUDE.md) for codebase structure, testing commands, and contribution guidelines.

## Credits

| Project | Author | Contribution |
|---------|--------|--------------|
| [vibing-steampunk](https://github.com/oisee/vibing-steampunk) | oisee | Original Go MCP server — ARC-1's starting point |
| [abap-adt-api](https://github.com/marcellourbani/abap-adt-api) | Marcello Urbani | TypeScript ADT library, definitive API reference |
| [mcp-abap-adt](https://github.com/mario-andreschak/mcp-abap-adt) | Mario Andreschak | First MCP server for ABAP ADT |
| [abaplint](https://github.com/abaplint/abaplint) | Lars Hvam | ABAP parser/linter (used via @abaplint/core) |

## License

MIT
