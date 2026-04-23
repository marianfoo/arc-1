# Authz Refactor Inventory — Artifact for Task 0

Generated 2026-04-23. Working artifact; delete in Task 11.

## 1. Action/Type Surface (from src/handlers/schemas.ts)

### SAPRead (uses `type` enum, 35 types on-prem, 25 on BTP)

| Type | Current OpType | Current Scope | Target Scope | Notes |
|---|---|---|---|---|
| PROG, CLAS, INTF, FUNC, FUGR, INCL, DDLS, DCLS, DDLX, BDEF, SRVD, SRVB, SKTD, TABL, VIEW, STRU, DOMA, DTEL, TRAN, DEVC, SOBJ, SYSTEM, COMPONENTS, MESSAGES, TEXT_ELEMENTS, VARIANTS, BSP, BSP_DEPLOY, API_STATE, INACTIVE_OBJECTS, AUTH, FTG2, ENHO, VERSIONS, VERSION_SOURCE | Read | read (via TOOL_SCOPES[SAPRead]='read') | read | Tool-level default in ACTION_POLICY |
| TABLE_CONTENTS | Query | read (via TOOL_SCOPES) — but blockData gates at safety layer | **data** | Needs per-type override in ACTION_POLICY; pruning must filter type enum |

### SAPWrite (action enum)

| Action | Current OpType | Target Scope | Target OpType |
|---|---|---|---|
| create | Create | write | Create |
| update | Update | write | Update |
| delete | Delete | write | Delete |
| edit_method | Update | write | Update |
| batch_create | Create | write | Create |

### SAPActivate

| Action | Target Scope | Target OpType |
|---|---|---|
| activate, publish_srvb, unpublish_srvb | write | Activate |

### SAPNavigate

| Action | Target Scope | Target OpType |
|---|---|---|
| definition, references, completion, hierarchy | read | Intelligence |

### SAPLint

| Action | Current Scope | Target Scope | Target OpType | Bug |
|---|---|---|---|---|
| lint, lint_and_fix, list_rules, format, get_formatter_settings | read (tool-level) | read | Intelligence | |
| **set_formatter_settings** | read (tool-level) | **write** | Update | **CLASSIFICATION BUG — tool-level read, but calls OperationType.Update** |

### SAPDiagnose

| Action | Target Scope | Target OpType |
|---|---|---|
| syntax, atc, dumps, traces, system_messages, gateway_errors, quickfix, apply_quickfix | read | Read |
| unittest | read | Test |

### SAPTransport

| Action | Current Scope | Target Scope | Target OpType | Bug |
|---|---|---|---|---|
| list, get | write (tool-level) | read | Read | was write |
| **check, history** | write (tool-level) | **read** | Read | **CLASSIFICATION BUG** |
| create, release, release_recursive, reassign, delete | write | transports | Transport | per-user scope granularity |

Also: SAPTransport tool currently gated by `enableTransports=true` in tool registration → remove.

### SAPGit

| Action | Current Scope (SAPGIT_ACTION_SCOPES) | Target Scope | Target OpType |
|---|---|---|---|
| list_repos, whoami, config, branches, external_info, history, objects, check | read | read | Read |
| stage, clone, pull, push, commit, switch_branch, create_branch, unlink | write | git | Update |

### SAPContext

| Action | Target Scope | Target OpType |
|---|---|---|
| deps, usages, impact | read | Intelligence |

### SAPManage

| Action | Current Scope | Target Scope | Target OpType | Bug |
|---|---|---|---|---|
| features, probe, cache_stats | read | read | Read | |
| create_package | write | write | Create | |
| delete_package | write | write | Delete | |
| change_package | write | write | Update | |
| **flp_list_catalogs, flp_list_groups, flp_list_tiles** | write | **read** | Read | **CLASSIFICATION BUG** |
| flp_create_catalog, flp_create_group, flp_create_tile, flp_add_tile_to_group, flp_delete_catalog | write | write | Workflow |

### Hyperfocused SAP

Same actions as above tools, keyed as `SAP.<action>` in ACTION_POLICY.

## 2. Files to Update (from grep of removed identifiers)

