#!/usr/bin/env node

// ARC-1 CLI — direct tool invocation entry point
// Delegates to compiled TypeScript (dist/cli.js).
//
// This bin is separate from `arc1` because the MCP server entry (`bin/arc1.js` → dist/index.js)
// must own stdin/stdout cleanly for the JSON-RPC stream. `arc1-cli` is for command-line use
// (read, activate, syntax, call, extract-cookies, …) and exits after a single invocation.

import('../dist/cli.js');
