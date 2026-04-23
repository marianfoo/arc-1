# Authorization & Roles

Who can do what, and where it's checked.

## In 30 seconds

ARC-1 has **three layers of authorization**. Every mutation (anything that writes, activates, transports, or pushes to Git) must clear all three:

```
  ╭──── Layer 1 — Server flag ────╮    "Is this capability enabled on this instance?"
  │      SAP_ALLOW_WRITES, etc.   │     Admin sets once at server startup
  ╰───────────────────────────────╯
  ╭──── Layer 2 — User scope ─────╮    "Does THIS user have permission?"
  │      JWT / API-key profile    │     Per-user, via XSUAA / OIDC / API-key profile
  ╰───────────────────────────────╯
  ╭──── Layer 3 — SAP auth ───────╮    "Does the SAP user have the authorization?"
  │      S_DEVELOP, S_ADT_RES     │     SAP's own PFCG roles per user
  ╰───────────────────────────────╯
```

**Reads of ABAP object source/metadata only require Layer 2** — ARC-1 never gates plain reads at the server level. Everything else needs both Layer 1 AND Layer 2 to succeed. Layer 3 is SAP's own check and always applies.

**Three tips**:
- Defaults are restrictive: `SAP_ALLOW_WRITES=false`, no SQL, no data preview, `$TMP` only.
- `admin` scope on a JWT expands to all 7 scopes automatically.
- `SAP_ALLOW_WRITES=false` blocks **every** mutation — object writes, transport writes, git writes, activation. There is no loophole.

---

## The capability matrix

This single table is the source of truth for what you need to grant for each operation. If you understand this table, you understand ARC-1 authorization.

| Capability                              | Scope (Layer 2) | Server flag (Layer 1)                              |
| --------------------------------------- | --------------- | -------------------------------------------------- |
| Read object source / metadata           | `read`          | — (always on)                                      |
| Search objects                          | `read`          | — (always on)                                      |
| Navigate (find def / references)        | `read`          | — (always on)                                      |
| Lint                                    | `read`          | — (always on)                                      |
| Diagnose (ATC, dumps, unit tests)       | `read`          | — (always on)                                      |
| Read transport info / list / history    | `read`          | — (always on)                                      |
| Read abapGit / gCTS info / list         | `read`          | — (always on)                                      |
| Preview named table contents            | `data`          | `SAP_ALLOW_DATA_PREVIEW=true`                      |
| Run freestyle SQL                       | `sql`           | `SAP_ALLOW_FREE_SQL=true`                          |
| Create / update / delete object         | `write`         | `SAP_ALLOW_WRITES=true`                            |
| Activate object                         | `write`         | `SAP_ALLOW_WRITES=true`                            |
| Package / FLP management                 | `write`         | `SAP_ALLOW_WRITES=true`                            |
| Create / release / delete transport     | `transports`    | `SAP_ALLOW_WRITES=true` + `SAP_ALLOW_TRANSPORT_WRITES=true` |
| Clone / pull / push / commit (Git)      | `git`           | `SAP_ALLOW_WRITES=true` + `SAP_ALLOW_GIT_WRITES=true`       |

For writes, `SAP_ALLOWED_PACKAGES` also applies — by default `$TMP` only. Set it to e.g. `$TMP,Z*` to allow writes to Z-packages.

