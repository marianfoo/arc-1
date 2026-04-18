# Skills

ARC-1 ships reusable prompt templates in the repository's [`skills/`](https://github.com/marianfoo/arc-1/tree/main/skills) folder.

This page is the published index for those files. The canonical copies stay in `skills/` so users can copy them directly into Claude, Copilot, Cursor, Codex, or another assistant without scraping the docs site.

See the full source catalog in [`skills/README.md`](https://github.com/marianfoo/arc-1/blob/main/skills/README.md).

## What Skills Are

Skills are task-focused prompt files for common SAP development workflows with ARC-1. They are not server features and do not require code changes in ARC-1 itself. They package good tool usage patterns so the assistant starts from a better workflow.

Typical uses:

- create a RAP service stack from a natural-language description
- implement RAP validations and determinations
- generate ABAP Unit or CDS unit tests
- explain unfamiliar ABAP code with dependency context
- analyze a prior ARC-1 chat session for prompt and tool usage quality

## How To Use Them

Choose the integration style that matches your assistant:

- **Claude Code**: copy a skill file into `~/.claude/commands/` and invoke it as a slash command
- **GitHub Copilot**: add the file as a prompt or instruction file under `.github/`
- **Cursor**: place the file under `.cursor/rules/`
- **OpenAI Codex**: copy the content into a rule file under your Codex rules directory
- **Generic tools**: paste the markdown into project instructions, system prompt, or reusable templates

These skills assume:

- ARC-1 is connected and working
- `mcp-sap-docs` is available when the skill asks for SAP documentation research

## Available Skills

### Creating And Generating

| Skill | What it does | Best for |
|---|---|---|
| [generate-rap-service](https://github.com/marianfoo/arc-1/blob/main/skills/generate-rap-service.md) | Creates a complete RAP service stack from a natural-language description | Fast prototyping and standard CRUD |
| [generate-rap-service-researched](https://github.com/marianfoo/arc-1/blob/main/skills/generate-rap-service-researched.md) | Researches the target system first, then plans and creates the RAP stack | Production-quality work in real packages |
| [generate-rap-logic](https://github.com/marianfoo/arc-1/blob/main/skills/generate-rap-logic.md) | Implements RAP determinations and validations in an existing behavior pool | Filling in business logic after stack creation |
| [generate-cds-unit-test](https://github.com/marianfoo/arc-1/blob/main/skills/generate-cds-unit-test.md) | Generates CDS unit tests using the CDS Test Double Framework | CDS entities with calculations, joins, filters, or aggregations |
| [generate-abap-unit-test](https://github.com/marianfoo/arc-1/blob/main/skills/generate-abap-unit-test.md) | Generates ABAP Unit tests with dependency analysis and test doubles | Classes with meaningful business logic |

### Analyzing And Understanding

| Skill | What it does | Best for |
|---|---|---|
| [explain-abap-code](https://github.com/marianfoo/arc-1/blob/main/skills/explain-abap-code.md) | Reads an ABAP object, pulls dependency context, and explains it in structure | Onboarding, debugging, and code comprehension |
| [migrate-custom-code](https://github.com/marianfoo/arc-1/blob/main/skills/migrate-custom-code.md) | Runs migration-oriented checks and groups findings by priority | S/4HANA migration and ABAP Cloud readiness |

### Meta And Quality

| Skill | What it does | Best for |
|---|---|---|
| [analyze-chat-session](https://github.com/marianfoo/arc-1/blob/main/skills/analyze-chat-session.md) | Reviews a prior ARC-1 conversation and identifies inefficient tool usage or prompt patterns | Improving team workflows and prompt hygiene |

## Recommended Starting Points

- Start with `generate-rap-service` when the goal is speed and the design is straightforward.
- Start with `generate-rap-service-researched` when writing into transportable packages or when team conventions matter.
- Use `explain-abap-code` before editing unfamiliar objects.
- Use the unit-test skills after generating or modifying non-trivial behavior.

## Why The Files Stay In `skills/`

Keeping canonical skill files in `skills/` has two advantages:

- they stay copyable as plain prompt assets for any assistant
- docs can explain and link to them without turning the published site into the source of truth

That split keeps the repo practical for both humans and tooling.
