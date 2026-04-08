# Phase 4: BTP Cloud Foundry Deployment

Deploy ARC-1 on SAP BTP Cloud Foundry with Docker, connecting to an on-premise SAP system via Cloud Connector and Destination Service.

## When to Use

- Organization uses SAP BTP
- SAP system is on-premise, accessible via Cloud Connector
- Want a cloud-hosted MCP server without managing infrastructure
- Combining with Phase 2 (OAuth/OIDC) for enterprise authentication

## Architecture

```
┌──────────────────┐                    ┌─────────────────────────────────────────────────┐
│  MCP Client      │     OAuth 2.0      │  SAP BTP Cloud Foundry                          │
│  (Copilot Studio │ ──────────────────►│                                                 │
│   / IDE / CLI)   │   Bearer JWT       │  ┌─────────────────────────────────────────┐    │
└──────────────────┘                    │  │  ARC-1 (Docker Container)               │    │
        │                               │  │                                         │    │
        │                               │  │  OIDC Validator ──► Entra ID JWKS       │    │
        │  ┌────────────────────┐       │  │  MCP Server (HTTP Streamable)           │    │
        └─►│  Entra ID          │       │  │  ADT Client ─── via Connectivity ──►────│──┐ │
           │  (Token Issuer)    │       │  │                    Proxy                 │  │ │
           └────────────────────┘       │  └─────────────────────────────────────────┘  │ │
                                        │                                               │ │
                                        │  ┌──────────────┐  ┌──────────────────────┐  │ │
                                        │  │ Destination   │  │ Connectivity Service │  │ │
                                        │  │ Service       │  │ (Proxy)              │◄─┘ │
                                        │  │ SAP_TRIAL     │  └──────────┬───────────┘    │
                                        │  └──────────────┘             │                 │
                                        └───────────────────────────────│─────────────────┘
                                                                        │
                                        ┌───────────────────────────────│─────────────────┐
                                        │  Cloud Connector              │                  │
                                        │  Virtual Host: a4h-abap:50000 │                  │
                                        │  ◄─────────────────────────────                  │
                                        └───────────────────────────────│─────────────────┘
                                                                        │
                                        ┌───────────────────────────────│─────────────────┐
                                        │  On-Premise SAP ABAP System   ▼                  │
                                        │  sap-host:50000  (ADT REST API)                  │
                                        └─────────────────────────────────────────────────┘
```

## Prerequisites

- SAP BTP subaccount with Cloud Foundry environment enabled
- Cloud Connector installed and connected to BTP subaccount
- Cloud Connector configured with virtual host mapping to SAP on-premise system
- `cf` CLI installed and logged in
- Docker image pushed to a container registry (GHCR, Docker Hub, etc.)

## Setup

### 1. Create BTP Services

```bash
# Login to Cloud Foundry
cf login -a https://api.cf.us10-001.hana.ondemand.com

# Create Destination service instance
cf create-service destination lite arc1-destination

# Create Connectivity service instance
cf create-service connectivity lite arc1-connectivity
```

### 2. Configure Cloud Connector

In the SAP Cloud Connector admin UI:

1. Add a **Subaccount** connection to your BTP subaccount
2. Under **Cloud To On-Premise** → **Access Control**:
   - Add mapping: **Virtual Host** `a4h-abap` port `50000` → **Internal Host** `sap-host` port `50000`
   - Protocol: HTTP
   - Add resource: Path prefix `/sap/bc/adt/` with all sub-paths

### 3. Configure BTP Destination

In BTP Cockpit → Connectivity → Destinations → **New Destination**:

| Property | Value |
|----------|-------|
| Name | `SAP_TRIAL` |
| Type | HTTP |
| URL | `http://a4h-abap:50000` |
| Proxy Type | OnPremise |
| Authentication | BasicAuthentication |
| User | `SAP_SERVICE_USER` |
| Password | (service account password) |

Additional Properties:

| Property | Value |
|----------|-------|
| `sap-client` | `001` |
| `sap-language` | `EN` |

### 4. Create manifest.yml

```yaml
---
applications:
  - name: arc1-mcp-server
    docker:
      image: ghcr.io/marianfoo/arc-1:latest
    instances: 1
    memory: 256M
    disk_quota: 512M
    health-check-type: http
    health-check-http-endpoint: /health
    env:
      # SAP connection (URL must match Cloud Connector virtual host mapping)
      SAP_URL: "http://a4h-abap:50000"
      SAP_CLIENT: "001"
      SAP_LANGUAGE: "EN"
      SAP_INSECURE: "true"
      # MCP transport (CF sets PORT env var automatically)
      SAP_TRANSPORT: "http-streamable"
      # BTP Destination Service (reads credentials from destination config)
      SAP_BTP_DESTINATION: "SAP_TRIAL"
      # Safety: read-only, no SQL
      SAP_READ_ONLY: "true"
      SAP_BLOCK_FREE_SQL: "true"
      # Logging
      SAP_VERBOSE: "true"
    services:
      - arc1-connectivity
      - arc1-destination
```

