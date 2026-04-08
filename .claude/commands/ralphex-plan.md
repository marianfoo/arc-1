# ralphex Plan Creator

Generate a structured implementation plan for the ralphex autonomous coding agent. The plan must be detailed enough for an autonomous agent (Claude Code) to execute each task without human guidance, in isolated sessions with fresh context.

## Input

The user provides a feature/task description. This can be:
- A free-form description ("add caching for ADT responses")
- A reference to a gap analysis or roadmap item
- A GitHub issue
- A detailed requirements brief

If the description is vague, ask 1-2 targeted clarifying questions before proceeding. Don't over-interview — get enough to start researching.

---

## Phase 1: Deep Research

Before writing a single line of the plan, research exhaustively. ralphex tasks execute in isolated Claude Code sessions with **no shared context** — every task must be self-contained. The quality of your research directly determines whether the autonomous agent succeeds or gets stuck.

### 1a. Read project guidelines

Read `CLAUDE.md` in full. Pay attention to:
- Codebase structure (the file tree)
- Key Files for Common Tasks table
- Code patterns (ADT client method, handler pattern, safety check)
- Testing conventions (vitest, mock patterns, fixture locations)
- Technology stack
- Configuration options (the config table — new features may need new flags)

### 1b. Read infrastructure docs

Read `INFRASTRUCTURE.md` for context on the test system:
- SAP A4H system details (host, ports, credentials pattern)
- BTP deployment details
- How to run integration/smoke tests against the live system
- PP (Principal Propagation) setup if auth-related

### 1c. Map the affected code

Based on the feature description, identify ALL files that will need changes. For each file:
- Read the current implementation
- Note line numbers for key sections
- Understand the patterns used

Use the "Key Files for Common Tasks" table in CLAUDE.md as a starting point, then trace the call chain to find additional files.

### 1d. Read existing tests

For every source file you plan to modify, find and read its test counterpart:
- Unit tests in `tests/unit/` (mirror source structure)
- Integration tests in `tests/integration/` if applicable
- Fixtures in `tests/fixtures/xml/` and `tests/fixtures/abap/`
- Understand mocking patterns: `vi.mock('undici', ...)` + `mockResponse()`

### 1e. Check for prior art

Search the codebase for similar patterns. If the feature extends an existing pattern, identify it to ensure consistency. Also check:
- `docs/plans/completed/` — similar completed plans for format reference
- `docs/research/` — existing research documents
- `docs/plans/` — in-progress plans to avoid conflicts

### 1f. SAP-specific research (when needed)

If the feature involves SAP-specific concepts (ADT APIs, authorization objects, BTP services, ABAP language features), use available MCP tools:
- `sap-docs` MCP tools — search SAP documentation, discovery center, community
- `sap-notes` MCP tools — search SAP Notes for known issues, corrections, recommendations
- Only use these when the feature genuinely requires SAP domain knowledge (new ADT endpoints, auth objects, BTP service configuration, etc.)

### 1g. Summarize findings

Before writing the plan, organize your findings:
- **Affected files** (source + test + config + docs)
- **Existing patterns** to follow (with file:line references)
- **Dependencies** between changes
- **Security/safety considerations**
- **Test strategy** (what to test, how to test it)

---

## Phase 2: Write the Plan

Write the plan to `docs/plans/<descriptive-name>.md`. The filename should be kebab-case and describe the feature (e.g., `add-cache-warmup.md`, `authorization-roles-scopes.md`).

### Plan Structure

The plan MUST follow this exact structure for ralphex compatibility:

```markdown
# <Title>

## Overview

<1-3 paragraphs: what this plan does, why, and key design decisions>

## Context

### Current State
<What exists today, what's missing or broken>

### Target State
<What the end result looks like>

### Key Files

| File | Role |
|------|------|
| `src/...` | Description of what this file does |

### Design Principles
<Numbered list of architectural decisions and constraints>

## Development Approach

<Brief notes on testing approach, ordering, conventions>

## Validation Commands

- `npm test`
- `npm run typecheck`
- `npm run lint`

### Task 1: <Descriptive title>

**Files:**
- Modify: `src/path/to/file.ts`
- Modify: `tests/unit/path/to/file.test.ts`

<1-2 sentences of context: what this task does and why>

- [ ] Step 1 description
- [ ] Step 2 description
- [ ] Add unit tests (~N tests): brief list of what to test
- [ ] Run `npm test` — all tests must pass

### Task 2: ...

### Task N: Final verification

- [ ] Run full test suite: `npm test` — all tests pass
- [ ] Run typecheck: `npm run typecheck` — no errors
- [ ] Run lint: `npm run lint` — no errors
- [ ] <Feature-specific verification steps>
- [ ] Move this plan to `docs/plans/completed/`
```

