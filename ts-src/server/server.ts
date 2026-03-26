/**
 * MCP Server for ARC-1.
 *
 * Creates and starts the MCP server with 11 intent-based tools.
 * Supports two transports:
 * - stdio (default): for local MCP clients (Claude Desktop, Claude Code, Cursor)
 * - http-streamable: for remote/containerized deployments
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { AdtClient } from '../adt/client.js';
import type { AdtClientConfig } from '../adt/config.js';
import { handleToolCall } from '../handlers/intent.js';
import { getToolDefinitions } from '../handlers/tools.js';
import { initLogger, logger } from './logger.js';
import type { ServerConfig } from './types.js';

/** ARC-1 version */
export const VERSION = '3.0.0-alpha.1';

/**
 * Create the MCP server with registered tool handlers.
 */
export function createServer(config: ServerConfig): Server {
  const server = new Server(
    { name: 'arc-1', version: VERSION },
    { capabilities: { tools: {} } },
  );

  // Create ADT client (may be unconfigured — tools will fail gracefully)
  const adtConfig: Partial<AdtClientConfig> = {
    baseUrl: config.url,
    username: config.username,
    password: config.password,
    client: config.client,
    language: config.language,
    insecure: config.insecure,
    safety: {
      readOnly: config.readOnly,
      blockFreeSQL: config.blockFreeSQL,
      allowedOps: config.allowedOps,
      disallowedOps: config.disallowedOps,
      allowedPackages: config.allowedPackages,
      dryRun: false,
      enableTransports: config.enableTransports,
      transportReadOnly: false,
      allowedTransports: [],
      allowTransportableEdits: config.allowTransportableEdits,
    },
  };

  const client = new AdtClient(adtConfig);

  // Register tool listing
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: getToolDefinitions(config),
  }));

  // Register tool call handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const toolName = request.params.name;
    const args = (request.params.arguments ?? {}) as Record<string, unknown>;
    const result = await handleToolCall(client, config, toolName, args);
    return { ...result } as Record<string, unknown>;
  });

  return server;
}

/**
 * Create and start the MCP server.
 */
export async function createAndStartServer(config: ServerConfig): Promise<Server> {
  initLogger(config.verbose ? 'text' : 'text', config.verbose);

  logger.info('ARC-1 starting', {
    version: VERSION,
    transport: config.transport,
    url: config.url || '(not configured)',
    readOnly: config.readOnly,
  });

  const server = createServer(config);

  if (config.transport === 'stdio') {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    logger.info('ARC-1 MCP server running on stdio');
  } else {
    // HTTP Streamable transport — for containerized/BTP deployments
    // Pass the factory function so HTTP server can create fresh server+transport
    // per request. This is required because MCP SDK's Server can only connect
    // to one transport at a time, and clients like Copilot Studio send
    // concurrent requests.
    const { startHttpServer } = await import('./http.js');
    await startHttpServer(() => createServer(config), config);
  }

  return server;
}
