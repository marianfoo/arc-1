# Authorization & Roles

ARC-1 uses a **three-layer authorization model**: every mutation must pass all three layers to succeed. Each layer has a specific role, and each is enforced independently.

```
┌───────────────────────────────────────────────────────────────────┐
│ Layer 1 — Server flag (ARC-1 config)                              │
│   "Does this instance allow this capability at all?"              │
│   Set via SAP_ALLOW_WRITES, SAP_ALLOW_TRANSPORT_WRITES, etc.      │
└───────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌───────────────────────────────────────────────────────────────────┐
│ Layer 2 — User scope (JWT / API-key profile)                      │
│   "Does this user have permission to do this?"                    │
│   Set via XSUAA role collections, OIDC scopes, or API-key profile │
└───────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌───────────────────────────────────────────────────────────────────┐
│ Layer 3 — SAP authorization (S_DEVELOP, S_ADT_RES, ...)           │
│   "Does the underlying SAP user have this authorization?"         │
│   Enforced by SAP per-user; reaches ARC-1 via principal propagation │
└───────────────────────────────────────────────────────────────────┘
```

**The two-gate rule**: every mutation (object write, transport write, git write, activation, FLP mutation) requires BOTH Layer 1 (server flag) AND Layer 2 (user scope). Layer 3 (SAP) is ARC-1-invariant and always applies. Reads of SAP object source/metadata require only Layer 2 (`read` scope); the server has no opt-out for plain reads. Table data preview and freestyle SQL have their own (flag, scope) pair.

---

## Server flags (Layer 1)

Seven positive opt-ins, all default `false` / restrictive:

| Flag / env var                       | Default    | Gates                                                        |
| ------------------------------------ | ---------- | ------------------------------------------------------------ |
| `SAP_ALLOW_WRITES` / `--allow-writes` | `false`    | Any object mutation (create, update, delete, activate, FLP)  |
| `SAP_ALLOW_DATA_PREVIEW` / `--allow-data-preview` | `false` | Named table content preview (`SAPRead(type=TABLE_CONTENTS)`)  |
| `SAP_ALLOW_FREE_SQL` / `--allow-free-sql` | `false` | Freestyle SQL via `SAPQuery`                                 |
| `SAP_ALLOW_TRANSPORT_WRITES` / `--allow-transport-writes` | `false` | Transport mutations (create / release / delete / reassign)   |
| `SAP_ALLOW_GIT_WRITES` / `--allow-git-writes` | `false`  | Git mutations (clone / pull / push / commit)                 |
| `SAP_ALLOWED_PACKAGES` / `--allowed-packages` | `$TMP` | Package allowlist for writes (`*` = any; reads unrestricted) |
| `SAP_ALLOWED_TRANSPORTS` / `--allowed-transports` | `[]` | Advanced: specific CTS transport ID whitelist                |
| `SAP_DENY_ACTIONS` / `--deny-actions` | `[]`     | Fine-grained per-action denial (see below)                   |

**Important**: `SAP_ALLOW_WRITES=false` truly blocks ALL mutations — object writes, transport writes, git writes, and activation. Transport reads and git reads remain available (gated only by scope). `SAP_ALLOW_TRANSPORT_WRITES` and `SAP_ALLOW_GIT_WRITES` are sub-gates within writes: admin must enable `SAP_ALLOW_WRITES=true` AND the specific capability for mutations to work.

---

## Scopes (Layer 2)

Seven scopes, JWT-bearing:

| Scope         | Grants                                                      | Implies                      |
| ------------- | ----------------------------------------------------------- | ---------------------------- |
| `read`        | Read ABAP object source, search, navigate, diagnose, lint   | —                            |
| `write`       | Create / update / delete objects; activate                  | `read` (implicit)            |
| `data`        | Preview named table contents (`TABLE_CONTENTS`)             | —                            |
| `sql`         | Execute freestyle SQL queries                               | `data` (implicit)            |
| `transports`  | Create / release / delete CTS transport requests            | —                            |
| `git`         | abapGit / gCTS mutations (clone / pull / push)              | —                            |
| `admin`       | Full administrative access                                  | **all other scopes** (v0.7)  |

