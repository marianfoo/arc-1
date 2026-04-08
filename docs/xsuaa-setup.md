# Phase 5: XSUAA OAuth for MCP-Native Clients

This guide sets up BTP XSUAA authentication so MCP-native clients (Claude Desktop, Cursor, VS Code, MCP Inspector) can authenticate via OAuth when connecting to ARC-1.

## Overview

MCP-native clients use RFC 8414 OAuth discovery to find authorization endpoints at the MCP server's URL. ARC-1 proxies the OAuth flow to XSUAA using the MCP SDK's `ProxyOAuthServerProvider`.

**Auth flow:**
1. Client discovers OAuth via `/.well-known/oauth-authorization-server`
2. Client redirects user to ARC-1's `/authorize` endpoint
3. ARC-1 proxies to XSUAA's login page
4. After login, XSUAA returns authorization code
5. Client exchanges code for token via ARC-1's `/token` endpoint
6. Client sends Bearer token with MCP requests

**Coexistence:** XSUAA OAuth coexists with API key and Entra ID OIDC auth. All three methods work on the same `/mcp` endpoint via a chained token verifier.

## Prerequisites

- SAP BTP Cloud Foundry account with XSUAA entitlement
- CF CLI installed and logged in
- ARC-1 deployed on BTP CF (see [Phase 4](phase4-btp-deployment.md))

## Step 1: Create XSUAA Service Instance

The `xs-security.json` file defines scopes, roles, and OAuth configuration:

```bash
cf create-service xsuaa application arc1-xsuaa -c xs-security.json
```

The included `xs-security.json` defines:

| Scope | Description | Tools |
|-------|-------------|-------|
| `read` | Read SAP objects | SAPRead, SAPSearch, SAPQuery, SAPNavigate, SAPContext, SAPLint, SAPDiagnose |
| `write` | Write SAP objects | SAPWrite, SAPActivate, SAPManage |
| `admin` | Administrative access | SAPTransport, system management |

| Role Collection | Scopes | Use Case |
|-----------------|--------|----------|
| ARC-1 Viewer | read | Read-only SAP access |
| ARC-1 Editor | read, write | Development access |
| ARC-1 Admin | read, write, admin | Full administrative access |

## Step 2: Bind Service and Configure

```bash
# Bind XSUAA to your app
cf bind-service arc1-mcp-server arc1-xsuaa

# Enable XSUAA auth
cf set-env arc1-mcp-server SAP_XSUAA_AUTH true

# Restage to pick up changes
cf restage arc1-mcp-server
```

Verify XSUAA is active in the logs:

```bash
cf logs arc1-mcp-server --recent | grep XSUAA
# Should show:
# INFO: XSUAA credentials loaded {"xsappname":"arc1-mcp!t..."}
# INFO: XSUAA OAuth proxy enabled {"xsappname":"arc1-mcp!t..."}
# INFO: ARC-1 HTTP server started {"auth":"XSUAA OAuth proxy"}
```

## Step 3: Assign Role Collections

1. Open **BTP Cockpit** → **Security** → **Role Collections**
2. Find "ARC-1 Viewer" / "ARC-1 Editor" / "ARC-1 Admin"
3. Click the role collection → **Edit** → **Users** tab
4. Add your BTP user (email address)
5. Save

## Step 4: Verify OAuth Discovery

```bash
curl -s https://arc1-mcp-server.cfapps.us10-001.hana.ondemand.com/.well-known/oauth-authorization-server | jq .
```

Expected response:
```json
{
  "issuer": "https://arc1-mcp-server.cfapps.us10-001.hana.ondemand.com/",
  "authorization_endpoint": "https://arc1-mcp-server.cfapps.us10-001.hana.ondemand.com/authorize",
  "token_endpoint": "https://arc1-mcp-server.cfapps.us10-001.hana.ondemand.com/token",
  "scopes_supported": ["read", "write", "admin"],
  "response_types_supported": ["code"],
  "code_challenge_methods_supported": ["S256"],
  "grant_types_supported": ["authorization_code", "refresh_token"]
}
```

## Step 5: Configure MCP Clients

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "arc1-sap": {
      "url": "https://arc1-mcp-server.cfapps.us10-001.hana.ondemand.com/mcp"
    }
  }
}
```

Claude Desktop will automatically discover OAuth via `/.well-known/oauth-authorization-server` and prompt for login.

### Cursor

In Cursor settings → MCP Servers, add:

```json
{
  "arc1-sap": {
    "url": "https://arc1-mcp-server.cfapps.us10-001.hana.ondemand.com/mcp"
  }
}
```

### MCP Inspector

Connect to:
```
https://arc1-mcp-server.cfapps.us10-001.hana.ondemand.com/mcp
```

The inspector will perform OAuth discovery and redirect to XSUAA login.

## Updating xs-security.json

If you need to add redirect URIs or change scopes:

```bash
# Edit xs-security.json
# Then update the service:
cf update-service arc1-xsuaa -c xs-security.json

# Restage the app to pick up changes:
cf restage arc1-mcp-server
```

## Configuration Reference

| Variable | Description | Default |
|----------|-------------|---------|
| `SAP_XSUAA_AUTH` | Enable XSUAA OAuth proxy | `false` |

XSUAA credentials are automatically loaded from `VCAP_SERVICES` when the service is bound. No manual credential configuration is needed.

## How Auth Coexistence Works

When XSUAA auth is enabled, the chained token verifier tries three methods in order:

1. **XSUAA JWT** — validated by `@sap/xssec` against XSUAA JWKS (offline, cached)
2. **Entra ID JWT** — validated by `jose` against OIDC issuer JWKS (if `SAP_OIDC_ISSUER` is set)
3. **API Key** — simple string match against `ARC1_API_KEY`

The first successful validation wins. This means:
- Copilot Studio (Entra ID OIDC) continues to work
- API key auth continues to work for testing
- MCP-native clients use XSUAA OAuth

## Troubleshooting

### "AADSTS50011: Redirect URI mismatch"
The redirect URI used by the MCP client isn't in `xs-security.json`. Add the URI pattern:
```json
"redirect-uris": [
  "http://localhost:*/**",
  "https://*.cfapps.us10-001.hana.ondemand.com/**"
]
```
Then run `cf update-service arc1-xsuaa -c xs-security.json`.

### "Token has no expiration time"
API key tokens now include a synthetic expiration (1 year). If you see this error, ensure you're running the latest version of ARC-1.

### "XSUAA credentials not found"
Ensure the XSUAA service is bound: `cf services` should show `arc1-xsuaa` bound to your app. If not: `cf bind-service arc1-mcp-server arc1-xsuaa && cf restage arc1-mcp-server`.

### "Insufficient scope"
The user doesn't have the required role collection assigned. Go to BTP Cockpit → Security → Role Collections and assign the appropriate collection to the user.

### OAuth flow hangs or returns 400
Check that the XSUAA client ID matches. Run `cf env arc1-mcp-server` and look for the `clientid` in the XSUAA binding credentials.

## Architecture

```
MCP Client (Claude Desktop, Cursor, MCP Inspector)
  │
  ├── GET /.well-known/oauth-authorization-server  ──→  OAuth metadata
  ├── GET /authorize?client_id=...&redirect_uri=... ──→  Proxied to XSUAA login
  ├── POST /token (authorization_code exchange)     ──→  Proxied to XSUAA token endpoint
  │
  └── POST /mcp (Bearer token)
        │
        ├── requireBearerAuth middleware
        │     └── Chained verifier: XSUAA → OIDC → API key
        │
        └── MCP Server (per-request)
              └── ADT Client → SAP System
```
