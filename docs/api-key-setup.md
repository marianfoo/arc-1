# API Key Setup

Protect your centralized arc1 MCP server with API keys. This is the simplest way to secure a remote arc1 instance — no external identity provider needed.

## When to Use

- Quick proof-of-concept
- Small-to-medium teams with trusted users
- When you don't need per-user SAP identity
- Internal network deployments where you want role-based access without an IdP
- All users share the same SAP service account

## Architecture

```
┌──────────────────┐     Bearer API Key      ┌──────────────────┐     Basic Auth      ┌────────────┐
│  MCP Client      │ ──────────────────────► │  arc1 Server      │ ──────────────────► │  SAP ABAP  │
│  (IDE / Copilot) │   Authorization header  │  (centralized)   │   SAP_USER/PASS    │  System    │
└──────────────────┘                         └──────────────────┘                     └────────────┘
```

## Server Setup

### 1. Generate an API Key

```bash
# Generate a random 32-character API key
openssl rand -base64 32
# Example output: K7mQ3xR9vL2pN8wY5tJ6hB4cF1gD0eA=
```

### 2. Start arc1 with API Key

```bash
# Using CLI flags
arc1 --url https://sap.example.com:44300 \
    --user SAP_SERVICE_USER \
    --password 'ServicePassword123' \
    --transport http-streamable \
    --http-addr 0.0.0.0:8080 \
    --api-key 'K7mQ3xR9vL2pN8wY5tJ6hB4cF1gD0eA='

# Using environment variables
export SAP_URL=https://sap.example.com:44300
export SAP_USER=SAP_SERVICE_USER
export SAP_PASSWORD=ServicePassword123
export SAP_TRANSPORT=http-streamable
export SAP_HTTP_ADDR=0.0.0.0:8080
export ARC1_API_KEY='K7mQ3xR9vL2pN8wY5tJ6hB4cF1gD0eA='
arc1
```

### 3. Test the Connection

```bash
# Should return 401 (no key)
curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/mcp

# Should return 200 (with key)
curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer K7mQ3xR9vL2pN8wY5tJ6hB4cF1gD0eA=" \
  http://localhost:8080/mcp

# Health check (no auth required)
curl http://localhost:8080/health
```

## Multi-Key Setup (Role-Based Access)

For teams that need different access levels, use `--api-keys` to assign each key a [profile](authorization.md#profiles-safety-presets):

### 1. Generate Keys Per Role

```bash
VIEWER_KEY=$(openssl rand -base64 32)
DEV_KEY=$(openssl rand -base64 32)
SQL_KEY=$(openssl rand -base64 32)
```

### 2. Start arc1 with Per-Key Profiles

```bash
# Using CLI flag
arc1 --url https://sap.example.com:44300 \
    --user SAP_SERVICE_USER \
    --password 'ServicePassword123' \
    --transport http-streamable \
    --api-keys "$VIEWER_KEY:viewer,$DEV_KEY:developer,$SQL_KEY:developer-sql"

# Using environment variable
export ARC1_API_KEYS="$VIEWER_KEY:viewer,$DEV_KEY:developer,$SQL_KEY:developer-sql"
arc1
```

Each key gets both scopes (tool visibility) and safety restrictions from its profile:

| Key | Profile | Can Do | Cannot Do |
|-----|---------|--------|-----------|
| `$VIEWER_KEY` | `viewer` | Read source, search, navigate | Write, data, SQL |
| `$DEV_KEY` | `developer` | Read + write source, transports | Data preview, SQL |
| `$SQL_KEY` | `developer-sql` | Everything | Nothing restricted |

### 3. Test Per-Key Access

```bash
# Viewer key — should succeed for read operations
curl -X POST -H "Authorization: Bearer $VIEWER_KEY" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}' \
  http://localhost:8080/mcp

# Developer key — should show additional tools (SAPWrite, SAPActivate, etc.)
curl -X POST -H "Authorization: Bearer $DEV_KEY" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}' \
  http://localhost:8080/mcp
```

### Available Profiles

| Profile | Scopes | Description |
|---------|--------|-------------|
| `viewer` | `read` | Read-only source code access |
| `viewer-data` | `read`, `data` | Source + table preview |
| `viewer-sql` | `read`, `data`, `sql` | Source + table preview + SQL |
| `developer` | `read`, `write` | Full development, no data |
| `developer-data` | `read`, `write`, `data` | Development + table preview |
| `developer-sql` | `read`, `write`, `data`, `sql` | Full access |

See [Authorization & Roles](authorization.md) for detailed scope descriptions.

## Client Configuration

### VS Code / Cursor

In `.vscode/mcp.json` or Cursor MCP settings:

```json
{
  "servers": {
    "arc1": {
      "type": "http",
      "url": "https://arc1.company.com/mcp",
      "headers": {
        "Authorization": "Bearer K7mQ3xR9vL2pN8wY5tJ6hB4cF1gD0eA="
      }
    }
  }
}
```

### Copilot Studio

1. Go to **Settings** → **Connectors** → **MCP Servers**
2. Click **Add MCP Server**
3. URL: `https://arc1.company.com/mcp`
4. Authentication: **API Key**
5. Header name: `Authorization`
6. Header value: `Bearer K7mQ3xR9vL2pN8wY5tJ6hB4cF1gD0eA=`

### Claude Desktop (via mcp-remote)

In `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "arc1": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://arc1.company.com/mcp",
        "--header",
        "Authorization: Bearer K7mQ3xR9vL2pN8wY5tJ6hB4cF1gD0eA="
      ]
    }
  }
}
```

## Production Deployment

### Docker

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
EXPOSE 8080
CMD ["node", "dist/index.js", "--transport", "http-streamable", "--http-addr", "0.0.0.0:8080"]
```

```bash
docker run -d \
  -e SAP_URL=https://sap.example.com:44300 \
  -e SAP_USER=SAP_SERVICE \
  -e SAP_PASSWORD=secret \
  -e SAP_TRANSPORT=http-streamable \
  -e SAP_HTTP_ADDR=0.0.0.0:8080 \
  -e ARC1_API_KEY='your-api-key-here' \
  -p 8080:8080 \
  arc1
```

### Behind a Reverse Proxy (nginx)

```nginx
server {
    listen 443 ssl;
    server_name arc1.company.com;

    ssl_certificate /etc/ssl/certs/arc1.crt;
    ssl_certificate_key /etc/ssl/private/arc1.key;

    location /mcp {
        proxy_pass http://localhost:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /health {
        proxy_pass http://localhost:8080;
    }
}
```

## Security Notes

- Always use HTTPS in production (TLS termination at reverse proxy or load balancer)
- Store API keys in a secrets manager, not in plaintext configs
- Rotate keys periodically
- With multi-key, audit logs include the profile name (e.g. `api-key:viewer`) to identify which key was used
- All API key users share the same SAP identity — no per-user SAP audit trail
- For per-user SAP auth, use [OAuth / JWT](oauth-jwt-setup.md) + [Principal Propagation](principal-propagation-setup.md)

## Limitations

- No true user identity — keys identify roles, not individuals
- Cannot do per-user SAP authorization (all keys use the shared SAP service account)
- Manual key rotation requires updating all clients that use that key
- Not MCP-spec-compliant OAuth (but works with all major clients)

## Next Steps

→ [OAuth / JWT Setup](oauth-jwt-setup.md) — Add user identity
→ [Principal Propagation Setup](principal-propagation-setup.md) — Per-user SAP auth
