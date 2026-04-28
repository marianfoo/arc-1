# ARC-1 CLI Guide

**arc1** provides a minimal CLI for direct SAP interaction from the terminal, plus an MCP server mode.

## Quick Start

```bash
# Install
npm install -g arc-1

# Or run directly with npx
npx arc-1@latest search "ZCL_*"
```

## Configuration

Set SAP connection via environment variables or `.env` file:

```bash
export SAP_URL=https://host:44300
export SAP_USER=dev
export SAP_PASSWORD=secret
```

Or pass CLI flags:

```bash
arc1 --url https://host:44300 --user dev --password secret search "ZCL_*"
```

## Commands

### serve (default)

Start the MCP server. This is the default command when no subcommand is given.

```bash
# Stdio transport (default — for Claude Desktop, Claude Code)
arc1

# HTTP Streamable transport (for VS Code, Copilot Studio)
arc1 --transport http-streamable --http-addr 0.0.0.0:3000
```

### search

Search for ABAP objects by name pattern.

```bash
arc1 search "ZCL_ORDER*"
arc1 search "Z*TEST*" --max 20
```

Returns JSON with object type, name, package, and description.

### source

Get source code of an ABAP object.

```bash
arc1 source PROG ZTEST_REPORT
arc1 source CLAS ZCL_MY_CLASS
arc1 source INTF ZIF_MY_INTERFACE
```

Supported types: `PROG`, `CLAS`, `INTF`.

### lint

Lint an ABAP source file locally (no SAP connection needed).

```bash
arc1 lint myclass.clas.abap
arc1 lint zreport.prog.abap
```

Output format: `line:column [severity] rule: message`

Uses [@abaplint/core](https://github.com/abaplint/abaplint) with sensible defaults.

### extract-cookies

Open a browser, log into SAP, and write a Netscape-format cookie file usable as `SAP_COOKIE_FILE`.

```bash
arc1-cli extract-cookies --url https://host:44300 --output ~/.config/arc-1/cookies.txt
```

When the running ARC-1 process is configured with `SAP_COOKIE_FILE` pointing to the same file, the next SAP call automatically reloads the fresh cookies — **no restart needed**. The reload is lazy: it fires on the next outgoing request after a persistent 401, so just re-extract and the next tool invocation picks up the new session.

`SAP_COOKIE_STRING` does not support hot-reload — that env var is read once at startup. Use `SAP_COOKIE_FILE` if you want the no-restart refresh path.

### version

Show ARC-1 version.

```bash
arc1 version
```

---

## MCP Server Configuration

All connection and safety flags are available. Each capability is a separate positive opt-in:

```bash
# Default: safe mode (read-only, no SQL, no data preview)
arc1

# Developer: enable writes + transports (writes restricted to $TMP by default)
arc1 --allow-writes=true --allow-transport-writes=true

# Full access: writes + SQL + data preview + transports + git
arc1 --allow-writes=true --allow-data-preview=true --allow-free-sql=true \
     --allow-transport-writes=true --allow-git-writes=true \
     --allowed-packages='*'

# Enable individual capabilities
arc1 --allow-writes=true            # Enable object mutations
arc1 --allow-free-sql=true          # Enable freestyle SQL
arc1 --allow-data-preview=true      # Enable named table preview

# Restrict write operations to specific packages (reads are not restricted by package)
# Use single quotes — bash expands $TMP inside double quotes.
arc1 --allowed-packages 'ZPROD*,$TMP'

# Fine-grained deny list (tool-qualified only)
arc1 --allow-writes=true --deny-actions "SAPWrite.delete,SAPManage.flp_*"

# API key authentication
arc1 --transport http-streamable --api-keys "my-secret-key:viewer"

# OIDC authentication
arc1 --transport http-streamable \
  --oidc-issuer "https://login.microsoftonline.com/..." \
  --oidc-audience "<expected-aud-claim>"

# BTP Destination
SAP_BTP_DESTINATION=SAP_TRIAL arc1
```

To inspect the resolved policy and config sources:

```bash
arc1 config show
arc1 config show --format=json
```

Full configuration reference: [configuration-reference.md](configuration-reference.md).
