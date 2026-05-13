---
name: sap-cap-stack-audit-full
description: Orchestrator audit that runs the full SAP CAP + Fiori Elements + BTP stack of checks in parallel — UI5 linter, manifest validation, CDS compile, TypeScript typecheck, hardcoded-customizing sweep, test suite, plus optional specialized agent reviews (UI5 code quality, CAP performance, project architecture, security, deployment readiness) — and consolidates everything into a single deduplicated report. Use when asked to "run a full audit", "audit the whole stack", "pre-release check", "production readiness audit", "do a comprehensive SAP audit", or to dispatch multiple specialized audits in one shot.
---

# SAP CAP Stack — Full Audit Orchestrator

Run **every applicable check** on a SAP CAP + Fiori Elements + BTP project in **six phases**, parallelize the work aggressively, deduplicate findings, and emit one consolidated report. The skill is **read-only**: it never modifies files and never opens PRs. Its purpose is situational awareness before a release, a hand-off, or a critical merge.

The skill orchestrates:
- **Static analysis tools** (UI5 linter, manifest schema, CDS compile, TypeScript)
- **Test suite** scoped to the project's existing configuration
- **Specialized audit skills** in this repository ([`sap-cap-clean-core-enforce`](../sap-cap-clean-core-enforce/SKILL.md), [`sap-cap-customizing-honor`](../sap-cap-customizing-honor/SKILL.md), [`sap-cap-security-rbac-matrix`](../sap-cap-security-rbac-matrix/SKILL.md), [`sap-fiori-app-audit`](../sap-fiori-app-audit/SKILL.md), [`sap-cap-text-polish`](../sap-cap-text-polish/SKILL.md))
- **MCP tooling** when available (Fiori Tools, SAP Docs, UI5 Tooling, CAP/cds-mcp)

It does **not** invent new checks; it composes existing ones.

## v1 Guardrails

- **Idempotent and read-only.** No file modification, no commits, no PRs.
- **Timeouts.** Each sub-audit caps at 10 min wall-clock; on timeout the result is marked `TIMEOUT` and the run continues.
- **Parallelism over speed.** Phases 2 and 3 fan out aggressively (one message, many tool calls). Phase 4 and 5 run sequentially because they depend on Phase 2/3 outputs.
- **Deduplication.** If two sub-audits report the same finding (same `file:line`, same category), keep the description with the most evidence and link to the other audit.
- **Cite `file:line`.** Every finding must have a clickable evidence pointer.

## Smart Defaults (apply silently, do NOT ask)

| Aspect | Default | Why |
| --- | --- | --- |
| Mode | Full audit (all phases) | The point of this skill is comprehensive coverage |
| Output language | English (Italian if project requires) | Match project convention |
| Output destination | `docs/audit/<yyyy-mm-dd>-stack-audit.md` | Stable filename convention |
| Test scope | Project's `npm test` script with `--runInBand` if jest, or fallback to project's existing CI test command | Do not invent a new test invocation |
| Agent budget | Max 6 specialized agents in parallel | Keep cost predictable |
| Skip flag | `quick` skips agent reviews (Phase 3); CLI static checks only | ~2 min run instead of ~10 min |

## Input

Single optional argument:

| Argument | Behavior |
| --- | --- |
| (empty) | Full audit of the whole project |
| `ui5` | Skip CAP/BTP-specific phases; only UI5/Fiori checks |
| `cap` | Skip UI5 phases; only CAP backend |
| `btp` | Only BTP best practices + deployment readiness + connectivity |
| `quick` | All phases EXCEPT Phase 3 (agent reviews). ~2 min |
| `<app-name>` or `<sub-folder>` | Filter to a specific app or directory |

Examples: (no arg) → full · `ui5` · `cap` · `quick` · `manager-ui` · `srv/handlers`.

## Step 1: Pre-flight

Always runs, ~30 s.

```bash
git status --short && git log -1 --oneline
git branch --show-current
```

Detect project shape:

