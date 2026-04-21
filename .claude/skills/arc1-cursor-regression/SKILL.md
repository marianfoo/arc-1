---
name: arc1-cursor-regression
description: Use when user asks to generate Cursor MCP config + regression prompts for ARC-1. Adaptive: derive tests from PR diff or chat findings and build targeted setup/prompts for changed features/fixes, including optional auth/sqlFilter/blockData quick presets.
---

# ARC-1 Cursor Regression Skill (Generic + Adaptive)

This skill creates tailored Cursor setup and prompts based on:
1. PR scope (preferred)
2. Current chat findings
3. Changed files in the local branch

It must not output a hardcoded one-scenario checklist unless the user explicitly asks for that scenario.

## Trigger conditions

Use this skill when user asks for:
- Cursor MCP setup for ARC-1
- Regression prompts
- “verify this PR/fix/feature” prompts
- “create config + prompts so I can run quickly”
- “run the env prep for me”
- auth/sqlFilter/blockData focused MCP regression

### Composite request shortcut (must support)

If the user asks in one message to:
- use this skill
- derive tests from chat + current branch diff
- generate config + env prep + one execution prompt
- and says “run the env prep for me”

then treat it as a single composite workflow:
1. Resolve target root/worktree/branch.
2. Derive module set from diff + chat.
3. Generate config + one copy/paste execution prompt.
4. Execute env prep commands immediately in the resolved root.
5. Report env prep execution status (success/failure + minimal fix if failed).

## Required discovery workflow

### 0) Resolve active ARC-1 root + branch/worktree (mandatory)

Always bind generated config/scripts/prompts to the actual target repo root (not a remembered path).

Run:

```bash
git rev-parse --show-toplevel
git branch --show-current
git worktree list --porcelain
```

Rules:
- If user gave a PR/branch, ensure the resolved root/branch matches that target.
- If multiple ARC-1 clones/worktrees exist, explicitly choose the one containing the target branch/commit.
- Never hardcode `/Users/.../DEV/arc-1` unless user explicitly requests that exact path.

### 1) Determine target scope

Use one of:
- PR URL/number from user
- explicit branch from user
- current branch diff

Preferred commands:

```bash
gh pr view <PR> --json number,title,body,headRefName,baseRefName,url
gh pr diff <PR> --name-only
```

Fallback:

```bash
git diff --name-only origin/main...HEAD
```

### 2) Capture chat-derived constraints

Extract blockers from chat and turn them into guardrails (examples):
- MCP server not connected
- missing env file
- wrong SAPQuery arg key (`query` vs `sql`)
- backend SQL grammar caveats
- safety/profile mismatch
- stale MCP tool descriptor / wrong runtime root

### 3) Build module set from file changes

Map changed files to test modules:

- `src/server/server.ts`, auth/preflight, startup behavior
  - `module_auth_preflight`
- `src/handlers/schemas.ts`, `TABLE_CONTENTS`, validation
  - `module_schema_validation`
- `src/handlers/intent.ts`, hints/scope/routing/diagnose actions
  - `module_handler_behavior`
- `src/adt/diagnostics.ts`, dump/gateway/system message parsing
  - `module_diagnostics_runtime`
- `src/adt/http.ts` login/html detection changes
  - `module_http_html_detection`
- `src/handlers/hyperfocused.ts`, `src/handlers/tools.ts`
  - `module_tool_visibility`
- test/docs-only changes
  - `module_static_verification`

Always include `module_connectivity_precheck` unless user requests static-only.

## Cursor setup strategy

Default: command-mode MCP servers (most reliable in Cursor).
Use URL mode only if user explicitly asks.

Generate only needed profiles for selected modules:
- `arc1-good` for positive behavior
- `arc1-bad` for auth-negative checks (only if auth/preflight module selected)
- `arc1-good-blockdata` for data-block safety checks
- optional profiles like `arc1-good-readonly`, `arc1-good-hyperfocused` depending on module set

Path/worktree requirements for generated config:
- MCP command/script must resolve to the same root used for PR diff analysis.
- If scripts are generated under `<root>/.cursor/scripts`, they must compute root relative to script location, with `ARC1_ROOT` override.
- Mention the resolved root in output so user can quickly verify it before running tests.

