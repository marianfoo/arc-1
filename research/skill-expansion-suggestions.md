# Skill Expansion Suggestions

Research notes from analyzing [superclaude-for-sap](https://github.com/babamba2/superclaude-for-sap) and brainstorming how similar patterns could work in ARC-1's architecture. None of these are committed to — they're ideas to keep in mind for future development.

---

## 1. SPRO Skill — SAP Customizing Explorer

**Idea:** A skill that helps users explore SPRO customizing configuration. Given a module or business scenario, it reads relevant customizing tables, explains the config, and identifies gaps.

**How it would work in ARC-1:**
- Bundle a condensed reference of ~50 key customizing tables across FI/CO/SD/MM/PP/WM/HR (inspired by superclaude's per-module `configs/*/spro.md` files, but condensed)
- Live-query config tables via `SAPRead(type="TABLE_CONTENTS")` or `SAPQuery` — no local caching like superclaude's `extract-spro.mjs`
- Cross-reference with SAP docs via mcp-sap-docs `search()`
- Fall back to table structure only (`SAPRead(type="TABL")`) when `blockData=true`

**Superclaude's approach:** 15 module-specific directories, each with `spro.md` (config paths + tables), `tcodes.md`, `tables.md`, `bapi.md`, `enhancements.md`, `workflows.md`. Static reference files, plus a live extraction script.

**ARC-1 advantage:** Live queries every time — always current, no stale cache. ARC-1's `SAPRead(type="TABLE_CONTENTS")` already supports this.

**Open questions:**
- Is there enough demand for customizing exploration vs. development tasks?
- Should the reference be a separate file or embedded in the skill?
- Which modules to prioritize? FI/SD/MM cover most users

---

## 2. Table/Data Allowlists — Server-Side Safety Enhancement

**Idea:** Add per-table allowlist/blocklist to complement the existing all-or-nothing `blockData`/`blockFreeSQL` flags.

**Current state:**
- `blockData=true` blocks ALL table preview — binary on/off
- `blockFreeSQL=true` blocks ALL freestyle SQL — binary on/off
- No per-table filtering exists
- Package allowlist exists for writes (`allowedPackages`) but not for data reads

**Proposed config options:**
```
SAP_ALLOWED_TABLES / --allowed-tables     # Whitelist (e.g., "T001,T001W,MARA,Z*")
SAP_BLOCKED_TABLES / --blocked-tables     # Blacklist (e.g., "USR02,PA0001,BNKA")
```

**Semantics:**
- `allowedTables` set → only listed tables queryable (whitelist mode)
- `blockedTables` set → listed tables blocked, all others allowed (blacklist mode)
- Both support wildcards (`Z*`, `PA*`)
- `blockedTables` takes precedence over `allowedTables`
- Applies to both `SAPRead(type="TABLE_CONTENTS")` and `SAPQuery` (parse SQL for table names)

**Default blocklist seed** (inspired by superclaude's `table_exception.md`, ~200 categorized tables):
- Auth: `USR02`, `AGR_1251`, `RFCDES`
- HR/PII: `PA0001`-`PA0008`, `HRP1000`, `PCL1`, `PCL2`
- Banking: `BNKA`, `KNBK`, `REGUH`, `PAYR`
- Credentials: `RSECTAB`, `RFCDES`

Could be opt-in via `--blocked-tables=@default` or new safety profiles (`viewer-safe`, `developer-safe`).

**Files that would be touched:**
- `src/adt/safety.ts` — `allowedTables`, `blockedTables`, `isTableAllowed()`, `checkTable()`
- `src/server/types.ts` — new fields on `SafetyConfig`
- `src/server/config.ts` — parse new CLI flags / env vars
- `src/handlers/intent.ts` — `checkTable()` before `getTableContents()` and `runQuery()`
- New: `src/adt/sql-tables.ts` — simple SQL table name extractor for SAPQuery enforcement

**Superclaude's approach:** Prompt-layer blocklist in `exceptions/table_exception.md` + a `block-forbidden-tables.mjs` hook that intercepts tool calls client-side. Categories: Banking/Payment, PII, Auth/Security, HR/Payroll, Tax/IDs, Audit Logs.

**ARC-1 advantage:** Server-side enforcement — can't be bypassed by prompt injection or client misconfiguration.

---

## 3. Ralph Skill — Self-Correcting Development Loop

**Idea:** A persistence loop that keeps working on a task until ALL verification gates pass: syntax clean, activation successful, unit tests green.

**Trigger phrases:** "ralph", "don't stop", "must activate", "keep going until it works", "finish this"

**Gate mapping to ARC-1 tools:**

| Gate | ARC-1 Tool |
|---|---|
| Pre-write lint | `SAPLint(action="lint", source=...)` |
| Write code | `SAPWrite(action="edit_method", ...)` for surgical fixes |
| Syntax check | `SAPDiagnose(action="syntax", type=..., name=...)` |
| Activation | `SAPActivate(objects=[...])` |
| Unit tests | `SAPDiagnose(action="unittest", type="CLAS", name=...)` |

**Loop logic:**
1. Read existing code via `SAPRead`, get deps via `SAPContext`
2. Lint proposed code via `SAPLint` (offline, no SAP round-trip)
3. Write via `SAPWrite(action="edit_method")` — surgical method editing
4. Gate 1: `SAPDiagnose(action="syntax")` → 0 errors
5. Gate 2: `SAPActivate(objects=[...])` → success
6. Gate 3: `SAPDiagnose(action="unittest")` → all pass (skip if no test class)
7. If any gate fails: read error, fix, go back to step 2
8. Bail after 3 consecutive failures on the same error

**Error recovery intelligence:**
- Syntax error → read error message, identify line, fix via `edit_method`
- Activation error → check missing dependencies via `SAPContext`, create if needed
- Test failure → read test method, fix implementation (never the test)

**Differences from superclaude's ralph:**

| Aspect | superclaude | ARC-1 |
|---|---|---|
| State tracking | `.sc4sap/ralph/prd.json` + `progress.txt` files | Conversation context (no filesystem) |
| Agent personas | "sap-architect", "sap-developer", "sap-critic" | Single LLM, no persona switching |
| Method editing | Full class replacement via `UpdateClass` | `edit_method` — surgical, much less error-prone |
| Pre-write lint | Not present | `SAPLint` — ARC-1 advantage |
| Tool names | `GetAbapAST`, `GetAbapSemanticAnalysis` | `SAPDiagnose(action="syntax")` — single unified tool |

---

## 4. Autopilot Skill — Autonomous Development Pipeline

**Idea:** Takes a brief SAP requirement (2-3 sentences) and handles the full lifecycle autonomously: probe → research → design → plan (wait for approval) → implement → verify → review → report.

**Phase mapping to ARC-1 tools:**

| Phase | Tools |
|---|---|
| 0. Probe | `SAPManage(action="probe")` |
| 1. Research | `SAPSearch`, `SAPRead`, `SAPContext`, `search()` (mcp-sap-docs) |
| 2. Design & Plan | Present plan, **wait for user approval** |
| 3. Transport | `SAPTransport(action="check"/"create")` |
| 4. Implement | `SAPWrite(action="batch_create")`, fallback to sequential |
| 5. Verify | Ralph loop (syntax → activate → test, max 3 retries) |
| 6. Review | `SAPDiagnose(action="atc")`, re-read all objects, check quality |
| 7. Report | Summary of created objects, transport, test results |

**Key design: Autopilot embeds ralph as its verification phase.** Ralph is the building block; autopilot orchestrates the full pipeline around it.

**Differences from superclaude's autopilot:**

| Aspect | superclaude | ARC-1 |
|---|---|---|
| Agent coordination | Named agents (architect, developer, tester, reviewer) | Single LLM orchestrates all phases |
| State persistence | `.sc4sap/autopilot/` directory | Conversation context |
| Batch operations | Sequential creates | `batch_create` — all objects at once |
| Cancel mechanism | `/sc4sap:cancel` command | Natural interruption |
| Pre-skill chaining | Checks for existing deep-interview/ralplan outputs | Standalone — does its own gathering |
| User approval gate | No mandatory approval before implementation | Phase 2 requires explicit user approval |

---

## 5. Other Ideas Worth Noting

### Pre-Compaction Context Preservation
Superclaude's `pre-compact.mjs` hook saves active transport numbers, recent object names, module context before Claude Code compacts the context window. ARC-1 could expose a `SAPContext` action for "session state" that returns a compact summary of recently-touched objects and active transports.

### ABAP Release Feature Matrix
Superclaude's `abap-release-reference.md` maps features to ABAP releases (when inline declarations, constructor expressions, RAP, EML became available). Useful for code generation. ARC-1's `features.ts` already does runtime detection — a skill reference could formalize the "check before generating" convention.

### SAP Version Reference (ECC vs S/4HANA)
Table renames (BSEG→ACDOCA, MKPF→MATDOC, KNA1→BUT000), MATNR length changes, output management shifts. Useful for migration skills and code generation targeting specific system versions.

### Status Line Template
A recommended Claude Code statusline showing SAP SID, safety profile, connection health, and read-only mode indicator.

### Session-Start Probe Hook
A Claude Code hook that auto-runs `SAPManage(action="probe")` at session start and injects system info into the conversation context.

---

## What to Skip

- **24 module-specific agent personas** — prompt bloat, SAP knowledge better served via mcp-sap-docs
- **SPRO live extraction script** — risky (SELECT * on config tables), ARC-1 queries live anyway
- **Keyword detection hooks** — brittle ("don't stop" → autopilot), explicit `/skill` invocation is better
- **Plugin manifest format** — ARC-1 is multi-client, not Claude Code-only
- **Naming convention files** — too ECC-specific, ARC-1's probe-first approach handles system differences at runtime

---

## Priority Assessment

| Idea | Impact | Effort | Dependencies |
|---|---|---|---|
| Ralph | High — most universally useful | Medium — skill only | None |
| Autopilot | High — flagship skill | Medium — skill only | Ralph (embeds it) |
| Table allowlists | High — safety feature | Medium — server code changes | None |
| SPRO | Medium — niche use case | Low — skill + reference file | None |
| Pre-compaction | Low — UX improvement | Low | None |
| Release matrix | Low — already have features.ts | Low | None |