```bash
# CAP signature
test -f srv/server.ts || test -f srv/server.js || test -f srv/index.ts || ls srv/*.cds 2>/dev/null | head -1

# Fiori apps detection (multiple layouts supported)
APPS=$(ls -d app/*/webapp 2>/dev/null | wc -l)
test "$APPS" -eq 0 && APPS=$(ls -d apps/*/webapp 2>/dev/null | wc -l)
echo "Detected $APPS Fiori app(s)"

# CDS compile sanity (entry-point auto-discovery)
SRV=$(grep -lE "^service\s+\w+" srv/*.cds | head -1)
test -n "$SRV" && npx cds compile srv app --service "$(grep -oE '^service\s+\w+' "$SRV" | head -1 | awk '{print $2}')" --to edmx > /tmp/audit-svc.edmx 2>&1 && echo "CDS OK" || echo "CDS FAIL"
```

Output of Phase 1: branch SHA, dirty files, project signature (CAP yes/no, Fiori apps count, CDS compile status, primary service name).

If CDS compile fails, **stop the audit** and emit a single-finding report — no point auditing on top of a broken model.

## Step 2: Static analysis (parallel)

All commands in Phase 2 are independent; dispatch them via **multiple Bash tool calls in a single message**.

### 2a — UI5 Linter per app

```bash
for app in $(ls -d app/*/webapp 2>/dev/null | cut -d/ -f2); do
  dir="app/$app"
  result=$(cd "$dir" && npx -y @ui5/linter 2>&1 | grep -E "[0-9]+ problems" | tail -1)
  echo "$app: $result"
done
```

### 2b — Manifest schema validation

Prefer MCP tool when available:

```
mcp__plugin_sapui5_ui5-tooling__run_manifest_validation app/<each>/webapp/manifest.json
```

Fallback: JSON Schema validation via `ajv` or similar against the manifest schema bundled in `@sap-ux/manifest-validation-tool` if installed.

### 2c — Fiori app discovery

```
mcp__plugin_sap-fiori-tools_fiori-tools__list_fiori_apps  (searchPath = cwd)
```

Record anomalies: duplicate app IDs, non-standard `appPath`, `odataVersion` mismatch with the backend service.

### 2d — Test suite

```bash
# Discover the test runner
if grep -q '"jest"' package.json && grep -q '"test":' package.json; then
  npm test 2>&1 | tail -10
elif test -f vitest.config.ts; then
  npx vitest run 2>&1 | tail -10
elif grep -q '"mocha"' package.json; then
  npm test 2>&1 | tail -10
fi
```

Skip in `quick` mode.

### 2e — TypeScript typecheck per app and srv

```bash
# Backend
test -f srv/tsconfig.json && npx -p typescript tsc --noEmit -p srv/tsconfig.json 2>&1 | tail -5

# Each app
for app in $(ls -d app/*/ 2>/dev/null); do
  test -f "$app/tsconfig.json" && (cd "$app" && npx -p typescript tsc --noEmit 2>&1 | head -5)
done
```

### 2f — Hardcoded customizing sweep

A quick regex pass to surface obvious hardcoded business decisions. The deep audit lives in [`../sap-cap-customizing-honor/SKILL.md`](../sap-cap-customizing-honor/SKILL.md); this is a fast cross-check.

```bash
grep -rnE ">=\s*[0-9]{2,}|<=\s*[0-9]{2,}|setTimeout\([^,]+,\s*[0-9]{4,}" srv/ --include="*.ts" --include="*.js" 2>/dev/null \
  | grep -vE "\.test\.|//|^.*\*|HTTP|status:|\.length|substring" \
  | head -20
```

## Step 3: Specialized audits (parallel agents)

Skip entirely in `quick` mode. Otherwise dispatch the agents below **in parallel** (one message, multiple Agent / Skill invocations).

Pick agents based on scope:

| When | Skill / Agent | Purpose |
| --- | --- | --- |
| Always (if CAP) | [`../sap-cap-clean-core-enforce/SKILL.md`](../sap-cap-clean-core-enforce/SKILL.md) | Clean Core Level A compliance audit |
| Always (if customizing pattern detected) | [`../sap-cap-customizing-honor/SKILL.md`](../sap-cap-customizing-honor/SKILL.md) | Bidirectional CSV ↔ code audit |
| Always | [`../sap-cap-security-rbac-matrix/SKILL.md`](../sap-cap-security-rbac-matrix/SKILL.md) | OWASP / ASVS / NIST / RBAC matrix |
| Per Fiori app (scope = `ui5` or full) | [`../sap-fiori-app-audit/SKILL.md`](../sap-fiori-app-audit/SKILL.md) `<app>` | Per-app UI/UX + frontend/backend contract |
| Optional polish round | [`../sap-cap-text-polish/SKILL.md`](../sap-cap-text-polish/SKILL.md) `dry-run` | User-visible text quality |
| If MCP `sap-btp-best-practices` exists | (project-specific agent) | BTP destination, XSUAA, audit log, resilience |
| Pre-deploy | (project-specific deployment-readiness agent) | mta.yaml / Kyma manifests / Dockerfile / health endpoints |

