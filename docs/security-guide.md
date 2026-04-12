# Security Best Practices Guide

A consolidated security reference for ARC-1 operators. This guide covers hardening, authentication, authorization, and incident response. It references detailed setup guides where appropriate rather than duplicating their content.

---

## 1. Security Architecture Overview

ARC-1 enforces authorization at two independent layers. Both must allow an operation for it to succeed.

| Layer | What it checks | Controlled by |
|-------|---------------|---------------|
| **ARC-1 (Layer 1)** | Scopes from JWT + server safety config | ARC-1 administrator |
| **BTP / IAS (Layer 2)** | XSUAA scopes and role collections (or IAS groups) assigned to users | BTP administrator via BTP Cockpit |
| **SAP (Layer 3)** | SAP authorization objects (S_DEVELOP, S_ADT_RES, etc.) | SAP Basis / role admin |

Checks are additive: scope check AND safety check AND SAP authorization must all pass. If any layer blocks, the operation fails. The server safety config acts as a hard ceiling — BTP role collections (XSUAA) or IAS group mappings determine which scopes a user receives, and per-user scopes can only restrict further, never expand beyond the server config. Layer 2 only applies when running on BTP with XSUAA or IAS authentication; for self-hosted OIDC deployments, scopes come directly from the JWT claims.

For the full two-layer model, scope definitions, and role assignment details, see [Authorization & Roles](authorization.md).

---

## 2. Authentication Methods and When to Use Each

| Scenario | Transport | MCP Client Auth | Recommended Guide |
|----------|-----------|----------------|-------------------|
| Local development (single user) | stdio | None | [Setup Guide](setup-guide.md) |
| Shared server (single access level) | HTTP | Single API key | [API Key Setup](api-key-setup.md) |
| Team server (role-based access) | HTTP | Multiple API keys with profiles | [API Key Setup](api-key-setup.md) |
| Enterprise (per-user identity) | HTTP | OIDC / JWT | [OAuth / JWT Setup](oauth-jwt-setup.md) |
| Enterprise + SAP audit trail | HTTP | OIDC / JWT + Principal Propagation | [OAuth / JWT](oauth-jwt-setup.md) + [PP Setup](principal-propagation-setup.md) |
| BTP Cloud Foundry | HTTP | XSUAA OAuth | [XSUAA Setup](xsuaa-setup.md) |

When XSUAA is enabled, all three auth methods are active in a fallback chain: XSUAA first, then OIDC, then API key. This allows coexistence of BTP users, external IdP users, and service accounts.

For the full decision guide and common combinations, see [Authentication Overview](enterprise-auth.md).

---

## 3. OIDC/JWT Configuration Checklist

When using an external identity provider (Entra ID, Okta, Keycloak, etc.), configure these environment variables or CLI flags:

| Variable / Flag | Required | Description |
|----------------|----------|-------------|
| `SAP_OIDC_ISSUER` / `--oidc-issuer` | **Yes** | OIDC issuer URL. Must match the `iss` claim in tokens. |
| `SAP_OIDC_AUDIENCE` / `--oidc-audience` | **Yes** | Expected `aud` claim value. For Entra ID v2.0, this is the raw client ID GUID. For v1.0, it is `api://{client-id}`. |
| `SAP_OIDC_CLOCK_TOLERANCE` / `--oidc-clock-tolerance` | No | Clock skew tolerance in seconds for `exp`/`nbf` validation. Default: 0. Useful when server and IdP clocks drift. |

Verification checklist:

- [ ] `SAP_OIDC_ISSUER` matches the `iss` claim in your tokens exactly (trailing slashes matter).
- [ ] `SAP_OIDC_AUDIENCE` matches the `aud` claim in your tokens (decode a token at jwt.ms to verify).
- [ ] The OIDC provider includes ARC-1 scopes (`read`, `write`, `data`, `sql`) in the `scope` or `scp` claim. Tokens without scope claims default to read-only access.
- [ ] The JWKS endpoint at `{issuer}/.well-known/openid-configuration` is reachable from the ARC-1 server.
- [ ] TLS certificates on the issuer URL are valid (no self-signed certs without `--insecure`).

