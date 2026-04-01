# ARC-1 Deployment Best Practices

## One Instance Per SAP System

ARC-1 follows the **one instance per SAP backend** pattern. Each ARC-1 deployment connects to exactly one SAP system. This is the same model used by Eclipse ADT, SAP Business Application Studio, and SAP GUI.

### Why one-per-system?

| Concern | One-per-system | Multi-backend gateway |
|---------|---------------|----------------------|
| **Security** | Blast radius = one system | One breach = all systems |
| **Auth** | Clean: one auth flow per instance | N destinations + N auth flows |
| **Safety gates** | Per-system: `readOnly`, `allowedOps`, `allowedPackages` | Can't vary per backend |
| **Tool descriptions** | Tailored to system type (BTP vs on-premise) | Must be generic for all |
| **Audit trail** | Clear per-system logs | Mixed across systems |
| **Scaling** | Scale independently | Heavy-use system affects all |

### Multi-user within each instance

Each ARC-1 instance serves **multiple users** via principal propagation (on-premise) or JWT Bearer Exchange (BTP). The MCP client authenticates the user, and ARC-1 maps that to a SAP user identity.

```
                    ┌─────────────────┐
                    │  MCP Client      │
                    │  (Claude, etc.)  │
                    └──┬──────────┬───┘
                       │          │
                       ▼          ▼
┌─────────────────────┐ ┌──────────────────────┐
│ arc1-ecc-dev        │ │ arc1-btp-dev         │
│ on-premise, PP      │ │ BTP ABAP, JWT Bearer │
│ readOnly=false      │ │ readOnly=false       │
│ 50 developers       │ │ 50 developers        │
└──────┬──────────────┘ └──────┬───────────────┘
       ▼                       ▼
┌──────────────┐      ┌──────────────────┐
│ SAP ECC Dev  │      │ BTP ABAP Env     │
└──────────────┘      └──────────────────┘
```

### Example: enterprise with multiple SAP systems

```
CF Apps:
┌──────────────────────────────────┐
│ arc1-ecc-dev                     │  ECC Dev, read+write, PP
│ readOnly=false                   │
├──────────────────────────────────┤
│ arc1-ecc-prod                    │  ECC Prod, read-only, PP
│ readOnly=true, blockFreeSQL=true │
├──────────────────────────────────┤
│ arc1-s4-dev                      │  S/4 Dev, read+write, PP
│ readOnly=false                   │
├──────────────────────────────────┤
│ arc1-btp-dev                     │  BTP ABAP, read+write, JWT Bearer
│ SAP_SYSTEM_TYPE=btp              │
│ readOnly=false                   │
└──────────────────────────────────┘
```

MCP client config for developers:

```json
{
  "mcpServers": {
    "sap-ecc-dev": {
      "url": "https://arc1-ecc-dev.cfapps.us10.hana.ondemand.com/mcp"
    },
    "sap-ecc-prod": {
      "url": "https://arc1-ecc-prod.cfapps.us10.hana.ondemand.com/mcp"
    },
    "sap-s4-dev": {
      "url": "https://arc1-s4-dev.cfapps.us10.hana.ondemand.com/mcp"
    },
    "sap-btp": {
      "url": "https://arc1-btp-dev.cfapps.us10.hana.ondemand.com/mcp"
    }
  }
}
```

The LLM sees separate tool sets from each server and picks the right one.

---

## System Type Detection

ARC-1 auto-detects whether it's connected to a BTP ABAP Environment or an on-premise system.

### How it works

On first `SAPManage probe`, ARC-1 reads `/sap/bc/adt/system/components` (already called for ABAP release detection — zero extra HTTP requests). If the `SAP_CLOUD` component is present, the system is BTP. Otherwise, on-premise.

### Manual override

For immediate correct tool definitions at startup (before the first probe), set:

```bash
# Environment variable
SAP_SYSTEM_TYPE=btp    # or: onprem, auto (default)

# CLI flag
--system-type btp
```

