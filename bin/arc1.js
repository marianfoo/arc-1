#!/usr/bin/env node

// ARC-1 — ABAP Relay Connector
// CLI entry point — delegates to compiled TypeScript
//
// Why a thin JS wrapper instead of direct dist/ reference:
// The MCP SDK's stdio transport requires the entry process to own stdin/stdout.
// Using a direct require() (not spawn) ensures no intermediate process layer
// that could interfere with the JSON-RPC stream.
// (Learned from fr0ster/mcp-abap-adt bin/mcp-abap-adt.js)

import('../dist/index.js');
