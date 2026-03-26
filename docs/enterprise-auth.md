# Enterprise Authentication Guide

This document describes the authentication methods available in arc1 for connecting
to SAP ABAP systems. It covers setup, configuration, and SAP-side requirements
for each method.

For centralized deployments (arc1 as a shared server), also see the phased setup guides:

- [Phase 1: API Key Authentication](phase1-api-key-setup.md) — Shared token, simplest setup
- [Phase 2: OAuth / JWT Authentication](phase2-oauth-setup.md) — OIDC identity with auto-discovery
- [Phase 3: Principal Propagation](phase3-principal-propagation-setup.md) — Per-user SAP auth via ephemeral certs
- [Phase 4: BTP Cloud Foundry Deployment](phase4-btp-deployment.md) — XSUAA + Destination Service
- [Auth Test Process](auth-test-process.md) — Step-by-step verification for each phase

---

## Authentication Methods Overview

| Method | Use Case | Security Level | SAP-Side Setup |
|--------|----------|---------------|----------------|
| **API Key** | Shared server, POC | Low (shared token) | None |
| **Basic auth** | Local dev, POC | Low (password in config) | None |
| **Cookie auth** | Reuse browser session | Low (manual, expires) | None |
| **OAuth2/XSUAA** | BTP/Cloud systems | Medium (service-to-service) | Service key in BTP cockpit |
| **X.509 mTLS** | Enterprise, cert-based SSO | High (no password) | STRUST + CERTRULE |
| **OIDC + Principal Propagation** | Multi-user enterprise | Highest (zero stored credentials) | STRUST + CERTRULE + EntraID |

**Rule: only one SAP auth method at a time.** ARC-1 validates this at startup.
MCP client auth (API Key or OIDC) is independent and can be combined with any SAP auth method.

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
