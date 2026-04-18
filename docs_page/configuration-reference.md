# Configuration Reference

Every flag, env var, and default in one place.

Global precedence: **CLI flag > env var > `.env` file > built-in default**. Within the safety layer, **profiles apply first and explicit safety flags override the profile's values**.

For the grouped template with inline commentary, see [`.env.example`](https://github.com/marianfoo/arc-1/blob/main/.env.example).

---

## Mental model

ARC-1 has three independent gates:

1. **Server safety config = ceiling.** `SAP_READ_ONLY`, `SAP_ALLOWED_PACKAGES`, `SAP_ENABLE_TRANSPORTS`, and related flags define the maximum power this process will expose.
2. **Profiles and MCP auth scopes = gate beneath that ceiling.** Use `ARC1_PROFILE` first for local development. API-key profiles and JWT scopes can only restrict further; they never widen the server ceiling.
3. **SAP authorization = final per-user check.** Even if ARC-1 allows an action, SAP can still reject it based on the SAP user's own permissions.

These gates combine with **AND**, not OR.

**Precedence example:** `ARC1_PROFILE=developer` + `SAP_READ_ONLY=true` stays read-only. The profile enables writes and transports first, then the explicit flag overrides that part of the profile again.

**Transport note:** `SAP_ENABLE_TRANSPORTS` is still explicit. Today it turns on only via a developer profile or `SAP_ENABLE_TRANSPORTS=true`; it is not auto-derived from `SAP_ALLOWED_PACKAGES`.

---

## Safety / scopes / profiles

**Every gate below defaults to the restrictive setting.** ARC-1 starts read-only: no writes, no free SQL, no named table preview, no transport actions, writes confined to `$TMP`.

Profiles are the primary knob. Pick the closest preset first, then use individual flags only when you need a custom mix.

### Profile expansions

Profiles are shortcuts. Individual flags set alongside a profile **override** the profile's values.

| Profile | `readOnly` | `blockData` | `blockFreeSQL` | `enableTransports` | `allowedPackages` |
|---|:---:|:---:|:---:|:---:|---|
| *(none)* | `true` | `true` | `true` | `false` | `$TMP` |
| `viewer` | `true` | `true` | `true` | `false` | (default) |
| `viewer-data` | `true` | `false` | `true` | `false` | (default) |
| `viewer-sql` | `true` | `false` | `false` | `false` | (default) |
| `developer` | `false` | `true` | `true` | `true` | `$TMP` |
| `developer-data` | `false` | `false` | `true` | `true` | `$TMP` |
| `developer-sql` | `false` | `false` | `false` | `true` | `$TMP` |

### Common recipes

| Use case | Set | Result |
|---|---|---|
| Read/search only | nothing, or `ARC1_PROFILE=viewer` | Safe default: no writes, no SQL, no table preview, no transports |
| Read + named table preview | `ARC1_PROFILE=viewer-data` | Enables `SAPQuery action=table_contents`, still no writes or free SQL |
| Read + SQL + table preview | `ARC1_PROFILE=viewer-sql` | Enables both `SAPQuery` modes, still no writes or transports |
| Writes + transports in `$TMP` | `ARC1_PROFILE=developer` | Local development preset without SQL or table preview |
| Full local development | `ARC1_PROFILE=developer-sql` + `SAP_ALLOWED_PACKAGES=*` | Writes + SQL + table preview + transports, unrestricted packages |
| Power-user operation filter | Start from a profile or explicit safety flags, then add `SAP_ALLOWED_OPS` / `SAP_DISALLOWED_OPS` | Fine-grained op gating layered on top of `SAP_READ_ONLY`, `SAP_BLOCK_DATA`, and `SAP_BLOCK_FREE_SQL` |

The recipes above show raw config values. When you pass them through a shell flag such as `-e`, quote shell-sensitive package patterns like `*` or `$TMP`: `-e SAP_ALLOWED_PACKAGES='*'` or `-e SAP_ALLOWED_PACKAGES='Z*,$TMP'`. In JSON, `.env`, and `--env-file`, use the raw value without extra shell quotes.

### Safety flags

| Flag | Env Var | Default | What it blocks when enabled |
|---|---|---|---|
| `--read-only` | `SAP_READ_ONLY` | `true` | `SAPWrite` (create/update/delete/edit_method), `SAPActivate`, FLP workflow actions — i.e. ops `C`, `U`, `D`, `A`, `W` |
| `--block-data` | `SAP_BLOCK_DATA` | `true` | `SAPQuery action=table_contents` (op `Q`) |
| `--block-free-sql` | `SAP_BLOCK_FREE_SQL` | `true` | `SAPQuery action=run_query` (op `F`) |
| `--enable-transports` | `SAP_ENABLE_TRANSPORTS` | `false` | When `false`, **all** `SAPTransport` actions are blocked — list, get, create, release, delete, reassign. Current behavior: stays off unless a developer profile or this flag enables it |
| `--allowed-packages` | `SAP_ALLOWED_PACKAGES` | `$TMP` | Writes targeting packages outside this list fail. Comma-separated, trailing `*` wildcard only (`Z*,Y*,$TMP`). `*` alone = unrestricted. **Reads are never package-filtered.** |
| `--allowed-ops` | `SAP_ALLOWED_OPS` | — | Whitelist operation codes (e.g. `RSQ`) — anything not listed is blocked. Power-user knob when profiles are too coarse |
| `--disallowed-ops` | `SAP_DISALLOWED_OPS` | — | Blacklist operation codes — listed codes are blocked, rest allowed |
| `--profile` | `ARC1_PROFILE` | — | Preset — expands to multiple flags, see [profile expansions](#profile-expansions) above |
| `--tool-mode` | `ARC1_TOOL_MODE` | `standard` | `standard` (11 tools) / `hyperfocused` (1 tool, ~200 tokens) |
| `--abaplint-config` | `SAP_ABAPLINT_CONFIG` | — | Path to custom abaplint.jsonc |
| `--lint-before-write` | `SAP_LINT_BEFORE_WRITE` | `true` | Pre-write lint validation |

### Operation-type codes

Used in `--allowed-ops` / `--disallowed-ops`:

```
Reads:  R = Read       S = Search     I = Intelligence (findRef, whereUsed, completion)
        Q = Query (table preview)     F = FreeSQL
Writes: C = Create     U = Update     D = Delete     A = Activate     W = Workflow (FLP)
Other:  T = Test (unit)   L = Lock   X = Transport
```

Write operations `C`, `D`, `U`, `A`, `W` are all blocked when `readOnly=true`, regardless of the op filter.

---

## SAP connection

| Flag | Env Var | Default | Description |
|---|---|---|---|
| `--url` | `SAP_URL` | — | SAP system URL (required) |
| `--client` | `SAP_CLIENT` | `100` | SAP client number |
| `--language` | `SAP_LANGUAGE` | `EN` | SAP logon language |
| `--insecure` | `SAP_INSECURE` | `false` | Skip TLS verification (dev only) |
| `--system-type` | `SAP_SYSTEM_TYPE` | `auto` | `auto` / `btp` / `onprem` |

## Layer B — ARC-1 → SAP authentication

Pick one primary method. Combinations that coexist safely are in the [Coexistence Matrix](enterprise-auth.md#coexistence-matrix).

### B1. Basic Auth

| Flag | Env Var | Description |
|---|---|---|
| `--user` | `SAP_USER` | SAP username |
| `--password` | `SAP_PASSWORD` | SAP password |

### B2. Cookie Auth (dev-only, SSO on-prem)

| Flag | Env Var | Description |
|---|---|---|
| `--cookie-file` | `SAP_COOKIE_FILE` | Path to Netscape-format cookie file |
| `--cookie-string` | `SAP_COOKIE_STRING` | Inline cookies (`k=v; k2=v2`) |

Not for production. See [local-development.md → SSO cookie extractor](local-development.md#sso-only-on-prem-cookie-extractor).

### B3. BTP ABAP Environment (direct OAuth)

| Flag | Env Var | Description |
|---|---|---|
| `--btp-service-key-file` | `SAP_BTP_SERVICE_KEY_FILE` | Path to BTP service key JSON |
| `--btp-service-key` | `SAP_BTP_SERVICE_KEY` | Inline BTP service key JSON |
| `--btp-oauth-callback-port` | `SAP_BTP_OAUTH_CALLBACK_PORT` | `0` (auto) |

Full reference: [btp-abap-environment.md](btp-abap-environment.md).

### B4. BTP Destination Service

| Env Var | Description |
|---|---|
| `SAP_BTP_DESTINATION` | Destination name (shared/Basic) |
| `SAP_BTP_PP_DESTINATION` | Destination name (`PrincipalPropagation` type) |

Full reference: [btp-destination-setup.md](btp-destination-setup.md).

### B5. Principal Propagation

| Flag | Env Var | Default | Description |
|---|---|---|---|
| `--pp-enabled` | `SAP_PP_ENABLED` | `false` | Per-user SAP identity |
| `--pp-strict` | `SAP_PP_STRICT` | `false` | PP failure = error, no fallback |
| `--pp-allow-shared-cookies` | `SAP_PP_ALLOW_SHARED_COOKIES` | `false` | Escape hatch: allow cookies to coexist with PP (cookies stay on shared client only) |

Full reference: [principal-propagation-setup.md](principal-propagation-setup.md).

### Layer B extras

| Flag | Env Var | Default | Description |
|---|---|---|---|
| `--disable-saml` | `SAP_DISABLE_SAML` | `false` | Emit `X-SAP-SAML2: disabled` + `?saml2=disabled` (SAP Note 3456236). **Breaks BTP ABAP / S/4 Public Cloud.** |

---

## Layer A — MCP Client → ARC-1 authentication

Multiple methods chain — API Key + OIDC + XSUAA can all be active on one instance.

### A1. No auth (stdio only, local dev)

Set nothing.

### A2. API Key(s)

| Flag | Env Var | Description |
|---|---|---|
| `--api-key` | `ARC1_API_KEY` | Single shared bearer token |
| `--api-keys` | `ARC1_API_KEYS` | Multi-key with profiles: `key1:viewer,key2:developer` |

Full reference: [api-key-setup.md](api-key-setup.md).

### A3. OIDC / JWT

| Flag | Env Var | Default | Description |
|---|---|---|---|
| `--oidc-issuer` | `SAP_OIDC_ISSUER` | — | OIDC issuer URL |
| `--oidc-audience` | `SAP_OIDC_AUDIENCE` | — | Expected audience claim |
| `--oidc-clock-tolerance` | `SAP_OIDC_CLOCK_TOLERANCE` | `0` | JWT clock skew seconds |

Full reference: [oauth-jwt-setup.md](oauth-jwt-setup.md).

### A4. XSUAA OAuth (BTP)

| Flag | Env Var | Default | Description |
|---|---|---|---|
| `--xsuaa-auth` | `SAP_XSUAA_AUTH` | `false` | Enable XSUAA token validation |

Full reference: [xsuaa-setup.md](xsuaa-setup.md).

---

## Transport & logging

| Flag | Env Var | Default | Description |
|---|---|---|---|
| `--transport` | `SAP_TRANSPORT` | `stdio` | `stdio` / `http-streamable` |
| `--http-addr` | `ARC1_HTTP_ADDR` / `SAP_HTTP_ADDR` | `0.0.0.0:8080` | HTTP bind address |
| `--port` | `ARC1_PORT` | `8080` | HTTP port (simpler alternative to `--http-addr`) |
| `--log-file` | `ARC1_LOG_FILE` | — | File sink path |
| `--log-level` | `ARC1_LOG_LEVEL` | `info` | `debug` / `info` / `warn` / `error` |
| `--log-format` | `ARC1_LOG_FORMAT` | `text` | `text` / `json` |
| `--verbose` | `SAP_VERBOSE` | `false` | Debug-level logging |

---

## Cache & concurrency

| Flag | Env Var | Default | Description |
|---|---|---|---|
| `--cache` | `ARC1_CACHE` | `auto` | `auto` / `memory` / `sqlite` / `none` |
| `--cache-file` | `ARC1_CACHE_FILE` | `.arc1-cache.db` | SQLite cache path |
| `--cache-warmup` | `ARC1_CACHE_WARMUP` | `false` | Pre-warm cache via TADIR scan on startup |
| `--cache-warmup-packages` | `ARC1_CACHE_WARMUP_PACKAGES` | — | Package filter (e.g. `Z*,Y*`) |
| `--max-concurrent` | `ARC1_MAX_CONCURRENT` | `10` | Max concurrent SAP HTTP requests |

Full reference: [caching.md](caching.md).

---

## Priority and combination rules

- **Priority:** CLI flag > env var > `.env` file > built-in default.
- **Layer A methods chain:** any combination of API Key / OIDC / XSUAA is valid and active simultaneously.
- **Layer B methods don't chain freely:** see the [Coexistence Matrix](enterprise-auth.md#coexistence-matrix). Unsafe combinations fail fast at startup.
- **Startup auth summary:** ARC-1 logs one line telling you exactly what's active — `auth: MCP=[...] SAP=[...] (shared|per-user) [disable-saml=on]`. When in doubt, read that line first.