### Critical ralphex Format Rules

These rules are non-negotiable — violating them causes ralphex to malfunction:

1. **Task headers MUST use `### Task N:` format** — ralphex detects tasks by this pattern. `N` can be integer or non-integer (2.5, 2a).

2. **Checkboxes (`- [ ]`) belong ONLY inside Task sections.** Never put checkboxes in Overview, Context, Design Principles, Development Approach, or any section outside `### Task N:`. Checkboxes outside tasks cause extra loop iterations.

3. **Include `## Validation Commands`** — ralphex runs these after each task. List the project's test/lint/typecheck commands.

4. **No checkboxes in Context or Overview** — even if listing requirements or design decisions, use plain bullets (`-`) not checkboxes (`- [ ]`).

5. **Each task must be self-contained** — ralphex executes each task in a fresh Claude Code session with no memory of previous tasks. Include enough context in each task for the agent to understand what to do without reading other tasks.

### Writing Effective Tasks

Each task runs in an isolated Claude Code session. The agent sees only the plan file and can read the codebase, but has NO context from previous task executions. Write tasks accordingly:

**DO:**
- Include file paths and line number references (e.g., "modify `isOperationAllowed()` at line ~95")
- Include the **Files:** block listing which files to modify/create
- Reference existing patterns by file and function name
- Include a "Run `npm test`" checkbox at the end of every task
- Include approximate test counts ("Add unit tests (~8 tests): ...")
- Describe the expected behavior, not just "implement X"
- Include context sentences explaining WHY this task exists

**DON'T:**
- Assume the agent knows what happened in previous tasks
- Use vague instructions ("update the tests accordingly")
- Skip test requirements — every task that changes code MUST include tests
- Create tasks that are too large (>10 checkboxes is a yellow flag, >15 is too many)
- Create tasks that are too small (a single checkbox task should be merged with an adjacent task)

### Task Ordering

Order tasks to minimize cross-task dependencies:
1. **Foundation first** — types, interfaces, core functions
2. **Wiring second** — connecting new code to existing infrastructure
3. **Config/CLI third** — new flags, env vars, profiles
4. **External config fourth** — xs-security.json, manifest.yml, etc.
5. **Documentation fifth** — CLAUDE.md, README, tool descriptions
6. **Final verification last** — always the last task

### Test Requirements

Tests are critical. Every task that modifies code MUST include test checkboxes. Follow these patterns:
- Unit tests: `tests/unit/` mirroring source structure, using vitest
- Mock HTTP: `vi.mock('undici', ...)` with `mockResponse()` helper
- XML fixtures: `tests/fixtures/xml/` for ADT response parsing
- Integration tests: `tests/integration/` when the feature touches SAP system interaction (auto-skipped without credentials)
- The test system described in `INFRASTRUCTURE.md` can be used for smoke testing and creating test fixtures

---

## Phase 3: Review & Refine

Before presenting the plan:

1. **Re-read the plan as if you're an autonomous agent** — would you know exactly what to do for each task? Are file paths specific? Are patterns referenced?

2. **Check for missing dependencies** — does Task 3 assume something from Task 2 that isn't explicitly stated?

3. **Verify the format** — run a mental checklist:
   - `### Task N:` headers? Yes
   - Checkboxes only in Task sections? Yes
   - `## Validation Commands` present? Yes
   - Every code-changing task has test checkboxes? Yes
   - Final verification task exists? Yes

4. **Check total scope** — aim for 5-12 tasks. Fewer than 5 means tasks are too large. More than 12 means the feature should be split into multiple plans.

---

## Output

Save the plan to `docs/plans/<name>.md` and tell the user:
- The plan file path
- How to execute it: `ralphex docs/plans/<name>.md`
- A brief summary of the task breakdown
