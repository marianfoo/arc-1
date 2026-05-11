# ARC-1 Skills

Best-practice agent skills for common SAP development workflows with ARC-1.

Each skill is a directory containing a `SKILL.md` file with YAML frontmatter — the format used by [Anthropic Agent Skills](https://code.claude.com/docs/en/skills) and consumed by the [`vercel-labs/skills`](https://github.com/vercel-labs/skills) CLI. Agents discover them by `description` and load them on demand.

## Install via the `skills` CLI (recommended)

The fastest way is `npx skills` — it auto-detects the agents installed in your project (Claude Code, Cursor, GitHub Copilot, OpenCode, Gemini CLI, Codex, …) and installs into the right paths.

```bash
# Install all ARC-1 skills into the current project
npx skills add marianfoo/arc-1

# Install globally (available in every project)
npx skills add marianfoo/arc-1 -g

# Install just one skill
npx skills add marianfoo/arc-1 -s generate-rap-service

# Pin to a release tag
npx skills add marianfoo/arc-1#v1.0.0
```

See the [`skills` CLI docs](https://github.com/vercel-labs/skills#readme) for `update`, `remove`, project-pinned lockfiles, and the full agent compatibility matrix.

## Manual install (without the CLI)

Copy the whole `skills/<skill-name>/` directory into your tool's skills directory. The agent reads `SKILL.md` and discovers the skill via its frontmatter `description`.

| Tool | Project install | Global install |
|---|---|---|
| Claude Code | `.claude/skills/<name>/` | `~/.claude/skills/<name>/` |
| Cursor | `.agents/skills/<name>/` | `~/.cursor/skills/<name>/` |
| GitHub Copilot (VS Code) | `.agents/skills/<name>/` | `~/.copilot/skills/<name>/` |
| OpenAI Codex (CLI) | `.agents/skills/<name>/` | `~/.codex/skills/<name>/` |
| Gemini CLI | `.agents/skills/<name>/` | `~/.gemini/skills/<name>/` |
| OpenCode | `.agents/skills/<name>/` | `~/.config/opencode/skills/<name>/` |

Example for Claude Code (project scope):

```bash
git clone https://github.com/marianfoo/arc-1.git /tmp/arc-1
mkdir -p .claude/skills
cp -r /tmp/arc-1/skills/generate-rap-service .claude/skills/
```

For tools not listed above, copy the body of `SKILL.md` into your tool's system prompt, custom instructions, or project context file. The skills are self-contained — they work anywhere you can provide custom instructions.

## Prerequisites

These skills assume you have:
1. **ARC-1 MCP server** connected and configured (SAP system access)
2. **mcp-sap-docs MCP server** connected (optional but recommended — provides SAP documentation context)

## Available Skills

### Creating & Generating

| Skill | What it does | When to use |
|---|---|---|
| [generate-rap-service](generate-rap-service/SKILL.md) | Creates a complete RAP OData service stack (table, CDS views, BDEF, SRVD, SRVB, class) from a natural language description, with provider-contract-aware service generation | Quick prototyping, simple CRUD, standard UI service generation |
| [generate-rap-service-researched](generate-rap-service-researched/SKILL.md) | Same output as above, but researches the target system first (existing naming conventions, architecture patterns, revisions, docs, formatter settings, impact) and builds an approved plan before creating anything | Production-quality services in transportable packages, complex domains, "measure twice, cut once" mode |
| [generate-rap-logic](generate-rap-logic/SKILL.md) | Implements determination and validation methods in an existing RAP behavior pool using structured class reads, version-aware edits, and quickfix-aware validation | After creating a RAP service — fills in the empty method stubs with ABAP Cloud logic |
| [generate-cds-unit-test](generate-cds-unit-test/SKILL.md) | Generates ABAP Unit tests for CDS entities using the CDS Test Double Framework | When a CDS view has calculations, CASE expressions, WHERE filters, JOINs, or aggregations worth testing |
| [generate-abap-unit-test](generate-abap-unit-test/SKILL.md) | Generates ABAP Unit tests for classes with dependency analysis and test doubles | When a class has non-trivial business logic and uses dependency injection |

#### generate-rap-service vs generate-rap-service-researched

Both skills produce the same RAP artifact stack. The difference is how they get there:

| | generate-rap-service | generate-rap-service-researched |
|---|---|---|
| **Approach** | "Vibe code" — starts creating immediately | "Measure twice, cut once" — researches first |
| **Research** | None — uses SAP standard defaults | Deep — reads existing RAP projects, naming conventions, ATC config |
| **Questions** | Minimal — just the business object description | Targeted — asks only what research couldn't answer |
| **Plan approval** | Shows artifact table, asks to proceed | Full implementation plan with architecture decisions, requires explicit approval |
| **Best for** | Quick prototyping, proof of concept, simple CRUD | Production services, complex domains, teams with established conventions |
| **Guardrails** | Managed only, UUID, single entity, standard CRUD | Any scenario — managed/unmanaged, compositions, custom keys |

### Recent ARC-1 Features These Skills Use

- `SAPContext(action="impact")` for RAP/CDS reuse and "what breaks if I change this?" analysis
- `SAPRead(type="VERSIONS")` and `SAPRead(type="VERSION_SOURCE")` for pattern mining and safer edits of existing RAP stacks
- `SAPTransport(action="history")` for object-to-transport traceability during later iterations
- `SAPLint(action="format" | "get_formatter_settings")` for SAP-native keyword case and indentation
- `SAPRead` / `SAPWrite` for `SKTD` so generated RAP services can carry attached Markdown documentation
- `SAPGit` when a package is already part of an abapGit or gCTS-backed delivery flow

### Analyzing & Understanding

| Skill | What it does | When to use |
|---|---|---|
| [explain-abap-code](explain-abap-code/SKILL.md) | Reads an ABAP object, fetches all dependencies via SAPContext, and produces a structured explanation | Onboarding to unfamiliar code, investigating bugs, documenting undocumented objects |
| [migrate-custom-code](migrate-custom-code/SKILL.md) | Runs ATC readiness checks, groups findings by priority, and generates replacement code | Preparing custom code for S/4HANA migration or ABAP Cloud readiness |
| [sap-object-documenter](sap-object-documenter/SKILL.md) | Batch-documents many custom objects at once — purpose, style (Classic/Modern/Mixed), dependencies — as Markdown | Onboarding packages, handoffs, seeding a repo wiki (vs. explain-abap-code which is single-object interactive) |

### Clean Core & Custom Code Retirement

| Skill | What it does | When to use |
|---|---|---|
| [sap-clean-core-atc](sap-clean-core-atc/SKILL.md) | Audits a package of custom code and buckets every Z/Y object into Clean Core Levels A–D using mcp-sap-docs + ATC | Planning an ECC→S/4HANA Cloud or BTP move; quarterly custom-code health check |
| [sap-unused-code](sap-unused-code/SKILL.md) | Finds Z/Y objects never called at runtime using SCMON or SUSG, then cross-references static where-used | Scoping a custom-code retirement project; pre-migration dead-code cleanup (requires `SAP_ALLOW_FREE_SQL=true` + `S_TABU_NAM` on `SCMON_*`/`SUSG_*`) |

### System Context & Local Workflow

| Skill | What it does | When to use |
|---|---|---|
| [bootstrap-system-context](bootstrap-system-context/SKILL.md) | Probes SID, release, installed components, feature flags, and lint preset; writes a local `system-info.md` | First step of a session against an unfamiliar system — grounds the assistant in real constraints before any code work |
| [setup-abap-mirror](setup-abap-mirror/SKILL.md) | Creates a local abapGit-style mirror of a package or object list for IDE context and `git diff` | Onboarding a codebase, pre-migration snapshotting, feeding local context to tools that can't call MCP per-read |

### Meta / Quality

| Skill | What it does | When to use |
|---|---|---|
| [analyze-chat-session](analyze-chat-session/SKILL.md) | Analyzes the current conversation's tool calls and produces a feedback report | After a complex session — identifies inefficiencies, anti-patterns, and improvement suggestions |
| [arc1-cursor-regression](../.claude/skills/arc1-cursor-regression/SKILL.md) | Generates a tailored Cursor MCP config and regression prompt set for ARC-1, derived from PR diff or chat findings | Verifying a specific ARC-1 PR/fix/feature against the live MCP surface |

### Typical Workflow

Skills are designed to chain together. A typical RAP development flow:

```
1. bootstrap-system-context         →  Capture SID, release, features, lint preset
2. generate-rap-service-researched  →  Create the service stack (uses system-info.md)
3. generate-rap-logic               →  Add business logic (validations, determinations)
4. generate-abap-unit-test          →  Generate tests for the behavior pool
5. generate-cds-unit-test           →  Generate tests for the CDS views
6. optional: attach SKTD docs / inspect revisions / inspect transport history
7. analyze-chat-session             →  Review what worked, file improvements
```

For codebase onboarding or pre-migration work:

```
1. bootstrap-system-context  →  Know the system
2. setup-abap-mirror         →  Pull the target package(s) into abapGit-style files
3. explain-abap-code         →  Understand key objects with dependency context
4. migrate-custom-code       →  Run ATC readiness checks and group findings
```

For clean-core / custom-code retirement planning:

```
1. bootstrap-system-context  →  Know the system
2. sap-unused-code           →  Scope the retirement (what even runs?)
3. sap-clean-core-atc        →  Classify the USED code into Levels A–D
4. sap-object-documenter     →  Document the keepers before rewriting
5. migrate-custom-code       →  Fix the Level B/C/D findings one at a time
```
