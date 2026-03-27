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
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import type { BTPProxyConfig } from '../adt/btp.js';
import { AdtClient } from '../adt/client.js';
import type { AdtClientConfig } from '../adt/config.js';
import { handleToolCall, TOOL_SCOPES } from '../handlers/intent.js';
import { getToolDefinitions } from '../handlers/tools.js';
import { initLogger, logger } from './logger.js';
import type { ServerConfig } from './types.js';

/** ARC-1 version */
export const VERSION = '3.0.0-alpha.1';

/**
 * Create the MCP server with registered tool handlers.
 * @param config Server configuration
 * @param btpProxy Optional BTP connectivity proxy config (resolved at startup)
 */
export function createServer(config: ServerConfig, btpProxy?: BTPProxyConfig): Server {
  const server = new Server({ name: 'arc-1', version: VERSION }, { capabilities: { tools: {} } });

  // Create ADT client (may be unconfigured — tools will fail gracefully)
  const adtConfig: Partial<AdtClientConfig> = {
    baseUrl: config.url,
    username: config.username,
    password: config.password,
    client: config.client,
    language: config.language,
    insecure: config.insecure,
    btpProxy,
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

  // Register tool listing — filtered by user's scopes when auth is active
  server.setRequestHandler(ListToolsRequestSchema, async (_request, extra) => {
    let tools = getToolDefinitions(config);

    // When authenticated, only show tools the user has scopes for
    if (extra.authInfo) {
      tools = tools.filter((tool) => {
        const requiredScope = TOOL_SCOPES[tool.name];
        return !requiredScope || extra.authInfo!.scopes.includes(requiredScope);
      });
    }

    return { tools };
  });

  // Register tool call handler — passes authInfo for scope enforcement + audit logging
  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    const toolName = request.params.name;
    const args = (request.params.arguments ?? {}) as Record<string, unknown>;
    const result = await handleToolCall(client, config, toolName, args, extra.authInfo);
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

  // Resolve BTP Destination if configured (overrides SAP_URL/USER/PASSWORD)
  let btpProxy: BTPProxyConfig | undefined;
  const btpDestination = process.env.SAP_BTP_DESTINATION;
  if (btpDestination) {
    const { resolveBTPDestination } = await import('../adt/btp.js');
    const resolved = await resolveBTPDestination(btpDestination);
    config.url = resolved.url;
    config.username = resolved.username;
    config.password = resolved.password;
    config.client = resolved.client;
    btpProxy = resolved.proxy ?? undefined;
    logger.info('BTP destination resolved', {
      destination: btpDestination,
      url: resolved.url,
      user: resolved.username,
      hasProxy: !!btpProxy,
    });
  }

  const server = createServer(config, btpProxy);

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
    // Load XSUAA credentials if XSUAA auth is enabled
    let xsuaaCredentials: import('./xsuaa.js').XsuaaCredentials | undefined;
    if (config.xsuaaAuth) {
      try {
        const xsenv = await import('@sap/xsenv');
        const services = xsenv.getServices({ uaa: { tag: 'xsuaa' } });
        const uaa = services.uaa as Record<string, string>;
        xsuaaCredentials = {
          url: uaa.url,
          clientid: uaa.clientid,
          clientsecret: uaa.clientsecret,
          xsappname: uaa.xsappname,
          uaadomain: uaa.uaadomain,
        };
        logger.info('XSUAA credentials loaded', {
          xsappname: xsuaaCredentials.xsappname,
          url: xsuaaCredentials.url,
        });
      } catch (err) {
        logger.error('Failed to load XSUAA credentials — XSUAA auth will not work', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const { startHttpServer } = await import('./http.js');
    await startHttpServer(() => createServer(config, btpProxy), config, xsuaaCredentials);
  }

  return server;
}