**`admin` is special**: when extracted from a JWT (XSUAA or OIDC), it expands to include all seven scopes. An admin user never needs explicit `read`/`write`/etc. grants.

`write` implies `read` — a developer who can write can also read. `sql` implies `data` — a user who can run SQL can also preview tables. These are the only non-admin implications. `write` does NOT imply `transports` or `git` — those are orthogonal and require explicit grants.

---

## The two-gate matrix

Every ARC-1 tool action routes through this matrix:

| Capability                          | Required scope (Layer 2) | Required server flag (Layer 1)                   |
| ----------------------------------- | ------------------------ | ------------------------------------------------ |
| Read object source / metadata       | `read`                   | (none)                                           |
| Search objects                      | `read`                   | (none)                                           |
| Navigate (find def / references)    | `read`                   | (none)                                           |
| Lint                                | `read`                   | (none)                                           |
| Diagnose (ATC, dumps, unit tests)   | `read`                   | (none)                                           |
| Preview named table contents        | `data`                   | `allowDataPreview=true`                          |
| Run freestyle SQL                   | `sql`                    | `allowFreeSQL=true`                              |
| Create / update / delete object     | `write`                  | `allowWrites=true`                               |
| Activate object                     | `write`                  | `allowWrites=true`                               |
| Read transport info / list          | `read`                   | (none)                                           |
| Create / release / delete transport | `transports`             | `allowWrites=true` + `allowTransportWrites=true` |
| Read Git info / repos               | `read`                   | (none)                                           |
| Push / pull / commit via Git        | `git`                    | `allowWrites=true` + `allowGitWrites=true`       |

The internal `ACTION_POLICY` matrix (in `src/authz/policy.ts`) is the single source of truth for the per-action mappings. The CI validator (`npm run validate:policy`) asserts every action in `src/handlers/schemas.ts` has a matching policy entry.

---

## API-key profiles (for non-BTP deployments)

When auth is via `ARC1_API_KEYS="key:profile,key:profile"`, the profile name determines both the scope set AND a partial `SafetyConfig` that is INTERSECTED with the server ceiling (tight side wins field-by-field):

| Profile           | Scopes granted                                              | Safety (intersected with server)                        |
| ----------------- | ----------------------------------------------------------- | ------------------------------------------------------- |
| `viewer`          | `[read]`                                                    | Read-only; no data preview; no SQL                      |
| `viewer-data`     | `[read, data]`                                              | Read + data preview                                     |
| `viewer-sql`      | `[read, data, sql]`                                         | Read + data + SQL                                       |
| `developer`       | `[read, write, transports, git]`                            | Write + transports + git, $TMP only                     |
| `developer-data`  | `[read, write, data, transports, git]`                      | Developer + data preview                                |
| `developer-sql`   | `[read, write, data, sql, transports, git]`                 | Developer + data + SQL                                  |
| `admin`           | `[read, write, data, sql, transports, git, admin]`          | All `allow*` true, unrestricted packages                |

Example: `ARC1_API_KEYS="abc123:viewer,def456:developer-sql"`.

**Intersection semantics**: if the server has `allowWrites=false`, even a `developer`-profile key gets `allowWrites=false` (server ceiling wins). If the profile has `allowedPackages=['$TMP']` and server has `allowedPackages=['$TMP', 'Z*']`, the key sees `['$TMP']` (profile narrows). Profile cannot exceed server — if profile says `['Z*']` but server says `['$TMP']`, server wins.

---

## BTP XSUAA setup

On BTP, scopes come from the user's JWT issued by XSUAA. Roles are configured in `xs-security.json`:

**Shipped role templates** (customize in your xs-security.json if needed):

| Role template    | Scopes                                                                        |
| ---------------- | ----------------------------------------------------------------------------- |
| `MCPViewer`      | `read`                                                                        |
| `MCPDataViewer`  | `data`                                                                        |
| `MCPSqlUser`     | `data`, `sql`                                                                 |
| `MCPDeveloper`   | `read`, `write`, `transports`, `git`                                          |
| `MCPAdmin`       | `read`, `write`, `data`, `sql`, `transports`, `git`, `admin` (all)            |

