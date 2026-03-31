# Connecting to SAP BTP ABAP Environment via ADT API

**Date:** 2026-03-31
**Status:** Research / Investigation

## Executive Summary

The ADT API (`/sap/bc/adt/*`) is fully available on BTP ABAP Environment (Steampunk). The main difference from on-premise is **authentication** — BTP ABAP requires OAuth 2.0 via XSUAA instead of Basic Auth. CSRF token handling remains identical. ARC-1 currently supports BTP only via the Destination Service → Cloud Connector → on-premise path. Direct BTP ABAP Environment connectivity is **not yet implemented**.

**Recommended approach:** Follow the fr0ster model — service key file + OAuth Authorization Code flow (browser login). This gives per-user identity and works for both local (stdio) and deployed (HTTP) scenarios.

---

## 1. Is ADT API Available on BTP ABAP Systems?

**Yes.** The same `/sap/bc/adt/*` endpoints are exposed. Eclipse ADT connects to BTP ABAP systems using these endpoints. The system URL comes from a **service key** created in the BTP Cockpit, and `/sap/bc/adt/` paths are appended to that base URL.

The service key JSON structure:

```json
{
  "uaa": {
    "clientid": "sb-<guid>!...",
    "clientsecret": "<secret>",
    "url": "https://<subdomain>.authentication.<region>.hana.ondemand.com",
    "identityzone": "<subdomain>",
    "tenantid": "<guid>"
  },
  "url": "https://<system-id>.abap.<region>.hana.ondemand.com",
  "catalogs": {
    "abap": { "path": "/sap/bc/adt", "type": "sap_abap" }
  }
}
```

Key fields:
- `url` — The ABAP system base URL (where ADT endpoints live)
- `uaa.url` — The XSUAA token endpoint (append `/oauth/token`)
- `uaa.clientid` / `uaa.clientsecret` — OAuth client credentials

---

## 2. Authentication — Authorization Code Flow (Recommended)

BTP ABAP Environment uses **OAuth 2.0 via XSUAA**. Basic Auth (username/password) is **NOT natively supported**.

The **Authorization Code** grant is the recommended flow. This is the same flow you see when Eclipse ADT opens a browser for login. Client Credentials (technical user) is not recommended — it restricts access more than it enables, and doesn't map to a real SAP user.

### How the Browser Login Works

1. MCP server starts a local HTTP callback listener (e.g., `http://localhost:3001/callback`)
2. Opens browser to XSUAA authorization endpoint:
   ```
   https://<subdomain>.authentication.<region>.hana.ondemand.com/oauth/authorize
     ?client_id=<clientid>
     &redirect_uri=http://localhost:3001/callback
     &response_type=code
   ```
3. User authenticates in the browser (SAP IdP, IAS, Azure AD, etc.)
4. Browser redirects to callback with an authorization code
5. Server exchanges code for JWT access token + refresh token:
   ```bash
   curl -X POST \
     "https://<subdomain>.authentication.<region>.hana.ondemand.com/oauth/token" \
     -u "<clientid>:<clientsecret>" \
     -d "grant_type=authorization_code&code=<code>&redirect_uri=http://localhost:3001/callback"
   ```
6. Use `Authorization: Bearer <access_token>` on all ADT requests
7. When access token expires (~12h), use refresh token to get a new one — no browser needed again

### How the Browser Flow Works per MCP Transport

The browser behavior is **different depending on how ARC-1 runs**:

#### stdio mode (Claude Desktop, VS Code, Claude Code — local)

- The MCP protocol spec says stdio servers **SHOULD NOT** use MCP's built-in OAuth. Auth is handled outside the protocol.
- **fr0ster's approach (recommended for ARC-1):**
  1. Server starts, reads service key file
  2. If no cached token exists, server opens the user's **default browser** directly (e.g., `open` on macOS)
  3. User logs in via browser
  4. Local callback server on `localhost:<port>` captures the authorization code
  5. Token is cached to disk → next time, no browser needed
- The MCP client (Claude Desktop etc.) is NOT involved in the auth — the server handles it independently
- Default callback ports in fr0ster: stdio=4001, HTTP=5000, SSE=4000

#### HTTP transport (deployed server, multi-user)

