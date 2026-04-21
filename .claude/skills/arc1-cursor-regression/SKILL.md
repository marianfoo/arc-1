---
name: arc1-cursor-regression
description: Use when user asks to set up Cursor MCP configs and generate ARC-1 regression prompts. This skill is PR-aware and chat-aware: it adapts tests and server configs to changed files, PR scope, and observed failures.
---

# ARC-1 Cursor Regression Skill (Adaptive)

Use this skill to generate **situation-specific** Cursor setup + prompts for ARC-1, not a fixed checklist.

## When to use

Use this skill when the user asks for any of:
- Cursor MCP setup for ARC-1
- Regression prompts
- PR verification prompts (e.g. PR URL/number like `#174`)
- “Did this fix actually work?” style test plans

## Core principle

Always adapt to the current context:
1. **PR / branch changes** (what was modified)
2. **Current chat findings** (what already failed or succeeded)
3. **Available local skills and conventions** (`.claude/skills/*`)

Do not output one hardcoded recipe unless the user explicitly asks for static output.

## Discovery workflow (required)

Before generating config/prompt, gather context.

### 1) Determine target scope

Priority order:
1. User-provided PR URL/number
2. Explicit branch name
3. Current git diff vs base branch

If PR is provided and `gh` is available, use:

```bash
gh pr view <PR_NUMBER> --json number,title,body,headRefName,baseRefName,url
gh pr diff <PR_NUMBER> --name-only
```

Fallback:

```bash
git diff --name-only origin/main...HEAD
```

### 2) Check available local skills

Inspect `.claude/skills/` and reuse relevant patterns instead of duplicating behavior.

### 3) Parse chat context

Extract known blockers from conversation (examples):
- MCP bridge “Not connected”
- Missing env file
- Wrong arg name (`query` vs `sql`)
- Backend grammar caveat (`UP TO ... ROWS` in SQL text)
- Safety profile blocks (`SAP_BLOCK_DATA`)

Treat these as constraints in generated prompts.

## Test-module mapping (file-change → tests)

Select modules based on changed files.

- `src/server/server.ts` with startup auth/preflight changes:
  - `auth_preflight_good_bad_recovery`
- `src/handlers/schemas.ts` with TABLE_CONTENTS/sqlFilter changes:
  - `table_contents_sqlfilter_validation`
- `src/handlers/intent.ts` with safety/scope/error-hint changes:
  - `safety_hint_and_scope_tests`
- `src/handlers/hyperfocused.ts` or `src/handlers/tools.ts`:
  - `hyperfocused_visibility_and_action_scope`
- `src/handlers/intent.ts` / `src/handlers/schemas.ts` with SAPQuery behavior:
  - `sapquery_parser_limits_and_baseline`
- `.github/workflows/*`, `scripts/ci/*`:
  - `ci_preflight_and_pipeline_behavior`
- docs-only changes:
  - `docs_accuracy_check` (light runtime, mostly static verification)

Always include a minimal `baseline_connectivity` module unless user asks for static-only review.

## Cursor setup strategy

Default to **command-mode MCP** for deterministic runs.
Use `url` mode only if the user explicitly asks for it.

### Command-mode server profiles

Generate only profiles needed for selected modules. Typical set:
- `arc1-good`
- `arc1-bad`
- Optional: `arc1-good-blockdata`, `arc1-good-readonly`, `arc1-good-hyperfocused`

### Config template (adjust profile set dynamically)

```json
{
  "mcpServers": {
    "arc1-good": {
      "command": "bash",
      "args": [
        "-lc",
        "cd <REPO_PATH> && set -a && source /tmp/arc1-good.env && set +a && node dist/index.js"
      ]
    },
    "arc1-bad": {
      "command": "bash",
      "args": [
        "-lc",
        "cd <REPO_PATH> && set -a && source /tmp/arc1-bad.env && set +a && node dist/index.js"
      ]
    }
  }
}
```

## Env preparation rules

- Build first: `npm run build`
- Do **not** source full infrastructure files blindly (unquoted values may break shell parsing).
- Parse only needed keys with `grep '^KEY=' ... | cut -d= -f2-`.
- Never print credentials.

## Prompt generation rules

Always generate:
1. **One-time env prep commands**
2. **One all-in-one execution prompt**
3. Optional smoke prompt if user asks for fast validation

### Prompt quality constraints

- Require precheck: all required MCP servers connected
- If disconnected: stop early and report exact server name
- Use schema-correct arguments:
  - `SAPQuery`: use `sql` + `maxRows`
  - Do not use `UP TO ... ROWS` in SQL text
- For negative auth tests, compare `Checked at` timestamps across calls
- Distinguish outcomes:
  - code regression
  - environment/setup blocker

## Output contract (required)

When this skill is used, return in this order:

1. **Why these tests were selected** (based on PR/chat signals)
2. **Cursor MCP config snippet** (adaptive profile set)
3. **One-time env prep commands**
4. **Single all-in-one prompt**
5. **Expected outcomes checklist** with PASS/FAIL criteria

## Canonical module snippets

### auth_preflight_good_bad_recovery
- Good server: `SAPRead(type="SYSTEM")` succeeds
- Bad server: `SAPRead(type="SYSTEM")` + `SAPSearch(query="Z*")` both preflight-block with same `Checked at`
- Recovery: switch back to good server, `SAPRead(type="SYSTEM")` succeeds

### table_contents_sqlfilter_validation
- Invalid filter: `sqlFilter="SELECT * FROM EABL"` → validation failure (condition-only)
- Block-data variant: same table read on blockdata profile → safety guidance

### sapquery_parser_limits_and_baseline
- JOIN case with `sql` + `maxRows`
- Subquery case with `sql` + `maxRows`
- Aggregate baseline with `sql` + `maxRows`
- Accept either rows or explicit parser limitation errors (non-preflight)

## Anti-patterns to avoid

- Hardcoding a single repo/PR scenario when user asked for adaptive behavior
- Assuming MCP bridge is connected without explicit precheck
- Using URL-mode start/stop instructions when command mode is available
- Calling `SAPQuery` with wrong arg key (`query`) when schema expects `sql`
- Embedding secrets in prompt output

