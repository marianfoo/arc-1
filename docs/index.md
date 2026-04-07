# ARC-1 — SAP ADT MCP Server

**Enterprise-ready proxy between AI clients and SAP systems.**

ARC-1 is a TypeScript MCP server (distributed as an npm package and Docker image) that implements the [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) and translates AI tool calls into [SAP ABAP Development Tools (ADT)](https://help.sap.com/docs/abap-cloud/abap-development-tools-user-guide/about-abap-development-tools) REST API requests. It works with Claude, GitHub Copilot, VS Code, and any MCP-compatible client.

> **This repository** ([marianfoo/arc-1](https://github.com/marianfoo/arc-1)) is the actively maintained fork, continued from the original [oisee/vibing-steampunk](https://github.com/oisee/vibing-steampunk).

## Why ARC-1?

| | [abap-adt-api](https://github.com/marcellourbani/abap-adt-api) | [mcp-abap-adt](https://github.com/mario-andreschak/mcp-abap-adt) | **ARC-1** |
|---|:---:|:---:|:---:|
| npm package + Docker image | — | — | **Y** |
| Read-only mode / package whitelist | — | — | **Y** |
| Transport controls (CTS safety) | — | — | **Y** |
| HTTP Streamable transport (Copilot Studio) | — | — | **Y** |
| 11 intent-based tools for AI agents | — | — | **Y** |
| Method-level read/edit (95% token reduction) | — | — | **Y** |
| Context compression (7-30x) | — | — | **Y** |
| Works with 8+ MCP clients | — | — | **Y** |

As an **admin**, you control what the AI can and cannot do:

- Restrict to read-only, specific packages, or whitelisted operations
- Require transport assignments before any write
- Block free-form SQL execution
- Allow or deny individual operation types per deployment

## Quick Start

```bash
# Run directly with npx (no install needed)
npx arc-1 --url https://your-sap-host:44300 --user YOUR_USER

# Or install globally
npm install -g arc-1
arc1 --url https://your-sap-host:44300 --user YOUR_USER

# Or use Docker
docker run -e SAP_URL=https://host:44300 -e SAP_USER=dev -e SAP_PASSWORD=secret \
  ghcr.io/marianfoo/arc-1
```

### BTP ABAP Environment

For SAP BTP ABAP (Steampunk) systems, use a service key instead of username/password:

```bash
SAP_BTP_SERVICE_KEY_FILE=/path/to/service-key.json arc1
```

A browser opens for login (OAuth 2.0 Authorization Code flow). See **[btp-abap-environment.md](btp-abap-environment.md)** for full setup.

## Connect Your Client

### Claude Desktop

Add to `~/.config/claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "sap": {
      "command": "npx",
      "args": ["-y", "arc-1"],
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
      "command": "npx",
      "args": ["-y", "arc-1"],
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
  npx arc-1 --transport http-streamable --port 3000
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

All MCP clients that support stdio work out of the box — just point them at `npx arc-1`.

## Tools

ARC-1 exposes 11 intent-based tools via MCP, designed for AI agents like Copilot Studio.

Full reference: **[tools.md](tools.md)**

## Admin Controls (Safety)

```bash
arc1 --read-only                              # block all writes
arc1 --allowed-packages "ZPROD*,$TMP"        # restrict packages
arc1 --block-free-sql                         # block RunQuery
arc1 --allowed-ops "RSQ"                      # whitelist operations
```

## Documentation

| Doc | Description |
|-----|-------------|
| [setup-guide.md](setup-guide.md) | **Start here** — deployment options, auth methods, decision tree |
| [architecture.md](architecture.md) | System architecture with Mermaid diagrams |
| [tools.md](tools.md) | Complete tool reference (11 intent-based tools) |
| [caching.md](caching.md) | Object caching — memory, SQLite, pre-warmer, reverse dep lookup |
| [mcp-usage.md](mcp-usage.md) | AI agent usage guide & workflow patterns |
| [docker.md](docker.md) | Full Docker reference |
| [btp-abap-environment.md](btp-abap-environment.md) | **BTP ABAP Environment** — direct connection via service key + OAuth |
| [enterprise-auth.md](enterprise-auth.md) | Enterprise authentication (all methods) |
| [cli-guide.md](cli-guide.md) | CLI commands and configuration |
| [sap-trial-setup.md](sap-trial-setup.md) | SAP BTP trial setup |
| [roadmap.md](roadmap.md) | Planned features |

## License

MIT — [GitHub Repository](https://github.com/marianfoo/arc-1)