Two options:

**Option A: MCP-native OAuth (spec-compliant)**
- MCP spec (2025-03-26) defines built-in OAuth 2.1 support for HTTP transport
- Server returns **HTTP 401** + `WWW-Authenticate` header pointing to metadata
- The **MCP client** (VS Code, Claude Desktop) opens the browser, not the server
- Client handles the full OAuth dance and attaches `Authorization: Bearer` to requests
- ARC-1 already has OIDC validation in `ts-src/server/http.ts` — could be extended to point at XSUAA
- VS Code, Claude Desktop, and Claude Code all support this flow (with some quirks)

**Option B: Pre-authenticated token via header (simpler)**
- User obtains a JWT token externally (e.g., via a login page, CLI tool)
- Passes it as `Authorization: Bearer <token>` header or custom header like `x-sap-jwt-token`
- ARC-1 validates the JWT and uses it for SAP requests
- This is what fr0ster supports via `x-sap-destination` header routing

### MCP Client Behavior for OAuth

| MCP Client | Browser Auth Support | Notes |
|---|---|---|
| **VS Code (Copilot Chat)** | Yes — opens browser automatically | Uses localhost callback URI |
| **Claude Desktop** | Yes — opens browser | Uses `claude.ai/api/mcp/auth_callback` redirect; some reported issues post Dec 2025 |
| **Claude Code (CLI)** | Yes — opens browser | Random port for callback; `--callback-port` to fix it |
| **Cursor** | Partial | May need manual token setup |

---

## 3. CSRF Token Handling

**Identical to on-premise.** Send `X-CSRF-Token: fetch` on a GET/HEAD request, extract the token from the response header, include it on subsequent POST/PUT/DELETE requests. Session cookies must be preserved.

---

## 4. Constraints vs On-Premise

| Area | Constraint |
|---|---|
| **ABAP Language** | Restricted ABAP ("ABAP for Cloud Development") — no dynpros, no reports, no unreleased SAP objects |
| **Released APIs only** | Only C1-released objects accessible; most standard SAP tables not directly queryable |
| **No SAP GUI** | Only ADT (Eclipse/API) available |
| **No direct DB table preview** | Data preview of database tables blocked by BTP backend policies |
| **No Basic Auth** | Must use OAuth 2.0; Basic Auth only via Communication Arrangements |
| **Package restrictions** | Custom development in `Z*` or customer namespace only |
| **Transport system** | Uses gCTS (Git-enabled CTS) or software components instead of traditional transport requests |
| **No OS-level access** | No file system, no SM51/SM66, no classic basis transactions |
| **Communication Scenarios** | Inbound API access may require explicit Communication Arrangements |

### Impact on ARC-1 Tools

| ARC-1 Tool | Impact |
|---|---|
| SAPRead | Works — source code, object metadata are accessible |
| SAPSearch | Works — object search endpoints available |
| SAPWrite | Works — but only for C1-released object types in customer namespace |
| SAPActivate | Works — activation endpoints available |
| SAPQuery | **Limited** — RunQuery (free SQL) likely blocked; CDS views work |
| SAPTransport | **Different** — gCTS instead of classic CTS; API may differ |
| SAPLint | Works — abaplint is client-side |
| SAPContext | Works — reads source code |
| SAPDiagnose | Works — ATC checks available (may need Communication Arrangement SAP_COM_0763) |

---

## 5. How Competitor Projects Handle Direct BTP ABAP Connection

### Overview

| Project | BTP ABAP Auth | Primary Flow | Uses SAML? |
|---|---|---|---|
| **fr0ster/mcp-abap-adt** | Service key + browser OAuth2 | Authorization Code | No (SAML providers exist but for edge cases) |
| **aws-abap-accelerator** | Basic Auth (dev) / X.509 certs (enterprise) | Certificate-based PP | No (SAML provider is a stub) |
| **abap-adt-api (npm)** | BearerFetcher callback | Any (caller provides token) | No |
| **ARC-1 (current)** | Only Destination Service → on-prem | N/A for direct BTP | No |

**Neither fr0ster nor AWS use SAML as their primary BTP auth flow.** Both have SAML providers but they are secondary/incomplete.

---