ARC-1 validates tokens per the OAuth 2.0 Protected Resource model (RFC 9700): signature verification via JWKS, issuer match, audience match, and expiration check.

---

## 4. API Key Security

### Key Generation

Always use cryptographically random keys with sufficient entropy:

```bash
openssl rand -base64 32
```

### Per-Key Profiles

Use `--api-keys` (not `--api-key`) to assign each key a profile with specific scopes and safety restrictions. This avoids giving all key holders the same access level.

```bash
arc1 --api-keys "$VIEWER_KEY:viewer,$DEV_KEY:developer,$SQL_KEY:developer-sql"
```

### Key Rotation

- Rotate keys on a regular schedule (quarterly recommended) and immediately upon suspected compromise.
- Multi-key mode allows rolling rotation: add the new key, distribute it, then remove the old key.
- Audit logs include the profile name (e.g., `api-key:viewer`) to identify which key was used, aiding in compromise investigation.
- API key rotation requires updating all clients that use the affected key.

### Limitations

API keys identify roles, not individuals. They do not support per-user SAP audit trails. For user-level identity, use OIDC or XSUAA.

For full setup instructions, see [API Key Setup](api-key-setup.md).

---

## 5. Safety Configuration Best Practices

### Recommended Production Settings

| Setting | Recommended Value | Why |
|---------|------------------|-----|
| `--read-only` | `true` for production systems | Prevents any write operations through ARC-1 |
| `--block-free-sql` | `true` for sensitive systems | Blocks arbitrary SQL queries against the database |
| `--block-data` | `true` unless table preview is required | Prevents named table content preview |
| `--allowed-packages` | `Z*,Y*,$TMP` | Restricts write operations (create, update, delete) to custom code packages (defaults to `$TMP` if not set). Read operations are not restricted by package. |
| `--pp-strict` | `true` when PP is enabled | Rejects requests without user identity (no fallback to shared account) |
| `--enable-transports` | `false` unless needed | Transport management is opt-in |

### Profile Reference

Profiles are safety presets that combine multiple flags. Use `--profile` to apply one:

| Profile | Read-only | Block Data | Block SQL | Transports | Packages | Scopes Granted |
|---------|-----------|------------|-----------|------------|----------|----------------|
| `viewer` | Yes | Yes | Yes | No | — | `read` |
| `viewer-data` | Yes | No | Yes | No | — | `read`, `data` |
| `viewer-sql` | Yes | No | No | No | — | `read`, `data`, `sql` |
| `developer` | No | Yes | Yes | Yes | `$TMP` | `read`, `write` |
| `developer-data` | No | No | Yes | Yes | `$TMP` | `read`, `write`, `data` |
| `developer-sql` | No | No | No | Yes | `$TMP` | `read`, `write`, `data`, `sql` |

Individual flags override profile defaults. The server safety config is always the ceiling -- per-user scopes from JWT tokens can only restrict further.

---

## 6. Scope Implications

ARC-1 scopes have transitive grants that operators should understand:

| Scope assigned | Scopes effectively granted | Reason |
|---------------|---------------------------|--------|
| `write` | `write` + `read` | A developer who can write can also read |
| `sql` | `sql` + `data` | A user who can run freestyle SQL can also preview tables |
| `read` | `read` only | No transitive grants |
| `data` | `data` only | No transitive grants |

This means:

- Assigning `write` without `read` is unnecessary -- `write` already includes `read`.
- Assigning `sql` without `data` is unnecessary -- `sql` already includes `data`.
- Assigning `data` does NOT grant `read` (source code access) -- these are independent dimensions.

The scope model separates two dimensions: **objects** (source code: `read`/`write`) and **data** (table contents: `data`/`sql`). A developer may need full source code access without being able to query production data, and vice versa.

---

## 7. Reverse Proxy Requirements

When deploying ARC-1 behind a reverse proxy (nginx, HAProxy, Traefik, etc.) outside of Cloud Foundry:

