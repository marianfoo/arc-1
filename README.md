# ARC-1 — SAP ADT MCP Server

**ARC-1** (pronounced _arc one_ [ɑːrk wʌn]) — Enterprise-ready MCP server for SAP ABAP systems. Secure by default, deployable to BTP or on-premise, and hardened with large unit/integration/E2E test coverage.

ARC-1 connects AI assistants (Claude, GitHub Copilot, Copilot Studio, and any MCP client) to SAP systems via the [ADT REST API](https://help.sap.com/docs/abap-cloud/abap-development-tools-user-guide/about-abap-development-tools). It ships as an [npm package](https://www.npmjs.com/package/arc-1) and [Docker image](https://github.com/marianfoo/arc-1/pkgs/container/arc-1).



**[Full Documentation](https://marianfoo.github.io/arc-1/)** | **[Quickstart](https://marianfoo.github.io/arc-1/quickstart/)** | **[Tool Reference](https://marianfoo.github.io/arc-1/tools/)**

## Why ARC-1?

Built for organizations that need AI-assisted SAP development with guardrails. Inspired by the pioneering work of [abap-adt-api](https://github.com/marcellourbani/abap-adt-api), [mcp-abap-adt](https://github.com/mario-andreschak/mcp-abap-adt), and [vibing-steampunk](https://github.com/oisee/vibing-steampunk) — ARC-1 adds what's needed to run in production:

### Security & Admin Controls

- **Safe by default** — read-only, no free SQL, no table preview, no transport writes, no Git writes. Enable each capability with explicit `SAP_ALLOW_*` flags
- **Action deny list** — block specific tool actions with `SAP_DENY_ACTIONS` (for example `SAPWrite.delete`), without exposing low-level operation codes to admins
- **Package restrictions** — limit AI write operations (create, update, delete) to specific packages with wildcards (`--allowed-packages "Z*,$TMP"`). Read operations are not restricted by package — use SAP's native authorization for read-level access control
- **Data access control** — enable table data preview (`--allow-data-preview=true`) or free-form SQL (`--allow-free-sql=true`) only when needed
- **Transport safety** — transport reads are available for review, while transport mutations require both `--allow-writes` and `--allow-transport-writes`. Update/delete operations auto-use the lock correction number when no explicit transport is provided
- **Git workflow safety** — Git operations are disabled by default. Enable explicitly with `--allow-git-writes` / `SAP_ALLOW_GIT_WRITES=true`
- **API-key profiles** — multi-key HTTP deployments can assign `viewer`, `viewer-data`, `viewer-sql`, `developer`, `developer-data`, `developer-sql`, or `admin` per key
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

- **12 intent-based tools** (~5K schema tokens) instead of 200+ individual tools — keeps the LLM's context window small
- **Method-level read/edit** — read or update a single class method, not the whole source (up to 20x fewer tokens)
- **Context compression** — `SAPContext` returns public API contracts of all dependencies in one call (7-30x compression)

### Built-in Object Caching

- **Automatic source caching** — every SAP object read is cached in memory (stdio) or SQLite (http-streamable). Repeated reads return instantly without calling SAP.
- **Dependency graph caching** — `SAPContext` dep resolution keyed by source hash; unchanged objects skip all ADT calls on subsequent runs.
- **Pre-warmer** — start with `ARC1_CACHE_WARMUP=true` to pre-index all custom objects at startup, enabling reverse dependency lookup (`SAPContext(action="usages")`) and fast CDS impact workflows (`SAPContext(action="impact", type="DDLS")`).
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

The 12 tools are designed from real LLM interaction feedback:

| Tool | What it does |
|------|-------------|
| **SAPRead** | Read ABAP source, table data, CDS views, metadata extensions (DDLX), service bindings (SRVB), message classes, BOR objects, deployed UI5/Fiori apps (BSP, BSP_DEPLOY), plus on-prem metadata reads for authorization fields (`AUTH`), feature toggles (`FTG2`), and enhancement implementations (`ENHO`). Structured format for classes returns metadata + decomposed includes as JSON |
| **SAPSearch** | Object search + full-text source code search across the system |
| **SAPWrite** | Create/update/delete ABAP source and DDIC metadata with automatic lock/unlock (PROG, CLAS, INTF, FUNC, INCL, DDLS, DDLX, BDEF, SRVD, DOMA, DTEL). Batch creation for multi-object workflows (e.g., RAP stack or domain+data element in one call) |
| **SAPActivate** | Activate ABAP objects — single or batch (essential for RAP stacks). Publish/unpublish OData service bindings (SRVB) |
| **SAPNavigate** | Go-to-definition, find references, code completion |
| **SAPQuery** | Execute ABAP SQL with table-not-found suggestions |
| **SAPTransport** | CTS transport management (list/create/release/delete/reassign), transport requirement checks, and reverse lookup history (`action="history"`) |
| **SAPGit** | Git-based ABAP workflows across gCTS and abapGit (list/clone/pull/push/commit/branch/unlink) with backend auto-selection and safety gating (`--allow-git-writes`) |
| **SAPContext** | Compressed dependency context (`action="deps"`), reverse dependency lookup (`action="usages"`), and CDS upstream/downstream impact analysis (`action="impact"` for DDLS) |
| **SAPLint** | Local ABAP lint (system-aware presets, auto-fix, pre-write validation) + ADT PrettyPrint (server-side formatting) |
| **SAPDiagnose** | Syntax check, ABAP Unit tests, ATC code quality, short dumps, profiler traces |
| **SAPManage** | Feature probing — detect what the system supports before acting |

Tool definitions automatically adapt to the target system (BTP vs on-premise), removing unavailable types and adjusting descriptions so the LLM never attempts unsupported operations.

### Feature Detection

ARC-1 probes the SAP system at startup and adapts its behavior:

- Detects HANA, gCTS, abapGit, RAP/CDS, AMDP, UI5, and transport availability
- Auto-detects BTP vs on-premise systems
- Maps SAP_BASIS release to the correct ABAP language version
- Each feature can be forced on/off or left on auto-detect
- In shared-credential mode (technical user), runs a startup auth preflight once and blocks SAP tool calls with a clear error on 401/403 to avoid repeated failed logins and potential user lockout

## ADT API Status and Strategy

There is still uncertainty around the exact long-term support boundary for ADT-based community and partner tooling. SAP published a new [SAP API Policy](https://www.sap.com/documents/2026/04/dce9aee4-497f-0010-bca6-c68f7e60039b.html) in April 2026, and customers or partners should review that policy, their SAP agreements, and their internal security requirements before using any ADT-based automation in production.

At the same time, the current public signals for ADT are positive. SAP's [ABAP Development Tools download page](https://tools.hana.ondemand.com/#abap) provides an official ADT SDK with JavaDoc and describes it as a public API for implementing or integrating tools with SAP's ABAP IDE. SAP also publishes a guide for [creating and consuming RESTful APIs in ADT](https://www.sap.com/documents/2013/04/12289ce1-527c-0010-82c7-eda71af511fa.html), including discovery-based REST communication. In addition, SAP has publicly described the ABAP language server direction as an ["ADT SDK 2.0"](https://community.sap.com/t5/technology-blog-posts-by-sap/abap-development-tools-for-vs-code-everything-you-need-to-know/bc-p/14263439/highlight/true#M186133) and indicated plans to release it as a standalone component after the first ABAP Development Tools for VS Code release.

ARC-1's strategy is to stay as close as possible to documented and discoverable ADT behavior:

- Prefer the published ADT SDK model, the ADT REST guide, and backend discovery/compatibility metadata over hard-coded or reverse-engineered assumptions
- Probe system capabilities before exposing tools, and keep unsupported features unavailable instead of guessing
- Keep read-only defaults, explicit write gates, package restrictions, transport gates, authentication controls, and audit logging in front of SAP's own authorization checks
- Treat implementation-specific ADT behavior as conditional: use feature detection, fallbacks, and clear errors instead of promising universal endpoint support
- Continuously review SAP's API policy, ADT SDK documentation, ABAP Development Tools for VS Code, and the future language-server-based tooling direction

This README is a technical project statement, not a compliance decision for a specific customer landscape. Organizations should make their own assessment, especially for autonomous workflows, bulk extraction, write operations, and centrally deployed MCP servers.

## Quick Start

```bash
npx arc-1@latest --url https://your-sap-host:44300 --user YOUR_USER
```

- **Trying it out on your laptop?** → [Quickstart](https://marianfoo.github.io/arc-1/quickstart/)
- **Full local dev setup (Docker, cookie extractor, client configs)?** → [Local Development](https://marianfoo.github.io/arc-1/local-development/)
- **Deploying for a team / BTP?** → [Deployment](https://marianfoo.github.io/arc-1/deployment/)

## Documentation

Full documentation is available at **[marianfoo.github.io/arc-1](https://marianfoo.github.io/arc-1/)**.

| Guide | Description |
|-------|-------------|
| [Quickstart](https://marianfoo.github.io/arc-1/quickstart/) | 5-minute npx + Claude Desktop setup |
| [Local Development](https://marianfoo.github.io/arc-1/local-development/) | Full local dev — all install methods, MCP client configs, SSO cookie extractor |
| [Deployment](https://marianfoo.github.io/arc-1/deployment/) | Multi-user deployment — Docker, BTP Cloud Foundry, BTP ABAP |
| [Configuration](https://marianfoo.github.io/arc-1/configuration-reference/) | Every flag and env var, one table |
| [Updating](https://marianfoo.github.io/arc-1/updating/) | Update procedures per install method |
| [Enterprise Auth](https://marianfoo.github.io/arc-1/enterprise-auth/) | Layer A / Layer B auth internals, coexistence matrix |
| [Tool Reference](https://marianfoo.github.io/arc-1/tools/) | Complete reference for all 12 tools |
| [Architecture](https://marianfoo.github.io/arc-1/architecture/) | System architecture with diagrams |
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
