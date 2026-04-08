# Authorization & Roles

ARC-1 controls what authenticated users can do through a layered authorization model. This document explains the scope and role system, how it integrates with the safety controls, and how to assign permissions for different user types.

For **how to authenticate** users (API keys, OAuth, XSUAA), see the [Authentication Overview](enterprise-auth.md).

---

## The Two Security Layers

ARC-1 enforces authorization at two independent levels. Both must allow an operation for it to succeed.

```
MCP Client Request
        │
        ▼
┌───────────────────────┐
│  Layer 1: ARC-1       │  Scopes (from JWT) + Safety Config (from server)
│  Scope & Safety Check │  "Is this user allowed to call this tool?"
└───────┬───────────────┘
        │  ✓ allowed
        ▼
┌───────────────────────┐
│  Layer 2: SAP System  │  SAP Authorization Objects (S_DEVELOP, S_ADT_RES, ...)
│  Authorization Check  │  "Is this SAP user allowed to access this object?"
└───────┬───────────────┘
        │  ✓ allowed
        ▼
    Operation executes
```

**Layer 1** is under your control as the ARC-1 administrator. It determines which MCP tools and operations a user can access.

**Layer 2** is the SAP system's own authorization. Even if ARC-1 allows an operation, SAP may still reject it based on the SAP user's authorization profile. This is especially relevant with [Principal Propagation](principal-propagation-setup.md), where each MCP user maps to a different SAP user with different permissions.

!!! info "Defense in depth"
    When using Principal Propagation, ARC-1 still enforces its own scopes. A user with only the `read` scope cannot write code even if their SAP user has full developer authorization. This prevents accidental or malicious privilege escalation through the MCP layer.

---

## Scopes

Scopes define what a user is allowed to do in ARC-1. They are carried in JWT tokens (from XSUAA or OIDC providers) and checked on every tool call.

### The Five Scopes

| Scope | What it grants | MCP Tools |
|-------|---------------|-----------|
| **`read`** | Read source code, search objects, navigate references, run unit tests, check syntax, view diagnostics | SAPRead, SAPSearch, SAPNavigate, SAPContext, SAPLint, SAPDiagnose |
| **`write`** | Create, modify, delete objects. Activate. Manage transports. | SAPWrite, SAPActivate, SAPManage, SAPTransport |
| **`data`** | Preview table contents (named tables via SAPRead) | Unlocks TABLE_CONTENTS in SAPRead |
| **`sql`** | Execute freestyle SQL queries | SAPQuery |
| **`admin`** | Reserved for future administrative features | None currently |

### Scope Implications

Some scopes automatically include others:

- **`write`** implies **`read`** — a developer who can write can also read
- **`sql`** implies **`data`** — a user who can run freestyle SQL can also preview tables

This means you never need to assign both `write` and `read` to the same user. Assigning `write` is sufficient.

### Two Dimensions: Objects vs Data

The scope model separates ABAP source code access from SAP data access:

| | Read | Write |
|---|---|---|
| **Objects** (source code) | `read` | `write` |
| **Data** (table contents, SQL) | `data` | `sql` |

This separation exists because reading source code and reading business data are fundamentally different security concerns. A developer may need full access to ABAP source but should not necessarily be able to query production data tables. Conversely, a data analyst may need table preview access without being able to modify source code.

---

## How Scopes Are Assigned

How users receive scopes depends on the authentication method:

| Auth Method | How Scopes Are Determined | Can Restrict Per User? |
|-------------|--------------------------|----------------------|
| **No auth** (stdio, local) | No scopes — safety config only | No |
| **API Key** | Full access (`read`, `write`, `data`, `sql`, `admin`) | No |
| **OIDC / JWT** | Extracted from JWT `scope` or `scp` claims | Yes (configure in IdP) |
| **XSUAA** | Extracted from XSUAA token local scopes | Yes (via BTP role collections) |

!!! warning "API keys grant full access"
    API keys cannot be scoped. Every valid API key grants all permissions. For per-user access control, use OIDC or XSUAA authentication instead.

!!! note "OIDC tokens without scope claims"
    If an OIDC JWT contains no `scope` or `scp` claims, ARC-1 defaults to **read-only access** and logs a warning. Configure your OIDC provider to include ARC-1 scopes in tokens. See [OAuth / JWT Setup](oauth-jwt-setup.md) for provider-specific instructions.

---

## Safety Config: The Server-Level Ceiling

Independent of scopes, the server administrator can set a global safety configuration that acts as a **hard ceiling**. Scopes can only restrict further — they can never exceed the safety config.

### Safety Controls

