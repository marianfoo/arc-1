# BTP Destination Setup Guide

How to configure SAP BTP Destinations for ARC-1, covering both **Basic Authentication** (shared service account) and **Principal Propagation** (per-user SAP identity).

---

## Authentication Modes Overview

ARC-1 supports three ways to authenticate to SAP:

| Mode | Who acts in SAP | Config | Use Case |
|------|----------------|--------|----------|
| **Hardcoded credentials** | Single user (SAP_USER/SAP_PASSWORD) | Env vars only, no BTP | Local dev, direct connection |
| **BTP Destination (Basic)** | Single service account | BTP Destination Service | Cloud deployment, shared user |
| **BTP Destination (PP)** | Each MCP user as their own SAP user | BTP Destination + Cloud Connector PP | Enterprise, per-user audit trail |

All three modes can coexist with any MCP client authentication (API key, OIDC, XSUAA).

---

## Mode 1: Hardcoded Credentials (No BTP)

The simplest mode. SAP credentials are set directly via environment variables or CLI flags:

```bash
# Via env vars
SAP_URL=http://sap-host:50000 SAP_USER=DEVELOPER SAP_PASSWORD=secret npx arc-1

# Via CLI flags
npx arc-1 --url http://sap-host:50000 --user DEVELOPER --password secret
```

This works for:
- Local development with `stdio` transport
- Direct network access to SAP (no Cloud Connector needed)
- Testing and demos

**Important:** Hardcoded credentials are always used as a fallback. Even when BTP Destination or Principal Propagation is configured, if PP fails for any reason, ARC-1 falls back to the hardcoded credentials or the BTP Destination's service account.

---

## Mode 2: BTP Destination with Basic Authentication

A BTP Destination stores SAP connection details (URL, user, password) centrally. ARC-1 reads them at startup via the Destination Service API.

### Step 1: Create the BTP Destination

In the BTP Cockpit, go to **Connectivity > Destinations** and create:

| Property | Value |
|----------|-------|
| **Name** | `SAP_TRIAL` (or any name) |
| **Type** | HTTP |
| **URL** | `http://a4h-abap:50000` (Cloud Connector virtual host) |
| **Proxy Type** | OnPremise |
| **Authentication** | BasicAuthentication |
| **User** | `DEVELOPER` (SAP technical user) |
| **Password** | `<password>` |

Add additional properties:

| Property | Value |
|----------|-------|
| `sap-client` | `001` |
| `HTML5.DynamicDestination` | `true` |

### Step 2: Configure ARC-1

Set the environment variable pointing to the destination name:

```bash
# In manifest.yml or via cf set-env
SAP_BTP_DESTINATION=SAP_TRIAL
```

ARC-1 resolves the destination at startup and uses the credentials for all requests. The `SAP_URL`, `SAP_USER`, and `SAP_PASSWORD` env vars are overridden by the destination values.

### Step 3: Bind Services

ARC-1 needs the Destination Service and Connectivity Service bindings:

```bash
cf create-service destination lite arc1-destination
cf create-service connectivity lite arc1-connectivity
cf bind-service arc1-mcp-server arc1-destination
cf bind-service arc1-mcp-server arc1-connectivity
```

Or in `manifest.yml`:

```yaml
services:
  - arc1-destination    # or your existing destination service instance
  - arc1-connectivity   # or your existing connectivity service instance
```

---

## Mode 3: BTP Destination with Principal Propagation

Each authenticated MCP user gets their **own SAP identity**. SAP enforces `S_DEVELOP` authorization per user and the audit log shows who did what.

### How it works

```
MCP Client → XSUAA OAuth → ARC-1 → Destination Service (X-User-Token: <jwt>)
                                         ↓
                                   SAML assertion with user identity
                                         ↓
                              ADT Client → SAP-Connectivity-Authentication header
                                         ↓
                              Connectivity Proxy → Cloud Connector
                                         ↓
                              X.509 cert (CN=SAP_USERNAME) → CERTRULE → SAP user
```

