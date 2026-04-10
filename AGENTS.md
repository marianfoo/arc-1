# AGENTS.md — ARC-1 Design Philosophy

This document explains **why** ARC-1 exists and **what principles** guide its design. For code locations, configuration flags, testing, and implementation patterns, see [CLAUDE.md](CLAUDE.md).

## What ARC-1 Is

ARC-1 is a **centralized, admin-controlled MCP gateway** between LLM clients and SAP ABAP systems. One instance per SAP system, deployed on BTP Cloud Foundry or Docker. It is **not** a developer-local tool, not an IDE plugin, and not an ABAP runtime.

## What ARC-1 Is Not

- Not a replacement for Eclipse ADT or VS Code — ARC-1 exposes SAP to LLMs, not to humans
- Not an ABAP execution engine — it proxies ADT REST APIs, never runs ABAP code
- Not a multi-system router — one instance connects to one SAP system (use infrastructure for routing)
- Not a feature-complete ADT wrapper — 11 intent-based tools by design, not 200+ endpoints

## Design Principles

### 1. Centralized Admin Control

**Problem:** Every other SAP MCP server runs unmanaged on developer laptops. No admin oversight, no audit trail, no way to restrict what an LLM does to SAP.

**Design:** ARC-1 runs as a managed service. Admins configure safety gates at startup: read-only mode, package allowlists (default: `$TMP`), operation filters, SQL blocking, transport guards. Every tool call is audited with user identity via pluggable sinks (stderr, file, BTP Audit Log Service). Per-user JWT scopes can restrict further but never expand beyond server config.

**Trade-off:** Admins must maintain safety policy per instance. Less convenient than "fully open" but necessary for regulated industries.

### 2. Per-User SAP Identity

**Problem:** Shared service accounts hide who did what. SAP's native authorization (S_DEVELOP, package checks) doesn't apply.

**Design:** Principal propagation maps each MCP user to their own SAP user via BTP Destination Service + Cloud Connector. SAP sees the real user identity and enforces its own authorization. No shared credentials, no credential leakage. The LLM acts with exactly the permissions the SAP user has.

**Trade-off:** Requires SAP Basis setup (STRUST, CERTRULE, Cloud Connector trust). Falls back to shared service account if PP setup is incomplete.

### 3. Token-Efficient Tool Design

**Problem:** LLMs have limited context windows. 200+ tools overwhelm mid-tier models (GPT-4o-mini, Gemini Flash, Copilot Studio). Large SAP responses waste tokens.

**Design:** 11 intent-based tools (~5K schema tokens) instead of individual endpoints. Hyperfocused mode reduces to 1 tool (~200 tokens). Method-level surgery extracts/replaces individual methods (95% token reduction). Context compression uses AST-based dependency extraction (7-30x reduction). This is the difference between working and not working on constrained LLMs.

**Trade-off:** Less granular control per-tool. Power users who know ADT endpoints can't call them directly — they go through the intent router.

### 4. BTP-Native Deployment

**Problem:** Enterprise SAP customers run on BTP. MCP servers that require manual Docker setup or local installation face adoption friction.

**Design:** First-class BTP Cloud Foundry support: Destination Service for credential management, Cloud Connector for on-premise SAP connectivity, XSUAA for OAuth, BTP Audit Log Service for compliance. Also deployable as Docker or npm for non-BTP environments. Local stdio mode for development.

**Trade-off:** BTP-specific features (XSUAA, Destination Service, PP) add code complexity. Non-BTP users don't benefit from these but aren't burdened by them either (opt-in via config).

### 5. Multi-Client, Vendor-Neutral

**Problem:** Enterprises use different LLM clients (Claude Desktop, Copilot Studio, VS Code Copilot, Gemini CLI, Cursor). Locking into one client is unacceptable.

**Design:** Standard MCP protocol. Three auth modes coexist on the same endpoint: XSUAA OAuth (BTP-native clients), OIDC/Entra ID (Copilot Studio), API key (development/testing). The same ARC-1 instance serves all client types without reconfiguration.

**Trade-off:** Supporting three auth modes adds complexity to the HTTP server and token validation chain.

### 6. Safe Defaults, Opt-In Power

**Problem:** Most MCP servers allow everything by default. Restricting access is an afterthought, if it happens at all.

**Design:** Read-only by default. Free SQL blocked by default. When writes are enabled, the package allowlist defaults to `$TMP` (local objects only). Writing to transportable packages requires explicit configuration. This inverts the trust model: everything is forbidden until the admin explicitly allows it.

**Trade-off:** First-time setup requires explicit configuration for write access. Developers may find the defaults restrictive until an admin configures their instance.

## Implications for LLM Agents

When working on ARC-1 code, keep these principles in mind:

- **Never add unguarded HTTP calls** — every ADT endpoint must have a `checkOperation()` safety guard
- **Never log to stdout** — stdout is exclusively for MCP JSON-RPC protocol; all logging goes to stderr
- **Prefer fewer tools over more tools** — new functionality should fit into the 11 existing tools, not create tool #12
- **Prefer server-side safety over client-side trust** — don't assume the LLM or user will make safe choices
- **Prefer explicit configuration over implicit behavior** — no magic defaults that bypass admin control
- **Test everything** — every code change requires tests; see CLAUDE.md for test patterns and levels
