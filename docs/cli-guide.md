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

### version

Show ARC-1 version.

```bash
arc1 version
```

---

## MCP Server Configuration

All connection and safety flags are available:

```bash
# Read-only mode
arc1 --read-only

# Restrict packages
arc1 --allowed-packages "ZPROD*,$TMP"

# Block free-form SQL
arc1 --block-free-sql

# Whitelist operations
arc1 --allowed-ops "RSQ"

# API key authentication
arc1 --transport http-streamable --api-key "my-secret-key"

# OIDC authentication
arc1 --transport http-streamable \
  --oidc-issuer "https://login.microsoftonline.com/..." \
  --oidc-audience "<expected-aud-claim>"

# BTP Destination
SAP_BTP_DESTINATION=SAP_TRIAL arc1
```

Full configuration reference: **[CLAUDE.md](../CLAUDE.md#configuration)**