### Step 1: Change BTP Destination to PrincipalPropagation

In the BTP Cockpit, edit the destination:

| Property | Value |
|----------|-------|
| **Authentication** | `PrincipalPropagation` |
| **User** | *(leave empty)* |
| **Password** | *(leave empty)* |

All other properties (URL, Proxy Type, sap-client) remain the same.

### Step 2: Configure Cloud Connector for Principal Propagation

In the Cloud Connector Admin UI:

1. **Cloud to On-Premise > Access Control**: ensure the virtual host (`a4h-abap:50000`) is mapped
2. **Cloud to On-Premise > Principal Propagation**:
   - Set **Principal Type** to `X.509 Certificate (General)`
   - Optionally configure the **Subject Pattern** (e.g., `CN=${email}` or `CN=${user_name}`)
3. **Trust Configuration**: synchronize with your BTP subaccount (should already be done if Cloud Connector is connected)

### Step 3: Configure SAP Backend

On the SAP system (via SAP GUI):

1. **STRUST**: Import the Cloud Connector's CA certificate into the **SSL Server Standard** PSE
2. **CERTRULE** (transaction `SM30`, view `VUSREXTID`): Create a mapping rule:
   - **External ID Type**: `DN` (Distinguished Name)
   - **External ID**: `CN=*` (or more specific pattern)
   - **SAP User**: Map to the corresponding SAP user
3. **ICM Profile** (transaction `RZ10` or `SMICM`):
   ```
   icm/HTTPS/verify_client = 1
   login/certificate_mapping_rulebased = 1
   ```
4. **Restart ICM**: Transaction `SMICM` → Administration → ICM → Soft Restart

### Step 4: Enable PP in ARC-1

```bash
# Set on the CF app
cf set-env arc1-mcp-server SAP_PP_ENABLED true
cf restage arc1-mcp-server
```

Or in `manifest.yml`:

```yaml
env:
  SAP_PP_ENABLED: "true"
  SAP_BTP_DESTINATION: "SAP_TRIAL"
  SAP_XSUAA_AUTH: "true"
```

### Step 5: Graceful Fallback

When `SAP_PP_ENABLED=true`:
- If the user has a valid JWT → per-user ADT client is created
- If PP fails (destination error, missing user mapping, etc.) → falls back to shared service account
- If no JWT available (API key auth, stdio) → uses shared service account

This means you can enable PP without breaking existing API key users.

---

## Using Principal Propagation from MCP Clients

### Prerequisites

- ARC-1 deployed on BTP CF with `SAP_XSUAA_AUTH=true` and `SAP_PP_ENABLED=true`
- XSUAA service instance with `xs-security.json` (see [Phase 5 XSUAA Setup](phase5-xsuaa-setup.md))
- BTP Destination set to `PrincipalPropagation`
- Cloud Connector and SAP configured for PP (Steps 2-3 above)

### Claude Desktop / Claude Code

Add to your Claude Desktop `claude_desktop_config.json` or Claude Code settings:

```json
{
  "mcpServers": {
    "arc1-sap": {
      "url": "https://arc1-mcp-server.cfapps.us10-001.hana.ondemand.com/mcp",
      "transport": "streamable-http"
    }
  }
}
```

Claude will auto-discover OAuth via `/.well-known/oauth-authorization-server` and prompt you to log in via XSUAA. After authentication, every SAP call runs as your user.

### Cursor

In Cursor settings, add MCP server:

```json
{
  "mcpServers": {
    "arc1-sap": {
      "url": "https://arc1-mcp-server.cfapps.us10-001.hana.ondemand.com/mcp"
    }
  }
}
```

Cursor supports MCP OAuth discovery natively. It will redirect you to the XSUAA login page.

### VS Code (with MCP extension)

If using an MCP extension that supports HTTP Streamable transport:

