# Local Development

Everything for running ARC-1 locally against your own SAP — one developer, one laptop.

Already did the [Quickstart](quickstart.md)? This page is the full toolbox: all install methods, `.env` patterns, MCP client configs, safety profiles, and the cookie extractor for SSO-only on-prem systems.

For multi-user / production deployments see [deployment.md](deployment.md).

---

## Install methods

Pick one — they're equivalent in behaviour, they differ in how you manage the binary.

### npx (zero install)

```bash
npx arc-1@latest --url https://your-sap-host:44300 \
                 --user YOUR_USER --password YOUR_PASS \
                 --client 100
```

npx downloads on first run and caches. Always gets the latest patch. Best for trying things out.

### npm install -g (faster startup)

```bash
npm install -g arc-1
arc1 --url https://your-sap-host:44300 --user YOUR_USER --password YOUR_PASS --client 100
```

Startup is ~1s faster than npx. Update with `npm install -g arc-1@latest`.

### Docker (local)

```bash
docker run -d --name arc1 -p 8080:8080 \
  -e SAP_URL=https://your-sap-host:44300 \
  -e SAP_USER=YOUR_USER \
  -e SAP_PASSWORD=YOUR_PASS \
  -e SAP_CLIENT=100 \
  ghcr.io/marianfoo/arc-1:latest
```

Defaults to HTTP Streamable on `:8080`. Connect MCP clients to `http://localhost:8080/mcp`. Full Docker reference → [docker.md](docker.md).

For stdio mode inside Docker (Claude Desktop wraps the `docker run` in the MCP config), add `-e SAP_TRANSPORT=stdio` and use `docker run -i --rm` instead of `-d`.

### git clone (contributing to ARC-1)

```bash
git clone https://github.com/marianfoo/arc-1.git
cd arc-1
npm ci
npm run build
npm start          # or: npm run dev  (tsx, auto-reload)
```

Config via `.env` (see below) or env vars / flags.

---

## Using a `.env` file

Copy `.env.example` to `.env` and uncomment what you need. Priority is CLI > env > `.env` > defaults.

Minimal `.env` for basic auth:

```bash
SAP_URL=https://your-sap-host:44300
SAP_USER=YOUR_USER
SAP_PASSWORD=YOUR_PASS
SAP_CLIENT=100
SAP_LANGUAGE=EN
```

**The `.env` file loads automatically for `npm run dev`, `npm start`, and the `arc1` CLI.** For `npx` and Docker, pass values as env vars or flags instead.

