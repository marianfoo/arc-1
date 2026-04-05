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
import { FileSink } from './sinks/file.js';
import type { ServerConfig } from './types.js';

/** ARC-1 version */
export const VERSION = '0.3.0'; // x-release-please-version

/** Build the base ADT client config (without per-user auth) */
function buildAdtConfig(
  config: ServerConfig,
  btpProxy?: BTPProxyConfig,
  bearerTokenProvider?: () => Promise<string>,
): Partial<AdtClientConfig> {
  return {
    baseUrl: config.url,
    username: config.username,
    password: config.password,
    client: config.client,
    language: config.language,
    insecure: config.insecure,
    btpProxy,
    bearerTokenProvider,
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
  // Set per-user auth for principal propagation.
  // Option 1 (Recommended): jwt-bearer exchanged token → Proxy-Authorization
  // Option 2 (Backward compat): SAML assertion → SAP-Connectivity-Authentication
  // Preserve the username for display only (e.g. SAPRead SYSTEM) by extracting it from the JWT.
  // Safety: the JWT signature was already verified by the OIDC middleware in http.ts —
  // we're just reading a claim from an already-trusted token. This value is never used
  // for auth or access control; the actual SAP identity comes from the SAML assertion.
  let displayUsername: string | undefined;
  try {
    const payload = JSON.parse(Buffer.from(userJwt.split('.')[1], 'base64url').toString());
    displayUsername = payload.user_name ?? payload.email ?? undefined;
  } catch {
    displayUsername = undefined;
  }

  if (authTokens.ppProxyAuth) {
    // Option 1: exchanged token replaces Proxy-Authorization
    adtConfig.ppProxyAuth = authTokens.ppProxyAuth;
    adtConfig.username = displayUsername;
    adtConfig.password = undefined;
  } else if (authTokens.sapConnectivityAuth) {
    // Option 2: SAML assertion from Destination Service
    adtConfig.sapConnectivityAuth = authTokens.sapConnectivityAuth;
    adtConfig.username = displayUsername;
    adtConfig.password = undefined;
  } else if (authTokens.bearerToken) {
    // TODO: Bearer token auth for OAuth2SAMLBearerAssertion destinations
    // This would replace basic auth with Bearer token
    logger.warn('Bearer token auth from destination not yet implemented — falling back to basic auth');
  } else {
    // No per-user auth token received.
    throw new Error(
      `Principal propagation failed for destination '${destName}': ` +
        'no SAP-Connectivity-Authentication header, Bearer token, or jwt-bearer exchange token returned. ' +
        'Check Cloud Connector status, destination configuration, and user JWT validity.',
    );
  }

  return new AdtClient(adtConfig);
}

/**
 * Create the MCP server with registered tool handlers.
 * @param config Server configuration
 * @param btpProxy Optional BTP connectivity proxy config (resolved at startup)
 * @param btpConfig Optional BTP service config (for per-user destination lookup)
 * @param bearerTokenProvider Optional OAuth bearer token provider (BTP ABAP Environment)
 */
export function createServer(
  config: ServerConfig,
  btpProxy?: BTPProxyConfig,
  btpConfig?: BTPConfig,
  bearerTokenProvider?: () => Promise<string>,
): Server {
  const server = new Server({ name: 'arc-1', version: VERSION }, { capabilities: { tools: {} } });

  // Create default ADT client (shared, uses startup-time credentials or OAuth bearer)
  const defaultClient = new AdtClient(buildAdtConfig(config, btpProxy, bearerTokenProvider));

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

    // Principal propagation: create per-user ADT client if enabled and user JWT available.
    // Only attempt PP when the token is a JWT (3 dot-separated parts), not a plain API key.
    let client = defaultClient;
    const token = extra.authInfo?.token;
    const isJwt = token && token.split('.').length === 3;
    if (config.ppEnabled && btpConfig && isJwt) {
      const ppUser = (extra.authInfo?.extra?.userName ?? extra.authInfo?.clientId) as string | undefined;
      const ppDest = process.env.SAP_BTP_PP_DESTINATION ?? process.env.SAP_BTP_DESTINATION ?? '';
      try {
        client = await createPerUserClient(config, btpConfig, btpProxy, token);
        logger.emitAudit({
          timestamp: new Date().toISOString(),
          level: 'info',
          event: 'auth_pp_created',
          user: ppUser,
          destination: ppDest,
          success: true,
        });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        logger.emitAudit({
          timestamp: new Date().toISOString(),
          level: 'error',
          event: 'auth_pp_created',
          user: ppUser,
          destination: ppDest,
          success: false,
          errorMessage: errMsg,
        });
        if (config.ppStrict) {
          // Strict mode: PP failure is a hard error — never fall back to shared client.
          // This ensures every request runs with the authenticated user's identity.
          return {
            content: [
              {
                type: 'text' as const,
                text: `Principal propagation failed (SAP_PP_STRICT=true): ${errMsg}`,
              },
            ],
            isError: true,
          } as Record<string, unknown>;
        }
        // Fall back to shared client (service account)
      }
    } else if (config.ppStrict && config.ppEnabled && !isJwt) {
      // Strict mode with non-JWT token (e.g., API key) — reject
      return {
        content: [
          {
            type: 'text' as const,
            text: 'Principal propagation requires a JWT token (SAP_PP_STRICT=true). API key authentication is not supported in strict PP mode.',
          },
        ],
        isError: true,
      } as Record<string, unknown>;
    }

    const result = await handleToolCall(client, config, toolName, args, extra.authInfo, server);
    return { ...result } as Record<string, unknown>;
  });

  return server;
}

