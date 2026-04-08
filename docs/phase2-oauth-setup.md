# Phase 2: OAuth / JWT Authentication Setup

Authenticate MCP clients using OAuth 2.1 with an external Identity Provider (Entra ID, Cognito, Okta, Keycloak). ARC-1 validates JWT Bearer tokens.

## When to Use

- Enterprise environments with existing IdP
- When you need to know which user is making requests
- Audit trail requirements
- When combined with Phase 3 for per-user SAP auth

## Architecture

```
                                 ┌─────────────────────┐
                                 │  Identity Provider   │
                                 │  (EntraID / Cognito) │
                                 └──────┬──────────────┘
                                        │ OIDC tokens
┌──────────────────┐     JWT Bearer     │     ┌──────────────────┐     Basic Auth      ┌────────────┐
│  MCP Client      │ ──────────────────►├────►│  arc1 Server      │ ──────────────────► │  SAP ABAP  │
│  (IDE / Copilot) │   Authorization    │     │  validates JWT    │   service account  │  System    │
└──────────────────┘                    │     └──────────────────┘                     └────────────┘
                                        │
                          ┌─────────────┘
                          │ JWKS keys
                          │ (cached 1h)
```

## Identity Provider Setup

### Microsoft Entra ID

1. **Create App Registration:**
   - Azure Portal → Microsoft Entra ID → App registrations → New registration
   - Name: `ARC-1 SAP MCP Server`
   - Supported account types: **Single tenant** (`Accounts in this organizational directory only`)
   - Redirect URI: leave blank (will be set after Copilot Studio connector creation)

2. **Expose an API:**
   - App registration → Expose an API → Set Application ID URI (accept default `api://{client-id}`)
   - Add a scope: `access_as_user` — Type: `Admins and users`, Display name: `Access ARC-1`

3. **Set Token Version to v2.0:**
   - App registration → Manifest → set `"requestedAccessTokenVersion": 2`
   - Or via Azure CLI:
     ```bash
     # Get the object ID of the service principal's associated app
     az ad app show --id {client-id} --query id -o tsv
     # Patch the API application to use v2.0 tokens
     az rest --method PATCH \
       --url "https://graph.microsoft.com/v1.0/applications/{object-id}" \
       --body '{"api":{"requestedAccessTokenVersion":2}}'
     ```
   - **Why:** ARC-1 validates the token `aud` claim exactly. Use one stable audience value and test with a real token from your tenant.

4. **Add Microsoft Graph User.Read permission:**
   - App registration → API permissions → Add a permission → Microsoft Graph → Delegated → `User.Read`
   - Click **Grant admin consent** for your organization
   - Or via Azure CLI:
     ```bash
     az ad app permission add --id {client-id} \
       --api 00000003-0000-0000-c000-000000000000 \
       --api-permissions e1fe6dd8-ba31-4d61-89e7-88639da4683d=Scope
     az ad app permission admin-consent --id {client-id}
     ```
   - **Why:** Power Platform requires this permission for OAuth connectors.

