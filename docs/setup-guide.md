# Setup Guide

This guide helps you choose the right deployment mode and authentication method for arc1, then walks you through setting it up.

---

## Decision Tree

### Step 1: Where does arc1 run?

```
Are you the only user?
├── Yes → Local deployment
│   ├── Want zero install? ─────────── npx (easiest)
│   ├── Want a global CLI? ─────────── npm install -g
│   ├── Want containerized? ────────── Docker (local)
│   └── Want to hack on arc1 itself? ─ git clone
│
└── No → Shared / remote deployment
    ├── Have BTP Cloud Foundry? ────── BTP CF (Docker on CF)
    └── Have any server / VM? ──────── Docker (remote)
```

### Step 2: How does arc1 connect to SAP?

```
Is your SAP system...
├── On your laptop / direct network? ─ Basic Auth (user/password)
├── Behind a corporate firewall? ───── Cloud Connector + Destination Service
├── A BTP ABAP Environment? ────────── OAuth2/XSUAA (service key)
└── Need per-user identity in SAP? ─── Principal Propagation (OIDC + X.509)
```

### Step 3: How do MCP clients authenticate to arc1?

```
Is arc1 exposed to a network?
├── No (local stdio) ──────────── No auth needed
├── Yes, single shared token ──── API Key (Bearer token)
├── Yes, per-user identity ────── OIDC JWT (EntraID, Cognito, etc.)
└── Yes, on BTP ───────────────── XSUAA OAuth2
```

### Common combinations

