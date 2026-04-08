# Phase 3: Principal Propagation Setup

Authenticate each MCP user to SAP with their own identity using ephemeral X.509 certificates. No shared SAP passwords. Full per-user audit trail.

## When to Use

- Enterprise environments requiring per-user SAP authorization
- Compliance/audit requirements (who did what in SAP)
- When different users should have different SAP permissions
- Zero shared credentials architecture

## Architecture

```
┌──────────────────┐     OAuth JWT        ┌──────────────────────────────┐     mTLS (ephemeral cert)   ┌────────────┐
│  MCP Client      │ ──────────────────► │  arc1 Server                  │ ────────────────────────► │  SAP ABAP  │
│  (IDE / Copilot) │                     │                              │   CN=<sap-username>      │  System    │
└──────────────────┘                     │  1. Validate JWT (Phase 2)   │   Signed by trusted CA   │            │
                                         │  2. Extract username          │                          │  STRUST:   │
                                         │  3. Generate ephemeral cert   │                          │   CA cert  │
                                         │  4. mTLS to SAP with cert    │                          │  CERTRULE: │
                                         └──────────────────────────────┘                          │   CN→User  │
                                                                                                    └────────────┘
```

## Prerequisites

- Phase 2 (OAuth/JWT) must be configured first
- SAP admin access for STRUST, CERTRULE, ICM configuration
- OpenSSL for CA certificate generation

## Step 1: Generate CA Key Pair

This CA signs the ephemeral certificates. SAP must trust this CA.

```bash
# Generate CA private key (RSA 2048)
openssl genrsa -out ca.key 2048

# Generate CA certificate (valid 10 years)
openssl req -new -x509 -key ca.key -out ca.crt -days 3650 \
  -subj "/CN=arc1-principal-propagation-ca/O=YourCompany/C=DE"

# Verify
openssl x509 -in ca.crt -text -noout
```

**Security:** Store `ca.key` in a secrets manager (AWS Secrets Manager, Azure Key Vault, HashiCorp Vault). Never commit to version control.

## Step 2: Configure SAP System

### 2a. Import CA Certificate into STRUST

1. Open transaction **`/nSTRUST`**
2. Double-click **SSL server Standard** PSE
3. Switch to Edit mode (pencil icon)
4. Click **Import certificate** (at bottom of screen)
5. Paste the contents of `ca.crt` (PEM format)
6. Click **Add to Certificate List**
7. **Save**

### 2b. Configure ICM Profile Parameters

1. Open transaction **`/nRZ10`**
2. Select the **DEFAULT** profile → Extended Maintenance → Change
3. Add/verify these parameters:

| Parameter | Value | Purpose |
|-----------|-------|---------|
| `icm/HTTPS/verify_client` | `1` | Request client certificate (accept) |
| `login/certificate_mapping_rulebased` | `1` | Enable CERTRULE mapping |

4. **Save** the profile

### 2c. Configure Certificate-to-User Mapping (CERTRULE)

1. Open transaction **`/nCERTRULE`**
2. Switch to Change mode
3. Click **Upload Certificate** → import a sample ephemeral cert:

```bash
# Generate a sample cert to import into CERTRULE
openssl req -new -x509 -key ca.key -out sample.crt -days 1 \
  -subj "/CN=DEVELOPER"
# Upload sample.crt into CERTRULE
```

4. Click **Rule** to create a mapping:
   - **Certificate Entry:** `Subject`
   - **Certificate Attr:** `CN` (Common Name)
   - **Login As:** `ID` (SAP User ID)
5. **Save**

This rule means: any certificate with Subject CN = `DEVELOPER` → log in as SAP user `DEVELOPER`.

### 2d. Restart ICM

1. Open transaction **`/nSMICM`**
2. Go to **Administration** → **ICM** → **Exit Soft** (or **Exit Hard**)
3. Wait for ICM to restart (green status)

### 2e. For Cloud Connector Deployments (Optional)

If SAP is on-premise behind BTP Cloud Connector:

1. **Install system certificate** in Cloud Connector:
   - Cloud Connector Admin UI → Configuration → ON PREMISE → System Certificate
   - Import the CA certificate (`ca.crt`)

2. **Configure trusted reverse proxy** in SAP:
   ```
   icm/trusted_reverse_proxy_0 = SUBJECT="CN=SCC, O=SAP, C=DE", ISSUER="CN=arc1-principal-propagation-ca, O=YourCompany, C=DE"
   ```

3. **Enable principal propagation** in Cloud Connector:
   - Cloud to On-Premises → system mapping → Allow Principal Propagation
   - Principal type: X.509 Certificate

## Step 3: Start arc1 with Principal Propagation