**Shipped role collections** (BTP admin assigns these to users):

- `ARC-1 Viewer` → `MCPViewer`
- `ARC-1 Developer` → `MCPDeveloper`
- `ARC-1 Data Viewer` → `MCPViewer` + `MCPDataViewer`
- `ARC-1 Developer + Data` → `MCPDeveloper` + `MCPDataViewer`
- `ARC-1 Developer + SQL` → `MCPDeveloper` + `MCPSqlUser`
- `ARC-1 Admin` → `MCPAdmin`

**Want a restricted developer?** (e.g., write access but no CTS and no Git.) Create your own role template in the xs-security.json with just `[read, write]`, redeploy, and assign it to the user. Or use `SAP_DENY_ACTIONS` to block specific actions globally. See the [XSUAA Setup Guide](xsuaa-setup.md).

---

## Deny actions (advanced)

`SAP_DENY_ACTIONS` provides fine-grained per-action blocking that overrides scope + flag checks. Use cases:

- "Developers can write but cannot delete" → `SAP_DENY_ACTIONS=SAPWrite.delete`
- "Disable all FLP management" → `SAP_DENY_ACTIONS=SAPManage.flp_*`
- "Block all Git operations on this instance" → `SAP_DENY_ACTIONS=SAPGit`

**Grammar** (tool-qualified only):

- `Tool` — deny all actions of a tool (e.g., `SAPTransport`)
- `Tool.action` — exact action (e.g., `SAPWrite.delete`)
- `Tool.glob*` — glob within a tool (e.g., `SAPManage.flp_*`)
- Cross-tool wildcards like `*.delete` are **rejected** — forces admins to be explicit about which tool.

**Storage**: `SAP_DENY_ACTIONS` accepts either an inline CSV OR a filesystem path to a JSON array:

```bash
# Inline CSV
SAP_DENY_ACTIONS="SAPWrite.delete,SAPManage.flp_*"

# File path (auto-detected by `/`, `./`, `~/`, `../` prefix)
SAP_DENY_ACTIONS="./deny-actions.json"
# Contents of ./deny-actions.json:
# ["SAPWrite.delete", "SAPManage.flp_*"]
```

**Fail-fast**: server aborts at startup if `SAP_DENY_ACTIONS` references an unknown tool or action, has invalid grammar, or cannot be read/parsed. No silent fallback.

---

## Recipes — reaching a specific state

Common configurations, copy-paste ready. Set these in `.env` or pass as CLI flags.

### Local read-only exploration (default)

No config needed. Defaults are restrictive. Reads of source/metadata work; everything else is blocked.

### Local developer (writes to $TMP and Z* packages)

```bash
SAP_ALLOW_WRITES=true
SAP_ALLOWED_PACKAGES="$TMP,Z*"
```

### Local developer + CTS transports

```bash
SAP_ALLOW_WRITES=true
SAP_ALLOWED_PACKAGES="$TMP,Z*"
SAP_ALLOW_TRANSPORT_WRITES=true
```

### Local developer + table data preview

```bash
SAP_ALLOW_WRITES=true
SAP_ALLOWED_PACKAGES="$TMP,Z*"
SAP_ALLOW_DATA_PREVIEW=true
```

### Local developer + freestyle SQL

```bash
SAP_ALLOW_WRITES=true
SAP_ALLOWED_PACKAGES="$TMP,Z*"
SAP_ALLOW_DATA_PREVIEW=true
SAP_ALLOW_FREE_SQL=true
```

### Local developer + abapGit/gCTS writes

```bash
SAP_ALLOW_WRITES=true
SAP_ALLOWED_PACKAGES="$TMP,Z*"
SAP_ALLOW_GIT_WRITES=true
```

### Full unrestricted local dev (not for production)

```bash
SAP_ALLOW_WRITES=true
SAP_ALLOW_DATA_PREVIEW=true
SAP_ALLOW_FREE_SQL=true
SAP_ALLOW_TRANSPORT_WRITES=true
SAP_ALLOW_GIT_WRITES=true
SAP_ALLOWED_PACKAGES="*"
```