`SAP_DENY_ACTIONS` provides an extra deny-list layer that overrides everything above (see [Advanced: deny actions](#advanced-deny-actions)).

---

## Scopes

Seven scopes, carried in the user's JWT or derived from an API-key profile:

| Scope          | Grants                                                    | Implies                |
| -------------- | --------------------------------------------------------- | ---------------------- |
| `read`         | Read source, search, navigate, lint, diagnose             | —                      |
| `write`        | Create / update / delete / activate ABAP objects          | `read`                 |
| `data`         | Preview named table contents                               | —                      |
| `sql`          | Execute freestyle SQL                                      | `data`                 |
| `transports`   | Create / release / delete CTS transport requests           | —                      |
| `git`          | abapGit / gCTS push / pull / commit                        | —                      |
| `admin`        | Everything                                                 | all other scopes       |

`write` does NOT imply `transports` or `git` — those are orthogonal. A plain developer can modify `$TMP` code; to move that code into a transport or push to Git, they need the additional scope.

---

## How scopes get assigned

| Auth method                | How the user's scopes are determined                                  |
| -------------------------- | --------------------------------------------------------------------- |
| **No auth** (stdio / dev)  | Scope checks skipped entirely; Layer 1 flags are the only control     |
| **API key** (ARC1_API_KEYS) | Profile name attached to the key → fixed scope set + partial safety  |
| **OIDC / JWT**             | `scope` / `scp` claim in the JWT                                      |
| **XSUAA** (BTP)            | `scope` claim in the XSUAA-issued JWT → determined by role collection |

### API-key profiles (non-BTP)

`ARC1_API_KEYS="key:profile,key:profile"`. Each profile maps to both a scope set AND a partial safety config intersected with the server ceiling:

| Profile           | Scopes                                                  | Package default |
| ----------------- | ------------------------------------------------------- | --------------- |
| `viewer`          | `[read]`                                                | —               |
| `viewer-data`     | `[read, data]`                                          | —               |
| `viewer-sql`      | `[read, data, sql]`                                     | —               |
| `developer`       | `[read, write, transports, git]`                        | `$TMP`          |
| `developer-data`  | `[read, write, data, transports, git]`                  | `$TMP`          |
| `developer-sql`   | `[read, write, data, sql, transports, git]`             | `$TMP`          |
| `admin`           | all 7                                                   | (unrestricted)  |

Example: `ARC1_API_KEYS="abc:viewer,def:developer-sql"`.

The profile **cannot exceed** the server ceiling — if the server has `SAP_ALLOW_WRITES=false`, even a `developer` key cannot write.

### BTP XSUAA (role templates)

`xs-security.json` ships with 5 role templates and 6 role collections. BTP admins assign role collections to users via SAP BTP Cockpit → Security.

| Role template    | Scopes                                                              |
| ---------------- | ------------------------------------------------------------------- |
| `MCPViewer`      | `read`                                                              |
| `MCPDataViewer`  | `data`                                                              |
| `MCPSqlUser`     | `data`, `sql`                                                       |
| `MCPDeveloper`   | `read`, `write`, `transports`, `git`                                |
| `MCPAdmin`       | all 7                                                               |

Role collections combine templates — e.g. `ARC-1 Developer + SQL` = `MCPDeveloper` + `MCPSqlUser`. See [XSUAA Setup](xsuaa-setup.md) for assignment details.

**Want a restricted developer** (e.g. can write but cannot transport or push to Git)? Define your own role template in `xs-security.json` with just `[read, write]` and redeploy. Or block specific actions via `SAP_DENY_ACTIONS`.

---

## Advanced: deny actions

`SAP_DENY_ACTIONS` is a fine-grained blocklist that applies AFTER scope + flag checks pass. Use it when you need to say "developers can write, but cannot delete" — scopes and flags are too coarse for that.

**Grammar** (tool-qualified only):

| Form             | Meaning                                          | Example                        |
| ---------------- | ------------------------------------------------ | ------------------------------ |
| `Tool`           | Deny every action of this tool                   | `SAPGit`                       |
| `Tool.action`    | Deny exactly this action                         | `SAPWrite.delete`              |
| `Tool.glob*`    | Glob match within a tool (`*` matches anything) | `SAPManage.flp_*`              |

Cross-tool wildcards like `*.delete` are rejected at startup.

**Storage**: inline CSV in the env var, OR a filesystem path to a JSON array. Auto-detected by `/`, `./`, `~/`, or `../` prefix.

```bash
# Inline
SAP_DENY_ACTIONS="SAPWrite.delete,SAPManage.flp_*"

# File
SAP_DENY_ACTIONS="./deny-actions.json"   # contains: ["SAPWrite.delete", "SAPManage.flp_*"]
```

ARC-1 **aborts at startup** if the value references an unknown tool / action, has invalid grammar, or cannot be read. No silent fallback.

---

## Recipes

The three common starting points. For the full reference (every flag, every default), see [configuration-reference.md](configuration-reference.md). For the explanation of the migration from v0.6, see [updating.md](updating.md).

### Just read and explore (default)

No config needed. Defaults are restrictive — reads work, everything else is blocked.

### Local developer

```bash
SAP_ALLOW_WRITES=true
SAP_ALLOWED_PACKAGES="$TMP,Z*"
# Optional, opt-in as needed:
# SAP_ALLOW_TRANSPORT_WRITES=true
# SAP_ALLOW_GIT_WRITES=true
# SAP_ALLOW_DATA_PREVIEW=true
# SAP_ALLOW_FREE_SQL=true
```

### Production multi-user (HTTP transport + API-key profiles)

```bash
SAP_TRANSPORT=http-streamable
SAP_ALLOW_WRITES=true
SAP_ALLOW_DATA_PREVIEW=true
SAP_ALLOW_FREE_SQL=true
SAP_ALLOW_TRANSPORT_WRITES=true
SAP_ALLOW_GIT_WRITES=true
SAP_ALLOWED_PACKAGES="$TMP,Z*,Y*"
ARC1_API_KEYS="viewer-key:viewer,dev-key:developer,admin-key:admin"
```

The server runs at maximum capability; individual users get whatever their API-key profile allows (intersected with the server ceiling).

---

## Troubleshooting — "Which layer blocked me?"

| Error fragment                                      | Layer     | Fix                                                                 |
| --------------------------------------------------- | --------- | ------------------------------------------------------------------- |
| `Insufficient scope: 'write' required for ...`      | Layer 2   | User's JWT / API-key profile lacks `write`                          |
| `Insufficient scope: 'transports' required ...`     | Layer 2   | User lacks `transports` — grant `MCPDeveloper` or `developer` profile |
| `Insufficient scope: 'git' required ...`            | Layer 2   | User lacks `git` — grant `MCPDeveloper` or `developer` profile      |
| `allowWrites=false blocks mutations`                | Layer 1   | Set `SAP_ALLOW_WRITES=true` on the server                           |
| `allowTransportWrites=false`                        | Layer 1   | Set `SAP_ALLOW_TRANSPORT_WRITES=true` (plus `SAP_ALLOW_WRITES=true`) |
| `allowGitWrites=false`                              | Layer 1   | Set `SAP_ALLOW_GIT_WRITES=true` (plus `SAP_ALLOW_WRITES=true`)      |
| `allowDataPreview=false`                            | Layer 1   | Set `SAP_ALLOW_DATA_PREVIEW=true`                                   |
| `allowFreeSQL=false`                                | Layer 1   | Set `SAP_ALLOW_FREE_SQL=true`                                       |
| `Operations on package '...' are blocked`           | Layer 1   | Add the package to `SAP_ALLOWED_PACKAGES`                           |
| `denied by server policy (SAP_DENY_ACTIONS)`        | Deny-list | Remove or narrow the pattern in `SAP_DENY_ACTIONS`                  |
| `No authorization for object ...`                   | Layer 3   | Grant SAP authorization (S_DEVELOP, S_ADT_RES) via SU01 / PFCG      |
| `Legacy authorization config detected`              | Migration | Old env var like `SAP_READ_ONLY`. See [updating.md](updating.md#v07-authorization-refactor-breaking-change) |

**Debugging tools**:

- `arc-1 config show` — dumps the resolved effective policy with per-field source attribution
- Startup log line: `effective safety: writes=YES data=NO ...` — shows the final values
- Startup `WARN: config contradiction: ...` — flags useless combos (like `allowTransportWrites=true` with `allowWrites=false`)

---

## References

- [Configuration Reference](configuration-reference.md) — every flag and env var
- [XSUAA Setup](xsuaa-setup.md) — BTP role templates, SSO
- [OAuth / JWT Setup](oauth-jwt-setup.md) — Entra ID, Okta, self-hosted OIDC
- [Principal Propagation Setup](principal-propagation-setup.md) — per-user SAP auth
- [Security Guide](security-guide.md) — hardening recommendations
- [Upgrading](updating.md) — migration guide from v0.6