Each agent runs **read-only** and reports back ≤500 words. If an agent times out or is unavailable, mark it `TOOL UNAVAILABLE` and move on.

Detection heuristics for whether to invoke an optional agent:

```bash
# Customizing pattern detected?
test -f "db/data/$(ls db/data/ 2>/dev/null | grep -iE 'systemparam|setting|config' | head -1)" && echo "customizing detected"

# Clean Core (Tier-2 S/4 proxies) detected?
grep -lE "@cds\.external|extend service.*S4|cds\.connect\.to\(['\"]S/4" srv/ -r --include="*.cds" --include="*.ts" 2>/dev/null | head -1

# BTP deployment artifacts?
test -f mta.yaml || ls k8s/*.yaml 2>/dev/null | head -1 || test -f Dockerfile
```

## Step 4: CAP-specific deep checks

Skip if scope = `ui5`.

### 4a — CDS model integrity

Use the `cds-mcp` MCP server if installed:

```
mcp__plugin_cds-mcp_cds-mcp__search_model query="list all entities"
mcp__plugin_cds-mcp_cds-mcp__search_model query="list all services"
```

Fallback: `npx cds compile srv app --to json > /tmp/model.json` and inspect entities/services from JSON.

### 4b — Profile / configuration audit

```bash
# Discover all CDS profiles
grep -nE "\[(production|onprem|development|live|mocked|k8s|hybrid)" .cdsrc*.json package.json 2>/dev/null | head -20
```

For each profile detected, check:
- Does it set `requires.auth`?
- Does it set `requires.db.kind`?
- Are remote bindings referenced (`requires.<name>.kind: odata-v[24]` + `credentials.destination`)?

### 4c — Build dry-run

```bash
grep -q '"build"' package.json && npm run build 2>&1 | tail -20
test -f mta.yaml && which mbt && mbt build --mode=verbose 2>&1 | tail -20 || echo "mbt not available"
```

## Step 5: Best-practice cross-check

Invoke (via Skill tool) any general best-practice skill present in the user's environment to cross-validate Phase 2/3 findings. Examples (only if available — do not invent):

- A BTP developer-guide skill
- A BTP cloud-logging best-practice skill
- A BTP connectivity / destination skill
- A CAP deployment-checklist skill

For each, extract the **DO / DON'T** highlights and compare against Phase 2/3 findings. Anything that violates a DO/DON'T is upgraded to `PRINCIPLE MISMATCH` and added to the high-priority section of the final report.

## Step 6: Optional formal code review

Run **only if** the current branch is not `main`/`master` and has a non-trivial diff:

```bash
BR=$(git rev-parse --abbrev-ref HEAD)
test "$BR" != "main" -a "$BR" != "master" && git diff --stat origin/main..."$BR" | tail -1
```

If applicable, invoke a code-review skill / agent (project-specific) with scope "all changes on current branch vs main". Otherwise, write "No active feature branch — code-review skipped".

## Output — consolidated report

Always written to `docs/audit/<yyyy-mm-dd>-stack-audit.md`. Final structure:

```markdown
# SAP Stack Audit — <yyyy-mm-dd> — branch <name>

## Summary
- Overall grade: **A | B | C | D** (based on count + severity of findings)
- Critical: N
- High: N | Medium: N | Low: N
- Build status: OK / FAIL
- Tests: passed / total

## Infrastructure
- CDS compile: OK / FAIL
- TypeScript (per scope): …
- Test suite: …
- Hardcoded residue: N findings

## UI5 / Fiori (per app)
| App | Linter | Manifest | TypeScript | Notes |
| --- | --- | --- | --- | --- |

## CAP Backend
- Model: …
- Service layer: …
- Performance flags: …

## BTP / Deploy
- …

## Critical (P1)
1. …

## High (P2)
1. …

## Quick Wins (P3)
- …

## Sub-audit reports
- Clean Core: [link]
- Customizing: [link]
- Security RBAC: [link]
- Fiori App (per app): [link x N]
- Text Polish: [link]

## Tools unavailable
- …

## Raw findings (deduplicated)
[per phase, citable file:line]
```