### Multi-user production: writes allowed server-wide, users restricted by scope

```bash
SAP_TRANSPORT=http-streamable
SAP_ALLOW_WRITES=true
SAP_ALLOW_DATA_PREVIEW=true
SAP_ALLOW_FREE_SQL=true
SAP_ALLOW_TRANSPORT_WRITES=true
SAP_ALLOW_GIT_WRITES=true
SAP_ALLOWED_PACKAGES="$TMP,Z*,Y*"
ARC1_API_KEYS="key-viewer-abc:viewer,key-dev-def:developer,key-admin-xyz:admin"
```

Each API key now receives the intersection of its profile with the server ceiling.

### Deny dangerous actions even for developers

```bash
SAP_ALLOW_WRITES=true
SAP_ALLOWED_PACKAGES="$TMP,Z*"
SAP_DENY_ACTIONS="SAPWrite.delete,SAPManage.flp_delete_catalog"
```

---

## Troubleshooting — "Which layer blocked me?"

When you get a scope or safety error, identify which layer by the error text:

| Error fragment                                    | Layer       | Typical cause                                      | Fix                                                                       |
| ------------------------------------------------- | ----------- | -------------------------------------------------- | ------------------------------------------------------------------------- |
| `Insufficient scope: 'write' required for ...`    | Layer 2     | Your JWT / API-key profile lacks `write`           | Assign the correct role collection (BTP) or API-key profile               |
| `Insufficient scope: 'transports' required ...`   | Layer 2     | Missing `transports` scope                         | Grant `MCPDeveloper` role template or use `developer` API-key profile     |
| `Insufficient scope: 'git' required ...`          | Layer 2     | Missing `git` scope                                | Same (all developer-\* profiles include `git`)                            |
| `allowWrites=false blocks mutations`              | Layer 1     | Server's `allowWrites` is false                    | Set `SAP_ALLOW_WRITES=true` on the server                                  |
| `allowTransportWrites=false`                      | Layer 1     | Transport-write flag is off                        | Set `SAP_ALLOW_TRANSPORT_WRITES=true` + ensure `allowWrites=true`         |
| `allowGitWrites=false`                            | Layer 1     | Git-write flag is off                              | Set `SAP_ALLOW_GIT_WRITES=true` + ensure `allowWrites=true`               |
| `allowDataPreview=false`                          | Layer 1     | Table preview flag is off                          | Set `SAP_ALLOW_DATA_PREVIEW=true`                                         |
| `allowFreeSQL=false`                              | Layer 1     | Freestyle SQL flag is off                          | Set `SAP_ALLOW_FREE_SQL=true`                                             |
| `Operations on package '...' are blocked`         | Layer 1     | Package not in `allowedPackages`                   | Add to `SAP_ALLOWED_PACKAGES` or use `*`                                   |
| `denied by server policy (SAP_DENY_ACTIONS)`      | Layer 1 +   | Matching deny pattern                              | Remove / adjust the pattern in `SAP_DENY_ACTIONS`                         |
| `No authorization for object ...` (SAP-side)      | Layer 3     | SAP user lacks S_DEVELOP / S_ADT_RES authorization | Grant SAP authorization via SU01 / PFCG                                   |
| `Legacy authorization config detected`            | Migration   | You have a removed env var like `SAP_READ_ONLY`    | See [Upgrading](updating.md) for the old→new mapping                       |

**Quick debugging tip**: run `arc-1 config show` on the server to see the resolved effective policy with per-field source attribution. For contradictions (like `allowTransportWrites=true` while `allowWrites=false`), look for `WARN: config contradiction: ...` in startup logs.

---

## References

- [Configuration Reference](configuration-reference.md) — flat list of every env var / flag
- [XSUAA Setup](xsuaa-setup.md) — BTP role templates, assignment, SSO
- [OAuth / JWT Setup](oauth-jwt-setup.md) — self-hosted OIDC IdPs (Entra ID, Okta, ...)
- [Principal Propagation Setup](principal-propagation-setup.md) — per-user SAP auth
- [Security Guide](security-guide.md) — hardening recommendations
- [Upgrading](updating.md) — migration guide from v0.6.x
