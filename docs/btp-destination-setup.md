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

### Step 1: Create a Dual-Destination Setup

The recommended approach uses **two destinations** — one for the shared service account and one for per-user PP:

**Destination 1: `SAP_TRIAL` (BasicAuth — shared client)**

| Property | Value |
|----------|-------|
| **Name** | `SAP_TRIAL` |
| **Type** | HTTP |
| **URL** | `http://a4h-abap:50000` (CC virtual host, HTTP) |
| **Proxy Type** | OnPremise |
| **Authentication** | BasicAuthentication |
| **User** | `DEVELOPER` |
| **Password** | `<password>` |
| `sap-client` | `001` |

This destination is resolved at startup and used as the fallback for API key auth and when PP fails.

**Destination 2: `SAP_TRIAL_PP` (PrincipalPropagation — per-user)**

| Property | Value |
|----------|-------|
| **Name** | `SAP_TRIAL_PP` |
| **Type** | HTTP |
| **URL** | `http://a4h-abap:50001` (CC virtual host, HTTPS port) |
| **Proxy Type** | OnPremise |
| **Authentication** | PrincipalPropagation |
| **User** | *(leave empty)* |
| **Password** | *(leave empty)* |
| `sap-client` | `001` |

This destination is used per-request when an authenticated user's JWT is available.

> **Why two destinations?** A PrincipalPropagation destination has no User/Password. If ARC-1 only had one PP destination, API key users and unauthenticated health checks would fail because the shared client has no credentials. The dual-destination approach ensures backward compatibility.

> **Why port 50001 for PP?** The Cloud Connector needs an HTTPS system mapping with `X509_GENERAL` auth mode for PP. Port 50001 is the SAP HTTPS port. The HTTP mapping (50000) uses `NONE_RESTRICTED` auth which doesn't support PP.

### Step 2: Configure Cloud Connector

These steps were validated on SAP Cloud Connector 2.x:

#### 2a. Generate System Certificate

Cloud Connector Admin UI → **Configuration → On-Premises** tab:

1. Under **System Certificate**, click **"Create and use a self-signed certificate"** icon
2. Fill in: `CN=a4h-cloudconnector, OU=ARC1, O=MZ, C=DE` (or your org details)
3. Click Create

Or via CC REST API:
```bash
curl -sk -u Administrator:<password> -X POST \
  -H "Content-Type: application/json" \
  -d '{"type":"selfsigned","subjectDN":"CN=a4h-cloudconnector, OU=ARC1, O=MZ, C=DE","keySize":2048}' \
  https://localhost:8443/api/v1/configuration/connector/onPremise/systemCertificate
```

#### 2b. Generate CA Certificate

Cloud Connector Admin UI → **Configuration → On-Premises** tab:

1. Scroll to **CA Certificate** section
2. Click **"Create and use a self-signed certificate"** icon
3. Fill in: `CN=SCC-CA-a4h, OU=ARC1, O=MZ, C=DE`
4. Key size: 4096 bits (recommended)
5. Click Create

This CA will sign the short-lived X.509 certificates for each propagated user.

#### 2c. Export the CA Certificate

1. In the CA Certificate section, click the **Download** icon
2. Save as `ca_cert.der` — you'll import this into SAP's STRUST

#### 2d. Add HTTPS System Mapping

Cloud Connector Admin UI → **Cloud to On-Premise → Access Control**:

1. Add a new system mapping:
   - **Virtual Host**: `a4h-abap`
   - **Virtual Port**: `50001`
   - **Internal Host**: `localhost`
   - **Internal Port**: `50001`
   - **Protocol**: `HTTPS`
   - **Back-end Type**: ABAP System
   - **Authentication Mode**: `X509_GENERAL`
2. Add resource `/` with all sub-paths enabled

Or via CC REST API:
```bash
curl -sk -u Administrator:<password> -X POST \
  -H "Content-Type: application/json" \
  -d '{"virtualHost":"a4h-abap","virtualPort":50001,"localHost":"localhost","localPort":50001,"protocol":"HTTPS","backendType":"abapSys","authenticationMode":"X509_GENERAL","sid":"A4H","hostInHeader":"INTERNAL"}' \
  "https://localhost:8443/api/v1/configuration/subaccounts/<region>/<subaccount>/systemMappings"
```

#### 2e. Configure Subject Pattern

Cloud Connector Admin UI → **Configuration → On-Premises** → scroll to **Principal Propagation → Subject Pattern Rules**:

