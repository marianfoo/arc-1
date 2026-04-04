# Skills

Best-practice prompt templates for common SAP development workflows with ARC-1. These skills replicate and extend [SAP Joule for Developers (J4D)](https://community.sap.com/topics/joule) capabilities using ARC-1 + mcp-sap-docs MCP servers.

## What Are Skills?

Skills are self-contained prompt templates that orchestrate MCP tool calls into structured workflows. They work with any AI coding assistant that supports custom instructions or commands.

Each skill maps to a Joule for Developers command (or goes beyond what J4D offers), using ARC-1 for live SAP system interaction and mcp-sap-docs for documentation context.

## How to Use

### Claude Code (CLI / Desktop / Web)

Copy skill files into your commands directory, then invoke as slash commands:

```bash
# Copy a single skill
cp skills/explain-abap-code.md ~/.claude/commands/

# Or copy all skills
cp skills/*.md ~/.claude/commands/
```

```
/explain-abap-code ZCL_SALESORDER
```

Docs: [Claude Code Slash Commands](https://docs.anthropic.com/en/docs/claude-code/slash-commands)

### VS Code -- GitHub Copilot

Add as a reusable prompt file in `.github/copilot-instructions.md` or use the **Copilot Chat prompt files** feature (`.github/prompts/*.prompt.md`). Reference in chat with `#<prompt-name>`.

Docs: [GitHub Copilot Custom Instructions](https://docs.github.com/en/copilot/customizing-copilot/adding-repository-custom-instructions-for-github-copilot)

### VS Code -- Copilot Coding Agent (Copilot Workspace)

Place instructions in `.github/copilot-instructions.md` -- the agent reads them automatically for task context.

### Cursor

Add as a **Rule** in `.cursor/rules/` (one `.md` file per skill). Rules are automatically included in context.

Docs: [Cursor Rules](https://cursor.com/docs/rules)

### OpenAI Codex (CLI)

Copy a `.rules` file under `./codex/rules/` (for example, `~/.codex/rules/default.rules`).

Docs: [Codex Rules](https://developers.openai.com/codex/rules)

### Generic / Other Tools

Copy the skill markdown content into your tool's system prompt, custom instructions, or project context file. The skills are self-contained prompt templates -- they work anywhere you can provide custom instructions.

## Prerequisites

These skills assume you have:

1. **ARC-1 MCP server** connected and configured (SAP system access)
2. **mcp-sap-docs MCP server** connected (optional but recommended -- provides SAP documentation context)

## Available Skills

### Code Understanding

| Skill | J4D Equivalent | Description |
|---|---|---|
| [Explain ABAP Code](explain-abap-code.md) | `/explain` | Explain ABAP code with full dependency context |

### Code Quality

| Skill | J4D Equivalent | Description |
|---|---|---|
| [Fix ABAP Code](fix-abap-code.md) | `/fix` | Detect and fix syntax errors, ATC findings, and lint issues |
| [Refactor ABAP Code](refactor-abap-code.md) | `/refactor` | Refactor ABAP code with safety checks |
| [Prettify ABAP Code](prettify-abap-code.md) | `/prettify` | Format and beautify ABAP source code |

### Code Generation

| Skill | J4D Equivalent | Description |
|---|---|---|
| [Generate ABAP Code](generate-abap-code.md) | `/generate` | Generate ABAP objects from natural-language descriptions |
| [Document ABAP Code](document-abap-code.md) | `/document` | Generate ABAP Doc comments for classes, interfaces, and methods |

### Testing

| Skill | J4D Equivalent | Description |
|---|---|---|
| [Generate ABAP Unit Test](generate-abap-unit-test.md) | `/test` | Generate ABAP Unit tests for classes and methods |
| [Generate CDS Unit Test](generate-cds-unit-test.md) | `/test` (CDS) | Generate CDS Test Double Framework tests for CDS entities |

## Feature Comparison: Skills vs J4D

| Capability | J4D | ARC-1 Skills | Notes |
|---|---|---|---|
| Code explanation | Cloud only | Cloud + On-Premise | Skills add dependency context via SAPContext |
| Unit test generation | Class-level | Class + CDS + Method-level | Skills support method-level surgery for targeted tests |
| Code generation | Cloud only | Cloud + On-Premise | Skills leverage mcp-sap-docs for patterns |
| ABAP Doc generation | Cloud only | Cloud + On-Premise | Skills generate from full dependency context |
| Code fixing | Cloud only | Cloud + On-Premise | Skills chain syntax + ATC + lint in iterative loop |
| Refactoring | Cloud only | Cloud + On-Premise | Skills use method surgery for safe refactoring |
| Code formatting | Cloud only | Cloud + On-Premise | LLM-based formatting with abaplint validation |
| SAP documentation lookup | Built-in | Via mcp-sap-docs | Real-time SAP Help, Community, and API reference |
| Clean Core compliance | N/A | Via mcp-sap-docs | Released API checks via `sap_search_objects` |
| Runtime diagnostics | N/A | Via SAPDiagnose | Short dumps, profiler traces -- beyond J4D |
| SQL exploration | N/A | Via SAPQuery | Ad-hoc ABAP SQL queries -- beyond J4D |
| Transport management | N/A | Via SAPTransport | Create/release transports -- beyond J4D |
