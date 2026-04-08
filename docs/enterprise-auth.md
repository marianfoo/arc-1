# Authentication Overview

ARC-1 has two independent authentication concerns that work together:

1. **MCP Client → ARC-1**: How does the AI client (Claude, Cursor, Copilot Studio) prove its identity to ARC-1?
2. **ARC-1 → SAP**: How does ARC-1 authenticate to the SAP system?

These are separate layers. You choose one method for each, and they combine freely. This guide helps you understand the options, pick the right combination, and find the detailed setup instructions.

For **what users can do** after authenticating (scopes, roles, safety controls), see [Authorization & Roles](authorization.md).

```
┌─────────────┐      MCP Client Auth       ┌─────────┐      SAP Auth        ┌─────────────┐
│  AI Client  │ ──────────────────────────► │  ARC-1  │ ──────────────────► │ SAP System  │
│  (Claude,   │  API Key, OIDC/JWT,        │  Server │  Basic Auth,        │ (ABAP, BTP) │
│   Cursor)   │  or XSUAA OAuth            │         │  OAuth/XSUAA,       │             │
└─────────────┘                            └─────────┘  mTLS, or PP        └─────────────┘
```

---

## Choosing Your Setup

### Quick Decision Guide

| Your situation | MCP Client → ARC-1 | ARC-1 → SAP | Setup Guide |
|----------------|-------------------|-------------|-------------|
| **Local dev** (single user, `npx`) | None needed | Basic Auth | [Setup Guide](setup-guide.md) |
| **Shared server** (team, quick start) | API Key | Basic Auth | [API Key Setup](api-key-setup.md) |
| **Team server** (role-based access) | API Keys (multi) | Basic Auth | [API Key Setup](api-key-setup.md) |
| **Enterprise** (per-user identity) | OIDC / JWT | Basic Auth (shared user) | [OAuth / JWT Setup](oauth-jwt-setup.md) |
| **Enterprise + SAP audit trail** | OIDC / JWT | Principal Propagation | [OAuth / JWT](oauth-jwt-setup.md) + [PP Setup](principal-propagation-setup.md) |
| **BTP Cloud Foundry** | XSUAA OAuth | Destination Service | [XSUAA Setup](xsuaa-setup.md) + [Destination Setup](btp-destination-setup.md) |
| **BTP ABAP Environment** (direct) | None (local) or XSUAA | OAuth (service key) | [BTP ABAP Setup](btp-abap-environment.md) |

### What to Consider

**How many users?**

