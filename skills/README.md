# ARC-1 Skills

Best-practice prompt templates for common SAP development workflows with ARC-1.

## Usage

These skills are prompt templates that work with any AI coding assistant that supports custom instructions or commands. Pick your tool below.

### Claude Code (CLI / Desktop / Web)

Copy skill files into your commands directory, then invoke as slash commands:

```bash
cp skills/generate-cds-unit-test.md ~/.claude/commands/
```
```
/generate-cds-unit-test ZI_SALESORDER
```

Docs: https://docs.anthropic.com/en/docs/claude-code/slash-commands

### VS Code — GitHub Copilot

Add as a reusable prompt file in `.github/copilot-instructions.md` or use the **Copilot Chat prompt files** feature (`.github/prompts/*.prompt.md`). Reference in chat with `#<prompt-name>`.

Docs: https://docs.github.com/en/copilot/customizing-copilot/adding-repository-custom-instructions-for-github-copilot

### VS Code — Copilot Coding Agent (Copilot Workspace)

Place instructions in `.github/copilot-instructions.md` — the agent reads them automatically for task context.

Docs: https://docs.github.com/en/copilot/customizing-copilot/adding-repository-custom-instructions-for-github-copilot

### Cursor

Add as a **Rule** in `.cursor/rules/` (one `.md` file per skill). Rules are automatically included in context.

Docs: https://cursor.com/docs/rules

### OpenAI Codex (CLI)

Copy a .rules file under ./codex/rules/ (for example, ~/.codex/rules/default.rules)

Docs: https://developers.openai.com/codex/rules

### Generic / Other Tools

Copy the skill markdown content into your tool's system prompt, custom instructions, or project context file. The skills are self-contained prompt templates — they work anywhere you can provide custom instructions.

## Prerequisites

These skills assume you have:
1. **ARC-1 MCP server** connected and configured (SAP system access)
2. **mcp-sap-docs MCP server** connected (optional but recommended — provides SAP documentation context)

## Available Skills

### Creating & Generating

| Skill | What it does | When to use |
|---|---|---|
| [generate-rap-service](generate-rap-service.md) | Creates a complete RAP OData service stack (table, CDS views, BDEF, SRVD, SRVB, class) from a natural language description | Quick prototyping, simple CRUD with standard patterns, user knows exactly what they want |
| [generate-rap-service-researched](generate-rap-service-researched.md) | Same output as above, but researches the target system first (existing naming conventions, architecture patterns, SAP docs) and builds an approved plan before creating anything | Production-quality services in transportable packages, complex domains, "measure twice, cut once" mode |
| [generate-rap-logic](generate-rap-logic.md) | Implements determination and validation methods in an existing RAP behavior pool | After creating a RAP service — fills in the empty method stubs with ABAP Cloud logic |
| [generate-cds-unit-test](generate-cds-unit-test.md) | Generates ABAP Unit tests for CDS entities using the CDS Test Double Framework | When a CDS view has calculations, CASE expressions, WHERE filters, JOINs, or aggregations worth testing |
| [generate-abap-unit-test](generate-abap-unit-test.md) | Generates ABAP Unit tests for classes with dependency analysis and test doubles | When a class has non-trivial business logic and uses dependency injection |

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

### Analyzing & Understanding

| Skill | What it does | When to use |
|---|---|---|
| [explain-abap-code](explain-abap-code.md) | Reads an ABAP object, fetches all dependencies via SAPContext, and produces a structured explanation | Onboarding to unfamiliar code, investigating bugs, documenting undocumented objects |
| [migrate-custom-code](migrate-custom-code.md) | Runs ATC readiness checks, groups findings by priority, and generates replacement code | Preparing custom code for S/4HANA migration or ABAP Cloud readiness |

### Meta / Quality

| Skill | What it does | When to use |
|---|---|---|
| [analyze-chat-session](analyze-chat-session.md) | Analyzes the current conversation's tool calls and produces a feedback report | After a complex session — identifies inefficiencies, anti-patterns, and improvement suggestions |

### Typical Workflow

Skills are designed to chain together. A typical RAP development flow:

```
1. generate-rap-service-researched  →  Create the service stack
2. generate-rap-logic               →  Add business logic (validations, determinations)
3. generate-abap-unit-test          →  Generate tests for the behavior pool
4. generate-cds-unit-test           →  Generate tests for the CDS views
5. analyze-chat-session             →  Review what worked, file improvements
```