5. **Create a Client Secret:**
   - App registration → Certificates & secrets → New client secret
   - Copy the secret value immediately (it won't be shown again)
   - Or via Azure CLI:
     ```bash
     az ad app credential reset --id {client-id} --display-name "PowerAutomate" --years 2
     ```

6. **Note the values:**
   - **Application (client) ID** — used as both Client ID and audience
   - **Directory (tenant) ID** — e.g., `9ef3a122-4319-496a-a394-a7318c2d0a7e`
   - **Client secret** — from step 5
   - **Issuer URL:** `https://login.microsoftonline.com/{tenant-id}/v2.0`

### AWS Cognito

1. Create User Pool
2. Create App Client
3. Configure domain
4. Issuer URL: `https://cognito-idp.{region}.amazonaws.com/{pool-id}`

### Keycloak

1. Create Realm
2. Create Client (confidential)
3. Issuer URL: `https://keycloak.company.com/realms/{realm}`

## Server Setup

### Start arc1 with OIDC Validation

```bash
arc1 --url https://sap.example.com:44300 \
    --user SAP_SERVICE_USER \
    --password 'ServicePassword123' \
    --transport http-streamable \
    --http-addr 0.0.0.0:8080 \
    --oidc-issuer 'https://login.microsoftonline.com/{tenant-id}/v2.0' \
    --oidc-audience '{client-id-guid}'
```

### Environment Variables

```bash
export SAP_URL=https://sap.example.com:44300
export SAP_USER=SAP_SERVICE_USER
export SAP_PASSWORD=ServicePassword123
export SAP_TRANSPORT=http-streamable
export SAP_HTTP_ADDR=0.0.0.0:8080
export SAP_OIDC_ISSUER='https://login.microsoftonline.com/{tenant-id}/v2.0'
export SAP_OIDC_AUDIENCE='{client-id-guid}'
```

## Client Configuration

### Important behavior in Phase 2

Phase 2 enables **JWT validation** on `/mcp`, but it does **not** provide OAuth discovery endpoints by itself.

This means:

- Clients that can attach Bearer tokens directly work immediately.
- For MCP-native OAuth discovery, use [Phase 5 XSUAA](phase5-xsuaa-setup.md) on BTP.

### VS Code / other clients with static headers

If your client supports custom HTTP headers, provide a Bearer token:

```json
{
  "mcpServers": {
    "arc1": {
      "url": "https://arc1.company.com/mcp",
      "headers": {
        "Authorization": "Bearer <access-token>"
      }
    }
  }
}
```

### Microsoft Copilot Studio / Power Automate

Copilot Studio uses Power Automate custom connectors to connect to MCP servers. The connector handles OAuth token acquisition automatically.

#### Step 1: Create Custom Connector

1. Go to [Power Automate](https://make.powerautomate.com/) → **Custom connectors** → **New custom connector** → **Create from blank**
2. **General tab:**
   - Connector name: `ARC-1 SAP MCP`
   - Host: `your-arc1-server.cfapps.us10-001.hana.ondemand.com` (or your server hostname)
   - Base URL: `/`

#### Step 2: Configure Security Tab

3. **Security tab** → Authentication type: **OAuth 2.0**
   - Identity Provider: **Microsoft Entra ID** (or **Azure Active Directory**, depending on UI label)
   - Enable **Dienstprinzipal-Unterstützung** (Service Principal support)
   - **Client ID:** `{client-id}` (from Entra ID app registration)
   - **Client secret:** `{client-secret}` (from Entra ID app registration)
   - **Authorization URL:** `https://login.microsoftonline.com`
   - **Tenant ID:** `{tenant-id}` (your actual tenant ID — **NOT** `common`)
   - **Resource URL:** `{client-id}` (raw GUID)
   - **Scope:** `api://{client-id}/access_as_user offline_access`

> **⚠️ Critical:** The **Tenant ID** must be your actual tenant GUID, not `common`. Using `common` fails for single-tenant apps.
>
> **⚠️ Critical:** Validate with a real token from your connector flow and set `SAP_OIDC_AUDIENCE` to the exact token `aud` claim.

#### Step 3: Create Definition

4. **Definition tab** → Create an action:
   - Summary: `InvokeServer`
   - Operation ID: `InvokeServer`
   - Verb: **POST**
   - URL: `https://your-arc1-server.example.com/mcp`
5. Click **Connector aktualisieren** (Update Connector)

#### Step 4: Add Redirect URI to Entra ID

6. After creating the connector, copy the **Umleitungs-URL** (Redirect URL) shown at the bottom of the Security tab
   - It looks like: `https://global.consent.azure-apim.net/redirect/crc25-5farc-2d1-20...`
7. Go to Azure Portal → App registration → **Authentication** → Add platform → **Web**
   - Add the redirect URI from step 6
   - Also add the base: `https://global.consent.azure-apim.net/redirect`

   Or via Azure CLI:
   ```bash
   az ad app update --id {client-id} \
     --web-redirect-uris \
       "https://global.consent.azure-apim.net/redirect" \
       "https://global.consent.azure-apim.net/redirect/your-connector-specific-uri"
   ```

#### Step 5: Create Connection

8. Click **Verbindung erstellen** (Create Connection)
9. A Microsoft login popup will appear — sign in with your organization account
10. Grant the requested permissions (Sign in and read user profile)

#### Troubleshooting Copilot Studio

| Error | Cause | Fix |
|-------|-------|-----|
| `AADSTS50011` (Reply address mismatch) | Redirect URI not registered | Add the connector's specific redirect URI to the app registration |
| `AADSTS90009` (Requesting token for itself) | Resource URL uses `api://` format | Change Resource URL to raw client ID GUID |
| `AADSTS90008` (Not consented, must require Graph) | Missing `User.Read` permission | Add Microsoft Graph `User.Read` and grant admin consent |
| `AADSTS65001` (Consent not granted) | App not authorized | Run `az ad app permission admin-consent --id {client-id}` |
| `Anmelden nicht möglich` (Login not possible) | Tenant ID is `common` or Resource URL empty | Set Tenant ID to actual GUID; set Resource URL to client ID |
| OAuth popup opens/closes immediately | Multiple issues possible | Check Tenant ID, Resource URL, and redirect URI registration |

### Manual Token Testing

```bash
# Get a token from Entra ID (example with Azure CLI)
az login --scope "api://{client-id}/access_as_user"

# Get access token
TOKEN=$(az account get-access-token --scope "api://{client-id}/access_as_user" --query accessToken -o tsv)

# Optional: inspect the aud claim and use that value in SAP_OIDC_AUDIENCE
python3 - "$TOKEN" <<'PY'
import base64, json, sys
tok=sys.argv[1].split(".")[1]
tok += "=" * ((4-len(tok)%4)%4)
print(json.loads(base64.urlsafe_b64decode(tok))["aud"])
PY

# Test against arc1
curl -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}' \
  https://your-arc1-server.example.com/mcp
```

## How It Works

1. Client obtains access token from your IdP (Entra, Cognito, Keycloak, ...)
2. Client sends `Authorization: Bearer <jwt>` on `/mcp`
3. ARC-1 validates JWT signature via JWKS
4. ARC-1 validates issuer, audience, and expiration
5. Request proceeds (SAP auth still via shared SAP connection unless Phase 3 PP is enabled)

## Security Notes

- JWT signatures are cryptographically verified via JWKS
- JWKS keys are cached for 1 hour (auto-refresh)
- Tokens must have correct issuer AND audience
- ARC-1 never sees user passwords (IdP handles login)
- SAP still uses a shared service account (for per-user SAP auth, add Phase 3)

## References

- [MCP Specification - Authorization](https://modelcontextprotocol.io/specification/2025-03-26/basic/authorization) — OAuth 2.1 auth for MCP servers
- [RFC 9728 - OAuth Protected Resource Metadata](https://datatracker.ietf.org/doc/html/rfc9728) — Auto-discovery of authorization servers
- [Microsoft Entra ID - App Registrations](https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app) — app registration setup
- [Authenticate your API and connector with Microsoft Entra ID](https://learn.microsoft.com/en-us/connectors/custom-connectors/azure-active-directory-authentication) — Power Automate/Copilot Studio connector flow
- [Access token claims reference](https://learn.microsoft.com/en-us/entra/identity-platform/access-token-claims-reference) — `aud` claim behavior
- [AWS Cognito User Pools](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools.html) — AWS IdP setup
- [Keycloak - Creating a Realm](https://www.keycloak.org/docs/latest/server_admin/#configuring-realms) — Open-source IdP setup

## Next Steps

→ [Phase 3: Principal Propagation](phase3-principal-propagation-setup.md) — Per-user SAP authentication
