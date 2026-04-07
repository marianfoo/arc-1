# arc1 — SAP ADT MCP Server

**Enterprise-ready MCP server for SAP ABAP systems. Secure by default, deployable to BTP or on-premise, battle-tested with 700+ tests.**

arc1 connects AI assistants (Claude, GitHub Copilot, Copilot Studio, and any MCP client) to SAP systems via the [ADT REST API](https://help.sap.com/docs/abap-cloud/abap-development-tools-user-guide/about-abap-development-tools). It ships as an [npm package](https://www.npmjs.com/package/arc-1) and [Docker image](https://github.com/marianfoo/arc-1/pkgs/container/arc-1).

> Continued from [oisee/vibing-steampunk](https://github.com/oisee/vibing-steampunk) (Go), rewritten in TypeScript with enterprise security, BTP deployment, and production-grade tooling.

![Vibing ABAP Developer](./media/vibing-steampunk.png)

**[Full Documentation](https://marianfoo.github.io/arc-1/)** | **[Setup Guide](https://marianfoo.github.io/arc-1/setup-guide/)** | **[Tool Reference](https://marianfoo.github.io/arc-1/tools/)**

## Why arc1?

Built for organizations that need AI-assisted SAP development with guardrails. Inspired by the pioneering work of [abap-adt-api](https://github.com/marcellourbani/abap-adt-api), [mcp-abap-adt](https://github.com/mario-andreschak/mcp-abap-adt), and [vibing-steampunk](https://github.com/oisee/vibing-steampunk) — arc1 adds what's needed to run in production:

### Security & Admin Controls

- **Read-only mode** — block all writes with a single flag (`--read-only`)
- **Operation allowlists/denylists** — control exactly which operation types (read, write, search, query, activate, transport) are permitted
- **Package restrictions** — limit AI access to specific packages with wildcards (`--allowed-packages "Z*,$TMP"`)
- **Data access control** — block table data preview (`--block-data`) or free-form SQL (`--block-free-sql`)
- **Transport safety** — require transport assignments, restrict to specific transports, or make transports read-only
- **Safety profiles** — preconfigured roles like `--profile viewer`, `developer-data`, or `developer-sql`
- **All writes blocked by default** — safe defaults out of the box

### Authentication

- **API key** — simple Bearer token for internal deployments
- **OIDC / JWT** — Entra ID, Keycloak, or any OpenID Connect provider
- **OAuth 2.0** — browser-based login for BTP ABAP Environment
- **XSUAA** — SAP BTP native auth with automatic token proxy for MCP clients
- **Principal Propagation** — per-user identity forwarded through Cloud Connector (every SAP action runs as the actual user, not a technical account)

### BTP Cloud Foundry Deployment

Deploy arc1 as a Cloud Foundry app on SAP BTP with full platform integration:

- **Destination Service** — connect to SAP systems via managed destinations
- **Cloud Connector** — reach on-premise systems through the connectivity proxy
- **Principal Propagation** — user identity forwarded end-to-end via X.509 certificates
- **XSUAA OAuth proxy** — MCP clients authenticate via standard OAuth, arc1 handles the BTP token exchange
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

- **700+ tests** across unit, integration, and E2E
- **Unit tests** run without SAP system access (33 test files, mocked HTTP)
- **Integration tests** against live SAP systems (on-premise + BTP ABAP)
- **E2E tests** deploy the server and execute real MCP tool calls
- **CI matrix** across Node 20, 22, and 24

### Tools Refined for Real-World Usage

The 11 tools are designed from real LLM interaction feedback:

| Tool | What it does |
|------|-------------|
| **SAPRead** | Read ABAP source, table data, CDS views, metadata extensions (DDLX), service bindings (SRVB), message classes, BOR objects |
| **SAPSearch** | Object search + full-text source code search across the system |
| **SAPWrite** | Create/update/delete ABAP source with automatic lock/unlock (PROG, CLAS, INTF, FUNC, INCL, DDLS, DDLX, BDEF, SRVD) |
| **SAPActivate** | Activate ABAP objects — single or batch (essential for RAP stacks) |
| **SAPNavigate** | Go-to-definition, find references, code completion |
| **SAPQuery** | Execute ABAP SQL with table-not-found suggestions |
| **SAPTransport** | CTS transport management (list, create, release) |
| **SAPContext** | Compressed dependency context — one call replaces N SAPRead calls |
| **SAPLint** | Local ABAP lint (system-aware presets, auto-fix, pre-write validation) |
| **SAPDiagnose** | Syntax check, ABAP Unit tests, ATC code quality, short dumps |
| **SAPManage** | Feature probing — detect what the system supports before acting |

Tool definitions automatically adapt to the target system (BTP vs on-premise), removing unavailable types and adjusting descriptions so the LLM never attempts unsupported operations.

### Feature Detection

arc1 probes the SAP system at startup and adapts its behavior:

- Detects HANA, abapGit, RAP/CDS, AMDP, UI5, and transport availability
- Auto-detects BTP vs on-premise systems
- Maps SAP_BASIS release to the correct ABAP language version
- Each feature can be forced on/off or left on auto-detect

## Quick Start

```bash
npx arc-1 --url https://your-sap-host:44300 --user YOUR_USER
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
| [vibing-steampunk](https://github.com/oisee/vibing-steampunk) | oisee | Original Go MCP server — arc1's starting point |
| [abap-adt-api](https://github.com/marcellourbani/abap-adt-api) | Marcello Urbani | TypeScript ADT library, definitive API reference |
| [mcp-abap-adt](https://github.com/mario-andreschak/mcp-abap-adt) | Mario Andreschak | First MCP server for ABAP ADT |
| [abaplint](https://github.com/abaplint/abaplint) | Lars Hvam | ABAP parser/linter (used via @abaplint/core) |

## License

MIT
