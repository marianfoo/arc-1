/**
 * ARC-1 — ABAP Relay Connector
 *
 * MCP (Model Context Protocol) server for SAP ABAP systems.
 * Provides 11 intent-based tools for AI agents to interact with SAP ADT.
 *
 * Entry point: starts the MCP server on stdio (default) or HTTP Streamable transport.
 */

import { config } from 'dotenv';
import { resolveConfig } from './server/config.js';
import { createAndStartServer } from './server/server.js';

// Load .env file (if present) before anything else
config();

const { config: serverConfig, sources } = resolveConfig(process.argv.slice(2));
await createAndStartServer(serverConfig, sources);