/**
 * Create and start the MCP server.
 */
export async function createAndStartServer(config: ServerConfig): Promise<Server> {
  initLogger(config.logFormat, config.verbose);

  // Add file sink if configured
  if (config.logFile) {
    logger.addSink(new FileSink(config.logFile));
    logger.info('File logging enabled', { logFile: config.logFile });
  }

  // Add BTP Audit Log sink if auditlog service is bound (auto-detected from VCAP_SERVICES)
  try {
    const { BTPAuditLogSink, parseBTPAuditLogConfig } = await import('./sinks/btp-auditlog.js');
    const auditLogConfig = parseBTPAuditLogConfig();
    if (auditLogConfig) {
      logger.addSink(new BTPAuditLogSink(auditLogConfig));
      logger.info('BTP Audit Log sink enabled', { url: auditLogConfig.url });
    }
  } catch (err) {
    logger.warn('BTP Audit Log sink initialization failed (optional)', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // Emit structured server_start audit event
  logger.emitAudit({
    timestamp: new Date().toISOString(),
    level: 'info',
    event: 'server_start',
    version: VERSION,
    transport: config.transport,
    readOnly: config.readOnly,
    url: config.url || '(not configured)',
    pid: process.pid,
  });

  logger.info('ARC-1 starting', {
    version: VERSION,
    transport: config.transport,
    url: config.url || '(not configured)',
    readOnly: config.readOnly,
  });

  // Resolve BTP ABAP Environment direct connection (service key + OAuth)
  let bearerTokenProvider: (() => Promise<string>) | undefined;
  if (config.btpServiceKey || config.btpServiceKeyFile) {
    const { resolveServiceKey, createBearerTokenProvider } = await import('../adt/oauth.js');

    // Temporarily set env vars so resolveServiceKey picks them up
    if (config.btpServiceKey) process.env.SAP_BTP_SERVICE_KEY = config.btpServiceKey;
    if (config.btpServiceKeyFile) process.env.SAP_BTP_SERVICE_KEY_FILE = config.btpServiceKeyFile;

    const serviceKey = resolveServiceKey();
    if (!serviceKey) {
      throw new Error(
        'BTP service key configured but could not be resolved — check SAP_BTP_SERVICE_KEY or SAP_BTP_SERVICE_KEY_FILE',
      );
    }

    // Override URL from service key (abap.url takes precedence over url)
    config.url = serviceKey.abap?.url ?? serviceKey.url;
    // Override client from service key if available
    if (serviceKey.abap?.sapClient) {
      config.client = serviceKey.abap.sapClient;
    }

    bearerTokenProvider = createBearerTokenProvider(serviceKey, config.btpOAuthCallbackPort);

    logger.info('BTP ABAP Environment configured (service key)', {
      url: config.url,
      uaaUrl: serviceKey.uaa.url,
      callbackPort: config.btpOAuthCallbackPort || 'auto',
    });
  }

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

  const server = createServer(config, btpProxy, btpConfig, bearerTokenProvider);

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
    await startHttpServer(
      () => createServer(config, btpProxy, btpConfig, bearerTokenProvider),
      config,
      xsuaaCredentials,
    );
  }

  return server;
}