## Env prep rules

- Build first (`npm run build`) unless user says skip.
- Build in the resolved target root (from discovery step 0).
- Never print secrets.
- Do not `source` full infra files blindly.
- Never ask users to paste a raw script body directly into an interactive shell.
- Default env file for generated scripts must be `${ARC1_ROOT}/.env` (or `${ROOT}/.env` after root resolution).
- Allow user override via `ARC1_ENV_FILE`.
- Generated scripts must fail fast if root/env/build artifacts are missing or required keys are empty.
- Generated script examples must be executed as files (`bash /path/to/script.sh` or executable path), not sourced.
- Parse only required keys (and strip surrounding quotes / CRLF):

```bash
grep '^KEY=' <file> | head -n1 | cut -d= -f2-
```

### Canonical Cursor script pattern

When generating `arc1-good.sh` / `arc1-good-btp-sim.sh`, use this pattern:

```bash
#!/usr/bin/env bash
if [[ "${BASH_SOURCE[0]}" != "$0" ]]; then
  echo "Do not source this script. Execute it: bash ${BASH_SOURCE[0]}"
  return 1 2>/dev/null || exit 1
fi

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="${ARC1_ROOT:-}"

if [[ -z "$ROOT" ]]; then
  if [[ -f "$SCRIPT_DIR/../../package.json" ]]; then
    ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
  else
    ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
  fi
fi

[[ -n "$ROOT" ]] || { echo "Unable to resolve ARC-1 root. Set ARC1_ROOT=/absolute/path/to/arc-1"; exit 1; }
[[ -f "$ROOT/package.json" ]] || { echo "Invalid ARC1_ROOT: $ROOT (package.json missing)"; exit 1; }
[[ -f "$ROOT/dist/index.js" ]] || { echo "Missing build artifact: $ROOT/dist/index.js. Run: (cd \"$ROOT\" && npm run build)"; exit 1; }

ENV_FILE="${ARC1_ENV_FILE:-$ROOT/.env}"
[[ -f "$ENV_FILE" ]] || { echo "Missing env file: $ENV_FILE"; exit 1; }

getv() {
  local key="$1"
  local raw
  raw="$(grep "^${key}=" "$ENV_FILE" | head -n1 | cut -d= -f2- || true)"
  printf '%s' "$raw" | tr -d '\r' | sed -E "s/^[[:space:]]+|[[:space:]]+$//g; s/^['\"]//; s/['\"]$//"
}

export SAP_URL="${SAP_URL:-$(getv SAP_URL)}"
export SAP_USER="${SAP_USER:-$(getv SAP_USER)}"
export SAP_PASSWORD="${SAP_PASSWORD:-$(getv SAP_PASSWORD)}"
export SAP_CLIENT="${SAP_CLIENT:-$(getv SAP_CLIENT)}"
export SAP_LANGUAGE="${SAP_LANGUAGE:-EN}"
export ARC1_PROFILE="${ARC1_PROFILE:-viewer}"
export SAP_TRANSPORT=stdio

[[ -n "${SAP_URL}" ]] || { echo "Missing SAP_URL in $ENV_FILE"; exit 1; }
[[ -n "${SAP_USER}" ]] || { echo "Missing SAP_USER in $ENV_FILE"; exit 1; }
[[ -n "${SAP_PASSWORD}" ]] || { echo "Missing SAP_PASSWORD in $ENV_FILE"; exit 1; }
node -e 'new URL(process.argv[1])' "$SAP_URL" >/dev/null || { echo "Invalid SAP_URL: [$SAP_URL]"; exit 1; }

exec node "$ROOT/dist/index.js"
```

For `arc1-good-btp-sim.sh`, add:

```bash
export SAP_SYSTEM_TYPE=btp
```

## Execution modes (must support both)

When generating runnable instructions, always provide both:

1) Shell mode (user-run):
- Safe one-time setup should be emitted as full commands (including heredoc wrappers), not raw script body fragments.
- If shell options like `set -u` are used in setup snippets, wrap setup in a subshell:
  - `( set -euo pipefail; ... )`
