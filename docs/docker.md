# Docker Guide for arc1

arc1 ships as a Docker image (and npm package) that speaks MCP over **HTTP streamable**
(the default transport in the Docker image). This makes it easy to run as a
long-lived, port-accessible container that multiple MCP clients can connect to
without spawning a new process per session.

> **stdio mode is still supported.** Pass `-e SAP_TRANSPORT=stdio` and use
> `docker run -i` to revert to the classic pipe-based transport.

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Pre-Built Images (GHCR)](#pre-built-images-ghcr)
3. [Building the Image](#building-the-image)
4. [How arc1 Runs in Docker](#how-arc1-runs-in-docker)
5. [Configuration Reference](#configuration-reference)
   - [Connection](#connection)
   - [Authentication](#authentication)
   - [Safety / Read-Only](#safety--read-only)
   - [Transport Management](#transport-management)
   - [Feature Flags](#feature-flags)
   - [Debugger](#debugger)
   - [Network / TLS](#network--tls)
6. [MCP Client Integration](#mcp-client-integration)
   - [Claude Desktop](#claude-desktop)
   - [Gemini CLI / Other Agents](#gemini-cli--other-agents)
7. [Common Configurations](#common-configurations)
   - [Read-Only for Production Review](#read-only-for-production-review)
   - [Sandboxed AI (Z* packages only)](#sandboxed-ai-z-packages-only)
   - [Cookie Authentication](#cookie-authentication)
   - [Corporate Proxy](#corporate-proxy)
7. [Updating the Image](#updating-the-image)
8. [Security Notes](#security-notes)
9. [Troubleshooting](#troubleshooting)

---

## Quick Start

> **No Docker Hub needed.** Pre-built images are published automatically to
> [GitHub Container Registry (GHCR)](https://github.com/marianfoo/arc-1/pkgs/container/arc-1) on every
> release. Pull them with `docker pull ghcr.io/marianfoo/arc-1:latest`.

### HTTP streamable (default — recommended)

The Docker image defaults to `SAP_TRANSPORT=http-streamable` listening on
`0.0.0.0:8080`. Start the container, map the port, and connect any MCP client
to `http://localhost:8080/mcp`.

```bash
# Start arc1 as a persistent HTTP MCP server
docker run -d --rm \
  -p 8080:8080 \
  -e SAP_URL=https://host:44300 \
  -e SAP_USER=developer \
  -e SAP_PASSWORD=secret \
  ghcr.io/marianfoo/arc-1:latest

# Verify it is up
curl -s http://localhost:8080/mcp   # should return an MCP protocol response
```

### stdio mode (classic, pipe-based)

```bash
docker run -i --rm \
  -e SAP_URL=https://host:44300 \
  -e SAP_USER=developer \
  -e SAP_PASSWORD=secret \
  -e SAP_TRANSPORT=stdio \
  ghcr.io/marianfoo/arc-1:latest
```

> **`-i` is required for stdio mode.** MCP communicates over stdin/stdout.
> Without `-i` the container exits immediately because stdin is closed.

---

## Pre-Built Images (GHCR)

Official images are built automatically by GitHub Actions and pushed to
**GitHub Container Registry** — no Docker Hub account is required for either
pulling or publishing.

### Image location

```
ghcr.io/marianfoo/arc-1
```

### Available tags

| Tag | Example | Description |
|---|---|---|
| `latest` | `ghcr.io/marianfoo/arc-1:latest` | Updated on every push to main (dev builds) and on every release |
| `x.y.z` | `ghcr.io/marianfoo/arc-1:0.2.0` | Exact version (immutable, created on release) |
| `x.y` | `ghcr.io/marianfoo/arc-1:0.2` | Latest patch within minor (created on release) |

**`latest`** is rebuilt on every push to `main`, so it always reflects the newest code — even unreleased changes. Use versioned tags for production.

### Pulling

```bash
# Latest (includes unreleased changes from main)
docker pull ghcr.io/marianfoo/arc-1:latest

# Pinned version (recommended for production/team use)
docker pull ghcr.io/marianfoo/arc-1:0.2.0
```

### Supported platforms

Each image is a multi-platform manifest covering:

| Platform | Architecture |
|---|---|
| `linux/amd64` | x86-64 servers, most CI runners |
| `linux/arm64` | Apple Silicon (via Rosetta or native Linux VM), AWS Graviton |

Docker automatically selects the right variant for your host.

### GitHub Actions: automated publishing

The workflow `.github/workflows/docker.yml` triggers on every `v*` tag push
(the same event fired at the end of the `release.yml` workflow):

```
release.yml
  └─► git tag v2.22.0 + git push tag
            │
            └─► docker.yml triggered
                  ├── docker/setup-qemu-action     (arm64 emulation)
                  ├── docker/setup-buildx-action   (multi-platform builder)
                  ├── docker/login-action          (GITHUB_TOKEN → ghcr.io)
                  ├── docker/metadata-action       (semver tags + OCI labels)
                  └── docker/build-push-action     (build + push)
```

**No extra secrets are needed.** The workflow uses the built-in `GITHUB_TOKEN`
with `packages: write` permission. This token is automatically available in all
GitHub Actions runs.

```yaml
permissions:
  contents: read
  packages: write
```

### Manual re-publish (workflow_dispatch)

You can trigger a new Docker build for any existing tag without a full release:

1. Go to **Actions → Docker** in the GitHub UI.
2. Click **Run workflow**.
3. Optionally supply an image tag override.

This is useful for republishing after a `Dockerfile` fix without bumping the
Go version.

### Visibility

Packages on GHCR inherit the visibility of the repository. If the repository is
public, the images are public and can be pulled anonymously. If private,
authentication is required (`docker login ghcr.io`).

---

## Building the Image

### From source

```bash
# Simple build (version = dev)
docker build -t arc1 .

# With version metadata (recommended for releases)
docker build \
  --build-arg VERSION=2.22.0 \
  --build-arg COMMIT=$(git rev-parse --short HEAD) \
  --build-arg BUILD_DATE=$(date -u +%Y-%m-%dT%H:%M:%SZ) \
  -t arc1:2.22.0 .
```

### Multi-platform build (for sharing)

```bash
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  --build-arg VERSION=2.22.0 \
  -t ghcr.io/yourorg/arc1:2.22.0 \
  --push .
```

> **Build note:** The image uses `node:20-alpine` as builder. The runtime image
> is `node:20-alpine` with only production dependencies installed.
> `better-sqlite3` requires native compilation during `npm install`.

---

## How arc1 Runs in Docker

### HTTP streamable (default)

The Docker image defaults to the **MCP streamable HTTP transport**, listening on
`0.0.0.0:8080`. This is the recommended mode for containerised deployments:

```
MCP Client (Claude Desktop, Cursor, etc.)
  │
  │  HTTP POST http://localhost:8080/mcp
  │
  ├─► docker container (long-lived, -d)
  │         │
  │    JSON-RPC over HTTP (streaming)
  │         │
  └─────────┴─► container keeps running; multiple clients can connect
```

Key differences from stdio mode:
- **Port 8080 is exposed** — map it with `-p 8080:8080`.
- **`-d` (detached) mode works** — the container stays alive between sessions.
- **No `-i` flag needed** — stdin is not used.
- **Multiple clients** can connect to the same container simultaneously.

### stdio mode (classic)

Set `SAP_TRANSPORT=stdio` to revert to the pipe-based model where an MCP client
spawns the container as a subprocess:

```
MCP Client
  │
  ├─► docker run -i --rm -e SAP_TRANSPORT=stdio -e SAP_URL=... arc1
  │         │
  │    JSON-RPC over stdin/stdout
  │         │
  └─────────┴─► container exits when client disconnects
```

### Transport / address options

| Env variable | CLI flag | Default in image | Description |
|---|---|---|---|
| `SAP_TRANSPORT` | `--transport` | `http-streamable` | `stdio` or `http-streamable` |
| `SAP_HTTP_ADDR` | `--http-addr` | `0.0.0.0:8080` | Listen address for http-streamable |

---

## Configuration Reference

All configuration is done through **environment variables** with the `SAP_`
prefix. CLI flags map 1:1 to env vars:

| CLI flag | Env variable | Default |
|---|---|---|
| `--url` | `SAP_URL` | *(required)* |
| `--user` | `SAP_USER` | |
| `--password` | `SAP_PASSWORD` | |
| `--client` | `SAP_CLIENT` | `001` |
| `--language` | `SAP_LANGUAGE` | `EN` |
| `--insecure` | `SAP_INSECURE` | `false` |
| `--read-only` | `SAP_READ_ONLY` | `true` |
| `--block-free-sql` | `SAP_BLOCK_FREE_SQL` | `true` |
| `--allowed-ops` | `SAP_ALLOWED_OPS` | |
| `--disallowed-ops` | `SAP_DISALLOWED_OPS` | |
| `--allowed-packages` | `SAP_ALLOWED_PACKAGES` | `$TMP` |
| `--enable-transports` | `SAP_ENABLE_TRANSPORTS` | `false` |
| `--feature-abapgit` | `SAP_FEATURE_ABAPGIT` | `auto` |
| `--feature-rap` | `SAP_FEATURE_RAP` | `auto` |
| `--feature-amdp` | `SAP_FEATURE_AMDP` | `auto` |
| `--feature-ui5` | `SAP_FEATURE_UI5` | `auto` |
| `--feature-transport` | `SAP_FEATURE_TRANSPORT` | `auto` |
| `--feature-hana` | `SAP_FEATURE_HANA` | `auto` |
| `--feature-ui5repo` | `SAP_FEATURE_UI5REPO` | `auto` |
| `--feature-flp` | `SAP_FEATURE_FLP` | `auto` |
| `--transport` | `SAP_TRANSPORT` | `http-streamable` *(image default)* |
| `--http-addr` | `SAP_HTTP_ADDR` | `0.0.0.0:8080` *(image default)* |
| `--verbose` | `SAP_VERBOSE` | `false` |
| **MCP Client Auth** | | |
| `--api-key` | `ARC1_API_KEY` | |
| `--api-keys` | `ARC1_API_KEYS` | |
| `--oidc-issuer` | `SAP_OIDC_ISSUER` | |
| `--oidc-audience` | `SAP_OIDC_AUDIENCE` | |
| `--xsuaa-auth` | `SAP_XSUAA_AUTH` | `false` |
| `--pp-enabled` | `SAP_PP_ENABLED` | `false` |
| `--pp-strict` | `SAP_PP_STRICT` | `false` |
| `--profile` | `ARC1_PROFILE` | |
| *(BTP destination)* | `SAP_BTP_DESTINATION` | |
| *(BTP PP destination)* | `SAP_BTP_PP_DESTINATION` | |

---

### Connection

```bash
SAP_URL=https://host:44300    # Required. Include scheme and port.
SAP_CLIENT=001                # SAP client number (3 digits)
SAP_LANGUAGE=EN               # ABAP session language (2-char ISO)
```

---

### Authentication

arc1 supports multiple auth methods for connecting to SAP, plus optional MCP client authentication.

#### MCP Client Authentication (Hop 1: Client → arc1)

When running arc1 as a shared server, protect it with API key or OAuth:

```bash
# API Key (simplest)
-e ARC1_API_KEY='your-secret-key'

# OAuth/OIDC JWT validation (enterprise)
-e SAP_OIDC_ISSUER='https://login.microsoftonline.com/{tenant}/v2.0' \
-e SAP_OIDC_AUDIENCE='<expected-aud-claim>'

# Principal Propagation (BTP Destination + Cloud Connector path)
-e SAP_BTP_DESTINATION=SAP_TRIAL \
-e SAP_BTP_PP_DESTINATION=SAP_TRIAL_PP \
-e SAP_PP_ENABLED=true
```

See the [Authentication guides](enterprise-auth.md) for detailed setup.

#### SAP Authentication (Hop 2: arc1 → SAP)

arc1 supports these mutually exclusive SAP auth methods. Use exactly one.

#### Basic auth (username + password)

```bash
-e SAP_USER=myuser -e SAP_PASSWORD=mypassword
```

#### Cookie file (Netscape format)

Mount a cookie file into the container and reference it:

```bash
docker run -i --rm \
  -e SAP_URL=https://host:44300 \
  -e SAP_COOKIE_FILE=/cookies/cookies.txt \
  -v /path/to/local/cookies.txt:/cookies/cookies.txt:ro \
  arc1
```

The cookie file must use the Netscape format exported by browser extensions like
*Edit This Cookie* or *Cookie-Editor*.

#### Cookie string

```bash
-e SAP_COOKIE_STRING="sap-usercontext=sap-client=001; SAP_SESSIONID_ABC=xyz"
```

> **Never bake credentials into the image** with `ENV` in a downstream
> Dockerfile. Always pass them at runtime via `-e` or `--env-file`.

#### Using `--env-file`

Keep credentials in a local `.env` file (never committed to git):

```bash
# .env
SAP_URL=https://host:44300
SAP_USER=developer
SAP_PASSWORD=s3cr3t
```

```bash
docker run -i --rm --env-file .env arc1
```

---

### Safety / Read-Only

ARC-1 is safe by default — read-only, no free SQL, no table preview, no transports. Use profiles or explicit flags to enable capabilities.

#### Default (safest)

Out of the box, all write operations, free SQL, and table preview are blocked. No additional flags needed for read-only access.

#### Enable developer access

Use a profile to enable writes and transports:

```bash
-e ARC1_PROFILE=developer
```

#### Enable free SQL

To allow arbitrary SELECT statements via `RunQuery`:

```bash
-e SAP_BLOCK_FREE_SQL=false
```

#### Operation allowlist

Only permit specific operation types. The operation codes are:

| Code | Meaning |
|---|---|
| `R` | Read (GetSource, GetObject, etc.) |
| `S` | Search (SearchObjects, GrepSource, etc.) |
| `Q` | Query (RunQuery — free SQL) |
| `C` | Create |
| `D` | Delete |
| `U` | Update (EditSource, WriteSource) |
| `A` | Activate |

Example — allow only read and search (equivalent to read-only but explicit):

```bash
-e SAP_ALLOWED_OPS=RS
```

Example — allow read, search, and query but no writes:

```bash
-e SAP_ALLOWED_OPS=RSQ
```

#### Operation blocklist

Block specific operation types while allowing everything else:

```bash
# Block create, delete, update, activate (but allow read/search/query)
-e SAP_DISALLOWED_OPS=CDUA
```

> `SAP_ALLOWED_OPS` and `SAP_DISALLOWED_OPS` are mutually exclusive. Use one or
> the other, not both.

#### Package restriction

Restrict all write operations to specific packages. Supports wildcards:

```bash
# Only allow writes to custom packages and $TMP
-e SAP_ALLOWED_PACKAGES="Z*,$TMP"

# Only one specific package
-e SAP_ALLOWED_PACKAGES="\$ZRAY_DEV"

# Multiple packages (comma-separated)
-e SAP_ALLOWED_PACKAGES="ZMYAPP,ZMYAPP_TEST,\$TMP"
```

Read operations (`R`, `S`) are not restricted by this filter — the AI can still
read objects from any package; it just cannot modify objects outside the
allowlist.

#### Package restrictions

By default, write access is limited to `$TMP` (local objects). To allow writing to custom packages:

```bash
-e SAP_ALLOWED_PACKAGES="Z*,$TMP"
```

This allows writing to any Z-package and `$TMP`. Use `"*"` for unrestricted access.

---

### Transport Management

CTS transport tools are **disabled by default** to prevent accidental releases.

```bash
# Enable transport tools
-e SAP_ENABLE_TRANSPORTS=true
```

---

### Feature Flags

Feature flags control whether optional SAP features are enabled. The default
`auto` mode probes the SAP system on startup and enables a feature only if the
corresponding ABAP components are installed.

Use `on` or `off` to skip the probe and force the behavior:

| Variable | Feature | Notes |
|---|---|---|
| `SAP_FEATURE_RAP` | RAP/OData development | BDEF, SRVD, SRVB tools |
| `SAP_FEATURE_AMDP` | AMDP/HANA debugger | Expert mode only |
| `SAP_FEATURE_UI5` | UI5/Fiori BSP | BSP app management |
| `SAP_FEATURE_TRANSPORT` | CTS transport | Superset of `--enable-transports` |
| `SAP_FEATURE_HANA` | HANA detection | AMDP, HANA SQL tools |
| `SAP_FEATURE_UI5REPO` | UI5 ABAP Repository OData | BSP deploy metadata reads |
| `SAP_FEATURE_FLP` | FLP PAGE_BUILDER_CUST OData | SAPManage FLP catalog/group/tile actions |

```bash
# Force all features off — fastest startup, smallest tool surface
-e SAP_FEATURE_ABAPGIT=off \
-e SAP_FEATURE_RAP=off \
-e SAP_FEATURE_AMDP=off \
-e SAP_FEATURE_UI5=off \
-e SAP_FEATURE_TRANSPORT=off \
-e SAP_FEATURE_HANA=off

# Force abapGit on without probing
-e SAP_FEATURE_ABAPGIT=on
```

Setting features to `off` reduces the number of registered MCP tools, which
keeps the AI's tool list shorter and lowers token usage.

---

### Network / TLS

#### Self-signed or internal CA certificates

For SAP systems using self-signed certificates, either skip verification
(development only) or add your CA to the image:

```bash
# Option 1: skip verification (NOT for production)
-e SAP_INSECURE=true

# Option 2: mount your CA certificate
docker run -i --rm \
  -e SAP_URL=https://internal-sap:44300 \
  -e SAP_USER=user -e SAP_PASSWORD=pass \
  -v /etc/ssl/certs/company-ca.crt:/usr/local/share/ca-certificates/company-ca.crt:ro \
  arc1
```

For a permanent fix, extend the image:

```dockerfile
FROM ghcr.io/marianfoo/arc-1:latest
USER root
COPY company-ca.crt /usr/local/share/ca-certificates/
RUN update-ca-certificates
USER arc1
```

#### HTTP/HTTPS proxy

arc1 respects standard Go proxy environment variables. Pass them via `-e`:

```bash
-e HTTPS_PROXY=http://proxy.corp.example:3128
-e NO_PROXY=localhost,127.0.0.1,internal-sap.corp
```

#### Connecting to a SAP system on the same Docker host

Use the host network or `host.docker.internal` (Docker Desktop):

```bash
# Linux — host network mode
docker run -i --rm --network host \
  -e SAP_URL=http://localhost:50000 \
  -e SAP_USER=user -e SAP_PASSWORD=pass \
  arc1

# Docker Desktop (Mac/Windows)
-e SAP_URL=http://host.docker.internal:50000
```

#### Connecting to a SAP system in another Docker network

```bash
docker network create sap-net

docker run -i --rm \
  --network sap-net \
  -e SAP_URL=http://sap-container:50000 \
  -e SAP_USER=user -e SAP_PASSWORD=pass \
  arc1
```

---

## MCP Client Integration

### HTTP streamable (recommended)

Start the container once and point any MCP client at `http://localhost:8080/mcp`:

```bash
docker run -d --name arc1 \
  -p 8080:8080 \
  -e SAP_URL=https://my-sap-system:44300 \
  -e SAP_USER=developer \
  -e SAP_PASSWORD=secret \
  ghcr.io/marianfoo/arc-1:latest
```

Then configure your MCP client to use the HTTP URL:

```json
{
  "mcpServers": {
    "arc1": {
      "url": "http://localhost:8080/mcp"
    }
  }
}
```

> MCP clients that support the streamable HTTP transport (Claude Desktop ≥ 0.9,
> Cursor, etc.) can connect directly by URL — no `docker run` subprocess needed.

### Claude Desktop (stdio fallback)

If your Claude Desktop version does not yet support HTTP MCP endpoints, use the
stdio mode by overriding the transport:

```json
{
  "mcpServers": {
    "arc1": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm",
        "-e", "SAP_URL=https://my-sap-system:44300",
        "-e", "SAP_USER=developer",
        "-e", "SAP_PASSWORD=secret",
        "-e", "SAP_TRANSPORT=stdio",
        "ghcr.io/marianfoo/arc-1:latest"
      ]
    }
  }
}
```

For a production system (read-only is already the default — no extra flags needed):

```json
{
  "mcpServers": {
    "arc1-prod": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm",
        "-e", "SAP_URL=https://prod-sap:44300",
        "-e", "SAP_USER=readonly_user",
        "-e", "SAP_PASSWORD=secret",
        "-e", "SAP_TRANSPORT=stdio",
        "ghcr.io/marianfoo/arc-1:latest"
      ]
    }
  }
}
```

> **Tip:** Use `--env-file` instead of individual `-e` flags to keep credentials
> out of the config file. Reference the absolute path to the env file:
>
> ```json
> "args": ["run", "-i", "--rm", "-e", "SAP_TRANSPORT=stdio", "--env-file", "/Users/me/.arc1-prod.env", "ghcr.io/marianfoo/arc-1:latest"]
> ```

### Gemini CLI / Other Agents

Clients that support HTTP MCP can connect to `http://localhost:8080/mcp` directly
once the container is running. For stdio-only clients use `docker run -i` with
`-e SAP_TRANSPORT=stdio`. See `docs/cli-agents/README.md` for agent-specific
configuration examples.

---

## Common Configurations

### Read-Only for Production Review

Default configuration is already read-only — safe for production:

```bash
docker run -d --rm \
  -p 8080:8080 \
  -e SAP_URL=https://prod:44300 \
  -e SAP_USER=s_ai_viewer \
  -e SAP_PASSWORD=secret \
  -e SAP_VERBOSE=true \
  ghcr.io/marianfoo/arc-1:latest
```

### Sandboxed AI (Z* packages only)

AI can read anything but only write to custom development packages:

```bash
docker run -i --rm \
  -e SAP_URL=https://dev:44300 \
  -e SAP_USER=developer \
  -e SAP_PASSWORD=secret \
  -e SAP_READ_ONLY=false \
  -e SAP_ALLOWED_PACKAGES="Z*,\$TMP" \
  -e SAP_DISALLOWED_OPS=D \
  ghcr.io/marianfoo/arc-1:latest
```

This setup lets the AI read system objects, write only to custom packages, and
prevents deletions. Free SQL and table preview remain blocked (defaults).

### Cookie Authentication

```bash
docker run -i --rm \
  -e SAP_URL=https://host:44300 \
  -e SAP_COOKIE_FILE=/cookies/cookies.txt \
  -v "${HOME}/.sap-cookies/my-system.txt:/cookies/cookies.txt:ro" \
  ghcr.io/marianfoo/arc-1:latest
```

### Corporate Proxy

```bash
docker run -i --rm \
  --env-file .env \
  -e HTTPS_PROXY=http://proxy.corp.example:3128 \
  -e NO_PROXY=localhost,127.0.0.1 \
  ghcr.io/marianfoo/arc-1:latest
```

---

## Updating the Image

For a comprehensive update guide covering all deployment modes (Docker, BTP, npm), see **[setup-guide.md — Updating arc1](setup-guide.md#updating-arc1)**.

### Quick reference

```bash
# Pull a specific version (recommended for production)
docker pull ghcr.io/marianfoo/arc-1:0.2.0

# Pull latest (includes unreleased changes from main)
docker pull ghcr.io/marianfoo/arc-1:latest

# Stop, remove, restart with new image
docker stop arc1 && docker rm arc1
docker run -d --name arc1 -p 8080:8080 --env-file .env ghcr.io/marianfoo/arc-1:0.2.0

# Verify version
docker run --rm ghcr.io/marianfoo/arc-1:0.2.0 --version
```

### Pinning a version (recommended)

For production or shared team environments, always pin to a specific version
tag rather than `latest`:

```
ghcr.io/marianfoo/arc-1:0.2.0
```

This ensures every team member uses the same binary regardless
of when the image was pulled. Check the
[GitHub releases page](https://github.com/marianfoo/arc-1/releases)
for the latest version.

### Rebuilding from source

```bash
git pull
docker build -t arc1:latest .
```

### Staying up to date automatically

Teams that want automatic image updates can use tools like
[Renovate](https://docs.renovatebot.com/) or
[Dependabot](https://docs.github.com/en/code-security/dependabot) to open PRs
when a new `ghcr.io/marianfoo/arc-1` image tag is published.

---

## Security Notes

1. **Never bake credentials into images.** Always pass `SAP_USER`,
   `SAP_PASSWORD`, `SAP_COOKIE_FILE` at runtime via `-e` or `--env-file`.

2. **Protect your `.env` file.** If using `--env-file`, ensure the file has
   restricted permissions (`chmod 600`) and is in `.gitignore`.

3. **Default is already read-only.** Only enable write access on
   development systems via `ARC1_PROFILE=developer` or `SAP_READ_ONLY=false`.

4. **The container runs as a non-root user** (`arc1:arc1`) inside Alpine. There
   are no open ports — the attack surface is minimal.

5. **Cookie files contain session tokens.** Mount them read-only (`:ro`) and
   use short-lived sessions where possible.

6. **Use `SAP_INSECURE=false` (the default).** Only set it to `true` in isolated
   development environments with no sensitive data.

---

## Troubleshooting

### Container exits immediately

arc1 exits if stdin is closed. Make sure you are using `-i`:

```bash
docker run -i --rm ...   # correct
docker run --rm ...      # wrong — exits immediately
docker run -d --rm ...   # wrong — detached mode breaks stdio
```

### `SAP URL is required` error

The `SAP_URL` environment variable is mandatory. Verify it is being passed:

```bash
docker run -i --rm -e SAP_URL=https://host:44300 ... arc1
```

### TLS certificate errors

```
x509: certificate signed by unknown authority
```

Either add your CA certificate (see [Network / TLS](#network--tls)) or use
`SAP_INSECURE=true` in non-production environments.

### `authentication required` error

Only one auth method is accepted. Check you are not accidentally setting both
`SAP_USER/SAP_PASSWORD` and `SAP_COOKIE_FILE`.

### Enable verbose logging

Add `-e SAP_VERBOSE=true` to see startup decisions including which features were
detected and which safety rules are active. Logs go to stderr; they will not
interfere with MCP over stdout.

```bash
docker run -i --rm \
  -e SAP_URL=https://host:44300 \
  -e SAP_USER=user -e SAP_PASSWORD=pass \
  -e SAP_VERBOSE=true \
  arc1 2>arc1-debug.log
```

### Tool not appearing in the AI client

1. Check feature flags — features in `auto` mode may have been turned off because
   the SAP component was not detected. Force them on with e.g.
   `SAP_FEATURE_RAP=on`.
2. Check `SAP_ALLOWED_OPS` / `SAP_DISALLOWED_OPS` — operation filters can block
   tools at the handler level even if they are registered.