| Requirement | Details |
|-------------|---------|
| **TLS termination** | Terminate TLS at the proxy. ARC-1's HTTP listener does not handle TLS natively. |
| **Header sanitization** | Strip or overwrite `X-Forwarded-For`, `X-Forwarded-Proto`, and `X-Forwarded-Host` from incoming requests to prevent spoofing. Only the proxy should set these. |
| **Proxy headers** | Forward `Host`, `X-Real-IP`, and `X-Forwarded-For` to ARC-1 for accurate logging. |
| **Health check** | Expose `/health` without authentication for load balancer probes. |
| **Timeouts** | Set proxy read/write timeouts to at least 120 seconds. Some ADT operations (activation, unit tests) can take 30-60 seconds. |
| **Request size** | Allow request bodies up to at least 10 MB for large source code writes. |

Example nginx configuration is provided in the [API Key Setup](api-key-setup.md#behind-a-reverse-proxy-nginx) guide.

---

## 8. BTP-Specific Security

### XSUAA Role Collections

Scopes are assigned to BTP users via role templates and role collections in the BTP Cockpit. The five scopes (`read`, `write`, `data`, `sql`, `admin`) map to role templates (MCPViewer, MCPDeveloper, MCPDataViewer, MCPSqlUser, MCPAdmin) that are combined into role collections for assignment.

### Principal Propagation

When `SAP_PP_ENABLED=true`, each MCP user's JWT identity flows through to SAP via Cloud Connector or mTLS. SAP sees the real user identity for authorization checks and audit logging. Use `SAP_PP_STRICT=true` in production to reject requests without user identity.

### Destination Service

BTP Destination Service centralizes SAP connection details and credentials. ARC-1 resolves the destination at runtime. Use `SAP_BTP_DESTINATION` for shared-user destinations and `SAP_BTP_PP_DESTINATION` for principal propagation destinations.

If Cloud Connector uses path-level allowlists, include non-ADT OData routes needed by ARC-1 features, especially:
- `/sap/opu/odata/UI2/PAGE_BUILDER_CUST` for FLP launchpad management (`SAPManage` FLP actions)
- `/sap/opu/odata/UI5/ABAP_REPOSITORY_SRV` for UI5 ABAP Repository metadata reads

For detailed setup instructions:

- [XSUAA Setup](xsuaa-setup.md) -- role templates, role collections, xs-security.json
- [Principal Propagation Setup](principal-propagation-setup.md) -- Cloud Connector, CERTRULE, mTLS
- [BTP Destination Setup](btp-destination-setup.md) -- Destination Service configuration
- [Authorization & Roles: XSUAA Roles](authorization.md#xsuaa-roles-btp-deployments) -- role-to-scope mapping

---

## 9. Audit Logging

ARC-1 emits structured audit events to all registered sinks. Three sink types are available:

| Sink | Activation | Output |
|------|-----------|--------|
| **Stderr** | Always active | JSON lines to stderr |
| **File** | Set `--log-file` / `ARC1_LOG_FILE` | JSON lines appended to a file |
| **BTP Audit Log** | Auto-detected from `VCAP_SERVICES` (requires `auditlog` premium plan) | Events sent to BTP Audit Log Service v2 API |

### What Gets Logged

| Event | Description |
|-------|-------------|
| `tool_call_start` | Tool name, arguments, user, client ID |
| `tool_call_end` | Duration, success/error status, error class, result size |
| `http_request` | HTTP method, ADT path, status code, duration |
| `http_csrf_fetch` | CSRF token fetch success/duration |
| `scope_denied` | Scope check failure (tool, required scope, user scopes) |
| `elicitation` | User confirmation prompts and responses |

All events within a single MCP tool call share a `requestId` for correlation. Events include `user` and `clientId` fields when authentication is active.

### Retention

- **File sink**: Retention is the operator's responsibility. Implement log rotation (e.g., logrotate) for long-running deployments.
- **BTP Audit Log**: Retention is managed by the BTP Audit Log Service per the service plan.
- **Stderr**: Transient unless captured by a container runtime or log aggregator.

---

## 10. Secrets Management

The following files and values must never be committed to version control:

| Secret | Storage Recommendation |
|--------|----------------------|
| `.env` files | Listed in `.gitignore`. Use environment variables or mounted files in production. |
| SAP passwords (`SAP_PASSWORD`) | Inject via environment variable, secrets manager, or `cf set-env`. |
| API keys (`ARC1_API_KEY`, `ARC1_API_KEYS`) | Store in a secrets manager (Vault, AWS Secrets Manager, Azure Key Vault). |
| BTP service keys (`SAP_BTP_SERVICE_KEY`) | Use `SAP_BTP_SERVICE_KEY_FILE` pointing to a mounted secret, not inline JSON. |
| Cookie files (`cookies.txt`) | Listed in `.gitignore`. Ephemeral by nature. |
| PP CA private key (`SAP_PP_CA_KEY`) | Store in HSM or secrets manager. This is the root of trust for principal propagation. |
| Client certificate keys (`SAP_CLIENT_KEY`) | Mount as a file with restricted permissions (0600). |

In containerized deployments, prefer mounted secrets (Kubernetes Secrets, CF user-provided services) over environment variables, as environment variables may appear in process listings or crash dumps.

---

## 11. Network Security

### OAuth Callback Server

The OAuth callback server (used for BTP ABAP browser login) binds exclusively to `127.0.0.1`. It is not reachable from the network. This prevents network-adjacent attackers from intercepting the OAuth authorization code.

### HTTP Streamable Transport

When ARC-1 runs with `--transport http-streamable`, the default bind address is `0.0.0.0:8080`. In production:

- Always place ARC-1 behind a TLS-terminating reverse proxy or load balancer.
- Restrict network access using firewall rules, security groups, or VPN.
- Without `--api-key`, `--api-keys`, or `--oidc-issuer`, the HTTP endpoint is open to anyone who can reach the port.

### SAP Connection

- Use HTTPS for the SAP connection (`SAP_URL=https://...`) whenever possible.
- Avoid `--insecure` / `SAP_INSECURE=true` in production. If SAP uses an internal CA, configure it at the OS/Node.js level (`NODE_EXTRA_CA_CERTS` environment variable).
- BTP deployments route through Cloud Connector, which handles TLS termination to the on-premise SAP system.

---

## 12. Incident Response

### API Key Compromise

1. **Rotate immediately**: Remove the compromised key from `ARC1_API_KEYS` and restart ARC-1.
2. **Review audit logs**: Search for events with the compromised key's profile to assess the blast radius. Look for `tool_call_start` and `tool_call_end` events.
3. **Generate a new key**: `openssl rand -base64 32`. Distribute to legitimate users.
4. **Check for damage**: If the key had write access, review recent transport requests and object modifications in the SAP system (SM21, STMS).

### BTP Service Key Compromise

1. **Regenerate in BTP Cockpit**: Delete the compromised service key and create a new one.
2. **Update ARC-1 config**: Deploy the new service key file and restart.
3. **Review BTP audit logs**: Check for unauthorized access via the compromised credentials.

### JWT / OIDC Token Compromise

1. **Revoke at the IdP**: Disable the compromised user account or rotate the signing keys at the identity provider.
2. **Short-lived tokens limit exposure**: JWT tokens typically expire in minutes to hours. Verify your IdP's token lifetime configuration.
3. **Check ARC-1 audit logs**: Correlate the user's identity across `tool_call_start` events.
4. **If PP was active**: The attacker may have acted as the user in SAP. Check SAP security audit log (SM20) for the user's actions.

### PP CA Key Compromise

This is the most critical compromise scenario -- the CA key can mint certificates for any SAP user.

1. **Revoke the CA immediately**: Remove the CA certificate from SAP STRUST.
2. **Generate a new CA**: Create a new key pair and import the new certificate into STRUST.
3. **Update ARC-1**: Deploy the new CA key and certificate.
4. **Audit all SAP activity**: Review SM20 for all users during the compromise window.