```bash
arc1 --url https://sap.example.com:44300 \
    --transport http-streamable \
    --http-addr 0.0.0.0:8080 \
    --oidc-issuer 'https://login.microsoftonline.com/{tenant-id}/v2.0' \
    --oidc-audience 'api://arc1-sap-connector' \
    --pp-ca-key ca.key \
    --pp-ca-cert ca.crt \
    --pp-cert-ttl 5m \
    --insecure  # Only for testing with self-signed SAP certs
```

### Environment Variables

```bash
export SAP_URL=https://sap.example.com:44300
export SAP_TRANSPORT=http-streamable
export SAP_HTTP_ADDR=0.0.0.0:8080
export SAP_OIDC_ISSUER='https://login.microsoftonline.com/{tenant-id}/v2.0'
export SAP_OIDC_AUDIENCE='api://arc1-sap-connector'
export SAP_PP_CA_KEY=/secrets/ca.key
export SAP_PP_CA_CERT=/secrets/ca.crt
export SAP_PP_CERT_TTL=5m
```

**Note:** No `SAP_USER` or `SAP_PASSWORD` needed! Authentication is entirely via certificates.

## Step 4: Test

```bash
# Get an OAuth token
TOKEN=$(az account get-access-token --resource api://arc1-sap-connector --query accessToken -o tsv)

# Call arc1 — it will generate an ephemeral cert for your user and authenticate to SAP
curl -H "Authorization: Bearer $TOKEN" https://arc1.company.com/mcp \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
```

## How It Works (Per Request)

1. MCP client sends request with `Authorization: Bearer <jwt>`
2. ARC-1 validates JWT signature, issuer, audience, expiry
3. ARC-1 extracts SAP username from JWT claim (e.g., `preferred_username`)
4. ARC-1 generates ephemeral X.509 certificate:
   - Subject CN = SAP username (e.g., `DEVELOPER`)
   - Valid for 5 minutes
   - Signed by the CA key
5. ARC-1 creates a per-request HTTPS client with the ephemeral cert
6. SAP receives the mTLS connection, verifies the cert against STRUST
7. SAP maps Subject CN to SAP user via CERTRULE
8. SAP processes the ADT request as that user
9. Ephemeral cert is discarded (never stored)

## Troubleshooting

### SAP Returns 401

1. **Check STRUST:** Is the CA cert in the SSL Server Standard certificate list?
2. **Check ICM:** Is `icm/HTTPS/verify_client = 1`? (check via `/nSMICM` → Goto → Parameters → Display)
3. **Check CERTRULE:** Does a rule mapping CN → User exist?
4. **Check ICM trace:** Set trace level 2 in SMICM, reproduce the error, check dev_icm trace file
5. **Check user exists:** Does the SAP user matching the CN exist and is unlocked?

### Certificate Mapping Not Working

1. Open transaction **`/nCERTRULE`**
2. Upload the actual ephemeral cert (from arc1 verbose logs) to test the mapping
3. Verify the rule matches

### Cloud Connector Issues

1. Check Cloud Connector logs (All/Payload trace)
2. Verify `icm/trusted_reverse_proxy` parameter matches CC system certificate
3. Ensure principal propagation is enabled in CC access control

## Security Notes

- **CA key is the crown jewel** — protect it like a root password
- Ephemeral certs are valid for only 5 minutes (configurable via `--pp-cert-ttl`)
- RSA-2048 key pair generated per request (~2ms overhead)
- No SAP passwords stored anywhere
- Full audit trail: SAP logs show which user performed each action
- CERTRULE can restrict which usernames are allowed (not just wildcard CN mapping)

## SAP Documentation References

- [Authenticating Users Against On-Premise Systems](https://help.sap.com/docs/connectivity/sap-btp-connectivity-cf/authenticating-users-against-on-premise-systems) — Principal Propagation via Cloud Connector
- [Setting Up Trust Between Identity Provider and SAP](https://help.sap.com/docs/btp/sap-business-technology-platform/principal-propagation) — BTP principal propagation overview
- [STRUST - Trust Manager (SAP Help)](https://help.sap.com/doc/saphelp_nw75/7.5.25/en-us/4c/61a6c6364e11d3963800a0c9e1edf3/frameset.htm) — Importing trusted CA certificates
- [CERTRULE - Rule-Based Certificate Mapping (SAP Note 2275087)](https://me.sap.com/notes/2275087) — Rule-based certificate-to-user mapping
- [ICM Profile Parameters](https://help.sap.com/doc/saphelp_nw75/7.5.25/en-us/48/21f839a44c3d65e10000000a42189c/frameset.htm) — ICM HTTPS client cert parameters
- [Cloud Connector - Principal Propagation](https://help.sap.com/docs/connectivity/sap-btp-connectivity-cf/configuring-principal-propagation) — Cloud Connector principal propagation setup