When `SAP_SYSTEM_TYPE=btp` is set, tool definitions are adapted at server startup:
- SAPRead removes PROG, INCL, VIEW, TEXT_ELEMENTS, VARIANTS from the type enum
- SAPWrite removes PROG, INCL, FUNC from the type enum
- SAPQuery description warns about blocked SAP standard tables
- SAPTransport description explains gCTS behavior
- SAPContext removes PROG, FUNC from the type enum

### What changes on BTP

| Tool | What changes |
|------|-------------|
| **SAPRead** | Removes PROG, INCL, VIEW, TEXT_ELEMENTS, VARIANTS, SOBJ. Returns helpful error if LLM tries them anyway. |
| **SAPWrite** | Only CLAS, INTF. Must use ABAP Cloud syntax, Z/Y namespace. |
| **SAPQuery** | Warns that SAP standard tables (DD02L, TADIR, etc.) are blocked. Suggests CDS views. |
| **SAPSearch** | Notes that only released and custom objects are returned. |
| **SAPTransport** | Explains gCTS: release = Git push, not TMS export. |
| **SAPContext** | Only CLAS, INTF. Includes released SAP objects (they're the dev API surface on BTP). |
| **SAPManage** | Returns `systemType` in probe results. |
| **SAPActivate** | No change. |
| **SAPNavigate** | Notes released object scope. |
| **SAPLint** | No change. |
| **SAPDiagnose** | No change. |

---

## Authentication Options

### Local development

| Target | Auth | Config |
|--------|------|--------|
| On-premise SAP | Basic Auth | `SAP_URL`, `SAP_USER`, `SAP_PASSWORD` |
| BTP ABAP Environment | Service Key + Browser OAuth | `SAP_BTP_SERVICE_KEY_FILE` |

### Deployed on BTP Cloud Foundry

| Target | Auth | Config |
|--------|------|--------|
| On-premise SAP (via Cloud Connector) | Principal Propagation | `SAP_BTP_DESTINATION`, `SAP_PP_ENABLED=true` |
| BTP ABAP Environment | JWT Bearer Exchange | `SAP_BTP_SERVICE_KEY` (future) |

### Configuration examples

**Local dev connecting to on-premise:**
```json
{
  "mcpServers": {
    "sap": {
      "command": "arc1",
      "env": {
        "SAP_URL": "http://sap-dev:50000",
        "SAP_USER": "DEVELOPER",
        "SAP_PASSWORD": "..."
      }
    }
  }
}
```

**Local dev connecting to BTP ABAP:**
```json
{
  "mcpServers": {
    "sap-btp": {
      "command": "arc1",
      "env": {
        "SAP_BTP_SERVICE_KEY_FILE": "~/.config/arc-1/btp-service-key.json",
        "SAP_SYSTEM_TYPE": "btp"
      }
    }
  }
}
```

**Deployed on CF connecting to on-premise (multi-user):**
```yaml
# manifest.yml
applications:
  - name: arc1-ecc-dev
    env:
      SAP_BTP_DESTINATION: SAP_ECC_DEV
      SAP_PP_ENABLED: true
      SAP_PP_STRICT: true
      SAP_TRANSPORT: http-streamable
      SAP_XSUAA_AUTH: true
```

---

## Security Recommendations

1. **Use `readOnly=true` for production systems** — prevents any write operations
2. **Use `blockFreeSQL=true` for sensitive systems** — blocks arbitrary SQL queries
3. **Use `allowedPackages=Z*,Y*`** — restricts operations to custom code packages
4. **Use `ppStrict=true`** — ensures every request has a user identity (no fallback to service account)
5. **Deploy separate instances per system** — limits blast radius
6. **Use XSUAA auth for deployed instances** — proper OAuth 2.0 with scopes (read/write/admin)
7. **Set `SAP_SYSTEM_TYPE`** explicitly in production — ensures correct tool definitions from startup

---

## BTP ABAP Environment Setup

See [BTP ABAP Environment guide](btp-abap-environment.md) for:
- Provisioning the BTP ABAP instance
- Running the "Prepare an Account for ABAP Development" booster
- Creating the service key
- Configuring ARC-1 with the service key
- OAuth browser login flow
