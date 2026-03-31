# arc1 — SAP ADT MCP Server

**ARC-1 (ABAP Relay Connector) — Enterprise-ready proxy between AI clients and SAP systems.**

arc1 is a TypeScript MCP server (distributed as an npm package and Docker image) that implements the [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) and translates AI tool calls into [SAP ABAP Development Tools (ADT)](https://help.sap.com/docs/abap-cloud/abap-development-tools-user-guide/about-abap-development-tools) REST API requests. It works with Claude, GitHub Copilot, VS Code, and any MCP-compatible client.

> **This repository** ([marianfoo/arc-1](https://github.com/marianfoo/arc-1)) is the actively maintained fork, continued from the original [oisee/vibing-steampunk](https://github.com/oisee/vibing-steampunk).

![Vibing ABAP Developer](./media/vibing-steampunk.png)

## Why arc1?

| | [abap-adt-api](https://github.com/marcellourbani/abap-adt-api) | [mcp-abap-adt](https://github.com/mario-andreschak/mcp-abap-adt) | **arc1** |
|---|:---:|:---:|:---:|
| npm package + Docker image | — | — | **Y** |
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
# Run directly with npx (no install needed)
npx arc-1 --url https://your-sap-host:44300 --user YOUR_USER

# Or install globally
npm install -g arc-1
arc1 --url https://your-sap-host:44300 --user YOUR_USER

# Or use Docker
docker run -e SAP_URL=https://host:44300 -e SAP_USER=dev -e SAP_PASSWORD=secret \
  ghcr.io/marianfoo/arc-1
```

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

### Other MCP Clients (Gemini CLI, OpenCode, Goose, Qwen, …)

All MCP clients that support stdio work out of the box — just point them at `npx arc-1`.

## Tools

arc1 exposes 11 intent-based tools (~5K schema tokens):

| Tool | What it does |
|------|-------------|
| **SAPRead** | Read ABAP source, table data, CDS views, message classes, class info |
| **SAPSearch** | Find objects by name with wildcards |
| **SAPWrite** | Create/update ABAP source code with auto lock/unlock |
| **SAPActivate** | Activate (publish) ABAP objects |
| **SAPNavigate** | Go-to-definition, find references, code completion |
| **SAPQuery** | Execute ABAP SQL queries against SAP tables |
| **SAPTransport** | CTS transport management (list, create, release) |
| **SAPContext** | Compressed dependency context for LLM efficiency |
| **SAPLint** | ABAP lint and code quality checks |
| **SAPDiagnose** | Runtime errors (short dumps), profiler traces, SQL traces |
| **SAPManage** | System feature probing and status |

Full tool reference: **[docs/tools.md](docs/tools.md)**

## Token Efficiency

**Method-level surgery** — read or edit a single method, not the whole class:

```
SAPRead(type="CLAS", name="ZCL_CALCULATOR", include="implementations")
SAPWrite(action="update", type="CLAS", name="ZCL_CALCULATOR", source="...")
```

Up to 20x fewer tokens vs full-class round-trips.

**Context compression** — `SAPContext` auto-appends public API signatures of all referenced classes and interfaces (7–30x compression). One call = source + full dependency context.

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
```

Full safety reference:

| Flag / Env | Default | Effect |
|---|:---:|---|
| `--read-only` / `SAP_READ_ONLY` | false | Block all write operations |
| `--block-free-sql` / `SAP_BLOCK_FREE_SQL` | false | Block `RunQuery` execution |
| `--allowed-ops` / `SAP_ALLOWED_OPS` | (all) | Whitelist operation types |
| `--disallowed-ops` / `SAP_DISALLOWED_OPS` | (none) | Blacklist operation types |
| `--allowed-packages` / `SAP_ALLOWED_PACKAGES` | (all) | Restrict to packages (wildcards: `Z*,$TMP`) |

## Configuration

Priority order: CLI flags > environment variables > `.env` file > defaults.

```bash
# Basic
arc1 --url https://host:44300 --user admin --password secret

# Cookie auth (SSO / Fiori Launchpad)
arc1 --url https://host:44300 --cookie-file cookies.txt
```

Full configuration reference: **[CLAUDE.md](CLAUDE.md#configuration)**

## Documentation

| Doc | Description |
|-----|-------------|
| [docs/setup-guide.md](docs/setup-guide.md) | **Start here** — deployment options, auth methods, decision tree |
| [docs/architecture.md](docs/architecture.md) | System architecture with Mermaid diagrams |
| [docs/tools.md](docs/tools.md) | Complete tool reference (11 intent-based tools) |
| [docs/mcp-usage.md](docs/mcp-usage.md) | AI agent usage guide & workflow patterns |
| [docs/docker.md](docs/docker.md) | Full Docker reference |
| [docs/enterprise-auth.md](docs/enterprise-auth.md) | Enterprise authentication (all methods) |
| [docs/sap-trial-setup.md](docs/sap-trial-setup.md) | SAP BTP trial setup |
| [docs/roadmap.md](docs/roadmap.md) | Planned features |
| [CLAUDE.md](CLAUDE.md) | AI development guidelines (codebase structure, patterns) |

## Development

```bash
npm ci                    # install dependencies
npm run build             # TypeScript → dist/
npm test                  # unit tests (no SAP system required)
npm run test:integration  # integration tests (skipped if no SAP vars set)
```

See [CLAUDE.md](CLAUDE.md) for codebase structure and contribution guidelines.

## Releasing

Releases are fully automated via [release-please](https://github.com/googleapis/release-please) and GitHub Actions.

### How it works

1. **Merge PRs to `main`** using [Conventional Commits](https://www.conventionalcommits.org/):
   - `feat: add SAPDeploy tool` → minor bump (0.1.0 → 0.2.0)
   - `fix: handle empty XML response` → patch bump (0.1.0 → 0.1.1)
   - `feat!: rename tools` or `BREAKING CHANGE:` in body → major bump (0.1.0 → 1.0.0)
   - `chore:`, `docs:`, `ci:` → no release

2. **release-please automatically creates a Release PR** that accumulates all changes since the last release, with a bumped version and generated `CHANGELOG.md`.

3. **Merge the Release PR** when you're ready. This triggers:
   - **npm publish** with provenance (trusted publishing via OIDC, no tokens)
   - **Docker push** to `ghcr.io/marianfoo/arc-1` with semver tags (`:0.2.0`, `:0.2`, `:latest`)
   - **GitHub Release** with auto-generated release notes

### Versioned artifacts

| Artifact | Location |
|----------|----------|
| npm package | [npmjs.com/package/arc-1](https://www.npmjs.com/package/arc-1) |
| Docker image | `ghcr.io/marianfoo/arc-1:{version}` |
| GitHub Release | [Releases](https://github.com/marianfoo/arc-1/releases) |

### CI workflows

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `test.yml` | push / PR to main | Lint, typecheck, unit tests (Node 20/22/24) |
| `release.yml` | push to main | release-please PR; on merge: npm + Docker + GitHub Release |
| `docker.yml` | push to main | Dev `latest` Docker image (every commit) |

## Credits

| Project | Author | Contribution |
|---------|--------|--------------|
| [abap-adt-api](https://github.com/marcellourbani/abap-adt-api) | Marcello Urbani | TypeScript ADT library, definitive API reference |
| [mcp-abap-adt](https://github.com/mario-andreschak/mcp-abap-adt) | Mario Andreschak | First MCP server for ABAP ADT |
| [abaplint](https://github.com/abaplint/abaplint) | Lars Hvam | ABAP parser/linter (used via @abaplint/core) |

## License

MIT
