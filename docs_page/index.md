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
- Require transport assignments before any write (update/delete auto-uses lock correction number when available)
- Block free-form SQL execution
- Allow or deny individual operation types per deployment

## Quick Start

```bash
# Run directly with npx (no install needed)
npx arc-1@latest --url https://your-sap-host:44300 --user YOUR_USER

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

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "sap": {
      "command": "npx",
      "args": ["-y", "arc-1@latest"],
      "env": {
        "SAP_URL": "https://your-sap-host:44300",
        "SAP_USER": "your-username",
        "SAP_PASSWORD": "your-password",
        "SAP_CLIENT": "100"
      }
    }
  }
}
```

**ARC-1 is read-only by default** — no writes, no free SQL, no table preview, no transport actions. To enable writes and widen the package scope, add safety flags to the `env` block. The example below unlocks everything (writes + SQL + transports + all packages):

```json
{
  "mcpServers": {
    "sap": {
      "command": "npx",
      "args": ["-y", "arc-1@latest"],
      "env": {
        "SAP_URL": "https://your-sap-host:44300",
        "SAP_USER": "your-username",
        "SAP_PASSWORD": "your-password",
        "SAP_CLIENT": "100",
        "ARC1_PROFILE": "developer-sql",
        "SAP_ALLOWED_PACKAGES": "*"
      }
    }
  }
}
```

For fine-grained control, see [Admin Controls (Safety)](#admin-controls-safety) below or [local-development.md → Safety profiles](local-development.md#safety-profiles).

### Claude Code

Add `.mcp.json` to your project root:

```json
{
  "mcpServers": {
    "sap": {
      "command": "npx",
      "args": ["-y", "arc-1@latest"],
      "env": {
        "SAP_URL": "https://your-sap-host:44300",
        "SAP_USER": "your-username",
        "SAP_PASSWORD": "your-password",
        "SAP_CLIENT": "100"
      }
    }
  }
}
```

### GitHub Copilot / VS Code (HTTP Streamable)

Start arc1 as an HTTP server, then point your MCP client to it:

```bash
SAP_URL=https://host:44300 SAP_USER=dev SAP_PASSWORD=secret \
  npx arc-1@latest --transport http-streamable --http-addr 0.0.0.0:3000
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

## Testing & CI

- **1,300+ unit tests** run locally without SAP access (`npm test`)
- **Integration + E2E lanes** run on `main` pushes and internal PRs in GitHub Actions
- **BTP tests** are local-only (`npm run test:integration:btp`, `npm run test:integration:btp:smoke`)
- **Reliability telemetry + coverage** are collected as informational CI signals

## Admin Controls (Safety)

Safe by default — read-only, no SQL, no data preview, no transports. Writes are restricted to `$TMP`. Enable capabilities explicitly:

```bash
# Enable everything (writes + transports + SQL + data, all packages)
arc1 --profile developer-sql --allowed-packages "*"

# Writes + transports, no SQL/data (default developer preset)
arc1 --profile developer

# Fine-grained individual flags
arc1 --read-only=false                        # writes only (still $TMP)
arc1 --read-only=false --allowed-packages "ZPROD*,$TMP"
arc1 --block-free-sql=false                   # free SQL only
arc1 --block-data=false                       # table preview only
arc1 --enable-transports=true                 # SAPTransport (all actions)
arc1 --allowed-ops "RSQ"                      # whitelist operation codes
```

Full recipe reference: [local-development.md → Safety profiles](local-development.md#safety-profiles). Profile expansions: [configuration-reference.md → Profile expansions](configuration-reference.md#profile-expansions).

## Documentation

| Doc | Description |
|-----|-------------|
| [quickstart.md](quickstart.md) | **Start here** — 5-minute npx + Claude Desktop setup |
| [local-development.md](local-development.md) | Full local dev — npx/npm/Docker/git, `.env`, SSO cookie extractor, MCP client configs |
| [deployment.md](deployment.md) | Multi-user deployment — Docker on a VM, BTP Cloud Foundry, BTP ABAP |
| [configuration-reference.md](configuration-reference.md) | Every flag and env var, one table |
| [updating.md](updating.md) | Update procedures (npx / Docker / BTP / git) |
| [enterprise-auth.md](enterprise-auth.md) | Auth internals — Layer A / Layer B, coexistence matrix |
| [authorization.md](authorization.md) | Scopes, roles, safety profiles |
| [tools.md](tools.md) | Complete tool reference (11 intent-based tools) |
| [mcp-usage.md](mcp-usage.md) | AI agent usage guide & workflow patterns |
| [architecture.md](architecture.md) | System architecture with Mermaid diagrams |
| [caching.md](caching.md) | Object caching — memory, SQLite, pre-warmer, reverse dep lookup |
| [security-guide.md](security-guide.md) | Security hardening checklist for production |
| [cli-guide.md](cli-guide.md) | CLI commands and configuration |
| [docker.md](docker.md) | Full Docker reference |
| [btp-abap-environment.md](btp-abap-environment.md) | BTP ABAP Environment — direct connection via service key + OAuth |
| [phase4-btp-deployment.md](phase4-btp-deployment.md) | BTP Cloud Foundry deployment details |
| [sap-trial-setup.md](sap-trial-setup.md) | SAP BTP trial setup |
| [roadmap.md](roadmap.md) | Planned features |

## License

MIT — [GitHub Repository](https://github.com/marianfoo/arc-1)
