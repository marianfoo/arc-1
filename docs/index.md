# vsp — SAP ADT MCP Server

**Enterprise-ready proxy between AI clients and SAP systems.**

vsp is a single Go binary that implements the [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) and translates AI tool calls into [SAP ABAP Development Tools (ADT)](https://help.sap.com/docs/abap-cloud/abap-development-tools-user-guide/about-abap-development-tools) REST API requests. It works with Claude, GitHub Copilot, VS Code, and any MCP-compatible client.

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

### Other MCP Clients

All MCP clients that support stdio work out of the box — just point them at the `vsp` binary.
See **[cli-agents/README.md](cli-agents/README.md)** for per-client config templates.

## Tool Modes

| Mode | Tools | Best for |
|------|------:|----------|
| `hyperfocused` | 1 universal `SAP()` | Local/small models, automation |
| `focused` (default) | 81 | Standard AI-assisted development |
| `expert` | 122 | Power users, full ADT access |

## Tool Categories

| Category | What they do |
|----------|-------------|
| **Read** | Source code, table data, CDS views, message classes |
| **Search** | Find objects by name; regex search inside source |
| **Write** | Create/update objects; surgical line-range edits |
| **Dev** | Syntax check, test, activate ABAP objects |
| **Navigate** | Go-to-definition and where-used |
| **System** | System info, call graphs, object structure |
| **Diagnostics** | Short dumps (RABAX), ABAP profiler (ATRA), SQL traces |
| **Transport** | CTS transport management |
| **Git** | abapGit-compatible export |
| **Install** | Bootstrap ZADT_VSP and abapGit — no SAP GUI needed |
| **Debugger** | External ABAP debugger (expert mode) |

Full reference: **[tools.md](tools.md)**

## Admin Controls (Safety)

```bash
vsp --read-only                              # block all writes
vsp --allowed-packages "ZPROD*,$TMP"        # restrict packages
vsp --block-free-sql                         # block RunQuery
vsp --allowed-ops "RSQ"                      # whitelist operations
vsp --allow-transportable-edits             # opt-in for transport objects
```

## Documentation

| Doc | Description |
|-----|-------------|
| [architecture.md](architecture.md) | System architecture with Mermaid diagrams |
| [tools.md](tools.md) | Complete tool reference (all 122 tools) |
| [mcp-usage.md](mcp-usage.md) | AI agent usage guide & workflow patterns |
| [cli-guide.md](cli-guide.md) | CLI command reference |
| [cli-agents/README.md](cli-agents/README.md) | Setup guides for 8 MCP clients |
| [sap-trial-setup.md](sap-trial-setup.md) | SAP BTP trial setup |
| [docker.md](docker.md) | Docker deployment |
| [DSL.md](DSL.md) | Go fluent API & YAML workflow engine |
| [agents.md](agents.md) | Developer & AI assistant guide |
| [changelog.md](changelog.md) | Version history |
| [roadmap.md](roadmap.md) | Planned features |

## License

MIT — [GitHub Repository](https://github.com/oisee/vibing-steampunk)
