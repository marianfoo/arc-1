# Deployment

Running ARC-1 for more than one person — shared team server, BTP Cloud Foundry, or a hosted instance that multiple MCP clients hit.

For single-developer setups on your own laptop, use [local-development.md](local-development.md) instead.

---

## Decision tree

**Who authenticates to SAP?**

| Answer | SAP auth to pick | Per-user SAP audit? |
|---|---|---|
| Everyone shares a service account | Basic Auth | ❌ Shared identity |
| Destination Service resolves it (on-prem via Cloud Connector) | BTP Destination | Depends on destination type |
| Destination uses `PrincipalPropagation` + Cloud Connector | **Principal Propagation** | ✅ Per-user |
| BTP ABAP Environment (Steampunk) | BTP service-key OAuth | Per-user via jwt-bearer |

**Who authenticates to ARC-1 (the MCP endpoint)?**

| Answer | MCP auth to pick |
|---|---|
| Everyone shares one token | API Key |
| IdP-issued JWT (Entra ID, Okta, Keycloak, Cognito, …) | OIDC |
| Running on BTP CF with XSUAA | XSUAA OAuth |
| Mix of the above | All three — they chain, see [enterprise-auth.md](enterprise-auth.md#coexistence-matrix) |

**Where does ARC-1 run?**

| Answer | Path |
|---|---|
| Docker on any VM / container host | [Docker deployment](#docker-on-any-vm) |
| BTP Cloud Foundry, on-prem SAP via Cloud Connector | [BTP CF with PP](#btp-cloud-foundry-with-principal-propagation) |
| BTP Cloud Foundry, BTP ABAP backend | [BTP CF + BTP ABAP](#btp-cloud-foundry--btp-abap-environment) |

---

## Docker on any VM

Run the published image on any host with Docker. Works for on-prem SAP reachable from the host, or BTP ABAP if the host can route to `*.abap.*.hana.ondemand.com`.

### Shared service account + API Key

```bash
docker run -d --name arc1 -p 8080:8080 \
  -e SAP_URL=https://your-sap-host:44300 \
  -e SAP_USER=SVC_ARC1 -e SAP_PASSWORD=... \
  -e SAP_CLIENT=100 \
  -e ARC1_API_KEY=$(openssl rand -hex 32) \
  -e ARC1_PROFILE=developer \
  -e SAP_ALLOWED_PACKAGES='Z*,$TMP' \
  ghcr.io/marianfoo/arc-1:latest
```

MCP clients pass `Authorization: Bearer <api-key>` when connecting to `http://host:8080/mcp`.

### Shared service account + per-user OIDC

Adds per-user identity on top of ARC-1 (Layer A) while still sharing one SAP user (Layer B):

```bash
docker run -d --name arc1 -p 8080:8080 \
  -e SAP_URL=https://your-sap-host:44300 \
  -e SAP_USER=SVC_ARC1 -e SAP_PASSWORD=... \
  -e SAP_OIDC_ISSUER=https://login.microsoftonline.com/{tenant}/v2.0 \
  -e SAP_OIDC_AUDIENCE=api://arc1 \
  ghcr.io/marianfoo/arc-1:latest
```

ARC-1 audit logs show the real MCP user; SAP audit logs show the shared service account. Trade-off — good compromise when you can't use PP.

**Full references:**
- [docker.md](docker.md) — image tags, build, ports, troubleshooting
- [api-key-setup.md](api-key-setup.md) — single / multi-key, profiles
- [oauth-jwt-setup.md](oauth-jwt-setup.md) — OIDC with Entra ID / Okta / Keycloak
- [security-guide.md](security-guide.md) — production hardening checklist

---

## BTP Cloud Foundry with Principal Propagation

The only deployment path that gives **true per-user SAP identity** with on-prem SAP. Each MCP user's JWT is exchanged for a SAML assertion via Cloud Connector → SAP sees the real user → S_DEVELOP / audit logs / change history all attribute to the human.

### You'll need

- BTP subaccount with a Cloud Foundry space
- Cloud Connector installed in your network, mapping your on-prem SAP
- BTP Destination Service with a destination of type `HTTP` + authentication `PrincipalPropagation`
- BTP XSUAA for MCP client auth
- Optional: BTP Audit Log Service

### Shape

```
MCP client (user JWT) → XSUAA validates → ARC-1 on CF
                                              │
                                              ▼
                                    Destination Service (PP)
                                              │
                                              ▼
                                     Cloud Connector
                                              │
                                              ▼
                                   On-prem SAP (real user)
```

### Config

```bash
cf set-env arc1 SAP_BTP_DESTINATION MY_SAP_DESTINATION
cf set-env arc1 SAP_BTP_PP_DESTINATION MY_SAP_PP_DESTINATION
cf set-env arc1 SAP_PP_ENABLED true
cf set-env arc1 SAP_XSUAA_AUTH true
cf set-env arc1 ARC1_PROFILE developer
cf set-env arc1 SAP_ALLOWED_PACKAGES 'Z*'
```

Startup summary:

```
INFO: auth: MCP=[xsuaa] SAP=pp (per-user)
```

**Full references:**
- [phase4-btp-deployment.md](phase4-btp-deployment.md) — MTA + Docker push, `manifest.yml`, service bindings, step-by-step
- [principal-propagation-setup.md](principal-propagation-setup.md) — Cloud Connector config, destination types, certificate chain
- [btp-destination-setup.md](btp-destination-setup.md) — destination configuration details
- [xsuaa-setup.md](xsuaa-setup.md) — `xs-security.json`, scopes, role collections

---

## BTP Cloud Foundry + BTP ABAP Environment

ARC-1 deployed on CF, backend is a BTP ABAP (Steampunk) system. No Cloud Connector needed — both sides are on BTP.

SAP auth is **OAuth2 via the BTP ABAP service key**. For per-user identity, ARC-1 performs a `jwt-bearer` token exchange against the XSUAA tenant — the MCP user's JWT becomes a SAP user token.

```bash
cf create-service xsuaa application arc1-xsuaa -c xs-security.json
cf create-service-key <abap-env-instance> arc1-sk
cf set-env arc1 SAP_BTP_SERVICE_KEY_FILE /app/service-key.json
cf set-env arc1 SAP_SYSTEM_TYPE btp
cf set-env arc1 SAP_XSUAA_AUTH true
```

**Full reference:** [btp-abap-environment.md](btp-abap-environment.md).

---

## Hardening checklist

For any deployment visible to a network, before you open the gate:

- [ ] TLS terminated by a reverse proxy or platform (never HTTP on a public port)
- [ ] `ARC1_API_KEY` or OIDC / XSUAA configured — never run HTTP mode without Layer A auth
- [ ] `SAP_READ_ONLY=true` unless you've deliberately enabled writes
- [ ] `SAP_ALLOWED_PACKAGES` set to a specific allowlist, not `*`
- [ ] `SAP_BLOCK_DATA=true` and `SAP_BLOCK_FREE_SQL=true` unless you need them
- [ ] `SAP_ENABLE_TRANSPORTS=false` unless you need CTS management
- [ ] If using cookies: `SAP_PP_ENABLED=true` and cookies both set? → refuses unless `SAP_PP_ALLOW_SHARED_COOKIES=true` escape hatch is explicit
- [ ] Audit log sink configured (file or BTP Audit Log Service)
- [ ] Image pinned to an exact version (`:0.7.0`), not `:latest`
- [ ] Update procedure rehearsed → [updating.md](updating.md)

Full production hardening guide: [security-guide.md](security-guide.md).

---

## Coexistence rules

ARC-1 fails fast at startup on unsafe combinations. See the [Coexistence Matrix](enterprise-auth.md#coexistence-matrix) for the full table. The ones that most often bite:

| Combo | Result |
|---|---|
| `SAP_PP_ENABLED=true` + `SAP_COOKIE_FILE` / `SAP_COOKIE_STRING` | ❌ startup error (unless `SAP_PP_ALLOW_SHARED_COOKIES=true`) |
| `SAP_BTP_SERVICE_KEY` + cookies | ❌ startup error |
| `SAP_BTP_SERVICE_KEY` + `SAP_PP_ENABLED=true` | ❌ startup error |
| `SAP_DISABLE_SAML=true` + BTP | ⚠️ warning, continues (will break BTP ABAP / S/4 Public Cloud) |

---

## Next

- **All flags** → [configuration-reference.md](configuration-reference.md)
- **Auth internals** → [enterprise-auth.md](enterprise-auth.md)
- **Update an existing deployment** → [updating.md](updating.md)
- **Best practices for multi-system landscapes** → [deployment-best-practices.md](deployment-best-practices.md)
