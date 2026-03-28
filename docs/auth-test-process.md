# Authentication Test Process

Step-by-step verification for each authentication phase. Run these tests after deploying arc1 to confirm each phase works as intended.

## Prerequisites

```bash
# Build arc1
npm run build

# Run unit tests first (all must pass)
npm test
```

---

## Phase 1: API Key Authentication

### Unit Tests

```bash
# Run Phase 1 related tests
npm test
```

### Manual Integration Test

**1. Start arc1 with API key:**

```bash
npx arc-1 --url http://your-sap:8000 \
  --user DEVELOPER --password secret --client 001 \
  --transport http-streamable --port 8080 \
  --api-key 'test-key-12345'
```

**2. Verify health endpoint (no auth required):**

```bash
curl -s http://localhost:8080/health
# Expected: {"status":"ok"}
```

**3. Verify request without API key is rejected:**

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/mcp
# Expected: 401
```

**4. Verify request with wrong API key is rejected:**

```bash
curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer wrong-key" \
  http://localhost:8080/mcp
# Expected: 401
```

**5. Verify request with correct API key succeeds:**

```bash
curl -s -H "Authorization: Bearer test-key-12345" \
  -H "Content-Type: application/json" \
  http://localhost:8080/mcp \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
# Expected: 200 with JSON-RPC response containing tool list
```

**6. Verify case-insensitive Bearer prefix:**

```bash
curl -s -H "Authorization: bearer test-key-12345" \
  -H "Content-Type: application/json" \
  http://localhost:8080/mcp \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
# Expected: 200 (same as above)
```

### Checklist

- [ ] Health endpoint returns 200 without auth
- [ ] Missing Authorization header → 401
- [ ] Wrong API key → 401
- [ ] Correct API key → 200 with tools
- [ ] Case-insensitive "Bearer" prefix works
- [ ] MCP client (VS Code/Cursor) connects with Authorization header

---

## Phase 2: OAuth / JWT Authentication

### Unit Tests

```bash
npm test
```

### Manual Integration Test

**Prerequisites:** You need an OIDC Identity Provider (EntraID, Keycloak, Cognito).

**1. Start arc1 with OIDC:**

```bash
npx arc-1 --url http://your-sap:8000 \
  --user DEVELOPER --password secret --client 001 \
  --transport http-streamable --port 8080 \
  --oidc-issuer 'https://your-idp.example.com' \
  --oidc-audience 'your-audience'
```

**2. Verify Protected Resource Metadata endpoint:**

```bash
curl -s http://localhost:8080/.well-known/oauth-protected-resource | jq .
# Expected: JSON with "resource", "authorization_servers", "bearer_methods_supported"
```

**3. Verify request without token is rejected:**

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/mcp
# Expected: 401
```

**4. Get a real JWT from your IdP:**

```bash
# Example for Azure CLI:
TOKEN=$(az account get-access-token --resource your-audience --query accessToken -o tsv)

# Example for Keycloak (password grant for testing):
TOKEN=$(curl -s -X POST https://keycloak.example.com/realms/myrealm/protocol/openid-connect/token \
  -d "grant_type=password&client_id=arc1&username=testuser&password=testpass" | jq -r .access_token)
```

**5. Verify request with valid JWT succeeds:**

```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  http://localhost:8080/mcp \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
# Expected: 200 with tool list
```

**6. Verify expired/invalid token is rejected:**

```bash
curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer invalid.jwt.token" \
  http://localhost:8080/mcp
# Expected: 401
```

**7. Check logs for username extraction:**

```
# In arc1 stderr output, look for:
# [OIDC] Authenticated user: <username>
```

### Checklist

- [ ] Protected Resource Metadata endpoint returns valid JSON
- [ ] Missing token → 401
- [ ] Invalid/expired token → 401
- [ ] Valid JWT → 200 with tools
- [ ] Username extracted from JWT claims (check logs)
- [ ] JWKS auto-discovery works (check logs for JWKS fetch)

---

## Phase 3: Principal Propagation

### Unit Tests

```bash
npm test
```

### Manual Integration Test

**Prerequisites:**
- Phase 2 (OIDC) configured and working
- SAP system configured with STRUST, CERTRULE, ICM (see [Phase 3 Setup](phase3-principal-propagation-setup.md))

**1. Generate test CA:**

```bash
openssl genrsa -out /tmp/test-ca.key 2048
openssl req -new -x509 -key /tmp/test-ca.key -out /tmp/test-ca.crt -days 365 \
  -subj "/CN=arc1-test-ca/O=Test/C=DE"
```

**2. Import CA cert into SAP STRUST** (see Phase 3 docs)

**3. Configure CERTRULE** to map `CN=<username>` → SAP user

**4. Start arc1 with PP:**

```bash
npx arc-1 --url https://your-sap:44300 \
  --transport http-streamable --port 8080 \
  --oidc-issuer 'https://your-idp.example.com' \
  --oidc-audience 'your-audience' \
  --pp-ca-key /tmp/test-ca.key \
  --pp-ca-cert /tmp/test-ca.crt \
  --pp-cert-ttl 5m \
  --insecure
```

**Note:** No `--user` or `--password` needed when PP is active.

**5. Authenticate and make a request:**

```bash
TOKEN=$(az account get-access-token --resource your-audience --query accessToken -o tsv)

curl -s -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  http://localhost:8080/mcp \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"SAPRead","arguments":{"type":"SYSTEM"}},"id":1}'
# Expected: Response showing SAP system info
```

**6. Verify per-user identity in SAP:**

Check in SAP transaction `/nSM21` (system log) or `/nSM04` (user sessions) that the request was executed as the mapped SAP user, not a service account.

### Checklist

- [ ] CA cert imported into SAP STRUST
- [ ] CERTRULE mapping configured (CN → SAP User)
- [ ] ICM parameter `icm/HTTPS/verify_client = 1` set
- [ ] arc1 starts without errors with `--pp-ca-key` and `--pp-ca-cert`
- [ ] Request with OIDC token uses ephemeral cert (check logs)
- [ ] SAP logs show per-user identity (not service account)

---

## Phase 4: BTP / Cloud Foundry

### Unit Tests

```bash
npm test
```

### Manual Integration Test

**To test on BTP Cloud Foundry:**

**1. Deploy to CF:**

```bash
# Build Docker image
docker build -t arc1 .
# Push to CF (see phase4-btp-deployment.md)
cf push
```

**2. Verify app is running** (check app logs):

```bash
cf logs arc1 --recent | grep "BTP"
# Expected: Log messages showing parsed XSUAA and Destination bindings
```

**3. Verify health:**

```bash
cf ssh arc1 -c "curl -s http://localhost:8080/health"
# Expected: {"status":"ok"}
```

### Checklist

- [ ] BTP config → OAuth config conversion works
- [ ] App starts on CF without errors
- [ ] Health endpoint returns 200

---

## Full Regression Suite

Run all tests:

```bash
# All unit tests
npm test

# Integration tests (requires SAP credentials)
npm run test:integration
```

---

## Quick Smoke Test

For a quick check that nothing is broken after code changes:

```bash
npm test
# Expected: All tests pass, no failures
```
