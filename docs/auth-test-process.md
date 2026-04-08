# Authentication Test Process

Use this checklist after deployment changes to verify ARC-1 authentication end-to-end.

Scope: ARC-1 `v0.3.x`.

---

## Prerequisites

```bash
npm run build
npm test
```

---

## Phase 1: API Key Authentication

### Start ARC-1

```bash
npx arc-1 --url http://your-sap:8000 \
  --user DEVELOPER --password secret --client 001 \
  --transport http-streamable --http-addr 0.0.0.0:8080 \
  --api-key 'test-key-12345'
```

### Verify

```bash
# health endpoint stays public
curl -s http://localhost:8080/health

# no auth -> 401
curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/mcp

# wrong key (and no OIDC fallback) -> 403
curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer wrong-key" \
  http://localhost:8080/mcp

# valid key -> 200
curl -s -H "Authorization: Bearer test-key-12345" \
  -H "Content-Type: application/json" \
  http://localhost:8080/mcp \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
```

Checklist:

- [ ] `/health` is reachable without auth
- [ ] missing auth returns 401
- [ ] wrong API key returns 403
- [ ] valid API key returns 200

---

## Phase 2: OIDC JWT Validation

### Start ARC-1

```bash
npx arc-1 --url http://your-sap:8000 \
  --user DEVELOPER --password secret --client 001 \
  --transport http-streamable --http-addr 0.0.0.0:8080 \
  --oidc-issuer 'https://login.microsoftonline.com/<tenant-id>/v2.0' \
  --oidc-audience '<expected-aud>'
```

### Verify

```bash
# no auth -> 401
curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/mcp

# invalid token -> 403
curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer invalid.jwt.token" \
  http://localhost:8080/mcp

# valid token -> 200
curl -s -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  http://localhost:8080/mcp \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
```

Checklist:

- [ ] missing token returns 401
- [ ] invalid token returns 403
- [ ] valid token returns 200
- [ ] token `aud` matches configured `SAP_OIDC_AUDIENCE`

---

## Phase 3: Principal Propagation (BTP Destination Path)

Prerequisites:

- ARC-1 on BTP CF
- `SAP_BTP_DESTINATION` + `SAP_BTP_PP_DESTINATION` configured
- `SAP_PP_ENABLED=true`
- Cloud Connector + SAP cert mapping configured

### Verify

```bash
cf logs arc1-mcp-server --recent | grep -E "Principal propagation|per-user|BTP destination"
```

In SAP:

- Check `SM20` for user-level entries
- Check `SM30` (`VUSREXTID`) mappings if user resolution fails

Checklist:

- [ ] JWT requests use per-user destination
- [ ] SAP actions are attributed to the individual SAP user
- [ ] fallback behavior matches `SAP_PP_STRICT` setting

---

## Phase 4: XSUAA OAuth Proxy (MCP-native)

Prerequisites:

- XSUAA service bound
- `SAP_XSUAA_AUTH=true`

### Verify

```bash
curl -s https://<app-url>/.well-known/oauth-authorization-server | jq .
```

Checklist:

- [ ] OAuth discovery endpoint is available
- [ ] MCP-native client can complete browser login
- [ ] authenticated MCP requests succeed

---

## Regression Smoke Test

```bash
npm test
npm run test:integration
```