- Add rule: `CN=${name}` (maps the user's login name to the cert CN)

#### 2f. Backend Trust Store

Set **"Determining Trust Through Allowlist"** to **OFF** (trusts all backend certs). This is acceptable when your SAP system uses self-signed certificates.

### Step 3: Configure SAP Backend

#### 3a. Import CC CA Certificate into STRUST

The Cloud Connector's CA certificate must be imported into SAP's SSL Server PSE so SAP trusts the short-lived PP certificates.

**Via CLI** (recommended — no SAP GUI needed):
```bash
# Convert DER to PEM
openssl x509 -inform DER -in ca_cert.der -out ca_cert.pem

# Import into SAPSSLS.pse
sapgenpse maintain_pk -p /usr/sap/<SID>/<INSTANCE>/sec/SAPSSLS.pse -a ca_cert.pem
```

Example for SID=A4H, instance=D00:
```bash
su - a4hadm -c "sapgenpse maintain_pk -p /usr/sap/A4H/D00/sec/SAPSSLS.pse -a /tmp/ca_cert.pem"
```

Verify with:
```bash
su - a4hadm -c "sapgenpse maintain_pk -p /usr/sap/A4H/D00/sec/SAPSSLS.pse -l"
```

**Via SAP GUI** (alternative):
1. Transaction **STRUST**
2. Expand **SSL Server Standard** → double-click your instance
3. Click **Import** (📥), browse to `ca_cert.der`
4. Click **Add to Certificate List**
5. Click **Save**

#### 3b. Verify ICM Profile Parameters

These must be set in the SAP instance profile (`DEFAULT.PFL` or instance profile):

```ini
icm/HTTPS/verify_client = 1          # Request client certificates
login/certificate_mapping_rulebased = 1   # Enable rule-based cert mapping
login/certificate = 1                    # Enable certificate login
login/certificate_mapping = 1            # Enable cert-to-user mapping
```

Check current values:
```bash
grep -E "certificate|icm/HTTPS" /sapmnt/<SID>/profile/DEFAULT.PFL
```

#### 3c. Create Certificate-to-User Mapping (CERTRULE)

Transaction **SM30**, view **VUSREXTID**:

1. Click **New Entries**
2. **External ID type**: leave empty (default DN)
3. **External ID**: `CN=DEVELOPER` (must match the Subject Pattern — `CN=${name}` generates `CN=<username>`)
4. **Seq. No.**: `000`
5. **User**: `DEVELOPER`
6. **Activated**: checked ✅
7. Save

> **Important:** The External ID must match **exactly** what the Cloud Connector generates. With Subject Pattern `CN=${name}`, the cert subject is just `CN=<username>` — NOT `CN=<username>, OU=ARC1, O=MZ, C=DE`. The OU/O/C are in the **issuer** (CA cert), not the **subject**.

> **Known issue:** Transaction `CERTRULE` may dump with `STRING_OFFSET_TOO_LARGE` (CX_SY_RANGE_OUT_OF_BOUNDS in SAPLSUSR_CERTRULE). Use `SM30` with view `VUSREXTID` as a workaround.

Repeat for each SAP user that will be used via PP. Create one entry per user.

#### 3d. Restart ICM

After all changes, restart ICM to pick up the updated certificates:

```bash
# Via sapcontrol (soft restart, no full SAP restart needed)
su - <sid>adm -c "sapcontrol -nr <instance_nr> -function RestartService"
```

Or via SAP GUI: Transaction **SMICM** → Administration → ICM → Soft Restart.

### Step 4: Enable PP in ARC-1

```bash
# Set the dual-destination config
cf set-env arc1-mcp-server SAP_BTP_DESTINATION SAP_TRIAL        # BasicAuth (shared)
cf set-env arc1-mcp-server SAP_BTP_PP_DESTINATION SAP_TRIAL_PP  # PP (per-user)
cf set-env arc1-mcp-server SAP_PP_ENABLED true
cf set-env arc1-mcp-server SAP_XSUAA_AUTH true
cf restage arc1-mcp-server
```

Or in `manifest.yml`:

```yaml
env:
  SAP_BTP_DESTINATION: "SAP_TRIAL"
  SAP_BTP_PP_DESTINATION: "SAP_TRIAL_PP"
  SAP_PP_ENABLED: "true"
  SAP_XSUAA_AUTH: "true"
```

### Step 5: Graceful Fallback

When `SAP_PP_ENABLED=true`:
- If the user has a valid JWT (XSUAA/OIDC, 3 dot-separated parts) → per-user ADT client via `SAP_BTP_PP_DESTINATION`
- If PP fails (destination error, missing user mapping, etc.) → falls back to shared service account via `SAP_BTP_DESTINATION`
- If no JWT available (API key auth, stdio) → uses shared service account
- API key tokens are detected as non-JWT and skip PP entirely (no wasted API calls)

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
| `SAP_BTP_DESTINATION` | BTP Destination name (BasicAuth, startup) | *(none)* |
| `SAP_BTP_PP_DESTINATION` | BTP Destination name (PP, per-user) | Falls back to `SAP_BTP_DESTINATION` |
| `SAP_PP_ENABLED` / `--pp-enabled` | Enable principal propagation | `false` |
| `SAP_XSUAA_AUTH` / `--xsuaa-auth` | Enable XSUAA OAuth proxy | `false` |
| `SAP_URL` / `--url` | Direct SAP URL (overridden by destination) | *(none)* |
| `SAP_USER` / `--user` | Direct SAP user (overridden by destination/PP) | *(none)* |
| `SAP_PASSWORD` / `--password` | Direct SAP password (overridden by destination/PP) | *(none)* |

**Priority:** PP per-user > BTP Destination > env vars.

**SAP Reference:** [Authenticating Users against On-Premise Systems](https://help.sap.com/docs/connectivity/sap-btp-connectivity-cf/authenticating-users-against-on-premise-systems)