| Scenario | Deployment | SAP Auth | MCP Auth | Guide |
|----------|-----------|----------|----------|-------|
| **Developer laptop** | npx / npm | Basic Auth | None (stdio) | [Local: npx](#local-npx) |
| **Team dev server** | Docker | Basic Auth | API Key | [Docker + API Key](#docker-with-api-key) |
| **Enterprise (single SAP user)** | Docker / BTP | Basic Auth | OIDC JWT | [Docker + OIDC](#docker-with-oidc) |
| **Enterprise (per-user SAP)** | BTP CF | Principal Propagation | XSUAA | [BTP deployment](phase4-btp-deployment.md) |
| **BTP ABAP Environment** | Docker / BTP | OAuth2/XSUAA | API Key or OIDC | [Docker + OAuth2](#docker-with-oauth2-xsuaa) |

> **Best practices:** For enterprise deployments with multiple SAP systems, see [Deployment Best Practices](deployment-best-practices.md) — covers one-instance-per-system architecture, security recommendations, and BTP-specific tool adaptation.

---

## Local Deployment

### Local: npx

The fastest way to get started. No install, no config files needed.

**Prerequisites:** Node.js 20+, network access to your SAP system.

```bash
# Interactive — prompts for password
npx arc-1@latest --url https://your-sap-host:44300 --user YOUR_USER

# Or pass everything
npx arc-1@latest --url https://your-sap-host:44300 --user YOUR_USER --password YOUR_PASS
```

This starts an MCP server on **stdio** — the default transport for Claude Desktop, Claude Code, and most MCP clients.

#### Connect Claude Desktop

Add to `~/.config/claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "sap": {
      "command": "npx",
      "args": ["-y", "arc-1@latest"],
      "env": {
        "SAP_URL": "https://your-sap-host:44300",
        "SAP_USER": "YOUR_USER",
        "SAP_PASSWORD": "YOUR_PASS"
      }
    }
  }
}
```

With safety controls (read-only, restricted packages):

```json
{
  "mcpServers": {
    "sap": {
      "command": "npx",
      "args": ["-y", "arc-1@latest"],
      "env": {
        "SAP_URL": "https://your-sap-host:44300",
        "SAP_USER": "YOUR_USER",
        "SAP_PASSWORD": "YOUR_PASS",
        "SAP_READ_ONLY": "true"
      }
    }
  }
}
```

```json
{
  "mcpServers": {
    "sap": {
      "command": "npx",
      "args": ["-y", "arc-1@latest"],
      "env": {
        "SAP_URL": "https://your-sap-host:44300",
        "SAP_USER": "YOUR_USER",
        "SAP_PASSWORD": "YOUR_PASS",
        "SAP_ALLOWED_PACKAGES": "Z*,$TMP",
        "SAP_BLOCK_FREE_SQL": "true"
      }
    }
  }
}
```

#### Connect Claude Code

Add `.mcp.json` to your project root:

```json
{
  "mcpServers": {
    "sap": {
      "command": "npx",
      "args": ["-y", "arc-1@latest"],
      "env": {
        "SAP_URL": "https://your-sap-host:44300",
        "SAP_USER": "YOUR_USER",
        "SAP_PASSWORD": "YOUR_PASS"
      }
    }
  }
}
```

With read-only mode:

```json
{
  "mcpServers": {
    "sap": {
      "command": "npx",
      "args": ["-y", "arc-1@latest"],
      "env": {
        "SAP_URL": "https://your-sap-host:44300",
        "SAP_USER": "YOUR_USER",
        "SAP_PASSWORD": "YOUR_PASS",
        "SAP_READ_ONLY": "true",
        "SAP_BLOCK_FREE_SQL": "true"
      }
    }
  }
}
```

#### Connect VS Code / GitHub Copilot (HTTP mode)

VS Code and Copilot use HTTP Streamable transport, not stdio. Start arc1 as an HTTP server first:

```bash
npx arc-1@latest --url https://host:44300 --user dev --password secret \
  --transport http-streamable --http-addr 0.0.0.0:3000
```

With safety controls:

```bash
npx arc-1@latest --url https://host:44300 --user dev --password secret \
  --transport http-streamable --http-addr 0.0.0.0:3000 \
  --read-only --block-free-sql
```

Then add to VS Code MCP settings:

```json
{
  "mcpServers": {
    "sap": {
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

#### Connect Cursor

For stdio mode, add to Cursor MCP settings:

```json
{
  "mcpServers": {
    "sap": {
      "command": "npx",
      "args": ["-y", "arc-1@latest"],
      "env": {
        "SAP_URL": "https://your-sap-host:44300",
        "SAP_USER": "YOUR_USER",
        "SAP_PASSWORD": "YOUR_PASS"
      }
    }
  }
}
```

For HTTP mode (same as VS Code), start the server first and point Cursor to `http://localhost:3000/mcp`.

#### Connect any other MCP client (Gemini CLI, Goose, OpenCode, etc.)

All MCP clients that support **stdio** work out of the box:

```bash
npx arc-1@latest --url https://host:44300 --user dev --password secret
```

For clients that support **HTTP Streamable**, start the server and connect to the URL:

```bash
npx arc-1@latest --url https://host:44300 --user dev --password secret \
  --transport http-streamable --http-addr 0.0.0.0:3000
# Connect your client to http://localhost:3000/mcp
```

#### Configuration via environment variables

All config options work as environment variables in the `env` block of MCP client configs. The most common safety options:

| Env Var | Example | Effect |
|---------|---------|--------|
| `SAP_READ_ONLY` | `"true"` | Block all write operations |
| `SAP_BLOCK_FREE_SQL` | `"true"` | Block SQL query execution |
| `SAP_ALLOWED_PACKAGES` | `"Z*,$TMP"` | Only allow writes to matching packages |
| `SAP_ALLOWED_OPS` | `"RSQ"` | Only allow Read, Search, Query operations |
| `SAP_INSECURE` | `"true"` | Skip TLS verification (dev only) |
| `SAP_CLIENT` | `"100"` | SAP client number (default: 100) |

See [Safety Controls](#safety-controls) and [Quick Reference](#quick-reference-all-configuration) for all options.

### Local: npm install

Same as npx but installs globally for faster startup:

```bash
npm install -g arc-1
arc1 --url https://your-sap-host:44300 --user YOUR_USER
```

### Local: Docker

Run arc1 in a container. Defaults to HTTP Streamable on port 8080.

```bash
docker run -d --name arc1 \
  -p 8080:8080 \
  -e SAP_URL=https://your-sap-host:44300 \
  -e SAP_USER=YOUR_USER \
  -e SAP_PASSWORD=YOUR_PASS \
  ghcr.io/marianfoo/arc-1:latest
```

Connect any MCP client to `http://localhost:8080/mcp`.

For stdio mode (e.g., Claude Desktop):

```json
{
  "mcpServers": {
    "sap": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm",
        "-e", "SAP_URL=https://your-sap-host:44300",
        "-e", "SAP_USER=YOUR_USER",
        "-e", "SAP_PASSWORD=YOUR_PASS",
        "-e", "SAP_TRANSPORT=stdio",
        "ghcr.io/marianfoo/arc-1:latest"
      ]
    }
  }
}
```

### Local: git clone (development)

For contributing or customizing arc1:

```bash
git clone https://github.com/marianfoo/arc-1.git
cd arc-1
npm ci
npm run build

# Run directly
SAP_URL=https://host:44300 SAP_USER=dev SAP_PASSWORD=secret npm start

# Or dev mode (auto-rebuild)
SAP_URL=https://host:44300 SAP_USER=dev SAP_PASSWORD=secret npm run dev
```

---

## Docker Images

Pre-built multi-arch images (amd64 + arm64) are published to GitHub Container Registry on every release.

| Tag | Description |
|-----|-------------|
| `ghcr.io/marianfoo/arc-1:latest` | Latest release (updated on every main push) |
| `ghcr.io/marianfoo/arc-1:0.2.0` | Exact version (immutable) |
| `ghcr.io/marianfoo/arc-1:0.2` | Latest patch within minor (e.g., 0.2.3) |

Pin to an exact version for production. Use `latest` for development.

Full Docker reference: **[docker.md](docker.md)**

---

## Remote / Shared Deployment

When arc1 is accessible over a network, you need **MCP client authentication** to prevent unauthorized access.

### Docker with API Key

Simplest auth for a shared server. All clients share one token.

```bash
docker run -d --name arc1 \
  -p 8080:8080 \
  -e SAP_URL=https://your-sap-host:44300 \
  -e SAP_USER=YOUR_USER \
  -e SAP_PASSWORD=YOUR_PASS \
  -e ARC1_API_KEY=your-secret-api-key \
  ghcr.io/marianfoo/arc-1:latest
```

Clients connect with a Bearer token:

```json
{
  "mcpServers": {
    "sap": {
      "url": "http://your-server:8080/mcp",
      "headers": {
        "Authorization": "Bearer your-secret-api-key"
      }
    }
  }
}
```

Full guide: **[api-key-setup.md](api-key-setup.md)**

### Docker with OIDC

Per-user identity via JWT tokens from an identity provider (EntraID, Cognito, Keycloak, etc.). Each user authenticates with their own token, but all requests use a shared SAP connection.

```bash
docker run -d --name arc1 \
  -p 8080:8080 \
  -e SAP_URL=https://your-sap-host:44300 \
  -e SAP_USER=YOUR_USER \
  -e SAP_PASSWORD=YOUR_PASS \
  -e SAP_OIDC_ISSUER=https://login.microsoftonline.com/{tenant}/v2.0 \
  -e SAP_OIDC_AUDIENCE=your-app-client-id \
  ghcr.io/marianfoo/arc-1:latest
```

Full guide: **[oauth-jwt-setup.md](oauth-jwt-setup.md)**

### Docker with BTP ABAP service key

For SAP BTP ABAP Environment systems, use a BTP service key (ARC-1 performs browser OAuth):

```bash
docker run -d --name arc1 \
  -p 8080:8080 \
  -e SAP_BTP_SERVICE_KEY='{"uaa":{"url":"...","clientid":"...","clientsecret":"..."},"url":"https://your-system.abap.eu10.hana.ondemand.com"}' \
  -e SAP_SYSTEM_TYPE=btp \
  ghcr.io/marianfoo/arc-1:latest
```

### BTP Cloud Foundry

For enterprise deployments with per-user SAP identity (principal propagation). This is the most secure option — no stored SAP credentials, each user's actions are traced to their SAP user.

Requires: BTP subaccount, Cloud Connector, Destination Service, XSUAA.

Full guide: **[phase4-btp-deployment.md](phase4-btp-deployment.md)**

---

## Authentication Reference

### SAP system authentication (arc1 → SAP)

How arc1 authenticates when calling SAP ADT APIs.

| Method | Config | When to use |
|--------|--------|------------|
| **Basic Auth** | `--user` + `--password` | Local dev, simple setups |
| **Cookie** | `--cookie-file` or `--cookie-string` | Reuse browser session (temporary) |
| **BTP Service Key OAuth** | `SAP_BTP_SERVICE_KEY` / `SAP_BTP_SERVICE_KEY_FILE` | Direct BTP ABAP Environment |
| **BTP Destination** | `SAP_BTP_DESTINATION` | BTP CF to on-prem SAP via Destination/Connectivity |
| **Principal Propagation** | `--pp-enabled` + BTP Destinations | Per-user SAP identity via Cloud Connector |

Only one SAP auth method can be active at a time.

### MCP client authentication (client → arc1)

How MCP clients prove their identity when connecting to arc1's HTTP endpoint. Not needed for stdio transport.

| Method | Config | When to use |
|--------|--------|------------|
| **None** | (default) | Local stdio, trusted network |
| **API Key** | `--api-key` or `ARC1_API_KEY` | Shared server, simple setup |
| **OIDC JWT** | `--oidc-issuer` + `--oidc-audience` | Per-user identity from IdP |
| **XSUAA** | BTP XSUAA binding | BTP Cloud Foundry deployment |

Full authentication reference: **[enterprise-auth.md](enterprise-auth.md)**

---

## Safety Controls

Always configure safety controls before exposing arc1 to users, especially in shared deployments.

```bash
# Read-only — no writes, no activations, no transport operations
--read-only

# Restrict to specific packages (wildcards supported)
--allowed-packages "ZPROD*,$TMP"

# Block free-form SQL queries
--block-free-sql

# Whitelist specific operation types only
# R=Read, S=Search, Q=Query, W=Write, C=Create, D=Delete, U=Activate, A=Analyze
--allowed-ops "RSQ"
```

**Recommendation for shared/production deployments:** Start with `--read-only` and relax as needed.

---

## Updating arc1

### Before you update

1. **Check the changelog** — review [CHANGELOG.md](https://github.com/marianfoo/arc-1/blob/main/CHANGELOG.md) or the [GitHub Releases page](https://github.com/marianfoo/arc-1/releases) for breaking changes.
2. **Pin to a version** — always use exact version tags (`:0.2.0`) in production, not `:latest`. This prevents surprise upgrades.
3. **Test first** — update a dev/staging instance before production. Verify your MCP clients can still connect and tools work as expected.

### Updating: npx / npm

npx always pulls the latest version automatically. To pin a version:

```bash
# Latest
npx arc-1

# Pinned version
npx arc-1@0.2.0

# If installed globally
npm install -g arc-1@0.2.0
```

After updating, verify the version:

```bash
npx arc-1 --version
```

Update your MCP client configs (Claude Desktop, `.mcp.json`) if you pin versions in the `args`:

```json
{
  "mcpServers": {
    "sap": {
      "command": "npx",
      "args": ["-y", "arc-1@0.2.0"]
    }
  }
}
```

### Updating: Docker (standalone)

```bash
# 1. Pull the new image
docker pull ghcr.io/marianfoo/arc-1:0.3.0

# 2. Stop the running container
docker stop arc1

# 3. Remove the old container
docker rm arc1

# 4. Start with the new image (same env vars / config)
docker run -d --name arc1 \
  -p 8080:8080 \
  --env-file .env \
  ghcr.io/marianfoo/arc-1:0.3.0

# 5. Verify
docker logs arc1
curl -s http://localhost:8080/mcp
```

**Downtime:** There is a brief interruption between stop and start. For zero-downtime updates, use a reverse proxy (nginx, Traefik) with two containers and switch traffic after health check.

**Rollback:** If the new version has issues, just start the old image again:

```bash
docker stop arc1 && docker rm arc1
docker run -d --name arc1 \
  -p 8080:8080 \
  --env-file .env \
  ghcr.io/marianfoo/arc-1:0.2.0   # previous version
```

### Updating: BTP Cloud Foundry

CF supports rolling updates natively — no manual stop/start needed.

#### Step 1: Update the image tag in manifest.yml

```yaml
applications:
  - name: arc1-mcp-server
    docker:
      image: ghcr.io/marianfoo/arc-1:0.3.0   # <-- update this
```

#### Step 2: Push with rolling strategy (zero-downtime)

```bash
cf push arc1-mcp-server --strategy rolling
```

This starts a new instance with the new image, waits for it to pass health checks, then stops the old instance. MCP clients experience no interruption.

#### Step 3: Verify

```bash
# Check the app is running
cf app arc1-mcp-server

# Check recent logs for startup errors
cf logs arc1-mcp-server --recent

# Test the endpoint
curl -s https://arc1-mcp-server.cfapps.us10.hana.ondemand.com/mcp
```

#### Rollback on BTP

If the new version fails health checks, CF automatically keeps the old instance running. For manual rollback:

```bash
# Option 1: Re-push the previous version
# Update manifest.yml back to the old image tag, then:
cf push arc1-mcp-server --strategy rolling

# Option 2: Revert to previous droplet (if available)
cf rollback arc1-mcp-server
```

#### BTP-specific considerations

- **Destination Service / Cloud Connector**: These are infrastructure configs, not part of the arc1 image. They don't change between arc1 versions — no action needed.
- **XSUAA bindings**: Service bindings persist across restages. No re-binding needed.
- **Environment variables**: If the new version adds required env vars (check the changelog), add them before pushing:
  ```bash
  cf set-env arc1-mcp-server NEW_VAR value
  cf push arc1-mcp-server --strategy rolling
  ```
- **Scaling**: If running multiple instances (`cf scale -i 2`), the rolling update handles each instance sequentially.

### Updating: git clone (development)

```bash
git pull origin main
npm ci          # in case dependencies changed
npm run build
npm start       # or npm run dev
```

### Monitoring after an update

After any update, verify:

1. **Startup logs** — check for errors or deprecation warnings
2. **Tool listing** — confirm all expected tools appear in your MCP client
3. **Basic operation** — run a simple `SAPRead` or `SAPSearch` to verify SAP connectivity
4. **Auth flow** — if using OIDC/XSUAA, verify a token-authenticated request succeeds

---

## Quick Reference: All Configuration

Priority: CLI flags > environment variables > `.env` file > defaults.

| Flag | Env Var | Default | Description |
|------|---------|---------|-------------|
| `--url` | `SAP_URL` | — | SAP system URL (required) |
| `--user` | `SAP_USER` | — | SAP username |
| `--password` | `SAP_PASSWORD` | — | SAP password |
| `--client` | `SAP_CLIENT` | 001 | SAP client number |
| `--language` | `SAP_LANGUAGE` | EN | SAP logon language |
| `--transport` | `SAP_TRANSPORT` | stdio | `stdio` or `http-streamable` |
| `--http-addr` | `SAP_HTTP_ADDR` | 0.0.0.0:8080 | HTTP listen address |
| `--insecure` | `SAP_INSECURE` | false | Skip TLS certificate verification |
| `--read-only` | `SAP_READ_ONLY` | false | Block all write operations |
| `--block-free-sql` | `SAP_BLOCK_FREE_SQL` | false | Block SQL query execution |
| `--allowed-ops` | `SAP_ALLOWED_OPS` | (all) | Whitelist operation types |
| `--disallowed-ops` | `SAP_DISALLOWED_OPS` | (none) | Blacklist operation types |
| `--allowed-packages` | `SAP_ALLOWED_PACKAGES` | `$TMP` | Restrict to packages (default: `$TMP` local objects only) |
| `--api-key` | `ARC1_API_KEY` | — | API key for HTTP auth |
| `--oidc-issuer` | `SAP_OIDC_ISSUER` | — | OIDC issuer URL |
| `--oidc-audience` | `SAP_OIDC_AUDIENCE` | — | OIDC audience |
| `--api-keys` | `ARC1_API_KEYS` | — | Multi-key with profiles (e.g. `key1:viewer,key2:developer`) |
| `--profile` | `ARC1_PROFILE` | — | Safety profile shortcut (`viewer`, `developer`, etc.) |
| `--block-data` | `SAP_BLOCK_DATA` | false | Block table preview |
| `--btp-service-key` | `SAP_BTP_SERVICE_KEY` | — | Inline BTP service key JSON |
| `--btp-service-key-file` | `SAP_BTP_SERVICE_KEY_FILE` | — | BTP service key file path |
| `--pp-enabled` | `SAP_PP_ENABLED` | false | Enable principal propagation |
| `--pp-strict` | `SAP_PP_STRICT` | false | Fail on PP errors (no fallback) |

---

## Further Reading

| Doc | Description |
|-----|-------------|
| [docker.md](docker.md) | Full Docker reference (build, config, troubleshooting) |
| [cli-guide.md](cli-guide.md) | CLI commands (search, source, lint) |
| [enterprise-auth.md](enterprise-auth.md) | All auth methods in detail |
| [api-key-setup.md](api-key-setup.md) | API Key setup (step-by-step) |
| [oauth-jwt-setup.md](oauth-jwt-setup.md) | OAuth/OIDC setup with EntraID |
| [principal-propagation-setup.md](principal-propagation-setup.md) | Per-user SAP identity |
| [phase4-btp-deployment.md](phase4-btp-deployment.md) | BTP Cloud Foundry deployment |
| [xsuaa-setup.md](xsuaa-setup.md) | XSUAA OAuth for MCP clients |
| [tools.md](tools.md) | Complete tool reference (11 tools) |
| [sap-trial-setup.md](sap-trial-setup.md) | SAP BTP trial account setup |