### fr0ster/mcp-abap-adt — Service Key + Authorization Code (Most Relevant)

This is the closest model for ARC-1's direct BTP ABAP support.

**Setup:**
1. User downloads service key JSON from BTP Cockpit
2. Places it at `~/.config/mcp-abap-adt/service-keys/<DESTINATION_NAME>.json`
3. Starts server with `--mcp=<DESTINATION_NAME>`

**Service key structure used:**
```json
{
  "uaa": {
    "clientid": "sb-abap-trial-...",
    "clientsecret": "...",
    "url": "https://account.authentication.eu10.hana.ondemand.com"
  },
  "abap": {
    "url": "https://account.abap.cloud.sap",
    "sapClient": "100"
  },
  "binding": { "env": "cloud", "type": "abap-cloud" }
}
```

**Auth flow:**
1. `AuthBroker` loads service key, extracts UAA credentials
2. Checks session cache (`~/.config/mcp-abap-adt/sessions/<DEST>.env`) for existing tokens
3. If no cached token → `AuthorizationCodeProvider` opens browser to XSUAA authorize endpoint
4. User authenticates in browser
5. Local callback server (`localhost:3001`) captures authorization code
6. Code exchanged for JWT access + refresh tokens
7. Tokens cached to disk for reuse across sessions
8. `Authorization: Bearer <token>` sent on all ADT requests
9. On 401/403: automatic token refresh via refresh token, then retry

**Architecture (multi-package):**
```
@mcp-abap-adt/auth-stores      → Reads service key files
@mcp-abap-adt/auth-providers   → 9 token providers (Authorization Code is primary for BTP)
@mcp-abap-adt/auth-broker      → Orchestrates: cache → refresh → browser flow
@mcp-abap-adt/connection       → HTTP transport, injects Bearer token + CSRF
```

**Key takeaway:** The complexity is in token lifecycle (acquire → cache → refresh → retry), not in the auth protocol itself. The actual OAuth exchange is straightforward.

---

### AWS ABAP Accelerator — Basic Auth + X.509 Certificates

**Development mode:** Standard Basic Auth (`SAP_USERNAME` + `SAP_PASSWORD`). Same as on-premise.

**Enterprise mode (ECS Fargate):**
1. User authenticates to MCP server via OAuth (AWS Cognito, Okta, Entra ID)
2. MCP server middleware extracts user identity from OAuth JWT
3. Generates **ephemeral X.509 certificate** (5-min RSA 2048-bit) with user's login as CN
4. Certificate signed by CA stored in AWS Secrets Manager
5. Certificate used to authenticate to SAP BTP ABAP via client cert auth
6. SAP CERTRULE maps certificate CN → SAP user

**Key difference:** This separates MCP auth (OAuth) from SAP auth (X.509 certs). It does NOT use XSUAA OAuth tokens to call ADT. It uses certificates instead.

**Not practical for ARC-1** — requires AWS infrastructure (Secrets Manager, IAM), CA certificate management, and SAP CERTRULE configuration.

---

### abap-adt-api (npm library) — BearerFetcher Pattern

The simplest integration pattern. The library accepts either a password string or a token-fetching function:

```typescript
// On-premise: Basic Auth
const client = new ADTClient("http://host:8000", "user", "password");

// BTP: OAuth Bearer token — caller provides the token
const client = new ADTClient(
  "https://<system-id>.abap.<region>.hana.ondemand.com",
  "user@domain.com",
  async () => {
    // Your function that obtains/refreshes OAuth token
    const token = await fetchOAuthToken(clientId, clientSecret, tokenUrl);
    return token;
  }
);
```

When the third parameter is a function (`BearerFetcher`), the library uses `Authorization: Bearer <token>` instead of Basic Auth. The caller is responsible for token lifecycle.

**Most relevant pattern for ARC-1** — minimal change to `AdtHttpClient`: accept a bearer token provider function alongside username/password.

---

## 6. Current ARC-1 Implementation Gap

### What Exists (ts-src/adt/btp.ts)

