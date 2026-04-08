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

| Skill | Description |
|---|---|
| [generate-cds-unit-test](generate-cds-unit-test.md) | Generate ABAP Unit tests for CDS entities using CDS Test Double Framework |
| [explain-abap-code](explain-abap-code.md) | Explain ABAP objects with dependency context and optional ATC analysis |
| [generate-abap-unit-test](generate-abap-unit-test.md) | Generate ABAP Unit tests for classes with dependency analysis and test doubles |
| [migrate-custom-code](migrate-custom-code.md) | ATC-driven S/4HANA custom code migration with fix proposals |
| [generate-rap-service](generate-rap-service.md) | Generate complete RAP OData UI service from natural language description |
| [generate-rap-logic](generate-rap-logic.md) | Generate RAP determination and validation implementations |