Full grouped template with every option: see [`.env.example`](https://github.com/marianfoo/arc-1/blob/main/.env.example). The file is grouped into Layer B (ARC-1 → SAP) and Layer A (MCP Client → ARC-1) blocks with fail-fast rules documented inline.

---

## MCP client configuration

All MCP clients that speak stdio work the same way — they spawn `npx arc-1` as a subprocess and talk JSON-RPC over stdin/stdout. The `env` block is where credentials and safety flags go.

### Claude Desktop

`~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows).

```json
{
  "mcpServers": {
    "sap": {
      "command": "npx",
      "args": ["-y", "arc-1@latest"],
      "env": {
        "SAP_URL": "https://your-sap-host:44300",
        "SAP_USER": "YOUR_USER",
        "SAP_PASSWORD": "YOUR_PASS",
        "SAP_CLIENT": "100"
      }
    }
  }
}
```

### Claude Code

Project-scoped: create `.mcp.json` in the repo root with the same shape as above. User-scoped: `~/.claude.json` with a `mcpServers` block.

### Cursor

Cursor Settings → MCP — same JSON shape as Claude Desktop.

### VS Code / GitHub Copilot (HTTP mode)

VS Code + Copilot speak HTTP Streamable, not stdio. Run ARC-1 as an HTTP server:

```bash
npx arc-1@latest --url https://host:44300 --user dev --password secret \
                 --client 100 \
                 --transport http-streamable --http-addr 127.0.0.1:3000
```

Then in VS Code MCP settings:

```json
{
  "mcpServers": {
    "sap": { "url": "http://localhost:3000/mcp" }
  }
}
```

> For a local loop, bind to `127.0.0.1` not `0.0.0.0` — stops other machines on the network from hitting your instance. If you bind `0.0.0.0`, add an API key: see [api-key-setup.md](api-key-setup.md).

### Gemini CLI / Goose / OpenCode / other stdio clients

Same pattern: spawn `npx -y arc-1@latest` with the same `env` block. All stdio clients are interchangeable.

---

## Safety profiles

> **ARC-1 ships read-only.** Writes, free SQL, named table preview, and transport actions are all blocked by default. Nothing the AI can do here will modify your SAP system until you flip a flag.

### What's blocked by default, and by which flag

| Capability | Default | Flag that blocks it | Tools/actions disabled when blocked |
|---|---|---|---|
| Writes | **off** | `SAP_READ_ONLY=true` | `SAPWrite` (create/update/delete/edit_method), `SAPActivate`, FLP workflow actions in `SAPManage` |
| Free SQL | **off** | `SAP_BLOCK_FREE_SQL=true` | `SAPQuery action=run_query` |
| Named table preview | **off** | `SAP_BLOCK_DATA=true` | `SAPQuery action=table_contents` |
| Transports | **off** | `SAP_ENABLE_TRANSPORTS=false` | **all** `SAPTransport` actions — including list/get |
| Package scope for writes | `$TMP` only | `SAP_ALLOWED_PACKAGES` | Writes to packages outside the allowlist fail. **Reads are never restricted by package.** |

### Profiles (shortcuts)

A profile sets several flags at once. Pick the closest, then widen specifics with individual flags.

| Profile | Writes | SQL | Data preview | Transports | Packages |
|---|---|---|---|---|---|
| *(none set)* | ❌ | ❌ | ❌ | ❌ | `$TMP` |
| `viewer` | ❌ | ❌ | ❌ | ❌ | `$TMP` |
| `viewer-data` | ❌ | ❌ | ✅ | ❌ | `$TMP` |
| `viewer-sql` | ❌ | ✅ | ✅ | ❌ | `$TMP` |
| `developer` | ✅ | ❌ | ❌ | ✅ | `$TMP` |
| `developer-data` | ✅ | ❌ | ✅ | ✅ | `$TMP` |
| `developer-sql` | ✅ | ✅ | ✅ | ✅ | `$TMP` |

### Recipes — enable exactly what you need

Put these in the `env` block of your MCP client config (or in `.env` / CLI flags). Individual flags override profile values, so you can combine them.

**Enable writes (stay in `$TMP`):**

```bash
SAP_READ_ONLY=false
```

**Enable writes to Z-packages as well:**

```bash
SAP_READ_ONLY=false
SAP_ALLOWED_PACKAGES=Z*,$TMP            # trailing * wildcard, comma-separated
```

**Enable free SQL (`SAPQuery run_query`):**

```bash
SAP_BLOCK_FREE_SQL=false
```

**Enable named table preview (`SAPQuery table_contents`):**

```bash
SAP_BLOCK_DATA=false
```

**Enable transport management (`SAPTransport` list/create/release/delete):**

```bash
SAP_ENABLE_TRANSPORTS=true
```

**Enable everything — writes, transports, SQL, data, unrestricted packages:**

```bash
ARC1_PROFILE=developer-sql
SAP_ALLOWED_PACKAGES=*
```

**Developer defaults (writes + transports, no SQL/data, `$TMP` only):**

```bash
ARC1_PROFILE=developer
```

### Package allowlist rules

- Comma-separated; trailing `*` wildcard only. `Z*,Y*,$TMP` matches `ZTEST`, `YFOO`, `$TMP`. Case-insensitive.
- `*` alone means unrestricted.
- Applies to **writes only** — `SAPRead`, `SAPSearch`, `SAPContext`, `SAPNavigate` are never package-filtered.

Full flag table: [configuration-reference.md](configuration-reference.md#safety-scopes-profiles). Production hardening recommendations: [security-guide.md](security-guide.md).

---

## SSO-only on-prem: cookie extractor

> ⚠️ **Developer-only escape hatch.** Single user, short-lived session, never for deployed / shared instances. The script refuses to run if `SAP_PP_ENABLED=true`.

Some corporate on-prem SAP systems return an HTML login page on `/sap/bc/adt/` instead of accepting Basic Auth — typically when SAML2 / SPNEGO / X.509 / Kerberos SSO is enforced. You're expected to authenticate through a browser.

For a single-developer local loop, the included extractor scrapes your existing SAP session cookies from Chrome and writes them to a file ARC-1 can reuse:

```bash
npm run extract-sap-cookies -- --url https://your-sap-host:44300
```

What it does:

1. Launches Chrome with remote-debugging enabled (CDP).
2. You complete your normal SSO login in the browser window (IdP redirect, MFA, whatever your corp flow is).
3. The script reads the SAP session cookies (`SAP_SESSIONID_*`, `MYSAPSSO2`, `sap-usercontext`) out of Chrome.
4. Writes them to `cookies.txt` with mode `0600`.

Then point ARC-1 at the cookie file:

```bash
export SAP_URL=https://your-sap-host:44300
export SAP_COOKIE_FILE=$PWD/cookies.txt
npx arc-1@latest
```

Startup log:

```
INFO: auth: MCP=[none] SAP=cookie (shared)
```

### When to use it

- ✅ SSO-only on-prem SAP, solo developer loop.
- ✅ Your IdP enforces MFA / X.509 client certs that can't be scripted.
- ❌ Multi-user / deployed ARC-1 — cookies are one user's session.
- ❌ BTP ABAP Environment — use [service-key OAuth](btp-abap-environment.md).
- ❌ Combined with `SAP_PP_ENABLED=true` — the extractor refuses, and ARC-1 fails at startup unless the explicit escape-hatch `SAP_PP_ALLOW_SHARED_COOKIES=true` is set.

### Limitations

- Cookies expire (usually minutes to hours). Re-run the script to refresh.
- SAP sees whichever user you logged in as, not "the MCP caller" — fine for solo dev, wrong for a shared service.
- No refresh token — you get whatever session the browser has.

For per-user SAP identity with a deployed ARC-1, the right answer is **Principal Propagation on BTP CF** — see [deployment.md → BTP Cloud Foundry](deployment.md#btp-cloud-foundry-with-principal-propagation).

---

## What you get at startup

Every ARC-1 startup prints a one-line auth summary on stderr:

```
INFO: auth: MCP=[none] SAP=basic (shared)
INFO: auth: MCP=[api-key] SAP=cookie (shared)
INFO: auth: MCP=[oidc] SAP=pp (per-user) [disable-saml=on]
```

This line tells you which Layer A / Layer B methods are active. If it disagrees with what you thought you configured, that's the first place to look.

Full auth reference (all methods, combinations, coexistence rules): [enterprise-auth.md](enterprise-auth.md).

---

## CLI usage (outside MCP)

Sometimes you just want to shell-test an ADT endpoint without running the full MCP server:

```bash
# Works off .env
npm run cli -- search ZCL_CUSTOMER
npm run cli -- source clas ZCL_CUSTOMER

# Verbose (shows every HTTP request)
SAP_VERBOSE=true npm run cli -- search ZCL_CUSTOMER
```

Full CLI reference → [cli-guide.md](cli-guide.md).

---

## Next

- **Deploy for a team** → [deployment.md](deployment.md)
- **All flags** → [configuration-reference.md](configuration-reference.md)
- **Auth internals and combinations** → [enterprise-auth.md](enterprise-auth.md)
- **Update ARC-1** → [updating.md](updating.md)
