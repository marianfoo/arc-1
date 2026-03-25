# vsp — SAP ADT MCP Server

**Enterprise-ready proxy between AI clients and SAP systems.**

vsp is a single Go binary that implements the [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) and translates AI tool calls into [SAP ABAP Development Tools (ADT)](https://help.sap.com/docs/abap-cloud/abap-development-tools-user-guide/about-abap-development-tools) REST API requests. It works with Claude, GitHub Copilot, VS Code, and any MCP-compatible client.

![Vibing ABAP Developer](./media/vibing-steampunk.png)

## Why vsp?

| | [abap-adt-api](https://github.com/marcellourbani/abap-adt-api) | [mcp-abap-adt](https://github.com/mario-andreschak/mcp-abap-adt) | **vsp** |
|---|:---:|:---:|:---:|
| Single binary, zero runtime deps | — | — | **Y** |
| Read-only mode / package whitelist | — | — | **Y** |
| Transport controls (CTS safety) | — | — | **Y** |
| HTTP Streamable transport (Copilot Studio) | — | — | **Y** |
| Token-efficient tool modes (1 / 81 / 122 tools) | — | — | **Y** |
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
curl -LO https://github.com/oisee/vibing-steampunk/releases/latest/download/vsp-linux-amd64
chmod +x vsp-linux-amd64 && mv vsp-linux-amd64 vsp

# Or build from source
git clone https://github.com/oisee/vibing-steampunk.git && cd vibing-steampunk
make build
```

## Connect Your Client

### Claude Desktop

Add to `~/.config/claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "sap": {
      "command": "/path/to/vsp",
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
      "command": "/path/to/vsp",
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

Start vsp as an HTTP server, then point your MCP client to it:

```bash
SAP_URL=https://host:44300 SAP_USER=dev SAP_PASSWORD=secret \
  vsp --transport http-streamable --port 3000
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

All MCP clients that support stdio work out of the box — just point them at the `vsp` binary.
See **[docs/cli-agents/README.md](docs/cli-agents/README.md)** for per-client config templates
(also available in [Русский](docs/cli-agents/README_RU.md) | [Українська](docs/cli-agents/README_UA.md) | [Español](docs/cli-agents/README_ES.md)).

## Tool Modes

Choose how many tools to expose based on your model and use case:

| Mode | Tools | Schema tokens | Best for |
|------|------:|:-------------:|----------|
| `hyperfocused` | 1 universal `SAP()` | ~200 | Local/small models, automation, minimal context |
| `focused` (default) | 81 | ~14K | Standard AI-assisted development |
| `expert` | 122 | ~40K | Power users, edge cases, full ADT access |

```bash
vsp --mode focused       # default
vsp --mode expert
vsp --mode hyperfocused  # SAP(action, target, params)
```

All safety controls work identically across all modes.

## Tool Categories

| Category | Tools (focused) | What they do |
|----------|:---:|-------------|
| **Read** | GetSource, GetTable, GetTableContents, RunQuery, GetPackage, GetFunctionGroup, GetCDSDependencies, GetClassInfo, GetMessages, CompareSource | Read ABAP source, table data, CDS views, message classes |
| **Search** | SearchObject, GrepObjects, GrepPackages | Find objects by name; regex search inside source across objects/packages |
| **Write** | WriteSource, EditSource, ImportFromFile, ExportToFile, MoveObject | Create/update objects; surgical line-range edits; file-based deploy |
| **Dev** | SyntaxCheck, RunUnitTests, RunATCCheck, LockObject, UnlockObject, ActivatePackage | Check, test, and activate ABAP objects |
| **Navigate** | FindDefinition, FindReferences | Go-to-definition and where-used |
| **System** | GetSystemInfo, GetInstalledComponents, GetCallGraph, GetObjectStructure, GetFeatures | System info, call graphs, object structure |
| **Diagnostics** | ListDumps, GetDump, ListTraces, GetTrace, GetSQLTraceState, ListSQLTraces | Short dumps (RABAX), ABAP profiler (ATRA), SQL traces (ST05) |
| **Transport** | ListTransports, GetTransport, GetInactiveObjects | CTS transport management |
| **Git** | GitTypes, GitExport | abapGit-compatible export (requires abapGit on SAP) |
| **Install** | InstallZADTVSP, InstallAbapGit, ListDependencies | Bootstrap dependencies directly to SAP — no SAP GUI needed |
| **Debugger** | DebuggerListen, DebuggerAttach, DebuggerDetach, DebuggerStep, DebuggerGetStack, DebuggerGetVariables, GetBreakpoints | External ABAP debugger (expert mode) |

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
vsp --read-only

# Restrict to specific packages (wildcards supported)
vsp --allowed-packages "ZPROD*,$TMP"

# Block free-form SQL
vsp --block-free-sql

# Whitelist operation types (R=Read, S=Search, Q=Query, …)
vsp --allowed-ops "RSQ"

# Require explicit transport before editing transportable objects
# (default: blocked — must opt in)
vsp --allow-transportable-edits --allowed-transports "DEVK*"
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
vsp --url https://host:44300 --user admin --password secret

# Cookie auth (SSO / Fiori Launchpad)
vsp --url https://host:44300 --cookie-file cookies.txt

# Multiple SAP systems via .vsp.json
vsp -s dev source CLAS ZCL_MY_CLASS
```

**`.vsp.json`** — define multiple system profiles:

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

vsp includes a built-in LSP that gives Claude Code real-time ABAP diagnostics without explicit tool calls:

```json
{
  "lsp": {
    "abap": {
      "command": "vsp",
      "args": ["lsp", "--stdio"],
      "extensionToLanguage": { ".abap": "abap", ".asddls": "abap" }
    }
  }
}
```

Provides: syntax errors on save, go-to-definition. SAP credentials from environment or `.env`.

## CLI Mode

vsp also works as a direct CLI tool (no MCP client needed):

```bash
vsp -s dev source CLAS ZCL_MY_CLASS          # read source
vsp -s dev test --package '$TMP'             # run unit tests
vsp -s dev grep "SELECT.*mara" --package Z*  # search source
vsp -s dev deploy myclass.clas.abap '$TMP'   # deploy file
vsp -s dev install abapgit                   # bootstrap dependencies
vsp systems                                  # list configured systems
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
| [docs/reviewer-guide.md](docs/reviewer-guide.md) | 8 hands-on tasks to evaluate vsp — no SAP system needed |

## Development

```bash
make build                                     # current platform
make build-all                                 # all 9 platforms (Linux/macOS/Windows × amd64/arm64/386)

go test ./...                                  # unit tests (270+)
go test -tags=integration -v ./pkg/adt/        # integration tests (requires SAP)
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