| Control | Flag / Env Var | Default | Effect |
|---------|---------------|---------|--------|
| Read-only mode | `--read-only` / `SAP_READ_ONLY` | `false` | Blocks all write operations |
| Block data | `--block-data` / `SAP_BLOCK_DATA` | `false` | Blocks table content preview |
| Block free SQL | `--block-free-sql` / `SAP_BLOCK_FREE_SQL` | `false` | Blocks freestyle SQL queries |
| Allowed operations | `--allowed-ops` / `SAP_ALLOWED_OPS` | (all) | Whitelist of operation type codes |
| Disallowed operations | `--disallowed-ops` / `SAP_DISALLOWED_OPS` | (none) | Blacklist of operation type codes |
| Allowed packages | `--allowed-packages` / `SAP_ALLOWED_PACKAGES` | (all) | Restrict to specific ABAP packages (supports wildcards) |
| Enable transports | `--enable-transports` / `SAP_ENABLE_TRANSPORTS` | `false` | Allow transport management |

### How Safety and Scopes Interact

```
Server Safety Config (ceiling)
  readOnly=false, blockData=true, blockFreeSQL=true
          │
          ▼
User JWT Scopes: [read, write, sql]
          │
          ▼  deriveUserSafety() merges both
Effective Config for this request:
  readOnly=false  ← server allows writes, user has write scope
  blockData=true  ← server blocks data, even though sql implies data
  blockFreeSQL=true ← server blocks SQL, overrides user's sql scope
```

The server always wins. If `blockFreeSQL=true` is set, no user can run freestyle SQL regardless of their `sql` scope.

### Profiles: Safety Presets

Instead of setting individual flags, you can use `--profile` (or `ARC1_PROFILE`) to apply a named preset:

| Profile | Read-only | Block Data | Block SQL | Transports | Use Case |
|---------|-----------|------------|-----------|------------|----------|
| `viewer` | Yes | Yes | Yes | No | Read-only access to source code |
| `viewer-data` | Yes | No | Yes | No | Source code + table preview |
| `viewer-sql` | Yes | No | No | No | Source code + table preview + SQL |
| `developer` | No | Yes | Yes | Yes | Full development, no data access |
| `developer-data` | No | No | Yes | Yes | Full development + table preview |
| `developer-sql` | No | No | No | Yes | Full development + SQL |

Individual flags override profile defaults: `--profile viewer --read-only=false` disables read-only even though the viewer profile normally enables it.

---

## XSUAA Roles (BTP Deployments)

When deploying on SAP BTP with XSUAA authentication, scopes are assigned through **role templates** and **role collections** defined in `xs-security.json`.

### Role Templates

Role templates are the building blocks. Each grants specific scopes:

| Role Template | Scopes | Purpose |
|--------------|--------|---------|
| **MCPViewer** | `read` | Read source code, search, navigate |
| **MCPDeveloper** | `read`, `write` | Full development access |
| **MCPDataViewer** | `data` | Table content preview |
| **MCPSqlUser** | `data`, `sql` | Freestyle SQL + table preview |
| **MCPAdmin** | `read`, `write`, `data`, `sql`, `admin` | Full access including admin |

### Role Collections

Role collections combine templates for assignment to users in BTP Cockpit:

| Role Collection | Templates Included | Typical User |
|----------------|-------------------|--------------|
| **ARC-1 Viewer** | MCPViewer | Code reviewer, read-only access |
| **ARC-1 Developer** | MCPDeveloper | ABAP developer |
| **ARC-1 Data Viewer** | MCPViewer + MCPDataViewer | Developer who needs to inspect table data |
| **ARC-1 Developer + Data** | MCPDeveloper + MCPDataViewer | Developer with table preview |
| **ARC-1 Developer + SQL** | MCPDeveloper + MCPSqlUser | Developer with full data access |
| **ARC-1 Admin** | MCPAdmin | System administrator |

### Assigning Roles

1. Open **SAP BTP Cockpit** > **Security** > **Role Collections**
2. Find the desired collection (e.g., "ARC-1 Developer + Data")
3. Click **Edit** > **Users** > **Add**
4. Enter the user's email/IdP identity
5. Save

The user's next token will include the assigned scopes.

---

## SAP-Side Authorization (Layer 2)

Even after ARC-1 grants access via scopes, the SAP system performs its own authorization checks. This is especially important when using Principal Propagation, where each MCP request runs as a different SAP user.

### Key SAP Authorization Objects

| Auth Object | Controls | Relevant For |
|------------|----------|-------------|
| **S_ADT_RES** | Access to ADT endpoints (ACTVT 01=create, 02=execute) | All ARC-1 operations |
| **S_DEVELOP** | ABAP Workbench (object types, activities) | SAPRead, SAPWrite, SAPActivate |
| **S_TRANSPRT** | Transport management (create, release, delete) | SAPTransport |
| **S_CTS_ADMI** | CTS administration | SAPTransport (release, delete) |
| **S_SQL_VIEW** | SQL query access | SAPQuery |

