---
name: arc1-cursor-regression
description: Use when user asks to quickly set up Cursor MCP servers for ARC-1 and generate/run regression prompts for auth preflight, sqlFilter validation, blockData safety, and SAPQuery behavior.
---

# ARC-1 Cursor Regression Skill

Use this skill to produce a repeatable Cursor setup and test prompt for ARC-1.

## Primary goal

Generate:
1. Cursor MCP config (command mode) with 3 servers (`arc1-good`, `arc1-good-blockdata`, `arc1-bad`)
2. One-time env preparation commands
3. A single all-in-one regression prompt the user can paste into Cursor

## Why this skill exists

This avoids flaky `url` mode behavior and avoids manual HTTP start/stop loops. In command mode, Cursor starts each MCP server with explicit env and calls tools naturally.

## Required defaults

- Repo path: `/Users/marianzeis/.codex/worktrees/17c4/arc-1`
- Infra file: `/Users/marianzeis/DEV/arc-1/.env.infrastructure`
- Lock-test vars:
  - `SAP_S4_LOCK_TEST_USER`
  - `SAP_S4_LOCK_TEST_PASSWORD`

## Configuration output template (Cursor)

Always output this shape (update repo path only if user requests):

```json
{
  "mcpServers": {
    "arc1-good": {
      "command": "bash",
      "args": [
        "-lc",
        "cd /Users/marianzeis/.codex/worktrees/17c4/arc-1 && set -a && source /tmp/arc1-good.env && set +a && node dist/index.js"
      ]
    },
    "arc1-good-blockdata": {
      "command": "bash",
      "args": [
        "-lc",
        "cd /Users/marianzeis/.codex/worktrees/17c4/arc-1 && set -a && source /tmp/arc1-good-blockdata.env && set +a && node dist/index.js"
      ]
    },
    "arc1-bad": {
      "command": "bash",
      "args": [
        "-lc",
        "cd /Users/marianzeis/.codex/worktrees/17c4/arc-1 && set -a && source /tmp/arc1-bad.env && set +a && node dist/index.js"
      ]
    }
  }
}
```

## One-time env prep template

Do not `source` the full `.env.infrastructure` file (it may contain unquoted values with spaces). Parse only needed keys.

```bash
cd /Users/marianzeis/.codex/worktrees/17c4/arc-1
npm run build

LOCK_USER="$(grep -E '^SAP_S4_LOCK_TEST_USER=' /Users/marianzeis/DEV/arc-1/.env.infrastructure | head -n1 | cut -d= -f2-)"
LOCK_PASS="$(grep -E '^SAP_S4_LOCK_TEST_PASSWORD=' /Users/marianzeis/DEV/arc-1/.env.infrastructure | head -n1 | cut -d= -f2-)"

cat > /tmp/arc1-good.env <<EOF2
SAP_URL=http://a4h.marianzeis.de:50000
SAP_USER=${LOCK_USER}
SAP_CLIENT=001
SAP_PASSWORD=${LOCK_PASS}
SAP_READ_ONLY=false
ARC1_PROFILE=developer-sql
SAP_ALLOWED_PACKAGES=*
EOF2

cat > /tmp/arc1-good-blockdata.env <<EOF2
SAP_URL=http://a4h.marianzeis.de:50000
SAP_USER=${LOCK_USER}
SAP_CLIENT=001
SAP_PASSWORD=${LOCK_PASS}
SAP_READ_ONLY=false
ARC1_PROFILE=developer-sql
SAP_ALLOWED_PACKAGES=*
SAP_BLOCK_DATA=true
EOF2

cat > /tmp/arc1-bad.env <<EOF2
SAP_URL=http://a4h.marianzeis.de:50000
SAP_USER=${LOCK_USER}
SAP_CLIENT=001
SAP_PASSWORD=WRONG_PASSWORD_FOR_TEST
SAP_READ_ONLY=false
ARC1_PROFILE=developer-sql
SAP_ALLOWED_PACKAGES=*
EOF2
```

## Test prompt template (single prompt)

When user asks for the runnable test prompt, output one copy-paste prompt that:

1. Prechecks connectivity for all 3 servers
2. Runs:
   - `A`: `arc1-good` → `SAPRead(type="SYSTEM")`
   - `B`: `arc1-good` → invalid `TABLE_CONTENTS` sqlFilter (`SELECT * ...`)
   - `C`: `arc1-good-blockdata` → `TABLE_CONTENTS` with condition filter
   - `D`: `arc1-good` → three `SAPQuery` calls
   - `E`: `arc1-bad` → `SAPRead SYSTEM` + `SAPSearch Z*`
   - `F`: `arc1-good` → `SAPRead SYSTEM`
3. Uses `SAPQuery` argument key `sql` (not `query`) and `maxRows`
4. Does not use `UP TO ... ROWS` in SQL text
5. Returns a PASS/FAIL table + raw responses + checked-at comparison

## Guardrails

- If any server is disconnected, stop and report exactly which server.
- Never print secrets.
- If runtime result is blocked by auth/environment, classify as setup issue, not immediate code regression.
- For `arc1-bad`, identical `Checked at` timestamps across calls are expected and should be verified.

## Output style contract

When using this skill, always deliver:

1. MCP config snippet
2. One-time env prep commands
3. Single all-in-one prompt
4. (Optional) short expected-result checklist