### Must update — user-facing docs (docs_page/)
- authorization.md — **complete rewrite**
- configuration-reference.md — **complete rewrite**
- xsuaa-setup.md — scope table, MCPDeveloper update
- security-guide.md — hardening section
- oauth-jwt-setup.md — new scopes in extraction
- local-development.md — .env examples
- cli-guide.md — CLI flag examples
- docker.md — env var examples
- deployment.md — examples
- deployment-best-practices.md — examples
- quickstart.md — default examples
- api-key-setup.md — drop single-key section
- principal-propagation-setup.md — three-layer note
- enterprise-auth.md — scope model
- log-analysis.md — new fields
- index.md — safety bullets
- tools.md — references to old flags
- roadmap.md — historical references
- architecture.md — if references old flags
- phase4-btp-deployment.md — XSUAA scope examples
- updating.md — **add migration section**

### Must update — internal docs (docs/)
- research/authorization-concept.md — add postscript
- research/sap-backend-roles.md — if references
- publishing-guide.md — if references
- implementation-plan-sapcontext-sapmanage.md — if references
- plans/ralphex-data-preview-probe-scope-hardening.md — in-progress plan
- plans/oauth-security-hardening.md — in-progress plan

### Must update — root files
- README.md — Safety & Admin Controls
- CLAUDE.md — config table (core)
- AGENTS.md — sync with CLAUDE.md
- CHANGELOG.md — breaking change entry
- .claude/skills/arc1-cursor-regression/SKILL.md — if references
- compare/00-feature-matrix.md — timestamp + new row

### Must update — tests (tests/)
- unit/adt/safety.test.ts — major rewrite
- unit/server/config.test.ts — major rewrite
- unit/server/server.test.ts — filter tests
- unit/server/http.test.ts — scope extraction + per-key
- unit/server/xsuaa.test.ts — create or expand
- unit/server/audit.test.ts — field name
- unit/server/audit-integration.test.ts — same
- unit/server/logger.test.ts — log formatting
- unit/handlers/intent.test.ts — scope tests
- unit/handlers/tools.test.ts — tool registration
- unit/handlers/hyperfocused.test.ts — scope tests
- unit/adt/transport.test.ts — enableTransports → scope
- unit/adt/crud.test.ts — readOnly → allowWrites
- unit/adt/devtools.test.ts — set_formatter_settings scope
- unit/adt/flp.test.ts — flp_list_* scope
- unit/adt/diagnostics.test.ts — op-code tests (delete)
- unit/adt/client.test.ts — allowedOps tests (delete)
- unit/adt/gcts.test.ts — enableGit
- unit/adt/abapgit.test.ts — enableGit
- integration/adt.integration.test.ts — op-code / readOnly
- integration/transport.integration.test.ts — enableTransports
- integration/gcts.integration.test.ts — enableGit
- integration/abapgit.integration.test.ts — enableGit
- evals/llm-eval.test.ts — inline config

### New test files to create
- tests/unit/authz/policy.test.ts
- tests/unit/server/deny-actions.test.ts
- tests/unit/server/effective-policy-log.test.ts
- tests/unit/cli/config-show.test.ts
- tests/unit/server/xsuaa.test.ts (if doesn't exist)

### External config
- xs-security.json — add scopes, update MCPDeveloper
- .env.example — complete rewrite (recipe blocks)
- package.json — add validate:policy script
- Dockerfile — verify no old env vars
- mta.yaml — gitignored, skip

### Out of scope (historical / competitor)
- docs/plans/completed/**
- docs/reports/**
- reports/**
- compare/** (except 00-feature-matrix.md)
- research/skill-expansion-suggestions.md

## 3. Classification Bugs to Fix (6)

1. SAPLint.set_formatter_settings — tool-level read, calls Update → **target: write scope**
2. SAPManage.flp_list_catalogs/groups/tiles — write scope, calls Read → **target: read scope**
3. SAPTransport.check — tool-level write, read-only impl → **target: read scope**
4. SAPTransport.history — tool-level write, read-only impl → **target: read scope**
5. checkTransport doesn't consult readOnly → **target: checkTransport requires allowWrites && allowTransportWrites for mutations**
6. checkGit doesn't consult readOnly → **target: checkGit requires allowWrites && allowGitWrites for mutations**
