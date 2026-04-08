# Documentation Audit — April 7, 2026

Scope: `docs/` with focus on setup, auth, and external dependencies (Microsoft + SAP).

## Summary

The docs had high-impact drift between documented flags and the current ARC-1 implementation (`v0.3.x`).  
Main risk before this audit: users could follow commands that do not exist in code.

This audit corrected the highest-impact docs and aligned primary setup/auth paths with the current CLI/env surface.

## High-Impact Issues Found

1. `--port` / `SAP_PORT` used across docs, but ARC-1 supports `--http-addr` / `SAP_HTTP_ADDR`.
2. Auth docs referenced unsupported local cert flags (`--client-cert`, `--pp-ca-key`, etc.).
3. Setup docs referenced unsupported SAP OAuth env vars (`SAP_XSUAA_URL`, `SAP_XSUAA_CLIENT_ID`, `SAP_XSUAA_CLIENT_SECRET`).
4. OIDC docs mixed audience guidance (`api://...` vs GUID) and included unsupported username mapping flags.
5. Test process doc expected behavior/endpoints inconsistent with current HTTP auth implementation.

## Files Updated

- `docs/index.md`
- `docs/setup-guide.md`
- `docs/cli-guide.md`
- `docs/phase1-api-key-setup.md`
- `docs/phase2-oauth-setup.md`
- `docs/phase3-principal-propagation-setup.md` (rewritten)
- `docs/enterprise-auth.md` (rewritten)
- `docs/auth-test-process.md` (rewritten)
- `docs/docker.md`
- `docs/btp-abap-environment.md`
- `docs/sap-trial-setup.md`

## External Research Notes (Verified April 7, 2026)

### SAP BTP ABAP Environment

- Free-tier usage is tied to SAP BTP commercial model + entitlements, not only trial accounts.
- Free-tier details evolve over time (for example, SAP lifecycle notes mention 0.5 ACU provisioning updates in March 2026).
- "Prepare an Account for ABAP Development" booster and Web Access entitlement guidance remains relevant.

References:

- [Using Free Service Plans (SAP BTP)](https://help.sap.com/docs/BTP/65de2977205c403bbc107264b8eccf4b/524e1081d8dc4b0f9d055a6bec383ec3.html)
- [Lifecycle Management (SAP BTP ABAP Environment)](https://help.sap.com/docs/ABAP_ENVIRONMENT/36609a00dcea4e6fa7c4ca2f2868e972/3b19c2bc43854d7cb49a6522d5f9442a.html)
- [Selecting a Service Plan for the Web Access for ABAP](https://help.sap.com/docs/BTP/65de2977205c403bbc107264b8eccf4b/2859cc59f9ba4976a6d613475d07c9ed.html)

### Microsoft Entra / Power Platform

- Custom connector OAuth setup for Power Automate/Copilot Studio remains based on Entra app registration + redirect URI registration.
- Audience handling must be validated against a real token `aud` claim and set exactly in `SAP_OIDC_AUDIENCE`.

References:

- [Authenticate your API and connector with Microsoft Entra ID](https://learn.microsoft.com/en-us/connectors/custom-connectors/azure-active-directory-authentication)
- [Access token claims reference](https://learn.microsoft.com/en-us/entra/identity-platform/access-token-claims-reference)
- [Access tokens in the Microsoft identity platform](https://learn.microsoft.com/en-us/entra/identity-platform/access-tokens)

## Remaining Cleanup (Lower Priority)

1. Add a generated "config reference from source" doc derived from `src/server/config.ts` to prevent drift.
2. Add CI check to fail if docs reference unknown ARC-1 flags/env vars.
3. Do a second pass on report/roadmap docs to separate historical design notes from current behavior.
