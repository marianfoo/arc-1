# Authentication Test Process

Step-by-step verification for each authentication phase. Run these tests after deploying arc1 to confirm each phase works as intended.

## Prerequisites

```bash
# Build vsp
go build -o arc1 ./cmd/arc1

# Run unit tests first (all 250+ must pass)
go test ./...
```

---

## Phase 1: API Key Authentication

### Unit Tests

```bash
# Run Phase 1 tests (12 tests)
go test ./internal/mcp/ -run "TestAPIKey|TestHealth|TestProtected|TestUsername|TestWired" -v
```

Expected: All 12 tests pass (valid key, invalid key, missing header, case-insensitive Bearer, raw token, timing-resistant, health endpoint, wired transport, Protected Resource Metadata, username mapping).

### Manual Integration Test

**1. Start arc1 with API key:**

```bash
./arc1 --url http://your-sap:8000 \
  --user DEVELOPER --password secret --client 001 \
  --transport http-streamable --http-addr 127.0.0.1:8080 \
  --api-key 'test-key-12345' --verbose
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
# Run OIDC tests (12 tests)
go test ./pkg/adt/ -run "TestOIDC" -v

# Run Protected Resource Metadata test
go test ./internal/mcp/ -run "TestProtectedResourceMetadataHandler" -v
```

### Manual Integration Test

**Prerequisites:** You need an OIDC Identity Provider (EntraID, Keycloak, Cognito).

**1. Start arc1 with OIDC:**

```bash
./arc1 --url http://your-sap:8000 \
  --user DEVELOPER --password secret --client 001 \
  --transport http-streamable --http-addr 127.0.0.1:8080 \
  --oidc-issuer 'https://your-idp.example.com' \
  --oidc-audience 'your-audience' \
  --verbose
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
  -d "grant_type=password&client_id=vsp&username=testuser&password=testpass" | jq -r .access_token)
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

**7. Check verbose logs for username extraction:**

```
# In arc1 stderr output, look for:
# [OIDC] Authenticated user: <username>
```

### Checklist

- [ ] Protected Resource Metadata endpoint returns valid JSON
- [ ] Missing token → 401
- [ ] Invalid/expired token → 401
- [ ] Valid JWT → 200 with tools
- [ ] Username extracted from JWT claims (check verbose logs)
- [ ] JWKS auto-discovery works (check logs for JWKS fetch)

---

## Phase 3: Principal Propagation

### Unit Tests

```bash
# Run PP transport tests (4 tests)
go test ./pkg/adt/ -run "TestTransportPrincipalPropagation|TestTransportSetPrincipalPropagation|TestWithPrincipalPropagation" -v

# Run cert auth tests
go test ./pkg/adt/ -run "TestWithClientCert|TestWithCACert" -v
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
./arc1 --url https://your-sap:44300 \
  --transport http-streamable --http-addr 127.0.0.1:8080 \
  --oidc-issuer 'https://your-idp.example.com' \
  --oidc-audience 'your-audience' \
  --pp-ca-key /tmp/test-ca.key \
  --pp-ca-cert /tmp/test-ca.crt \
  --pp-cert-ttl 5m \
  --insecure \
  --verbose
```

**Note:** No `--user` or `--password` needed when PP is active.

**5. Authenticate and make a request:**

```bash
TOKEN=$(az account get-access-token --resource your-audience --query accessToken -o tsv)

curl -s -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  http://localhost:8080/mcp \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"SAP","arguments":{"action":"read","params":{"type":"user_info"}}},"id":1}'
# Expected: Response showing the SAP user matching your OIDC username
```

**6. Verify per-user identity in SAP:**

Check in SAP transaction `/nSM21` (system log) or `/nSM04` (user sessions) that the request was executed as the mapped SAP user, not a service account.

**7. Verify fallback to basic auth:**

If you also provide `--user` and `--password`, requests WITHOUT an OIDC token in context should fall back to basic auth. This is tested automatically in `TestTransportPrincipalPropagation_FallsBackToBasicAuth`.

### Checklist

- [ ] PP transport unit tests pass (4 tests)
- [ ] CA cert imported into SAP STRUST
- [ ] CERTRULE mapping configured (CN → SAP User)
- [ ] ICM parameter `icm/HTTPS/verify_client = 1` set
- [ ] arc1 starts without errors with `--pp-ca-key` and `--pp-ca-cert`
- [ ] Request with OIDC token uses ephemeral cert (check verbose logs)
- [ ] SAP logs show per-user identity (not service account)
- [ ] Fallback to basic auth works when no OIDC context

---

## Phase 4: BTP / VCAP_SERVICES

### Unit Tests

```bash
# Run BTP tests (6 tests)
go test ./pkg/adt/ -run "TestParseVCAPServices|TestBTPConfig|TestDestinationLookup" -v
```

### Manual Integration Test

Phase 4 is currently deferred. The core BTP building blocks (VCAP_SERVICES parsing, Destination Service lookup) are tested via unit tests with mock servers.

**To test on BTP Cloud Foundry:**

**1. Deploy to CF:**

```bash
GOOS=linux GOARCH=amd64 go build -o arc1 ./cmd/arc1
cf push
```

**2. Verify VCAP_SERVICES parsing** (check app logs):

```bash
cf logs arc1 --recent | grep "BTP"
# Expected: Log messages showing parsed XSUAA and Destination bindings
```

**3. Verify Destination Service lookup:**

```bash
cf ssh arc1 -c "curl -s http://localhost:8080/health"
# Expected: {"status":"ok"}
```

### Checklist

- [ ] VCAP_SERVICES parsing unit tests pass (4 tests)
- [ ] Destination lookup unit tests pass (2 tests)
- [ ] BTP config → OAuth config conversion works

---

## Full Regression Suite

Run all auth-related tests in one go:

```bash
# All unit tests
go test ./... -v -count=1 2>&1 | tee test-results.txt

# Auth-specific tests only
go test ./pkg/adt/ -run "TestOIDC|TestTransportPrincipal|TestWithPrincipal|TestParseVCAP|TestBTPConfig|TestDestination|TestWithClient|TestWithCA" -v
go test ./internal/mcp/ -run "TestAPIKey|TestHealth|TestProtected|TestUsername|TestWired" -v
```

**Expected totals:**
- Phase 1 (API Key): 12 tests
- Phase 2 (OIDC): 12 tests
- Phase 3 (PP Transport): 4 tests + 2 cert auth tests
- Phase 4 (BTP): 6 tests
- **Total auth tests: ~36**

---

## Quick Smoke Test (All Phases)

For a quick check that nothing is broken after code changes:

```bash
go test ./pkg/adt/ ./internal/mcp/ -count=1
# Expected: ok on both packages, no failures
```