- Instruct users to run generated scripts as executables or via `bash`, never `source`.

2) Codex mode (agent-run):
- Provide a compact command block Codex can run directly (`cd <resolved-root> && ...`).
- Keep the same root/worktree guarantees as shell mode.
- Never assume Codex is running in a specific clone unless discovery confirmed it.

### Execution decision rule

- If user explicitly says “run the env prep for me” (or equivalent), execute env prep now.
- Otherwise, provide env prep commands only (do not execute).
- When executed, always:
  - run in resolved target root
  - create/refresh `.cursor/scripts/arc1-good.sh` and `.cursor/scripts/arc1-good-btp-sim.sh`
  - run build unless user explicitly asked to skip
  - run `bash -n` syntax validation on generated scripts
  - return prepared paths + default env file path used

## Optional fixed preset (auth/sqlFilter/blockData)

Use this only when the user explicitly asks for the legacy 3-server quick regression profile.

Preset behavior:
1. Precheck connectivity for `arc1-good`, `arc1-good-blockdata`, `arc1-bad`
2. Run:
   - `arc1-good` → `SAPRead(type="SYSTEM")`
   - `arc1-good` → invalid `TABLE_CONTENTS` sqlFilter (`SELECT * ...`) to verify validation
   - `arc1-good-blockdata` → `TABLE_CONTENTS` with condition filter to verify blockData enforcement
   - `arc1-good` → three `SAPQuery` calls
   - `arc1-bad` → `SAPRead SYSTEM` + `SAPSearch Z*` (auth-negative)
   - `arc1-good` → `SAPRead SYSTEM` (post-check)
3. Use `SAPQuery` args `sql` + `maxRows`; do not use `UP TO ... ROWS` in SQL text.
4. Return PASS/FAIL table + raw responses + checked-at comparison when requested.

## Prompt generation contract

When asked for runnable output, always return in this order:

1. Why these tests were selected (PR/chat signals)
2. Cursor MCP config snippet (adaptive profiles only)
3. One-time env prep commands
4. One all-in-one test prompt
5. Expected outcomes checklist (PASS/FAIL criteria)

## Runtime prompt guardrails (must include)

- Precheck required MCP servers are connected.
- Resolve actual server IDs by suffix match (`*-arc1-good`, `*-arc1-good-btp-sim`) rather than assuming literal IDs.
- If any required server disconnected/missing: stop and report exact server name.
- Verify server/tool contract matches expected scope from selected modules.
  - If expected actions/params are absent in advertised tool schema, classify as `Environment/session setup issue (not code regression)` and suggest rebuild/reconnect on the correct root.
- Use schema-correct args:
  - `SAPQuery` uses `sql` + `maxRows`.
  - avoid `UP TO ... ROWS` in SQL text unless backend-specific test intentionally checks parser rejection.
- Classify final status as one of:
  - `Implemented fixes confirmed`
  - `Regression found`
  - `Environment/session setup issue (not code regression)`

## Diagnostics-specific module guidance (for PRs touching SAPDiagnose)

Include these runtime checks when diagnostics files are touched:
- dumps list (`action="dumps"`, bounded results)
- dump detail by id, including section-aware output if supported
- invalid dump id not-found guidance
- `system_messages` action
- `gateway_errors` list and detail retrieval
- gateway detail by id + errorType normalization behavior if applicable
- BTP guardrail behavior if target system is BTP

## Anti-patterns

- Hardcoding only auth/sqlFilter tests when PR scope is diagnostics
- Hardcoding absolute repo paths in scripts/config (`/Users/.../DEV/arc-1`)
- Mixing PR analysis root and runtime server root
- Emitting script text in a way that encourages pasting raw script bodies into interactive shells
- Recommending `source` for runtime server scripts
- Assuming server IDs without checking connected MCP descriptors
- Treating stale tool schema as code regression without classifying env/setup first
- Falling back to custom HTTP client without user permission when prompt says native-only
- Leaking secret values in logs/output