- VCAP_SERVICES parsing for Destination Service + Connectivity Service credentials
- OAuth2 `client_credentials` token exchange (but only for Destination/Connectivity Service tokens)
- Cloud Connector proxy setup (`onpremise_proxy_host`)
- Principal Propagation via SAML assertions through Destination Service
- Destination lookup at `/destination-configuration/v1/destinations/{name}`

### What's Missing for Direct BTP ABAP

1. **OAuth2 Bearer Auth in HTTP client** — `ts-src/adt/http.ts` only supports Basic Auth for the ADT connection itself
2. **Service key parsing** — No support for reading BTP ABAP service key JSON
3. **Token lifecycle management** — Need caching + auto-refresh (tokens expire in ~12h)
4. **Direct HTTPS connection** — Current flow always routes through Destination Service → Cloud Connector
5. **`ProxyType: 'Internet'` handling** — `btp.ts` line 510 only creates proxy for `OnPremise` type; `Internet` destinations are not fully supported

### Relevant Code Note

In `btp.ts` there is already a TODO:
```typescript
// TODO: Bearer token auth for OAuth2SAMLBearerAssertion destinations
// This would replace basic auth with Bearer token
logger.warn('Bearer token auth from destination not yet implemented');
```

---

## 7. Implementation Plan — Direct Connection via Service Key

Following the fr0ster model (most practical for ARC-1). Authorization Code flow only — no Client Credentials.

### End-to-End Setup (How fr0ster Does It)

fr0ster documents this in `docs/installation/examples/SERVICE_KEY_SETUP.md`:

**Step 1: Create Service Key in SAP BTP Cockpit**
1. Go to BTP Cockpit → your Subaccount → Service Instances
2. Find your ABAP Environment service instance
3. Create a Service Key (or download existing one)
4. Save the JSON file

**Step 2: Place Service Key Locally**
```bash
# fr0ster convention:
mkdir -p ~/.config/mcp-abap-adt/service-keys
cp ~/Downloads/service-key.json ~/.config/mcp-abap-adt/service-keys/TRIAL.json
# The filename (minus .json) becomes the "destination" name
```

**Step 3: Configure MCP Client**

fr0ster's Claude Desktop config:
```json
{
  "mcpServers": {
    "mcp-abap-adt": {
      "type": "stdio",
      "command": "mcp-abap-adt",
      "args": ["--unsafe", "--mcp=TRIAL"],
      "timeout": 60
    }
  }
}
```

Or via npx:
```json
{
  "mcpServers": {
    "mcp-abap-adt": {
      "command": "npx",
      "args": ["-y", "@fr0ster/mcp-abap-adt", "--transport=stdio", "--mcp=TRIAL"]
    }
  }
}
```

**Step 4: First Use**
- Start the MCP client (Claude Desktop, VS Code, etc.)
- Make any tool call → server detects no cached token
- **Browser opens automatically** to XSUAA login page
- User authenticates in browser
- Token is captured and cached → subsequent calls just work
- Token auto-refreshes; browser only opens again if refresh token also expires

**`--unsafe` flag**: Enables writing cached session tokens to disk (`~/.config/mcp-abap-adt/sessions/TRIAL.env`). Without it, tokens are in-memory only and lost on restart (re-login via browser each time).

### Proposed ARC-1 Configuration

```bash
# Option 1: Path to service key file (recommended)
SAP_BTP_SERVICE_KEY_FILE=/path/to/service-key.json

# Option 2: Inline service key JSON (e.g., for Docker)
SAP_BTP_SERVICE_KEY='{"uaa":{...},"url":"..."}'

# Optional: callback port for browser OAuth (default: auto)
SAP_OAUTH_CALLBACK_PORT=3001
```

When a service key is provided, ARC-1 would:
- Extract `url` as the SAP system URL (replaces `SAP_URL`)
- Extract `uaa.url`, `uaa.clientid`, `uaa.clientsecret` for OAuth
- Ignore `SAP_USER` / `SAP_PASSWORD` (not applicable)
- On first request: open browser → capture code → exchange for JWT → cache

### Changes Required in ARC-1

