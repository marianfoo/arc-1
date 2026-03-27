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
import type { BTPConfig, BTPProxyConfig } from '../adt/btp.js';
import { AdtClient } from '../adt/client.js';
import type { AdtClientConfig } from '../adt/config.js';
import { handleToolCall, TOOL_SCOPES } from '../handlers/intent.js';
import { getToolDefinitions } from '../handlers/tools.js';
import { initLogger, logger } from './logger.js';
import type { ServerConfig } from './types.js';

/** ARC-1 version */
export const VERSION = '3.0.0-alpha.1';

/** Build the base ADT client config (without per-user auth) */
function buildAdtConfig(config: ServerConfig, btpProxy?: BTPProxyConfig): Partial<AdtClientConfig> {
  return {
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
}

/**
 * Create a per-user ADT client for principal propagation.
 *
 * Called per MCP request when ppEnabled=true and user JWT is available.
 * Looks up the BTP Destination with X-User-Token header to get per-user
 * auth tokens, then creates an ADT client that sends the
 * SAP-Connectivity-Authentication header with every request.
 *
 * The Cloud Connector uses this header to generate an X.509 cert
 * mapped to the SAP user via CERTRULE.
 */
async function createPerUserClient(
  config: ServerConfig,
  btpConfig: BTPConfig,
  btpProxy: BTPProxyConfig | undefined,
  userJwt: string,
): Promise<AdtClient> {
  const { lookupDestinationWithUserToken } = await import('../adt/btp.js');
  // Use SAP_BTP_PP_DESTINATION if set, otherwise fall back to SAP_BTP_DESTINATION.
  // This enables a dual-destination approach:
  // - SAP_BTP_DESTINATION = BasicAuth destination (shared client, startup resolution)
  // - SAP_BTP_PP_DESTINATION = PrincipalPropagation destination (per-user, runtime)
  const destName = process.env.SAP_BTP_PP_DESTINATION ?? process.env.SAP_BTP_DESTINATION;
  if (!destName) {
    throw new Error('SAP_BTP_PP_DESTINATION or SAP_BTP_DESTINATION is required for principal propagation');
  }

  const { destination, authTokens } = await lookupDestinationWithUserToken(btpConfig, destName, userJwt);

  const adtConfig = buildAdtConfig(config, btpProxy);
  // Override URL from destination (in case it differs from startup-resolved URL)
  adtConfig.baseUrl = destination.URL;
  // Set per-user auth: either SAP-Connectivity-Authentication (PP via Cloud Connector)
  // or Bearer token (OAuth2SAMLBearerAssertion)
  if (authTokens.sapConnectivityAuth) {
    adtConfig.sapConnectivityAuth = authTokens.sapConnectivityAuth;
    // Don't send basic auth when using PP — the user identity comes from the SAML assertion
    adtConfig.username = undefined;
    adtConfig.password = undefined;
  } else if (authTokens.bearerToken) {
    // TODO: Bearer token auth for OAuth2SAMLBearerAssertion destinations
    // This would replace basic auth with Bearer token
    logger.warn('Bearer token auth from destination not yet implemented — falling back to basic auth');
  }

  return new AdtClient(adtConfig);
}

/**
 * Create the MCP server with registered tool handlers.
 * @param config Server configuration
 * @param btpProxy Optional BTP connectivity proxy config (resolved at startup)
 * @param btpConfig Optional BTP service config (for per-user destination lookup)
 */
export function createServer(config: ServerConfig, btpProxy?: BTPProxyConfig, btpConfig?: BTPConfig): Server {
  const server = new Server({ name: 'arc-1', version: VERSION }, { capabilities: { tools: {} } });

  // Create default ADT client (shared, uses startup-time credentials)
  const defaultClient = new AdtClient(buildAdtConfig(config, btpProxy));

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

    // Principal propagation: create per-user ADT client if enabled and user JWT available
    let client = defaultClient;
    if (config.ppEnabled && btpConfig && extra.authInfo?.token) {
      try {
        client = await createPerUserClient(config, btpConfig, btpProxy, extra.authInfo.token);
        logger.debug('Per-user ADT client created', {
          user: extra.authInfo.extra?.userName ?? extra.authInfo.clientId,
        });
      } catch (err) {
        logger.error('Failed to create per-user ADT client — falling back to shared client', {
          error: err instanceof Error ? err.message : String(err),
          user: extra.authInfo.extra?.userName ?? extra.authInfo.clientId,
        });
        // Fall back to shared client (service account)
      }
    }

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
  let btpConfig: BTPConfig | undefined;
  const btpDestination = process.env.SAP_BTP_DESTINATION;
  if (btpDestination) {
    const { resolveBTPDestination, parseVCAPServices } = await import('../adt/btp.js');
    const resolved = await resolveBTPDestination(btpDestination);
    config.url = resolved.url;
    config.username = resolved.username;
    config.password = resolved.password;
    config.client = resolved.client;
    btpProxy = resolved.proxy ?? undefined;

    // Keep btpConfig for per-user destination lookup (principal propagation)
    if (config.ppEnabled) {
      btpConfig = parseVCAPServices() ?? undefined;
      logger.info('Principal propagation enabled', {
        destination: btpDestination,
        hasBtpConfig: !!btpConfig,
      });
    }

    logger.info('BTP destination resolved', {
      destination: btpDestination,
      url: resolved.url,
      user: resolved.username,
      hasProxy: !!btpProxy,
      ppEnabled: config.ppEnabled,
    });
  }

  const server = createServer(config, btpProxy, btpConfig);

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
    await startHttpServer(() => createServer(config, btpProxy, btpConfig), config, xsuaaCredentials);
  }

  return server;
}