### Severity rollup

Grade calculation (default; adjust to project's conventions if `CLAUDE.md` specifies):

| Grade | Trigger |
| --- | --- |
| A | 0 Critical · 0 High · ≤5 Medium |
| B | 0 Critical · ≤2 High |
| C | 0 Critical · 3-5 High |
| D | ≥1 Critical OR ≥6 High |

### Deduplication

Two findings are duplicates when **all** of these match:
- Same file path
- Same line range (or overlapping by ±2 lines)
- Same root cause category

Merge: keep the description with more evidence; cross-link the other audit's reference.

## BTP vs On-Premise Differences

| Aspect | BTP | On-Premise |
| --- | --- | --- |
| Test suite | Often `npm test` with mocked profile | May require live S/4 connectivity (`live` profile) |
| Deployment dry-run | `mbt build` or `kubectl apply --dry-run=client` | Less standardized; may need manual smoke test |
| MCP tooling availability | Generally rich | Limited; expect more `TOOL UNAVAILABLE` markers |
| Connectivity check | Destination service + XSUAA | SAP Cloud Connector / Reverse Proxy |

The orchestrator logic is identical; expect more `TOOL UNAVAILABLE` flags on-premise.

## Error Handling

| Symptom | Likely cause | Action |
| --- | --- | --- |
| CDS compile fails in Phase 1 | Schema error | Stop the audit, emit single-finding report |
| Test suite cannot be invoked | No `test` script / unsupported runner | Mark Phase 2d "SKIPPED (no test runner)" and continue |
| Agent times out (Phase 3) | Long-running sub-audit | Mark `TIMEOUT`, attach partial output, continue |
| MCP tool unavailable | Plugin not installed | Mark `TOOL UNAVAILABLE`, fall back to non-MCP method if any |
| Two agents report the same finding | Expected | Deduplicate per the rule above |
| Test suite produces flaky results | Single-writer SQLite, in-memory DB locks | Note in report; do not retry |

## What This Skill Does NOT Do

- Does **not** modify any file.
- Does **not** open PRs.
- Does **not** run destructive commands.
- Does **not** redesign architecture (use a design skill).
- Does **not** invent new checks; only composes existing skills/tools.
- Does **not** download remote artifacts beyond what the project already references.

## When to Use This Skill

- Before a major release / cut-over.
- When taking over an unfamiliar project, to get a baseline.
- Before a Clean Core / production-readiness review meeting.
- As a sanity check after a large refactor or merge.
- When preparing a status report for stakeholders.

## When NOT to Use

- For a single targeted question (use the specific skill directly).
- When the project is mid-broken state — fix the breakage first.
- For continuous CI execution (too expensive; use [`../sap-cap-ci-gates-pattern/SKILL.md`](../sap-cap-ci-gates-pattern/SKILL.md) instead).
- For learning the codebase from scratch (use a code-exploration skill).

## Follow-up

- The consolidated report points to each sub-audit's report. Open the relevant one for deep findings.
- Findings tagged `PRINCIPLE MISMATCH` should be triaged first — they violate established best-practice conventions.
- Findings tagged `TOOL UNAVAILABLE` indicate gaps in the local tooling, not in the project.
- Critical (P1) findings should block release; High (P2) should have owners assigned; Medium (P3) belongs in the backlog.

## References

- [SAP CAP — Production-Readiness Guide](https://cap.cloud.sap/docs/guides/deployment/)
- [SAP UI5 — Linter](https://github.com/SAP/ui5-linter)
- [SAP Fiori Tools — Manifest Validation](https://help.sap.com/docs/SAP_FIORI_tools)
- [SAP BTP — Reference Architecture](https://help.sap.com/docs/btp/sap-btp-neo-environment/reference-architectures)
- [OWASP — Application Security Verification Standard (ASVS)](https://owasp.org/www-project-application-security-verification-standard/)
