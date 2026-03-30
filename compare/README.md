# ARC-1 Competitive Landscape

This folder contains detailed analysis documents for each SAP ADT / MCP project in the ecosystem. These documents serve as a living reference to:

1. **Track feature parity** -- understand what ARC-1 has vs. what competitors offer
2. **Identify adoption opportunities** -- bug fixes and patterns from other projects that can benefit ARC-1
3. **Evaluate placement** -- determine if a feature belongs in ARC-1 (developer tools) or [mcp-sap-docs](https://github.com/marianfoo/mcp-sap-docs) (documentation/search)

## Projects Analyzed

| # | Project | Type | Language | Status |
|---|---------|------|----------|--------|
| 1 | [oisee/vibing-steampunk](01-vibing-steampunk.md) | ADT MCP Server (upstream) | Go | Active |
| 2 | [mario-andreschak/mcp-abap-abap-adt-api](02-mcp-abap-abap-adt-api.md) | ADT MCP Server (abap-adt-api wrapper) | TypeScript | Dormant |
| 3 | [mario-andreschak/mcp-abap-adt](03-mcp-abap-adt.md) | ADT MCP Server (read-only) | TypeScript | Dormant |
| 4 | [AWS ABAP Accelerator](04-aws-abap-accelerator.md) | ADT MCP Server (Amazon Q) | Python | Active |
| 5 | [fr0ster/mcp-abap-adt](05-fr0ster-mcp-abap-adt.md) | ADT MCP Server (monorepo) | TypeScript | Very Active |
| 6 | [lemaiwo/btp-sap-odata-to-mcp-server](06-btp-odata-mcp.md) | OData-to-MCP Bridge | TypeScript | Moderate |
| 7 | [DassianInc/dassian-adt](07-dassian-adt.md) | ADT MCP Server (abap-adt-api fork) | TypeScript | New/Active |

## How to Update

Run the `/compare-projects` skill from Claude Code to trigger a fresh evaluation across all projects. This will:
- Check each project's recent commits and releases
- Identify new features or bug fixes relevant to ARC-1
- Update the `## Changelog & Relevance Tracker` section in each document
- Flag items requiring action

## Feature Placement Guide

| If the feature is about... | It belongs in... |
|----------------------------|-----------------|
| ABAP source code read/write/activate | ARC-1 |
| ADT API operations (transport, debug, lint) | ARC-1 |
| SAP documentation search | mcp-sap-docs |
| SAP community content | mcp-sap-docs |
| OData service discovery/execution | Separate project (not ADT) |
| BTP deployment/auth patterns | ARC-1 (server-side) |
