# Quickstart

Get ARC-1 talking to your SAP system in five minutes. Zero install, Basic Auth, Claude Desktop.

If this path doesn't match you — SSO-only SAP, Docker, BTP, a team server — skip straight to:

- **[Local development](local-development.md)** — full local dev (npx / npm / Docker / git-clone), `.env` patterns, SSO cookie extractor
- **[Deployment](deployment.md)** — multi-user / production (Docker, BTP Cloud Foundry, BTP ABAP)

---

## Prerequisites

- Node.js 22+
- Network access to a SAP system (dev/sandbox ideally)
- A SAP user + password with ADT authorizations

That's it. No global install, no config files.

---

## 1. Verify ARC-1 can reach your SAP

```bash
npx arc-1@latest --url https://your-sap-host:44300 \
                 --user YOUR_USER --password YOUR_PASS \
                 --client 100
```

You should see a startup line like:

```
INFO: auth: MCP=[none] SAP=basic (shared)
INFO: ARC-1 MCP server running on stdio
```

Hit `Ctrl+C` to stop. If this failed, check TLS (`--insecure` for self-signed dev certs), the client number, and that the user can log into SE80 via the web GUI.

---

## 2. Wire it into Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

Use the same `command` and `args` either way:

- `command`: `npx`
- `args`: `["-y", "arc-1@latest"]`

Then pick one `env` block for local development.

### Path A — read and search only

`viewer` is the same as the built-in default, but keeping it explicit makes the intent obvious in local configs.

```json
{
  "SAP_URL": "https://your-sap-host:44300",
  "SAP_USER": "YOUR_USER",
  "SAP_PASSWORD": "YOUR_PASS",
  "SAP_CLIENT": "100",
  "ARC1_PROFILE": "viewer"
}
```

#### What you just got — read-only by default

| Capability | Result |
|---|---|
| Writes | Off |
| Free SQL | Off |
| Named table preview | Off |
| Transports | Off |
| Package scope | `$TMP` if you later enable writes |

### Path B — full local development

Use this only on a dev or sandbox system you are comfortable modifying.

```json
{
  "SAP_URL": "https://your-sap-host:44300",
  "SAP_USER": "YOUR_USER",
  "SAP_PASSWORD": "YOUR_PASS",
  "SAP_CLIENT": "100",
  "ARC1_PROFILE": "developer-sql",
  "SAP_ALLOWED_PACKAGES": "*"
}
```

#### What you just got — writes, SQL, data, and transports

| Capability | Result |
|---|---|
| Writes | On |
| Free SQL | On |
| Named table preview | On |
| Transports | On |
| Package scope | `*` (all packages) |

Need something in between? Start from `ARC1_PROFILE=developer` for writes in `$TMP`, or pick a narrower recipe in [configuration-reference.md → Common recipes](configuration-reference.md#common-recipes).

Restart Claude Desktop after updating the config. The SAP tools (`SAPRead`, `SAPSearch`, etc.) should appear in the tool picker.

Other MCP clients (Claude Code, Cursor, VS Code Copilot, Gemini CLI, Goose): same shape, see [local-development.md](local-development.md#mcp-client-configuration).

---

## 3. Try a read

In Claude Desktop, ask:

> Using the SAP tools, show me the source of report `RSPO0041`.

Claude should call `SAPRead` and return the ABAP source.

---

## Next steps

- **Your SAP uses SSO (SAML / SPNEGO / X.509)?** Basic Auth won't work. See [local-development.md → SSO-only on-prem](local-development.md#sso-only-on-prem-cookie-extractor).
- **Running on BTP or deploying for a team?** → [deployment.md](deployment.md).
- **Full flag and profile reference** → [configuration-reference.md](configuration-reference.md).
