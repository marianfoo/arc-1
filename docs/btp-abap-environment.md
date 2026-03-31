# BTP ABAP Environment Setup

ARC-1 supports direct connections to SAP BTP ABAP Environment (Steampunk) using OAuth 2.0 Authorization Code flow via a BTP service key.

This is the same authentication flow used by Eclipse ADT when connecting to BTP ABAP systems — a browser opens for login, and tokens are cached for subsequent use.

## Prerequisites

- A SAP BTP ABAP Environment service instance
- A service key for the instance (created in BTP Cockpit)
- ARC-1 installed (`npm install -g arc-1` or via Docker)

## Step 1: Create a Service Key

1. Open your SAP BTP Cockpit
2. Navigate to your Subaccount > Service Instances
3. Find your **ABAP Environment** service instance
4. Go to **Service Keys** and create a new one (or use an existing one)
5. Download the service key JSON file

The service key looks like this:

```json
{
  "uaa": {
    "url": "https://your-subdomain.authentication.eu10.hana.ondemand.com",
    "clientid": "sb-abap-12345...",
    "clientsecret": "your-client-secret"
  },
  "url": "https://your-system.abap.eu10.hana.ondemand.com",
  "abap": {
    "url": "https://your-system.abap.eu10.hana.ondemand.com",
    "sapClient": "100"
  },
  "catalogs": {
    "abap": { "path": "/sap/bc/adt", "type": "sap_abap" }
  }
}
```

## Step 2: Configure ARC-1

### Option A: Service Key File (Recommended)

Save the service key to a file and point ARC-1 to it:

```bash
# Save the service key
cp ~/Downloads/service-key.json ~/.config/arc-1/btp-service-key.json

# Start ARC-1 with the service key
SAP_BTP_SERVICE_KEY_FILE=~/.config/arc-1/btp-service-key.json arc1
```

### Option B: Inline Service Key (for Docker / CI)

Pass the entire service key JSON as an environment variable:

```bash
SAP_BTP_SERVICE_KEY='{"uaa":{"url":"...","clientid":"...","clientsecret":"..."},"url":"..."}' arc1
```

### Option C: CLI Flags

```bash
arc1 --btp-service-key-file /path/to/service-key.json
# or
arc1 --btp-service-key '{"uaa":{...}}'
```

## Step 3: Configure Your MCP Client

### Claude Desktop / Claude Code

Add to your MCP client config (`claude_desktop_config.json` or `.mcp.json`):

```json
{
  "mcpServers": {
    "arc-1": {
      "command": "arc1",
      "env": {
        "SAP_BTP_SERVICE_KEY_FILE": "/path/to/service-key.json"
      }
    }
  }
}
```

Or via npx (no global install):

```json
{
  "mcpServers": {
    "arc-1": {
      "command": "npx",
      "args": ["-y", "arc-1"],
      "env": {
        "SAP_BTP_SERVICE_KEY_FILE": "/path/to/service-key.json"
      }
    }
  }
}
```

### VS Code (Copilot Chat)

In your `.vscode/mcp.json`:

```json
{
  "servers": {
    "arc-1": {
      "command": "arc1",
      "env": {
        "SAP_BTP_SERVICE_KEY_FILE": "${userHome}/.config/arc-1/btp-service-key.json"
      }
    }
  }
}
```

## Step 4: First Login

1. Start your MCP client (Claude Desktop, VS Code, etc.)
2. Make any tool call (e.g., ask Claude to "search for ABAP classes")
3. **A browser window opens automatically** to the SAP BTP login page
4. Authenticate in the browser (SAP IdP, IAS, Azure AD, etc.)
5. After successful login, the browser shows "Authentication Successful"
6. Return to your MCP client — the tool call completes
7. Subsequent calls reuse the cached token (no browser needed)

When the access token expires (~12 hours), ARC-1 automatically refreshes it using the refresh token. A browser login is only needed again if the refresh token also expires.

### Browser Doesn't Open?

If the browser fails to open automatically (e.g., on a headless server), ARC-1 logs the authorization URL. Copy it and open it manually in any browser.

## Configuration Reference

| Variable / Flag | Description |
|---|---|
| `SAP_BTP_SERVICE_KEY` / `--btp-service-key` | Inline service key JSON |
| `SAP_BTP_SERVICE_KEY_FILE` / `--btp-service-key-file` | Path to service key JSON file |
| `SAP_BTP_OAUTH_CALLBACK_PORT` / `--btp-oauth-callback-port` | Port for OAuth browser callback (default: auto-assigned) |

## How It Works

1. **Service key parsing**: ARC-1 reads the service key to extract:
   - `url` — The ABAP system base URL (where ADT API endpoints live)
   - `uaa.url` — The XSUAA token endpoint
   - `uaa.clientid` / `uaa.clientsecret` — OAuth client credentials

2. **OAuth Authorization Code flow**:
   - ARC-1 starts a local callback server on localhost
   - Opens the browser to `{uaa.url}/oauth/authorize?client_id=...&redirect_uri=...`
   - User authenticates in the browser
   - Browser redirects to callback with authorization code
   - ARC-1 exchanges code for JWT access token + refresh token

3. **Bearer token auth**: All ADT API requests use `Authorization: Bearer <token>` instead of Basic Auth. CSRF token handling and cookie management work identically to on-premise.

4. **Token lifecycle**: Access tokens are cached in memory. When they expire, ARC-1 uses the refresh token to get a new one. Only if the refresh token also expires does it trigger another browser login.

## Constraints vs On-Premise

BTP ABAP Environment has some limitations compared to on-premise:

| Area | Constraint |
|---|---|
| ABAP Language | Restricted ABAP ("ABAP for Cloud Development") |
| Released APIs only | Only C1-released objects accessible |
| No SAP GUI | Only ADT (Eclipse/API) available |
| No direct DB table preview | Data preview may be restricted |
| Package restrictions | Custom development in `Z*` or customer namespace only |
| Transport system | Uses gCTS or software components instead of classic transports |
| SAPQuery | `RunQuery` (free SQL) likely blocked; CDS views work |

## Cross-Platform Support

The browser login works on all platforms:
- **macOS**: Opens with `open` command
- **Linux**: Opens with `xdg-open` command
- **Windows**: Opens with `start` command

If the system cannot open a browser (e.g., headless server or WSL without browser integration), the authorization URL is logged to stderr for manual copy-paste.
