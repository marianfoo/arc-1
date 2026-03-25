# arc1 — SAP ADT MCP Server

**ARC-1 (ABAP Relay Connector) — Enterprise-ready proxy between AI clients and SAP systems.**

arc1 is a single Go binary that implements the [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) and translates AI tool calls into [SAP ABAP Development Tools (ADT)](https://help.sap.com/docs/abap-cloud/abap-development-tools-user-guide/about-abap-development-tools) REST API requests. It works with Claude, GitHub Copilot, VS Code, and any MCP-compatible client.

> **This repository** ([marianfoo/arc-1](https://github.com/marianfoo/arc-1)) is the actively maintained fork, continued from the original [oisee/vibing-steampunk](https://github.com/oisee/vibing-steampunk).

![Vibing ABAP Developer](./media/vibing-steampunk.png)

## Why arc1?

| | [abap-adt-api](https://github.com/marcellourbani/abap-adt-api) | [mcp-abap-adt](https://github.com/mario-andreschak/mcp-abap-adt) | **arc1** |
|---|:---:|:---:|:---:|
| Single binary, zero runtime deps | — | — | **Y** |
| Read-only mode / package whitelist | — | — | **Y** |
| Transport controls (CTS safety) | — | — | **Y** |
| HTTP Streamable transport (Copilot Studio) | — | — | **Y** |
| 11 intent-based tools (~5K schema tokens) | — | — | **Y** |
| Method-level read/edit (95% token reduction) | — | — | **Y** |
| Context compression (7–30x) | — | — | **Y** |
| Works with 8+ MCP clients | — | — | **Y** |

As an **admin**, you control what the AI can and cannot do:
- Restrict to read-only, specific packages, or whitelisted operations
- Require transport assignments before any write
- Block free-form SQL execution
- Allow or deny individual operation types per deployment

## Quick Start

```bash
# Download from releases
curl -LO https://github.com/marianfoo/arc-1/releases/latest/download/arc1-linux-amd64
chmod +x arc1-linux-amd64 && mv arc1-linux-amd64 arc1

# Or build from source
git clone https://github.com/marianfoo/arc-1.git && cd arc-1
make build
```

## Connect Your Client

### Claude Desktop

Add to `~/.config/claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "sap": {
      "command": "/path/to/arc1",
      "env": {
        "SAP_URL": "https://your-sap-host:44300",
        "SAP_USER": "your-username",
        "SAP_PASSWORD": "your-password"
      }
    }
  }
}
```

### Claude Code

Add `.mcp.json` to your project root:

```json
{
  "mcpServers": {
    "sap": {
      "command": "/path/to/arc1",
      "env": {
        "SAP_URL": "https://your-sap-host:44300",
        "SAP_USER": "your-username",
        "SAP_PASSWORD": "your-password"
      }
    }
  }
}
```

### GitHub Copilot / VS Code (HTTP Streamable)

Start arc1 as an HTTP server, then point your MCP client to it:

```bash
SAP_URL=https://host:44300 SAP_USER=dev SAP_PASSWORD=secret \
  arc1 --transport http-streamable --port 3000
```

Add to VS Code / Copilot MCP config:

```json
{
  "mcpServers": {
    "sap": {
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

HTTP Streamable is also the transport for **Copilot Studio** (Microsoft Power Platform integrations).

### Other MCP Clients (Gemini CLI, OpenCode, Goose, Qwen, …)

All MCP clients that support stdio work out of the box — just point them at the `arc1` binary.
See **[docs/cli-agents/README.md](docs/cli-agents/README.md)** for per-client config templates
(also available in [Русский](docs/cli-agents/README_RU.md) | [Українська](docs/cli-agents/README_UA.md) | [Español](docs/cli-agents/README_ES.md)).

## Tools

arc1 exposes 11 intent-based tools (~5K schema tokens):

| Tool | What it does |
|------|-------------|
| **SAPRead** | Read ABAP source, table data, CDS views, message classes, class info |
| **SAPSearch** | Find objects by name; regex search inside source across objects/packages |
| **SAPWrite** | Create/update objects; surgical line-range edits; file-based deploy |
| **SAPActivate** | Syntax check, activate, run unit tests, run ATC checks |
| **SAPNavigate** | Go-to-definition, find references, call graph analysis |
| **SAPQuery** | Run SQL queries, read table contents |
| **SAPTransport** | CTS transport management (list, inspect, inactive objects) |
| **SAPContext** | System info, installed components, object structure, feature detection |
| **SAPLint** | ABAP lint, parse, and code analysis |
| **SAPDiagnose** | Short dumps (RABAX), ABAP profiler (ATRA), SQL traces (ST05) |
| **SAPManage** | abapGit export, install dependencies, bootstrap tooling |

Full tool reference: **[docs/tools.md](docs/tools.md)**

## Token Efficiency

**Method-level surgery** — read or edit a single method, not the whole class:

```
SAP(action="read", target="CLAS ZCL_CALCULATOR", params={"method": "FACTORIAL"})
SAP(action="edit", target="CLAS ZCL_CALCULATOR", params={"method": "FACTORIAL", "source": "..."})
```

Up to 20x fewer tokens vs full-class round-trips.

**Context compression** — `GetSource` auto-appends public API signatures of all referenced classes and interfaces (7–30x compression). One call = source + full dependency context.

## Admin Controls (Safety)

Configure what the AI is allowed to do before deployment:

```bash
# Read-only mode — no writes at all
arc1 --read-only

# Restrict to specific packages (wildcards supported)
arc1 --allowed-packages "ZPROD*,$TMP"

# Block free-form SQL
arc1 --block-free-sql

# Whitelist operation types (R=Read, S=Search, Q=Query, …)
arc1 --allowed-ops "RSQ"

# Require explicit transport before editing transportable objects
# (default: blocked — must opt in)
arc1 --allow-transportable-edits --allowed-transports "DEVK*"
```

Full safety reference:

| Flag / Env | Default | Effect |
|---|:---:|---|
| `--read-only` / `SAP_READ_ONLY` | false | Block all write operations |
| `--block-free-sql` / `SAP_BLOCK_FREE_SQL` | false | Block `RunQuery` execution |
| `--allowed-ops` / `SAP_ALLOWED_OPS` | (all) | Whitelist operation types |
| `--disallowed-ops` / `SAP_DISALLOWED_OPS` | (none) | Blacklist operation types |
| `--allowed-packages` / `SAP_ALLOWED_PACKAGES` | (all) | Restrict to packages (wildcards: `Z*,$TMP`) |
| `--allow-transportable-edits` / `SAP_ALLOW_TRANSPORTABLE_EDITS` | false | Require explicit opt-in for transport objects |
| `--allowed-transports` / `SAP_ALLOWED_TRANSPORTS` | (all) | Whitelist CTS transport numbers |

## Configuration

Priority order: CLI flags > environment variables > `.env` file > defaults.

```bash
# Basic
arc1 --url https://host:44300 --user admin --password secret

# Cookie auth (SSO / Fiori Launchpad)
arc1 --url https://host:44300 --cookie-file cookies.txt

# Multiple SAP systems via .arc1.json
arc1 -s dev source CLAS ZCL_MY_CLASS
```

**`.arc1.json`** — define multiple system profiles:

```json
{
  "default": "dev",
  "systems": {
    "dev":  { "url": "http://dev:50000",  "user": "DEVELOPER", "client": "001" },
    "prod": { "url": "https://prod:44300", "user": "VIEWER",    "client": "100", "read_only": true }
  }
}
```

Passwords via environment: `VSP_DEV_PASSWORD`, `VSP_PROD_PASSWORD`.

Full configuration reference: **[CLAUDE.md](CLAUDE.md#configuration)**

## ABAP LSP for Claude Code

arc1 includes a built-in LSP that gives Claude Code real-time ABAP diagnostics without explicit tool calls:

```json
{
  "lsp": {
    "abap": {
      "command": "arc1",
      "args": ["lsp", "--stdio"],
      "extensionToLanguage": { ".abap": "abap", ".asddls": "abap" }
    }
  }
}
```

Provides: syntax errors on save, go-to-definition. SAP credentials from environment or `.env`.

## CLI Mode

arc1 also works as a direct CLI tool (no MCP client needed):

```bash
arc1 -s dev source CLAS ZCL_MY_CLASS          # read source
arc1 -s dev test --package '$TMP'             # run unit tests
arc1 -s dev grep "SELECT.*mara" --package Z*  # search source
arc1 -s dev deploy myclass.clas.abap '$TMP'   # deploy file
arc1 -s dev install abapgit                   # bootstrap dependencies
arc1 systems                                  # list configured systems
```

See **[docs/cli-guide.md](docs/cli-guide.md)** for the full command reference.

## Documentation

| Doc | Description |
|-----|-------------|
| [docs/architecture.md](docs/architecture.md) | System architecture with Mermaid diagrams |
| [docs/tools.md](docs/tools.md) | Complete tool reference (all 122 tools) |
| [docs/mcp-usage.md](docs/mcp-usage.md) | AI agent usage guide & workflow patterns |
| [docs/cli-guide.md](docs/cli-guide.md) | CLI command reference |
| [docs/cli-agents/README.md](docs/cli-agents/README.md) | Setup guides for 8 MCP clients |
| [docs/sap-trial-setup.md](docs/sap-trial-setup.md) | SAP BTP trial setup |
| [docs/docker.md](docs/docker.md) | Docker deployment |
| [docs/DSL.md](docs/DSL.md) | Go fluent API & YAML workflow engine |
| [docs/changelog.md](docs/changelog.md) | Version history |
| [docs/roadmap.md](docs/roadmap.md) | Planned features |
| [CLAUDE.md](CLAUDE.md) | AI development guidelines (codebase structure, patterns) |
| [docs/reviewer-guide.md](docs/reviewer-guide.md) | 8 hands-on tasks to evaluate arc1 — no SAP system needed |

## Development

```bash
make build                                     # current platform
make build-all                                 # all 9 platforms (Linux/macOS/Windows × amd64/arm64/386)

go test ./...                                  # unit tests — no SAP required
go test -tags=integration -v ./pkg/adt/        # integration tests — skipped if no SAP vars set
```

See [CLAUDE.md](CLAUDE.md) for codebase structure and contribution guidelines.

## Credits

| Project | Author | Contribution |
|---------|--------|--------------|
| [abap-adt-api](https://github.com/marcellourbani/abap-adt-api) | Marcello Urbani | TypeScript ADT library, definitive API reference |
| [mcp-abap-adt](https://github.com/mario-andreschak/mcp-abap-adt) | Mario Andreschak | First MCP server for ABAP ADT |
| [abaplint](https://github.com/abaplint/abaplint) | Lars Hvam | ABAP parser (ported to Go for context compression) |

## License

MIT
