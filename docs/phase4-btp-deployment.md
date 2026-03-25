# Phase 4: BTP Cloud Foundry Deployment

Deploy vsp on SAP BTP Cloud Foundry with XSUAA authentication and Destination Service for SAP connectivity.

## When to Use

- Organization uses SAP BTP
- SAP system accessible via Cloud Connector
- Want SAP-managed OAuth (XSUAA) instead of external IdP
- Need BTP Destination Service for connection management

## Architecture

```
┌──────────────────┐     XSUAA OAuth      ┌──────────────────┐     Destination Svc    ┌────────────┐
│  MCP Client      │ ──────────────────► │  vsp on BTP CF   │ ────────────────────► │  SAP ABAP  │
│  (IDE / Copilot) │   JWT Bearer        │  (MTA deploy)    │   via Cloud Connector │  (on-prem) │
└──────────────────┘                     └──────────────────┘                       └────────────┘
```

## Prerequisites

- SAP BTP subaccount
- Cloud Foundry environment enabled
- Cloud Connector configured for SAP on-prem access
- `cf` CLI installed

## Setup

### 1. Create BTP Services

```bash
# Login to Cloud Foundry
cf login -a https://api.cf.<landscape>.hana.ondemand.com

# Create XSUAA service (with xs-security.json)
cf create-service xsuaa application vsp-xsuaa -c xs-security.json

# Create Destination service
cf create-service destination lite vsp-destination

# Create Connectivity service
cf create-service connectivity lite vsp-connectivity
```

### 2. Configure SAP Destination

In BTP Cockpit → Connectivity → Destinations:

| Property | Value |
|----------|-------|
| Name | `SAP_SYSTEM` |
| Type | HTTP |
| URL | `https://sap.internal:44300` |
| Proxy Type | OnPremise |
| Authentication | BasicAuthentication (or PrincipalPropagation) |
| User | `SAP_SERVICE_USER` |
| Password | `ServicePassword123` |
| sap-client | `001` |

### 3. Deploy vsp

```bash
# Build for Linux
GOOS=linux GOARCH=amd64 go build -o vsp ./cmd/vsp

# Deploy
cf push
```

### 4. Configure MCP Clients

The vsp URL will be: `https://vsp-mcp-server.cfapps.<landscape>.hana.ondemand.com/mcp`

## Status

**Phase 4 is deferred.** Phases 1-3 cover all non-BTP scenarios. Phase 2's OIDC validator works with XSUAA tokens since XSUAA supports standard OIDC discovery.

## SAP Documentation References

- [SAP BTP Cloud Foundry Environment](https://help.sap.com/docs/btp/sap-business-technology-platform/cloud-foundry-environment) — CF runtime overview
- [SAP Authorization and Trust Management (XSUAA)](https://help.sap.com/docs/btp/sap-business-technology-platform/what-is-sap-authorization-and-trust-management-service) — XSUAA service documentation
- [Calling the Destination Service REST API](https://help.sap.com/docs/connectivity/sap-btp-connectivity-cf/calling-destination-service-rest-api) — Destination lookup API
- [Cloud Connector Installation](https://help.sap.com/docs/connectivity/sap-btp-connectivity-cf/installation) — Cloud Connector setup
- [Cloud Connector Principal Propagation](https://help.sap.com/docs/connectivity/sap-btp-connectivity-cf/configuring-principal-propagation) — On-premise principal propagation
- [Authenticating Users Against On-Premise Systems](https://help.sap.com/docs/connectivity/sap-btp-connectivity-cf/authenticating-users-against-on-premise-systems) — End-to-end authentication flow
- [Wouter's BTP MCP Server](https://github.com/lemaiwo/btp-sap-odata-to-mcp-server) — Reference implementation for BTP + MCP