```json
{
  "mcp.servers": {
    "arc1-sap": {
      "url": "https://arc1-mcp-server.cfapps.us10-001.hana.ondemand.com/mcp"
    }
  }
}
```

### Copilot Studio (Power Platform)

Copilot Studio uses a custom connector with Entra ID OAuth (not XSUAA). For PP with Copilot Studio:

1. Use the Entra ID OIDC authentication (see [Phase 2 OAuth Setup](phase2-oauth-setup.md))
2. Ensure the Entra ID token's `preferred_username` or `email` claim maps to a SAP user
3. ARC-1 will pass the Entra ID JWT to the Destination Service as `X-User-Token`
4. The Destination Service generates the SAML assertion from the Entra ID token

**Note:** For this to work, the BTP trust configuration must trust the Entra ID tenant. In BTP Cockpit → Security → Trust Configuration, add Entra ID as a trusted IdP.

### MCP Inspector (Testing)

```bash
# Start MCP Inspector pointing to your server
npx @modelcontextprotocol/inspector https://arc1-mcp-server.cfapps.us10-001.hana.ondemand.com/mcp
```

Inspector supports OAuth discovery. It will open a browser for XSUAA login.

---

## Verifying Principal Propagation

### Check ARC-1 logs

```bash
cf logs arc1-mcp-server --recent | grep -E "per-user|Principal|PP"
```

You should see:
```
INFO: Principal propagation enabled {"destination":"SAP_TRIAL","hasBtpConfig":true}
INFO: BTP destination resolved (per-user) {"name":"SAP_TRIAL","auth":"PrincipalPropagation","hasConnectivityAuth":true}
DEBUG: Per-user ADT client created {"user":"john.doe@company.com"}
```

### Check SAP audit log (SM20)

In SAP, run transaction **SM20** (Security Audit Log):
- Filter by the time of your MCP request
- You should see the **individual SAP user** (e.g., `JDOE`) — not the technical service account
- The action should match what the MCP tool did (e.g., read program source)

### Check SAP user determination (SM30 / VUSREXTID)

If PP isn't mapping to the correct SAP user:
1. Check the CERTRULE table via SM30, view `VUSREXTID`
2. Verify the certificate subject (CN) matches what the Cloud Connector sends
3. Use transaction `SU01` to verify the target SAP user exists

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `Destination Service (per-user) returned HTTP 401` | User JWT invalid or expired | Re-authenticate in your MCP client |
| `auth token error: User token validation failed` | BTP doesn't trust the IdP that issued the JWT | Add IdP to BTP Trust Configuration |
| `SAP returns 403 on ADT call` | SAP user exists but lacks `S_DEVELOP` authorization | Grant via `PFCG` role assignment |
| `CERTRULE mapping not found` | Cloud Connector sends cert but SAP can't map CN to user | Check `SM30` view `VUSREXTID` |
| PP falls back to shared client | Destination auth type is still `BasicAuthentication` | Change to `PrincipalPropagation` in BTP Cockpit |
| `SAP_PP_ENABLED is true but btpConfig is null` | `VCAP_SERVICES` not available | Ensure Destination + Connectivity services are bound |

---

## Configuration Reference

| Env Var / Flag | Description | Default |
|----------------|-------------|---------|
| `SAP_BTP_DESTINATION` | BTP Destination name to use | *(none)* |
| `SAP_PP_ENABLED` / `--pp-enabled` | Enable principal propagation | `false` |
| `SAP_XSUAA_AUTH` / `--xsuaa-auth` | Enable XSUAA OAuth proxy | `false` |
| `SAP_URL` / `--url` | Direct SAP URL (overridden by destination) | *(none)* |
| `SAP_USER` / `--user` | Direct SAP user (overridden by destination/PP) | *(none)* |
| `SAP_PASSWORD` / `--password` | Direct SAP password (overridden by destination/PP) | *(none)* |

**Priority:** BTP Destination > env vars. When PP is enabled, per-user auth > destination credentials > env vars.