!!! warning "Read operations that use POST"
    Several ADT endpoints that perform read-like operations use HTTP POST internally. This means SAP requires **S_ADT_RES with ACTVT=01 AND 02** for read-only users. Without both activity types, operations like code completion, find references, and syntax check will fail with 403 errors. See the [SAP ADT Authorization documentation](https://help.sap.com/docs/abap-cloud/abap-development-tools-user-guide/authorization) for details.

### Recommended SAP Roles

For on-premise systems using a shared technical user, create composite roles:

| SAP Role | Auth Objects | Purpose |
|----------|-------------|---------|
| **ZMCP_READ** | S_ADT_RES (ACTVT 01+02), S_DEVELOP (ACTVT 03) | Read source code via ADT |
| **ZMCP_WRITE** | S_DEVELOP (ACTVT 01+02+06), S_TRANSPRT, S_CTS_ADMI | Write + transport management |
| **ZMCP_DATA** | S_TABU_DIS, relevant table auth groups | Table content preview |
| **ZMCP_SQL** | S_SQL_VIEW | Freestyle SQL execution |

Assign the appropriate combination to your shared SAP user. With Principal Propagation, each SAP user's own authorization profile applies instead.

---

## Common Scenarios

### Scenario 1: Local Development

```bash
# No auth, full access, safety config only
npx arc-1 --url http://sap:50000 --user DEV --password secret
```

No scopes are enforced. Use `--read-only` or `--profile viewer` to restrict.

### Scenario 2: Shared Server for a Team

```bash
# API key auth, read-only for safety
npx arc-1 --url http://sap:50000 --user SHARED_USER --password secret \
  --transport http-streamable --api-key "$(openssl rand -hex 32)" \
  --profile viewer
```

All users share the same API key and get read-only access.

### Scenario 3: Multi-User with Per-User Scopes (XSUAA)

Deploy on BTP CF with XSUAA. Assign role collections per user:
- Junior developers get "ARC-1 Viewer"
- Senior developers get "ARC-1 Developer + Data"
- DBAs get "ARC-1 Viewer" + "ARC-1 Developer + SQL" (custom collection)

Each user's JWT carries their scopes. ARC-1 enforces them per-request.

### Scenario 4: Multi-User with SAP Identity (Principal Propagation)

Deploy with PP enabled. Each MCP user maps to their SAP user:
- ARC-1 scopes control tool-level access
- SAP authorization controls object-level access
- Audit trail shows the real SAP user, not a shared account

See [Principal Propagation Setup](principal-propagation-setup.md) for configuration.

---

## Troubleshooting

### "Insufficient scope" errors

The user's JWT is missing the required scope for the tool they're calling. Check:

1. What scope the tool requires (see [scope table above](#the-five-scopes))
2. What scopes the user's token has (check ARC-1 logs at debug level)
3. Whether the correct role collection is assigned in BTP Cockpit

### "Operation blocked by safety config" errors

The server's safety config is blocking the operation, regardless of user scopes:

1. Check `--read-only`, `--block-data`, `--block-free-sql` settings
2. Check `--allowed-ops` / `--disallowed-ops` if set
3. Remember: the server config is the ceiling — scopes cannot override it

### User can read code but not table contents

Table content preview requires the `data` scope. The `read` scope only covers source code objects. Assign the MCPDataViewer role template (or a collection that includes it).

### SAPQuery returns "insufficient scope"

SAPQuery (freestyle SQL) requires the `sql` scope, not just `data`. Assign MCPSqlUser role template.

---

## Further Reading

- [Authentication Overview](enterprise-auth.md) — How to authenticate users to ARC-1
- [XSUAA Setup](xsuaa-setup.md) — Configuring XSUAA scopes and roles on BTP
- [OAuth / JWT Setup](oauth-jwt-setup.md) — Using external OIDC providers
- [Principal Propagation Setup](principal-propagation-setup.md) — Per-user SAP identity
- [Authorization Concept (Research)](../research/authorization-concept.md) — Detailed SAP authorization object mapping and endpoint inventory
- [SAP ADT Authorization](https://help.sap.com/docs/abap-cloud/abap-development-tools-user-guide/authorization) — Official SAP documentation on ADT authorization objects
- [OAuth 2.0 Scopes (RFC 6749 Section 3.3)](https://datatracker.ietf.org/doc/html/rfc6749#section-3.3) — OAuth scope specification