- **Single user** (local dev): No MCP client auth needed. Use Basic Auth to SAP.
- **Small team** (shared server): API Key is the simplest. For role differentiation, use [multiple API keys](api-key-setup.md#multi-key-setup-role-based-access) with per-key profiles.
- **Enterprise** (many users, compliance): Use OIDC or XSUAA. Per-user tokens enable per-user [scopes and roles](authorization.md).

**Do you need per-user SAP identity?**

- **No** (most setups): ARC-1 connects to SAP with a single shared user. Simpler to set up, but all operations appear as one SAP user in logs.
- **Yes** (audit, compliance): Use [Principal Propagation](principal-propagation-setup.md). Each MCP user maps to their SAP user. Full audit trail, per-user SAP authorization. Requires Cloud Connector or mTLS setup.

**Where does ARC-1 run?**

- **Locally** (npx, npm): MCP client connects via stdio. No network auth needed.
- **Remote server / Docker**: MCP client connects via HTTP. Needs MCP Client Auth (API Key or OIDC).
- **SAP BTP Cloud Foundry**: XSUAA handles both MCP client auth and SAP connectivity.

---

## MCP Client Authentication (Client → ARC-1)

These methods control who can talk to ARC-1 when it runs as an HTTP server. Not needed for local stdio connections.

### No Authentication (Local / stdio)

When using ARC-1 locally via `npx` or `npm`, the MCP client connects through stdio (standard input/output). No network auth is needed — security relies on the user's OS-level access.

**Upsides:** Zero setup. Works immediately.
**Downsides:** No per-user identity. No authorization scopes — only [safety config](authorization.md#safety-config-the-server-level-ceiling) applies.
**When to use:** Local development, personal use.

### API Key

A shared secret token. Simple to set up, no external IdP needed. Supports **multiple keys with per-key profiles** for role-based access control.

**Upsides:** Simplest server auth. Works with any MCP client. No IdP needed. Per-key profiles enable role-based access without an external auth provider.
**Downsides:** Keys identify roles, not individual users. No per-user SAP audit trail. Key rotation requires updating clients.
**When to use:** Small-to-medium teams, POCs, internal servers behind a VPN. Multi-key mode works well for team servers with 2–3 access levels.
**Prerequisites:** Generate random keys, configure server and clients.

**Setup:** [API Key Setup](api-key-setup.md)

### OIDC / JWT (External Identity Provider)

Per-user authentication via any [OpenID Connect](https://openid.net/specs/openid-connect-core-1_0.html) provider (Microsoft Entra ID, Google, Okta, Keycloak, Auth0, etc.). Users authenticate with their corporate identity. Tokens carry per-user [scopes](authorization.md#scopes) for fine-grained authorization.

**Upsides:** Per-user identity. Per-user scopes. Works with existing corporate IdPs. Standard protocol.
**Downsides:** Requires an OIDC provider. Token rotation is automatic (refresh tokens) but initial setup is more complex.
**When to use:** Enterprise deployments with existing identity infrastructure.
**Prerequisites:** An OIDC provider with app registration. Configure scopes in IdP to match ARC-1's scope model.

**Setup:** [OAuth / JWT Setup](oauth-jwt-setup.md)

### XSUAA OAuth (SAP BTP)

SAP's own OAuth service for BTP applications. Similar to OIDC but uses SAP's [Authorization and Trust Management Service](https://help.sap.com/docs/btp/sap-business-technology-platform/what-is-sap-authorization-and-trust-management-service). Scopes and roles are managed in the BTP Cockpit.

**Upsides:** Native BTP integration. Scopes and roles managed in BTP Cockpit. Supports [role collections](authorization.md#xsuaa-roles-btp-deployments) for easy user management. MCP clients auto-discover the OAuth configuration.
**Downsides:** Only available on BTP. More complex setup than API Key.
**When to use:** BTP Cloud Foundry deployments.
**Prerequisites:** BTP subaccount with XSUAA service instance.

**Setup:** [XSUAA Setup](xsuaa-setup.md)

---

## SAP Authentication (ARC-1 → SAP)

These methods control how ARC-1 proves its identity to the SAP system.

### Basic Authentication

Username and password sent with every HTTP request to SAP. The simplest SAP auth method.

**Upsides:** Zero SAP-side setup. Works with any SAP system.
**Downsides:** Credentials stored in config. Single SAP user for all MCP users. No per-user audit trail.
**When to use:** Local dev, shared servers where SAP identity doesn't matter.
**Prerequisites:** A SAP user with appropriate authorization (see [SAP-Side Authorization](authorization.md#sap-side-authorization-layer-2)).

```bash
arc1 --url http://sap:50000 --user DEVELOPER --password secret
```

### Cookie Authentication

Reuse session cookies from a browser session. Useful for one-off sessions.

**Upsides:** No stored credentials. Reuses existing browser session.
**Downsides:** Cookies expire (typically 30 minutes). Manual process.
**When to use:** Quick one-off sessions using an existing SAP GUI/Fiori session.

```bash
arc1 --url http://sap:50000 --cookie-file cookies.txt
```

### OAuth2 / Service Key (BTP ABAP Environment)

For SAP BTP ABAP Environment systems, ARC-1 uses a service key for OAuth2 authentication. Handles token lifecycle (refresh, retry) automatically. Requires an interactive browser login on first use.

**Upsides:** Secure OAuth flow. Automatic token refresh. Works with BTP ABAP systems.
**Downsides:** Requires service key from BTP Cockpit. Interactive login on first use.
**When to use:** Connecting to BTP ABAP Environment (Steampunk) systems.
**Prerequisites:** BTP ABAP instance with service key. See [BTP ABAP Setup](btp-abap-environment.md).

```bash
arc1 --btp-service-key-file /path/to/service-key.json
```

### X.509 Client Certificate (mTLS)

ARC-1 authenticates to SAP using a TLS client certificate. SAP maps the certificate's Subject CN to a SAP user via CERTRULE. No username or password needed.

**Upsides:** No stored passwords. Strong cryptographic identity. Per-user certificates possible.
**Downsides:** Requires PKI setup (CA, certificate generation). SAP-side setup (STRUST, CERTRULE).
**When to use:** Enterprise environments requiring certificate-based authentication.
**Prerequisites:** CA infrastructure, SAP STRUST and CERTRULE configuration.

```bash
arc1 --url https://sap:443 --client-cert client.crt --client-key client.key
```

See the detailed configuration in the [Enterprise Authentication Reference](#detailed-sap-authentication-reference) section below.

### Principal Propagation (Per-User SAP Identity)

The most complete authentication model. Each MCP user's identity flows through to SAP, so every request runs as the real SAP user — not a shared technical account.

**Upsides:** Full per-user audit trail. SAP-level authorization per user. Zero stored SAP credentials. No shared accounts.
**Downsides:** Most complex setup (Cloud Connector or mTLS + CERTRULE). Requires OIDC or XSUAA on the client side.
**When to use:** Enterprise deployments requiring audit compliance, per-user SAP authorization, or regulatory requirements.
**Prerequisites:** Cloud Connector (on-premise SAP) or direct mTLS (cloud SAP). CERTRULE configuration. OIDC or XSUAA for user identity.

**Setup:** [Principal Propagation Setup](principal-propagation-setup.md)

```
MCP Client ──OIDC/XSUAA──► ARC-1 ──X.509 cert (per user)──► Cloud Connector ──► SAP
                                    generated from user JWT
```

### BTP Destination Service

For BTP deployments connecting to on-premise SAP systems via Cloud Connector. The Destination Service handles connection details, credentials, and optionally Principal Propagation.

**Upsides:** Centralized connection management. Cloud Connector integration. Supports PP.
**Downsides:** BTP-only. Requires Destination and Connectivity service instances.
**When to use:** BTP Cloud Foundry apps connecting to on-premise SAP via Cloud Connector.
**Prerequisites:** BTP Destination Service instance, Cloud Connector configured.

**Setup:** [BTP Destination Setup](btp-destination-setup.md)

---

## Common Combinations

### Local Developer

```
stdio (no MCP auth) → Basic Auth to SAP
```

Simplest setup. Single user. Use `--profile developer` for write access or `--profile viewer` for read-only.

### Team Server with Role-Based Access

```
API Keys with profiles (MCP auth) → Basic Auth to SAP
```

Quick to set up. Different keys for different roles (e.g., viewer key for reviewers, developer key for developers). All users share one SAP user. Each key enforces its profile's scopes and safety restrictions.

### Enterprise with Per-User Control

```
OIDC (MCP auth) → Basic Auth (shared SAP user)
```

Per-user scopes control what each person can do in ARC-1, but all requests use the same SAP user. Good when SAP identity per user isn't required.

### Enterprise with Full Audit Trail

```
OIDC or XSUAA (MCP auth) → Principal Propagation (per-user SAP identity)
```

Gold standard. Per-user scopes in ARC-1 + per-user SAP authorization + full audit trail. Requires Cloud Connector or mTLS setup.

### BTP Cloud Foundry (Production)

```
XSUAA (MCP auth) → BTP Destination Service → Cloud Connector → On-premise SAP
```

Full BTP stack. Role collections in BTP Cockpit. PP optional but recommended for audit compliance.

---

## Setup Guides

| Guide | What it covers |
|-------|---------------|
| [API Key Setup](api-key-setup.md) | Shared token auth for MCP clients |
| [OAuth / JWT Setup](oauth-jwt-setup.md) | Per-user OIDC auth (EntraID, Okta, Keycloak) |
| [XSUAA Setup](xsuaa-setup.md) | SAP BTP OAuth with role collections |
| [Principal Propagation Setup](principal-propagation-setup.md) | Per-user SAP identity via Cloud Connector |
| [BTP Destination Setup](btp-destination-setup.md) | BTP connectivity to on-premise SAP |
| [BTP ABAP Environment](btp-abap-environment.md) | Direct connection to BTP ABAP (Steampunk) |
| [Auth Test Process](auth-test-process.md) | Verification checklists for each auth method |
| [Authorization & Roles](authorization.md) | Scopes, roles, safety config |

---

## Detailed SAP Authentication Reference

The sections below provide configuration details for each SAP authentication method. For most users, the setup guides above are sufficient — use this reference for advanced configuration or troubleshooting.

---

## 1. Basic Authentication

The simplest method. Username and password are sent with every HTTP request.

```bash
# CLI flags
arc1 --url https://sap-host:443 --user DEVELOPER --password 'ABAPtr2023#00'

# Environment variables
export SAP_URL=https://sap-host:443
export SAP_USER=DEVELOPER
export SAP_PASSWORD='ABAPtr2023#00'
arc1

# .env file (auto-loaded)
SAP_URL=https://sap-host:443
SAP_USER=DEVELOPER
SAP_PASSWORD=ABAPtr2023#00
```

**When to use:** Local development, sandbox systems, CI/CD pipelines with secrets.
**Security:** Password is in plaintext in config/env. Not suitable for production
multi-user deployments.

---

## 2. Cookie Authentication

Reuse session cookies from a browser session (MYSAPSSO2, SAP_SESSIONID).

```bash
# From a cookie file (Netscape format or key=value)
arc1 --url https://sap-host:443 --cookie-file cookies.txt

# From a cookie string
arc1 --url https://sap-host:443 --cookie-string "MYSAPSSO2=abc123; SAP_SESSIONID_A4H_001=xyz"
```

**When to use:** One-off sessions where you have browser cookies.
**Security:** Session cookies expire (typically 30 min). Not scalable.

---

## 3. OAuth2/XSUAA (BTP/Cloud Systems)

For SAP BTP systems using XSUAA for authentication. Uses OAuth2 client_credentials
flow to obtain a Bearer token.

### From a Service Key File

```bash
arc1 --service-key /path/to/servicekey.json
```

The service key JSON is downloaded from SAP BTP Cockpit and looks like:

```json
{
  "url": "https://my-system.abap.eu10.hana.ondemand.com",
  "systemid": "DEV",
  "uaa": {
    "url": "https://my-tenant.authentication.eu10.hana.ondemand.com",
    "clientid": "sb-clone-abc123",
    "clientsecret": "secret-value"
  }
}
```

### With Explicit OAuth Parameters

```bash
arc1 --url https://sap-host:443 \
    --oauth-url https://tenant.authentication.eu10.hana.ondemand.com/oauth/token \
    --oauth-client-id sb-clone-abc123 \
    --oauth-client-secret secret-value
```

**Token lifecycle:** ARC-1 caches the OAuth token and refreshes it automatically
60 seconds before expiry. Thread-safe for concurrent requests.

**References:**
- [SAP BTP: Create Service Keys](https://help.sap.com/docs/btp/sap-business-technology-platform/creating-service-keys)
- [SAP XSUAA Documentation](https://help.sap.com/docs/btp/sap-business-technology-platform/what-is-sap-authorization-and-trust-management-service)

---

## 4. X.509 Client Certificate Authentication (mTLS)

ARC-1 authenticates to SAP using a TLS client certificate. SAP maps the certificate's
Subject CN (Common Name) to a SAP user via CERTRULE. No username or password is needed.

### Configuration

```bash
# CLI flags
arc1 --url https://sap-host:443 \
    --client-cert /path/to/client.crt \
    --client-key /path/to/client.key

# With custom CA (when SAP uses an internal CA)
arc1 --url https://sap-host:443 \
    --client-cert /path/to/client.crt \
    --client-key /path/to/client.key \
    --ca-cert /path/to/ca.crt

# Environment variables
export SAP_URL=https://sap-host:443
export SAP_CLIENT_CERT=/path/to/client.crt
export SAP_CLIENT_KEY=/path/to/client.key
export SAP_CA_CERT=/path/to/ca.crt  # optional
```

### How It Works

```
arc1 ─── TLS handshake with client certificate ───► SAP ICM
                                                    │
                                                    ▼
                                              CERTRULE engine
                                              maps Subject CN
                                              to SAP username
                                                    │
                                                    ▼
                                              Authenticated as
                                              SAP user = CN
```

1. ARC-1 loads the client certificate and private key from PEM files
2. During TLS handshake, arc1 presents the client certificate to SAP ICM
3. SAP ICM verifies the certificate against trusted CAs in STRUST
4. SAP's CERTRULE engine maps the certificate's Subject CN to a SAP user
5. All subsequent requests run as that SAP user

### SAP-Side Setup

#### Step 1: Generate a CA and Client Certificate

```bash
# Generate CA (self-signed, for testing)
openssl genrsa -out ca.key 4096
openssl req -new -x509 -key ca.key -out ca.crt -days 365 \
  -subj "/CN=arc1-enterprise-ca/O=My Company"

# Generate client certificate for a specific SAP user
openssl genrsa -out developer.key 2048
openssl req -new -key developer.key -out developer.csr \
  -subj "/CN=DEVELOPER"
openssl x509 -req -in developer.csr -CA ca.crt -CAkey ca.key \
  -CAcreateserial -out developer.crt -days 365
```

The certificate's Subject CN (`DEVELOPER`) must match the SAP username.

#### Step 2: Import CA Certificate into SAP STRUST

1. Open transaction `/nSTRUST` in SAP GUI
2. Navigate to **SSL Server Standard** PSE
3. If no PSE exists, click **Create** → use defaults → Save
4. Double-click the PSE entry to open it
5. In the **Certificate** section, click **Import**
6. Paste the CA certificate PEM content (`ca.crt`)
7. Click **Add to Certificate List**
8. **Save** the PSE

Alternatively, via SAP profile (no GUI needed):
- Copy `ca.crt` into the container
- Use `sapgenpse` command-line tool to import

**Reference:** [SAP Help: Maintaining the PSE in STRUST](https://help.sap.com/docs/ABAP_PLATFORM/e73baa71770e4c0ca5fb2a3c17e8e229/4510e4a027c746e8e10000000a421937.html)

#### Step 3: Enable Certificate Login in SAP Profile

Edit the SAP instance profile (e.g., `A4H_D00_vhcala4hci`):

```
# Enable rule-based certificate mapping
login/certificate_mapping_rulebased = 1

# Accept client certificates (1 = optional, 2 = required)
icm/HTTPS/verify_client = 1
```

Restart the ABAP instance after profile changes.

**Reference:** [SAP Help: ICM HTTPS Parameters](https://help.sap.com/docs/ABAP_PLATFORM/683d6a1797a34730a6e005d1e8de6f22/48e20f476bfb7c6de10000000a42189c.html)

#### Step 4: Configure Certificate Mapping Rule (CERTRULE)

1. Open transaction `/nCERTRULE` (or use `/nCERTMAP` on older systems)
2. Click **Import Certificate** and upload the client certificate (`developer.crt`)
3. Create a new rule:
   - **Certificate Attribute:** `Subject` → `CN`
   - **Login As:** Select `CN value is used as SAP username`
4. Save and activate the rule

This tells SAP: "when a client presents a certificate, use the CN as the SAP username."

**Reference:** [SAP Help: Configuring Certificate Login](https://help.sap.com/docs/ABAP_PLATFORM/e73baa71770e4c0ca5fb2a3c17e8e229/4513f2bf27da4ce8e10000000a421937.html)

#### Step 5: Restart ICM

After all configuration changes, restart SAP ICM:
- Transaction `/nSMICM` → Administration → ICM → **Soft Restart**
- Or via command line: `sapcontrol -nr 00 -function RestartService`

#### Step 6: Test

```bash
# Test with curl
curl --cert developer.crt --key developer.key \
  https://sap-host:443/sap/bc/adt/core/discovery?sap-client=001

# Test with arc1
arc1 --url https://sap-host:443 --client-cert developer.crt --client-key developer.key
```

---

## 5. OIDC Token Validation + Principal Propagation

The most secure multi-user authentication. Combines OIDC (Microsoft EntraID) token
validation with ephemeral X.509 certificate generation.

### How It Works

```
User (alice@company.com)
  │
  ▼
Copilot Studio / IDE  ──── authenticates via EntraID ───► EntraID
  │                                                         │
  │  OIDC Bearer token                                      │
  ▼                                                         │
arc1 HTTP endpoint  ◄─── validates token via JWKS ───────────┘
  │
  │  1. Extract username from JWT claim
  │  2. Map: alice@company.com → ALICE (SAP username)
  │  3. Generate ephemeral X.509 cert: CN=ALICE, valid 5 min
  │  4. Sign cert with CA key (trusted in SAP STRUST)
  │
  ▼
SAP ABAP System  ◄─── mTLS with ephemeral cert
  │
  │  SAP validates cert against STRUST
  │  CERTRULE maps CN=ALICE to SAP user ALICE
  │  SAP audit log shows: ALICE executed this action
  │
  ▼
Response to user
```

**Key properties:**
- **Zero SAP credentials stored anywhere** — no passwords, no service accounts
- **Per-user audit trail** — SAP logs show the actual end user
- **Short-lived certificates** — ephemeral certs expire in 5 minutes
- **Centralized identity** — uses existing corporate EntraID accounts

### Configuration

```bash
# OIDC validation (validates incoming Bearer tokens)
arc1 --url https://sap-host:443 \
    --oidc-issuer https://login.microsoftonline.com/{tenant-id}/v2.0 \
    --oidc-audience api://arc1-sap-connector \
    --oidc-username-claim preferred_username \
    --pp-ca-key /path/to/ca.key \
    --pp-ca-cert /path/to/ca.crt \
    --pp-cert-ttl 5m \
    --transport http-streamable

# Environment variables
export SAP_URL=https://sap-host:443
export SAP_OIDC_ISSUER=https://login.microsoftonline.com/{tenant-id}/v2.0
export SAP_OIDC_AUDIENCE=api://arc1-sap-connector
export SAP_OIDC_USERNAME_CLAIM=preferred_username
export SAP_PP_CA_KEY=/path/to/ca.key
export SAP_PP_CA_CERT=/path/to/ca.crt
export SAP_PP_CERT_TTL=5m
export SAP_TRANSPORT=http-streamable
```

### Setup Guide

#### Step 1: Create EntraID App Registration

1. Go to [Azure Portal](https://portal.azure.com/) → **Azure Active Directory** → **App registrations**
2. Click **New registration**
   - Name: `ARC-1 SAP Connector`
   - Supported account types: `Accounts in this organizational directory only`
   - Redirect URI: not needed (server-to-server)
3. Note the **Application (client) ID** and **Directory (tenant) ID**
4. Go to **Expose an API**
   - Set **Application ID URI** (e.g., `api://arc1-sap-connector`)
   - Add a scope: `SAP.Access`
5. Go to **Certificates & secrets** (if clients need client credentials, otherwise skip)

**References:**
- [Microsoft: Register an application](https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app)
- [Microsoft: Expose an API](https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-configure-app-expose-web-apis)

#### Step 2: Generate CA Key Pair

```bash
# Generate a CA key pair (RSA-4096)
# This CA will sign the ephemeral certificates.
# The CA certificate must be imported into SAP STRUST.
openssl genrsa -out pp-ca.key 4096
openssl req -new -x509 -key pp-ca.key -out pp-ca.crt -days 3650 \
  -subj "/CN=arc1-principal-propagation-ca/O=My Company"
```

Keep `pp-ca.key` secure — it is the root of trust. In production, store it in
Azure Key Vault or a hardware security module (HSM).

#### Step 3: Configure SAP (Same as X.509 mTLS)

Follow the same STRUST + CERTRULE setup from [Section 4](#4-x509-client-certificate-authentication-mtls):
1. Import `pp-ca.crt` into STRUST (SSL Server Standard PSE)
2. Set `login/certificate_mapping_rulebased = 1`
3. Set `icm/HTTPS/verify_client = 1`
4. Configure CERTRULE to map Subject CN to SAP username
5. Restart ICM

#### Step 4: Username Mapping (Optional)

If OIDC usernames don't match SAP usernames directly, create a mapping file:

```yaml
# oidc-user-mapping.yaml
alice@company.com: ALICE_DEV
bob.smith@company.com: BSMITH
admin@company.com: SAP_ADMIN
```

```bash
arc1 --oidc-user-mapping oidc-user-mapping.yaml ...
```

Without a mapping file, ARC-1 extracts the username part before `@` and uppercases it:
`alice@company.com` → `ALICE`.

#### Step 5: Username Claim Selection

The JWT claim used to extract the SAP username. Common values:

| Claim | Description | Example Value |
|-------|-------------|---------------|
| `preferred_username` | EntraID display name (default) | `alice@company.com` |
| `upn` | User Principal Name | `alice@company.com` |
| `email` | Email address | `alice@company.com` |
| `sub` | Subject identifier (opaque ID) | `aAbBcC123...` |
| `unique_name` | Legacy Azure AD claim | `alice@company.com` |

**Priority chain:** ARC-1 tries the configured claim first, then falls back through
`preferred_username` → `upn` → `unique_name` → `email` → `sub`.

For email-like claims (`email`, `upn`, `preferred_username`), arc1 automatically
extracts the part before `@` as the username.

---

## Custom CA Certificate

When the SAP system uses a TLS server certificate signed by an internal CA
(not a public CA like Let's Encrypt), arc1 needs the CA certificate to verify
the connection.

```bash
# With any auth method
arc1 --url https://sap-host:443 --user DEV --password pass \
    --ca-cert /path/to/internal-ca.crt

# Environment variable
export SAP_CA_CERT=/path/to/internal-ca.crt
```

This sets the TLS trust store for the SAP connection. It's independent of the
client certificate (which is for authentication).

**Alternative:** Use `--insecure` / `SAP_INSECURE=true` to skip TLS verification
entirely (only for testing, never in production).

---

## Configuration Reference

### All Auth-Related Flags

| Flag | Env Var | Description |
|------|---------|-------------|
| `--api-key` | `ARC1_API_KEY` | Single API key (full scopes) |
| `--api-keys` | `ARC1_API_KEYS` | Multiple API keys with profiles (`key:profile,...`) |
| `--user` | `SAP_USER` | SAP username (basic auth) |
| `--password` | `SAP_PASSWORD` | SAP password (basic auth) |
| `--cookie-file` | `SAP_COOKIE_FILE` | Path to cookie file |
| `--cookie-string` | `SAP_COOKIE_STRING` | Cookie string |
| `--client-cert` | `SAP_CLIENT_CERT` | Client certificate PEM (mTLS) |
| `--client-key` | `SAP_CLIENT_KEY` | Client private key PEM (mTLS) |
| `--ca-cert` | `SAP_CA_CERT` | CA certificate PEM (custom CA) |
| `--service-key` | `SAP_SERVICE_KEY` | BTP service key JSON file |
| `--oauth-url` | `SAP_OAUTH_URL` | OAuth2 token endpoint |
| `--oauth-client-id` | `SAP_OAUTH_CLIENT_ID` | OAuth2 client ID |
| `--oauth-client-secret` | `SAP_OAUTH_CLIENT_SECRET` | OAuth2 client secret |
| `--oidc-issuer` | `SAP_OIDC_ISSUER` | OIDC issuer URL |
| `--oidc-audience` | `SAP_OIDC_AUDIENCE` | Expected token audience |
| `--oidc-username-claim` | `SAP_OIDC_USERNAME_CLAIM` | JWT claim for username |
| `--oidc-user-mapping` | `SAP_OIDC_USER_MAPPING` | Username mapping YAML |
| `--pp-ca-key` | `SAP_PP_CA_KEY` | CA key for principal propagation |
| `--pp-ca-cert` | `SAP_PP_CA_CERT` | CA cert for principal propagation |
| `--pp-cert-ttl` | `SAP_PP_CERT_TTL` | Ephemeral cert validity (default: 5m) |
| `--insecure` | `SAP_INSECURE` | Skip TLS verification |

### Auth Method Priority

Only one authentication method can be active at a time:
1. Basic auth (`--user` + `--password`)
2. Cookie auth (`--cookie-file` or `--cookie-string`)
3. X.509 mTLS (`--client-cert` + `--client-key`)
4. Service Key (`--service-key`)
5. OAuth2 (`--oauth-url` + `--oauth-client-id` + `--oauth-client-secret`)
6. Principal Propagation (`--pp-ca-key` + `--pp-ca-cert`)

OIDC validation (`--oidc-issuer`) is independent — it validates incoming MCP
requests and is typically combined with principal propagation for the SAP connection.

---

## Troubleshooting

### Certificate errors

**"loading client certificate: ..."**
- Verify cert and key are valid PEM format: `openssl x509 -in client.crt -text -noout`
- Verify key matches cert: `openssl x509 -noout -modulus -in client.crt | md5` should equal `openssl rsa -noout -modulus -in client.key | md5`

**"CA certificate file contains no valid PEM certificates"**
- Verify the CA file is PEM-encoded (starts with `-----BEGIN CERTIFICATE-----`)
- Ensure the file contains the full certificate chain if needed

### SAP returns 401 with certificate auth

- Verify the CA is imported in STRUST (correct PSE: SSL Server Standard)
- Verify `login/certificate_mapping_rulebased = 1` is active (`/nRZ11`)
- Verify `icm/HTTPS/verify_client` is `1` or `2` (not `0`)
- Verify CERTRULE has an active rule mapping the certificate's CN
- Check ICM trace: `/nSMICM` → Goto → Trace File → Display End

### OIDC token validation fails

**"key ID not found in JWKS"**
- The token was signed with a key that rotated. JWKS cache refreshes every hour.
- Verify the `--oidc-issuer` URL is correct (must match the `iss` claim)

**"JWT audience mismatch"**
- For Entra ID v2.0 tokens (`requestedAccessTokenVersion: 2`), the `aud` claim is the raw client ID GUID
- For Entra ID v1.0 tokens (default), the `aud` claim is `api://{client-id}`
- Set `SAP_OIDC_AUDIENCE` to match what your tokens actually contain
- Check with: `az account get-access-token --scope "api://{client-id}/access_as_user" --query accessToken -o tsv | jwt decode -` (or paste into jwt.ms)

**"JWT issuer mismatch"**
- EntraID v2.0 issuer format: `https://login.microsoftonline.com/{tenant-id}/v2.0`
- EntraID v1.0 issuer format: `https://sts.windows.net/{tenant-id}/`
- Set `requestedAccessTokenVersion: 2` in the app manifest to get v2.0 tokens

### Power Platform / Copilot Studio OAuth errors

**"AADSTS50011" (Reply address mismatch)**
- Each Power Automate connector generates a unique redirect URI
- Copy the exact URI from the connector's Security tab → Umleitungs-URL
- Add it to the Entra ID app registration under Authentication → Web → Redirect URIs

**"AADSTS90009" (Requesting token for itself, use GUID)**
- When an app requests a token for itself (client ID = resource), the Resource URL must be the raw GUID
- Change Resource URL from `api://...` to just the client ID GUID

**"AADSTS90008" (Must require Microsoft Graph access)**
- Add `User.Read` delegated permission from Microsoft Graph
- Grant admin consent: `az ad app permission admin-consent --id {client-id}`

**"Anmelden nicht möglich" / Login popup opens and closes**
- Verify Tenant ID in the connector is the actual tenant GUID, not `common`
- Verify Resource URL is set (not empty)
- Verify the redirect URI is registered in the app registration

### Principal propagation: SAP rejects ephemeral cert

- Verify the CA cert in STRUST is the same one used with `--pp-ca-cert`
- Verify CERTRULE works: test with a static cert first (Section 4)
- Check ephemeral cert content: `openssl x509 -in /tmp/test.crt -text -noout`
- Enable SAP ICM trace for detailed TLS handshake logging