| File | Change |
|------|--------|
| `ts-src/adt/http.ts` | Accept `bearerTokenProvider?: () => Promise<string>` in config. When set, use `Authorization: Bearer` instead of Basic Auth. |
| `ts-src/server/config.ts` | Parse `SAP_BTP_SERVICE_KEY` / `SAP_BTP_SERVICE_KEY_FILE` env vars |
| `ts-src/server/types.ts` | Add service key config fields |
| New: `ts-src/adt/oauth.ts` | Authorization Code flow: browser open, local callback server, code→token exchange, token caching + refresh |
| `ts-src/server/server.ts` | If service key present, create OAuth token provider and pass to ADT client |

### Core Code Change (BearerFetcher Pattern)

Following `abap-adt-api`'s approach, the HTTP client change is small:

```typescript
// In AdtHttpClient — add bearer token support
if (this.config.bearerTokenProvider) {
  const token = await this.config.bearerTokenProvider();
  headers['Authorization'] = `Bearer ${token}`;
} else {
  // Existing Basic Auth path
  headers['Authorization'] = 'Basic ' + btoa(`${user}:${pass}`);
}
```

The real work is in the new `oauth.ts` module:
- Start local HTTP server for callback
- Open browser via `child_process` (`open` on macOS, `xdg-open` on Linux)
- Exchange authorization code for tokens
- Cache tokens (in-memory + optional disk persistence)
- Auto-refresh before expiry
- Retry on 401/403

CSRF token handling and cookie management remain unchanged.

---

## 8. Required Communication Arrangements

For programmatic access to BTP ABAP Environment, certain Communication Arrangements may be needed:

| Scenario | ID | Purpose |
|---|---|---|
| ADT Core | (built-in) | Basic ADT access — typically available by default |
| ATC Checks | SAP_COM_0763 | Run ATC checks programmatically |
| Custom Communication Scenario | Custom | For specific inbound API access patterns |

Communication Arrangement setup:
1. Create a Communication System (pointing to your MCP server / external caller)
2. Create a Communication User (technical user with required authorizations)
3. Create a Communication Arrangement binding scenario + system + user

---

## 9. References

### SAP Documentation
- [SAP Help: ADT in BTP ABAP Environment](https://help.sap.com/docs/sap-btp-abap-environment/abap-environment/adt)
- [SAP Help: Connect to the ABAP System](https://help.sap.com/docs/btp/sap-business-technology-platform/connect-to-abap-system)
- [SAP Help: Creating Service Key for ABAP System](https://help.sap.com/docs/btp/sap-business-technology-platform/creating-service-key-for-abap-system)
- [SAP Community: Testing BTP ABAP APIs with Postman (OAuth 2.0)](https://community.sap.com/t5/technology-blog-posts-by-sap/manually-testing-sap-btp-abap-environment-apis-with-postman-using-oauth-2-0/ba-p/13556445)
- [SAP Community: Manual Testing of BTP ABAP APIs](https://community.sap.com/t5/technology-blog-posts-by-sap/manual-testing-of-apis-in-sap-btp-abap-environment-using-postman/ba-p/13509246)
- [SAP BTP ABAP Environment FAQ](https://pages.community.sap.com/topics/btp-abap-environment/faq)

### MCP Protocol & OAuth
- [MCP Authorization Specification (2025-03-26)](https://modelcontextprotocol.io/specification/2025-03-26/basic/authorization) — OAuth 2.1 for HTTP transport
- [Understanding Authorization in MCP (Tutorial)](https://modelcontextprotocol.io/docs/tutorials/security/authorization)
- [What's New in the 2025-11-25 MCP Authorization Spec](https://den.dev/blog/mcp-november-authorization-spec/)

### Competitor Implementations
- [GitHub: fr0ster/mcp-abap-adt](https://github.com/fr0ster/mcp-abap-adt) — Service key + browser OAuth2 for BTP ABAP
- [fr0ster: Service Key Setup Docs](https://github.com/fr0ster/mcp-abap-adt/blob/master/docs/installation/examples/SERVICE_KEY_SETUP.md)
- [GitHub: marcellourbani/abap-adt-api](https://github.com/marcellourbani/abap-adt-api) — ADT client with BearerFetcher pattern
- [GitHub: AWS ABAP Accelerator](https://github.com/aws-solutions-library-samples/guidance-for-deploying-sap-abap-accelerator-for-amazon-q-developer) — X.509 cert + OAuth for enterprise