### 5. Build and Push Docker Image

```bash
# Build for Linux (required for CF)
docker build --platform linux/amd64 \
  -t ghcr.io/your-org/arc1:latest \
  --build-arg VERSION=$(git describe --tags --always) \
  --build-arg COMMIT=$(git rev-parse --short HEAD) \
  .

# Login to container registry
echo $GHCR_TOKEN | docker login ghcr.io -u USERNAME --password-stdin

# Push
docker push ghcr.io/your-org/arc1:latest
```

### 6. Deploy to Cloud Foundry

```bash
# Push the app (first time)
cf push

# The app URL will be:
# https://arc1-mcp-server.cfapps.us10-001.hana.ondemand.com
```

### 7. Set Credentials via Environment (not in manifest)

**Never put secrets in manifest.yml.** Set them via `cf set-env`:

```bash
# API Key for simple auth (Phase 1)
cf set-env arc1-mcp-server ARC1_API_KEY "your-secure-api-key"

# OR OAuth/OIDC validation (Phase 2) — recommended
cf set-env arc1-mcp-server SAP_OIDC_ISSUER "https://login.microsoftonline.com/{tenant-id}/v2.0"
cf set-env arc1-mcp-server SAP_OIDC_AUDIENCE "{client-id}"

# Restart to apply
cf restart arc1-mcp-server
```

> **Note on audience:** When using Entra ID with `requestedAccessTokenVersion: 2`, the audience is the raw Application (client) ID GUID, not the `api://` URI.

### 8. Verify Deployment

```bash
# Health check
curl https://arc1-mcp-server.cfapps.us10-001.hana.ondemand.com/health
# → {"status":"ok"}

# Check Protected Resource Metadata (OAuth discovery)
curl https://arc1-mcp-server.cfapps.us10-001.hana.ondemand.com/.well-known/oauth-protected-resource
# → {"resource":"https://arc1-mcp-server.cfapps...","...}

# Test with Bearer token
TOKEN=$(az account get-access-token --scope "api://{client-id}/access_as_user" --query accessToken -o tsv)
curl -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}' \
  https://arc1-mcp-server.cfapps.us10-001.hana.ondemand.com/mcp
```

## How BTP Connectivity Works

ARC-1 auto-detects BTP Cloud Foundry via the `VCAP_APPLICATION` environment variable:

1. **Public URL auto-detection:** ARC-1 reads `application_uris` from `VCAP_APPLICATION` to construct the externally reachable URL (used for RFC 9728 metadata). Override with `SAP_PUBLIC_URL` if needed.

2. **Destination Service:** When `SAP_BTP_DESTINATION` is set, ARC-1 reads SAP credentials (user, password, URL) from the BTP Destination Service at runtime, using the connectivity service binding from `VCAP_SERVICES`.

3. **Connectivity Proxy:** On-premise HTTP calls are routed through BTP's connectivity proxy (`connectivityproxy.internal.cf...`) using the `Proxy-Authorization` header with a connectivity service OAuth token.

4. **Port:** CF sets the `PORT` environment variable (typically `8080`). ARC-1's Docker image defaults `SAP_HTTP_ADDR` to `0.0.0.0:8080`.

## Updating the Deployment

```bash
# Build and push new image
docker build --platform linux/amd64 -t ghcr.io/your-org/arc1:latest .
docker push ghcr.io/your-org/arc1:latest

# Restart CF app to pull latest image
# Option A: Simple restart (picks up new image if tag is :latest)
cf push arc1-mcp-server --docker-image ghcr.io/your-org/arc1:latest -c "/usr/local/bin/arc1"

# Option B: If only env vars changed
cf restart arc1-mcp-server
```

> **Note:** When the Docker image ENTRYPOINT changes, CF may cache the old start command. Use `-c "/usr/local/bin/arc1"` to explicitly set the start command.

## Combining with OAuth (Recommended)

For production, combine BTP deployment with Phase 2 (OAuth/OIDC):

```bash
# Set OIDC validation on the CF app
cf set-env arc1-mcp-server SAP_OIDC_ISSUER "https://login.microsoftonline.com/{tenant-id}/v2.0"
cf set-env arc1-mcp-server SAP_OIDC_AUDIENCE "{client-id}"
cf restart arc1-mcp-server
```

