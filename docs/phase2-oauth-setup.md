# Phase 2: OAuth / JWT Authentication Setup

Authenticate MCP clients using OAuth 2.1 with an external Identity Provider (EntraID, Cognito, Okta, Keycloak). ARC-1 validates JWT Bearer tokens and extracts user identity.

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

### Microsoft Entra ID (Azure AD)

1. **Create App Registration:**
   - Azure Portal → Microsoft Entra ID → App registrations → New registration
   - Name: `ARC-1 SAP MCP Server`
   - Supported account types: Single tenant (or multi-tenant)
   - Redirect URI: not needed for service-to-service

2. **Expose an API:**
   - App registration → Expose an API
   - Set Application ID URI: `api://arc1-sap-connector`
   - Add scope: `SAP.Access` (admin consent)

3. **Note the values:**
   - Application (client) ID
   - Directory (tenant) ID
   - Issuer URL: `https://login.microsoftonline.com/{tenant-id}/v2.0`

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
    --oidc-audience 'api://arc1-sap-connector'
```

### Environment Variables

```bash
export SAP_URL=https://sap.example.com:44300
export SAP_USER=SAP_SERVICE_USER
export SAP_PASSWORD=ServicePassword123
export SAP_TRANSPORT=http-streamable
export SAP_HTTP_ADDR=0.0.0.0:8080
export SAP_OIDC_ISSUER='https://login.microsoftonline.com/{tenant-id}/v2.0'
export SAP_OIDC_AUDIENCE='api://arc1-sap-connector'
export SAP_OIDC_USERNAME_CLAIM='preferred_username'  # default
```

### Username Mapping (Optional)

If OIDC usernames don't match SAP usernames, create a mapping file:

```yaml
# oidc-user-mapping.yaml
alice: ALICE_DEV
bob: BOB_ADMIN
carol@company.com: CAROL
```

```bash
arc1 ... --oidc-user-mapping oidc-user-mapping.yaml
```

## Client Configuration

### VS Code (with OAuth)

VS Code supports MCP OAuth natively. Configure in `.vscode/mcp.json`:

```json
{
  "servers": {
    "arc1": {
      "type": "http",
      "url": "https://arc1.company.com/mcp"
    }
  }
}
```

VS Code will:
1. Discover the Protected Resource Metadata at `/.well-known/oauth-protected-resource`
2. Find the Authorization Server (your IdP)
3. Open browser for OAuth login
4. Send Bearer tokens automatically

### Copilot Studio (with OAuth)

1. Go to **Settings** → **Connectors** → **MCP Servers**
2. Click **Add MCP Server**
3. URL: `https://arc1.company.com/mcp`
4. Authentication: **OAuth 2.0** → **Dynamic Discovery**
5. Copilot Studio auto-discovers endpoints via `/.well-known/oauth-protected-resource`

### Manual Token Testing

```bash
# Get a token from your IdP (example with Azure CLI)
TOKEN=$(az account get-access-token --resource api://arc1-sap-connector --query accessToken -o tsv)

# Use with arc1
curl -H "Authorization: Bearer $TOKEN" https://arc1.company.com/mcp
```

## How It Works

1. MCP client sends request without token
2. ARC-1 returns `401` with `WWW-Authenticate: Bearer resource_metadata="..."`
3. Client fetches Protected Resource Metadata
4. Client discovers IdP authorization server
5. Client performs OAuth 2.1 Authorization Code + PKCE flow
6. Client sends `Authorization: Bearer <jwt>` on every request
7. ARC-1 validates JWT signature via JWKS (cached 1 hour)
8. arc1 checks issuer, audience, expiry
9. ARC-1 extracts username from configured claim
10. Request proceeds (SAP auth still via service account)

## Security Notes

- JWT signatures are cryptographically verified via JWKS
- JWKS keys are cached for 1 hour (auto-refresh)
- Tokens must have correct issuer AND audience
- ARC-1 never sees user passwords (IdP handles login)
- SAP still uses a shared service account (for per-user SAP auth, add Phase 3)

## References

- [MCP Specification - Authorization](https://modelcontextprotocol.io/specification/2025-03-26/basic/authorization) — OAuth 2.1 auth for MCP servers
- [RFC 9728 - OAuth Protected Resource Metadata](https://datatracker.ietf.org/doc/html/rfc9728) — Auto-discovery of authorization servers
- [Microsoft Entra ID - App Registrations](https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app) — Azure AD app setup
- [AWS Cognito User Pools](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools.html) — AWS IdP setup
- [Keycloak - Creating a Realm](https://www.keycloak.org/docs/latest/server_admin/#configuring-realms) — Open-source IdP setup

## Next Steps

→ [Phase 3: Principal Propagation](phase3-principal-propagation-setup.md) — Per-user SAP authentication
