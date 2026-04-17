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

This means you never need to assign both `write` and `read` to the same user. Assigning `write` is sufficient. These implications are enforced at the scope-check layer — a user with only `write` can call read tools without an explicit `read` scope, and a user with only `sql` can preview named tables without an explicit `data` scope. For production hardening guidance on scope assignment and safety config, see the [Security Guide](security-guide.md).

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
| **No auth** (stdio, local, or HTTP without auth) | No scopes — [safety config](#safety-config-the-server-level-ceiling) is the only control | No |
| **API Key** (single) | All scopes granted. Use safety config or profiles to restrict. | No (single shared key) |
| **API Keys** (multi) | Scopes derived from the profile assigned to each key | Yes (different key per user/team) |
| **OIDC / JWT** | Extracted from JWT `scope` or `scp` claims | Yes (configure in IdP) |
| **XSUAA** | Extracted from XSUAA token local scopes | Yes (via BTP role collections) |
| **XSUAA + PP** | Scopes from XSUAA token, SAP identity from PP | Yes (scopes + SAP auth) |

### API Keys

ARC-1 supports two API key modes:

#### Single API Key (`--api-key` / `ARC1_API_KEY`)

A single shared key that grants all scopes. The **server's safety config still applies as a hard ceiling**, so you can restrict what the key allows:

```bash
# Read-only server — API key users can only read, regardless of full scopes
arc1 --transport http-streamable --api-key "$KEY" --profile viewer

# Development server with no data access
arc1 --transport http-streamable --api-key "$KEY" --profile developer
```

All users sharing this key get the same access level.

#### Multiple API Keys with Profiles (`--api-keys` / `ARC1_API_KEYS`)

Assign different API keys to different [profiles](#profiles-safety-presets), giving each key its own scope and safety restrictions. Format: `key:profile` pairs, comma-separated.

```bash
# Generate keys
VIEWER_KEY=$(openssl rand -hex 32)
DEV_KEY=$(openssl rand -hex 32)
ADMIN_KEY=$(openssl rand -hex 32)

# Start with per-key profiles
arc1 --transport http-streamable \
  --api-keys "$VIEWER_KEY:viewer,$DEV_KEY:developer,$ADMIN_KEY:developer-sql"
```

Each key gets **both** the profile's scopes (for tool-level access control) **and** the profile's safety config (for operation-level enforcement):

| Key | Profile | Scopes | Effect |
|-----|---------|--------|--------|
| `$VIEWER_KEY` | `viewer` | `read` | Read source code only |
| `$DEV_KEY` | `developer` | `read`, `write` | Full development, no data access |
| `$ADMIN_KEY` | `developer-sql` | `read`, `write`, `data`, `sql` | Full access including SQL |

Distribute different keys to different teams or users. Each key enforces its profile independently — no IdP or external auth infrastructure required.

!!! tip "Combining single and multi-key"
    Both `--api-key` and `--api-keys` can be set simultaneously. Multi-key entries are checked first. The single key acts as a fallback with full scopes (subject to safety config). This is useful for migration: add `--api-keys` for new users while keeping the existing `--api-key` for backward compatibility.

!!! note "Environment variable format"
    `ARC1_API_KEYS="key1:viewer,key2:developer,key3:developer-sql"`  
    Keys may contain colons (e.g. base64-encoded values) — the **last** colon in each entry separates the key from the profile name.

!!! note "OIDC tokens without scope claims"
    If an OIDC JWT contains no `scope` or `scp` claims, ARC-1 defaults to **read-only access** and logs a warning. Configure your OIDC provider to include ARC-1 scopes in tokens. See [OAuth / JWT Setup](oauth-jwt-setup.md) for provider-specific instructions.

---

## Safety Config: The Server-Level Ceiling

Independent of scopes, the server administrator can set a global safety configuration that acts as a **hard ceiling**. Scopes can only restrict further — they can never exceed the safety config.

### Safety Controls

| Control | Flag / Env Var | Default | Effect |
|---------|---------------|---------|--------|
| Read-only mode | `--read-only` / `SAP_READ_ONLY` | **`true`** | Blocks all write operations |
| Block data | `--block-data` / `SAP_BLOCK_DATA` | **`true`** | Blocks table content preview |
| Block free SQL | `--block-free-sql` / `SAP_BLOCK_FREE_SQL` | **`true`** | Blocks freestyle SQL queries |
| Allowed operations | `--allowed-ops` / `SAP_ALLOWED_OPS` | (all) | Whitelist of operation type codes |
| Disallowed operations | `--disallowed-ops` / `SAP_DISALLOWED_OPS` | (none) | Blacklist of operation type codes |
| Allowed packages | `--allowed-packages` / `SAP_ALLOWED_PACKAGES` | `$TMP` | Restrict to specific ABAP packages (supports wildcards). Defaults to `$TMP` (local objects only). Set to `"*"` for unrestricted or `"Z*,$TMP"` for custom packages. |
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

| Profile | Read-only | Block Data | Block SQL | Transports | Packages | Use Case |
|---------|-----------|------------|-----------|------------|----------|----------|
| `viewer` | Yes | Yes | Yes | No | — | Read-only access to source code |
| `viewer-data` | Yes | No | Yes | No | — | Source code + table preview |
| `viewer-sql` | Yes | No | No | No | — | Source code + table preview + SQL |
| `developer` | No | Yes | Yes | Yes | `$TMP` | Full development, no data access |
| `developer-data` | No | No | Yes | Yes | `$TMP` | Full development + table preview |
| `developer-sql` | No | No | No | Yes | `$TMP` | Full development + SQL |

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
| **S_SERVICE** | OData service start authorization (hashed `SRV_NAME`, `SRV_TYPE=HT`) | SAPManage (FLP actions) |
| **S_PB_CHIP** | FLP page-builder chip access | SAPManage (FLP actions) |
| **/UI2/CHIP** | FLP chip access (`/UI2/CHIP` namespace) | SAPManage (FLP actions) |

!!! warning "Read operations that use POST"
    Several ADT endpoints that perform read-like operations use HTTP POST internally. This means SAP requires **S_ADT_RES with ACTVT=01 AND 02** for read-only users. Without both activity types, operations like code completion, find references, and syntax check will fail with 403 errors. See the [SAP ADT Authorization documentation](https://help.sap.com/docs/abap-cloud/abap-development-tools-user-guide/authorization) for details.
    FLP list operations use HTTP GET, but still require OData service authorization (`S_SERVICE`) for `/UI2/PAGE_BUILDER_CUST`.

### ICF Service Activation (FLP OData)

FLP management in ARC-1 uses the Gateway OData service `/UI2/PAGE_BUILDER_CUST`. It must be activated before `SAPManage` FLP actions can work. See SAP Help for [UI service authorizations](https://help.sap.com/docs/ABAP_PLATFORM_NEW/9765143c554c4ec3951fb17ff80d8989/86fa207d3edd4ed987e66b547d1b3025.html) and [OData activation for FLP](https://help.sap.com/docs/FIORI_IMPLEMENTATION_740/bc700aa28d5c468c84969c3b33773710/b7383953fcabff4fe10000000a44176d.html).

1. Open transaction `/IWFND/MAINT_SERVICE`.
2. Ensure service `/UI2/PAGE_BUILDER_CUST` is active (customer alias commonly `ZPAGE_BUILDER_CUST`).
3. Verify endpoint access:

```bash
curl -s -o /dev/null -w "%{http_code}" "$SAP_URL/sap/opu/odata/UI2/PAGE_BUILDER_CUST/"
```

Expected result is `200`.

### Recommended SAP Roles

For on-premise systems using a shared technical user, create composite roles:

| SAP Role | Auth Objects | Purpose |
|----------|-------------|---------|
| **ZMCP_READ** | S_ADT_RES (ACTVT 01+02), S_DEVELOP (ACTVT 03) | Read source code via ADT |
| **ZMCP_WRITE** | S_DEVELOP (ACTVT 01+02+06), S_TRANSPRT, S_CTS_ADMI | Write + transport management |
| **ZMCP_DATA** | S_TABU_DIS, relevant table auth groups | Table content preview |
| **ZMCP_SQL** | S_SQL_VIEW | Freestyle SQL execution |
| **ZMCP_FLP** | S_SERVICE (`/UI2/PAGE_BUILDER_CUST`), S_PB_CHIP, /UI2/CHIP, S_DEVELOP (`OBJTYPE=IWSG`) | FLP launchpad management via SAPManage |

Assign the appropriate combination to your shared SAP user. With Principal Propagation, each SAP user's own authorization profile applies instead.

Alternatively, assign SAP standard role `SAP_FLP_ADMIN`, which includes the required authorizations for FLP customization services.

---

## Auth Method Coexistence

ARC-1 supports running multiple MCP client auth methods simultaneously. When XSUAA is enabled, all three methods are active with a fallback chain:

1. **XSUAA** — tried first (BTP OAuth tokens)
2. **OIDC** — tried second (external IdP tokens, e.g. Entra ID)
3. **API Key** — tried last (shared secret)

This means you can deploy on BTP with XSUAA for most users, while still accepting API keys for service accounts or CI/CD pipelines, and OIDC tokens from external identity providers. Each method extracts scopes differently, but all are subject to the same safety config ceiling.

!!! note "Principal Propagation requires JWT tokens"
    PP only works with XSUAA or OIDC tokens (JWTs), not API keys. API key requests always use the shared SAP user. If `SAP_PP_STRICT=true`, API key requests are rejected when PP is enabled — use XSUAA or OIDC instead.

---

## Common Scenarios

### Scenario 1: Local Development

```bash
# No auth, full access, safety config only
npx arc-1 --url http://sap:50000 --user DEV --password secret
```

No scopes are enforced. Use `--read-only` or `--profile viewer` to restrict.

### Scenario 2: Shared Server with Role-Based API Keys

The recommended approach for team deployments without an external IdP. Each team or role gets its own API key with a specific profile:

```bash
# Generate keys for each role
VIEWER_KEY=$(openssl rand -hex 32)
DEV_KEY=$(openssl rand -hex 32)
SQL_KEY=$(openssl rand -hex 32)

# Single server with per-key access control
arc1 --url http://sap:50000 --user SHARED_USER --password secret \
  --transport http-streamable \
  --api-keys "$VIEWER_KEY:viewer,$DEV_KEY:developer,$SQL_KEY:developer-sql"
```

Distribute keys to teams:
- **Reviewers** get `$VIEWER_KEY` → can only read source code
- **Developers** get `$DEV_KEY` → can read/write code, no data access
- **DBAs** get `$SQL_KEY` → full access including SQL queries

This runs as a **single server instance** — no need for multiple ports or deployments.

!!! tip "Single key fallback"
    For simpler setups where everyone gets the same access, a single API key with a server-wide profile still works:
    ```bash
    arc1 --transport http-streamable --api-key "$KEY" --profile viewer
    ```

### Scenario 3: Internal Network

When ARC-1 is deployed on an internal network, the simplest secure approach is using **multi-key API keys** — no external IdP needed:

```bash
# Internal server with role-based keys
arc1 --url http://sap:50000 --user SHARED_USER --password secret \
  --transport http-streamable \
  --api-keys "$VIEWER_KEY:viewer,$DEV_KEY:developer"
```

Each user configures their MCP client with the key matching their role. The keys enforce both scopes (tool visibility) and safety config (operation restrictions) per request.

If the server runs **without any auth** (`--api-key` and `--api-keys` both unset), the HTTP endpoint is open and safety config is the only control — all users get the same access:

```bash
# Open endpoint — everyone gets read-only via safety config
arc1 --url http://sap:50000 --user SHARED_USER --password secret \
  --transport http-streamable --profile viewer
```

For per-user differentiation on an open endpoint, add `--api-keys` as shown above, or an OIDC provider (Keycloak, Entra ID) if your organization already has one.

!!! warning "Open endpoints"
    Without `--api-key`, `--api-keys`, or `--oidc-issuer`, anyone who can reach the server's port can use it. Combine with network-level controls (firewall rules, VPN, reverse proxy) for defense in depth.

### Scenario 4: Multi-User with Per-User Scopes (XSUAA)

Deploy on BTP CF with XSUAA. Assign role collections per user:
- Junior developers get "ARC-1 Viewer"
- Senior developers get "ARC-1 Developer + Data"
- DBAs get "ARC-1 Viewer" + "ARC-1 Developer + SQL" (custom collection)

Each user's JWT carries their scopes. ARC-1 enforces them per-request.

### Scenario 5: Multi-User with SAP Identity (Principal Propagation)

PP gives each MCP user their own SAP identity, which is essential for audit trails and SAP-level authorization. But SAP developers typically have broad authorization in their SAP system (they need it for Eclipse/ADT). This creates a question: **how do you restrict what they can do through ARC-1 specifically?**

The answer is that PP and XSUAA scopes work together — they are not alternatives:

```
XSUAA Token (with scopes: read, write)
        │
        ▼
┌──────────────────────┐
│  ARC-1 Scope Check   │  "Does this user have the 'write' scope?"
│  (from XSUAA roles)  │  ← controlled by BTP role collections
└──────┬───────────────┘
       │  ✓ scope OK
       ▼
┌──────────────────────┐
│  ARC-1 Safety Config │  "Is the server configured to allow writes?"
│  (from server flags) │  ← controlled by admin
└──────┬───────────────┘
       │  ✓ safety OK
       ▼
┌──────────────────────┐
│  SAP Authorization   │  "Does this SAP user have S_DEVELOP?"
│  (per-user via PP)   │  ← controlled by SAP role admin
└──────┬───────────────┘
       │  ✓ SAP auth OK
       ▼
    Operation executes
```

This means you can:

- Assign "ARC-1 Viewer" in BTP to a developer who has full SAP authorization — they can only read through ARC-1 even though they could write through Eclipse
- Assign "ARC-1 Developer" but withhold `data`/`sql` scopes — the developer can modify code but cannot query production tables through ARC-1
- Use the safety config as an additional server-wide ceiling on top of both

PP is enabled alongside XSUAA — they are part of the same BTP deployment. See [Principal Propagation Setup](principal-propagation-setup.md) and [XSUAA Setup](xsuaa-setup.md) for configuration.

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
- [Authorization Concept (Research)](../docs/research/authorization-concept.md) — Detailed SAP authorization object mapping and endpoint inventory
- [SAP ADT Authorization](https://help.sap.com/docs/abap-cloud/abap-development-tools-user-guide/authorization) — Official SAP documentation on ADT authorization objects
- [OAuth 2.0 Scopes (RFC 6749 Section 3.3)](https://datatracker.ietf.org/doc/html/rfc6749#section-3.3) — OAuth scope specification