Then configure your MCP client (Copilot Studio, VS Code) to use OAuth authentication as described in [OAuth / JWT Setup](oauth-jwt-setup.md).

## Troubleshooting

### App crashes with "unable to find user arc1"

The Docker image user doesn't match what CF cached. Fix with explicit command:
```bash
cf push arc1-mcp-server --docker-image ghcr.io/your-org/arc1:latest -c "/usr/local/bin/arc1"
```

### SAP returns 401 "Logon failed"

- Check that the BTP Destination credentials are correct
- Verify Cloud Connector mapping is active and healthy
- Check that the virtual host in `SAP_URL` matches the Cloud Connector mapping

### Health check fails

- Verify the app started: `cf logs arc1-mcp-server --recent`
- Check memory (256M is sufficient for ARC-1)
- Verify health check endpoint: `cf app arc1-mcp-server` should show `health-check-http-endpoint: /health`

### "connection refused" to SAP

- Verify Cloud Connector is connected to the BTP subaccount
- Check Cloud Connector access control allows `/sap/bc/adt/*` paths
- Verify `SAP_URL` matches the virtual host configured in Cloud Connector

## Deploying Without Docker (Node.js Buildpack)

If you need customization beyond what the Docker image provides (e.g., custom certificates, native modules, or patching), you can deploy ARC-1 as a Node.js application using the `nodejs_buildpack`:

### 1. Prepare the Application

```bash
# Clone and build
git clone https://github.com/marianfoo/arc-1.git
cd arc-1
npm ci
npm run build
```

### 2. Create a CF-specific manifest

```yaml
# manifest-nodejs.yml
applications:
  - name: arc1-mcp-server
    buildpacks:
      - nodejs_buildpack
    instances: 1
    memory: 256M
    disk_quota: 512M
    health-check-type: http
    health-check-http-endpoint: /health
    command: node dist/index.js
    env:
      SAP_URL: "http://a4h-abap:50000"
      SAP_CLIENT: "001"
      SAP_TRANSPORT: "http-streamable"
      SAP_SYSTEM_TYPE: "auto"
      SAP_READ_ONLY: "true"
      SAP_BLOCK_FREE_SQL: "true"
    services:
      - arc1-connectivity
      - arc1-destination
```

### 3. Deploy

```bash
cf push -f manifest-nodejs.yml
```

**Differences from Docker deployment:**
- Uses CF's Node.js buildpack (auto-detects `package.json`)
- `better-sqlite3` native module is compiled during staging — may add 30-60s to deploy
- You can modify source before pushing (custom tool descriptions, additional middleware, etc.)
- Environment is Ubuntu-based (not Alpine), which may affect some native dependencies

### 4. Customization Examples

**Custom start script** — add pre-startup logic:

```bash
# In package.json scripts:
"start:cf": "node scripts/pre-start.js && node dist/index.js"
```

Then set `command: npm run start:cf` in the manifest.

**Custom CA certificates** — for on-premise SAP with self-signed certs:

```bash
# Set NODE_EXTRA_CA_CERTS to a bundled cert file
cf set-env arc1-mcp-server NODE_EXTRA_CA_CERTS /home/vcap/app/certs/sap-ca.pem
```

## Deploying for BTP ABAP Environment

For connecting to a BTP ABAP Environment (instead of on-premise), see the separate manifest template `manifest-btp-abap.yml` and the [BTP ABAP Environment guide](btp-abap-environment.md).

Key differences from on-premise deployment:
- No Cloud Connector or Connectivity Service needed
- Auth is via service key + JWT Bearer Exchange (not PP)
- Set `SAP_SYSTEM_TYPE=btp` for adapted tool descriptions
- Set `SAP_BTP_SERVICE_KEY` as an env var (via `cf set-env` — never in manifest)

## SAP Documentation References

- [SAP BTP Cloud Foundry Environment](https://help.sap.com/docs/btp/sap-business-technology-platform/cloud-foundry-environment) — CF runtime overview
- [SAP Cloud Connector Installation](https://help.sap.com/docs/connectivity/sap-btp-connectivity-cf/installation) — Cloud Connector setup
- [SAP Destination Service](https://help.sap.com/docs/connectivity/sap-btp-connectivity-cf/calling-destination-service-rest-api) — Destination lookup API
- [SAP BTP Docker Deployment](https://help.sap.com/docs/btp/sap-business-technology-platform/deploy-docker-images-in-cloud-foundry-environment) — Docker on CF
