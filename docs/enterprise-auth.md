# Enterprise Authentication Guide

This guide documents the authentication options that are currently implemented in ARC-1 (`v0.3.x`).

ARC-1 has two independent authentication hops:

1. **MCP client -> ARC-1** (who can call the MCP endpoint)
2. **ARC-1 -> SAP** (how ARC-1 authenticates to SAP ADT)

---

## 1) MCP Client -> ARC-1

### Option A: No auth (local only)

Use for local `stdio` setups only.

### Option B: API key

```bash
arc1 --transport http-streamable --http-addr 0.0.0.0:8080 --api-key "your-secret"
```

Or:

```bash
export ARC1_API_KEY=your-secret
```

### Option C: OIDC JWT validation (Entra ID, Cognito, Keycloak, ...)

```bash
arc1 --transport http-streamable --http-addr 0.0.0.0:8080 \
  --oidc-issuer "https://login.microsoftonline.com/<tenant-id>/v2.0" \
  --oidc-audience "<expected-audience>"
```

Or:

```bash
export SAP_OIDC_ISSUER="https://login.microsoftonline.com/<tenant-id>/v2.0"
export SAP_OIDC_AUDIENCE="<expected-audience>"
```

Notes:
- `SAP_OIDC_AUDIENCE` must match the token `aud` claim.
- For Entra v2 access tokens, `aud` is often the API application's client ID (GUID). Validate with a real token in your tenant.

### Option D: XSUAA OAuth proxy (BTP Cloud Foundry)

When `SAP_XSUAA_AUTH=true` and an XSUAA service binding is present, ARC-1 exposes OAuth discovery + proxy endpoints for MCP-native clients.

```bash
export SAP_XSUAA_AUTH=true
```

See [Phase 5: XSUAA setup](phase5-xsuaa-setup.md).

---

## 2) ARC-1 -> SAP

ARC-1 supports the following SAP authentication modes.

### Option A: Basic auth (most common for on-prem/dev)

```bash
arc1 --url https://sap-host:44300 --user DEVELOPER --password 'secret'
```

Or:

```bash
export SAP_URL=https://sap-host:44300
export SAP_USER=DEVELOPER
export SAP_PASSWORD='secret'
```

### Option B: Cookie auth

```bash
arc1 --url https://sap-host:44300 --cookie-file ./cookies.txt
# or
arc1 --url https://sap-host:44300 --cookie-string "MYSAPSSO2=...; SAP_SESSIONID_...=..."
```

### Option C: BTP ABAP Environment (service key + browser OAuth)

```bash
export SAP_BTP_SERVICE_KEY_FILE=/path/to/service-key.json
export SAP_SYSTEM_TYPE=btp
arc1
```

ARC-1 opens a browser for OAuth Authorization Code flow and caches tokens.

See [BTP ABAP environment setup](btp-abap-environment.md).

### Option D: BTP Destination Service (shared technical user)

Use on BTP Cloud Foundry when connecting to on-prem SAP through Connectivity + Cloud Connector.

```bash
export SAP_BTP_DESTINATION=SAP_TRIAL
```

Destination values override `SAP_URL` / `SAP_USER` / `SAP_PASSWORD`.

### Option E: Principal propagation via BTP Destination + Cloud Connector

Per-user SAP identity for JWT-authenticated users:

```bash
export SAP_BTP_DESTINATION=SAP_TRIAL
export SAP_BTP_PP_DESTINATION=SAP_TRIAL_PP
export SAP_PP_ENABLED=true
```

Behavior:
- JWT request -> try per-user destination (`SAP_BTP_PP_DESTINATION`)
- If PP fails and `SAP_PP_STRICT=false` -> fallback to shared destination/client
- API key / non-JWT request -> shared destination/client

See [BTP destination setup](btp-destination-setup.md) and [Phase 3 PP setup](phase3-principal-propagation-setup.md).

---

## Supported Config Reference

### MCP auth config

| CLI flag | Env var |
|---|---|
| `--api-key` | `ARC1_API_KEY` |
| `--oidc-issuer` | `SAP_OIDC_ISSUER` |
| `--oidc-audience` | `SAP_OIDC_AUDIENCE` |
| `--xsuaa-auth` | `SAP_XSUAA_AUTH` |

### SAP auth config

| CLI flag | Env var |
|---|---|
| `--url` | `SAP_URL` |
| `--user` | `SAP_USER` |
| `--password` | `SAP_PASSWORD` |
| `--cookie-file` | `SAP_COOKIE_FILE` |
| `--cookie-string` | `SAP_COOKIE_STRING` |
| `--btp-service-key` | `SAP_BTP_SERVICE_KEY` |
| `--btp-service-key-file` | `SAP_BTP_SERVICE_KEY_FILE` |
| `--btp-oauth-callback-port` | `SAP_BTP_OAUTH_CALLBACK_PORT` |
| `--pp-enabled` | `SAP_PP_ENABLED` |
| `--pp-strict` | `SAP_PP_STRICT` |
| *(BTP destination)* | `SAP_BTP_DESTINATION` |
| *(BTP per-user destination)* | `SAP_BTP_PP_DESTINATION` |

---

## What Is Not in `v0.3.x`

These options are **not** available in the current ARC-1 codebase:

- Local SAP mTLS flags like `--client-cert` / `--client-key` / `--ca-cert`
- Generic OAuth SAP flags like `--oauth-url` / `--oauth-client-id` / `--oauth-client-secret`
- Local certificate-generation PP flags like `--pp-ca-key` / `--pp-ca-cert` / `--pp-cert-ttl`
- OIDC username claim/mapping flags like `--oidc-username-claim` / `--oidc-user-mapping`

If you need these, track roadmap items first before documenting/using them in deployment runbooks.

---

## Troubleshooting

### `401` / `403` from ARC-1 on `/mcp`
- Verify `Authorization: Bearer <token>` is present.
- Verify `SAP_OIDC_ISSUER` and `SAP_OIDC_AUDIENCE` match real JWT claims.
- If using API key, confirm exact key match.

### OIDC works locally but not via Copilot Studio
- Ensure the connector redirect URI from Power Platform is registered in Entra app auth settings.
- Ensure tenant-specific issuer is used (not a mismatched tenant).

### Principal propagation always falls back to shared user
- Verify `SAP_PP_ENABLED=true`.
- Verify `SAP_BTP_PP_DESTINATION` authentication type is `PrincipalPropagation`.
- Verify Cloud Connector + backend certificate mapping configuration.

### BTP service key flow does not log in
- Verify service key JSON is valid and includes `uaa.url`, `clientid`, `clientsecret`, and `url`.
- If browser cannot open, copy the logged authorization URL manually.
