# Connecting to SAP BTP ABAP Environment via ADT API

**Date:** 2026-04-01
**Status:** Implemented (pending live testing)

## Executive Summary

The ADT API (`/sap/bc/adt/*`) is fully available on BTP ABAP Environment (Steampunk). The main difference from on-premise is **authentication** — BTP ABAP requires OAuth 2.0 via XSUAA instead of Basic Auth. CSRF token handling remains identical.

**Implementation:** ARC-1 now supports direct BTP ABAP Environment connections via service key + OAuth Authorization Code flow (browser login), following the fr0ster model. See [BTP ABAP Environment Setup](../btp-abap-environment.md) for usage.

**Files added/changed:**
- `ts-src/adt/oauth.ts` — OAuth module (service key parsing, browser flow, token lifecycle)
- `ts-src/adt/http.ts` — `bearerTokenProvider` in config, Bearer token injection
- `ts-src/adt/config.ts` — `bearerTokenProvider` in `AdtClientConfig`
- `ts-src/adt/client.ts` — Pass bearer token provider to HTTP client
- `ts-src/server/types.ts` — `btpServiceKey`, `btpServiceKeyFile`, `btpOAuthCallbackPort`
- `ts-src/server/config.ts` — Parse new env vars and CLI flags
- `ts-src/server/server.ts` — Wire up service key → OAuth provider → ADT client
- `tests/unit/adt/oauth.test.ts` — 27 tests
- `tests/unit/server/config.test.ts` — 7 new config tests

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

## 6. ARC-1 Implementation (Completed)

### What Was Added

1. **`ts-src/adt/oauth.ts`** — New OAuth 2.0 module:
   - Service key parsing and validation (`parseServiceKey`, `loadServiceKeyFile`, `resolveServiceKey`)
   - Browser Authorization Code flow (`performBrowserLogin`, `startCallbackServer`, `openBrowser`)
   - Token exchange and refresh (`exchangeCodeForToken`, `refreshAccessToken`)
   - BearerFetcher pattern (`createBearerTokenProvider`) — caches token, auto-refreshes, re-authenticates

2. **`ts-src/adt/http.ts`** — Bearer token support:
   - `bearerTokenProvider?: () => Promise<string>` in `AdtHttpConfig`
   - Injected on every request + CSRF token fetch (replaces Basic Auth when set)

3. **`ts-src/server/server.ts`** — Startup wiring:
   - If `btpServiceKey` or `btpServiceKeyFile` is configured, resolves the service key
   - Overrides `config.url` and `config.client` from service key
   - Creates `bearerTokenProvider` and passes to `AdtClient`

### What Still Exists (On-Premise BTP Path)

The existing `ts-src/adt/btp.ts` Destination Service path is unchanged and still works for on-premise connectivity via Cloud Connector. The two paths are independent — service key is for direct BTP ABAP, Destination Service is for on-premise via BTP.

---

## 7. ARC-1 Usage — See Setup Guide

For end-to-end setup instructions, see **[docs/btp-abap-environment.md](../btp-abap-environment.md)**.

Quick start:
```bash
SAP_BTP_SERVICE_KEY_FILE=/path/to/service-key.json arc1
```

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
