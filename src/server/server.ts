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
import { deriveUserSafety } from '../adt/safety.js';
import type { Cache } from '../cache/cache.js';
import { CachingLayer } from '../cache/caching-layer.js';
import { MemoryCache } from '../cache/memory.js';
import {
  getCachedFeatures,
  handleToolCall,
  hasRequiredScope,
  setCachedFeatures,
  TOOL_SCOPES,
} from '../handlers/intent.js';
import { getToolDefinitions } from '../handlers/tools.js';
import { initLogger, logger } from './logger.js';
import { FileSink } from './sinks/file.js';
import type { ServerConfig } from './types.js';

/** ARC-1 version */
export const VERSION = '0.6.4'; // x-release-please-version

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
      blockData: config.blockData,
      allowedOps: config.allowedOps,
      disallowedOps: config.disallowedOps,
      allowedPackages: config.allowedPackages,
      dryRun: false,
      enableTransports: config.enableTransports,
      transportReadOnly: false,
      allowedTransports: [],
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

  // Build an effective proxy that uses the PP destination's Location ID, not the
  // startup destination's. In dual-destination setups, SAP_BTP_DESTINATION and
  // SAP_BTP_PP_DESTINATION may point to different Cloud Connectors (different
  // Location IDs). If we blindly reuse the startup proxy, PP requests route to
  // the wrong SCC instance — causing 401/403/404 errors that are hard to debug.
  const effectiveProxy =
    btpProxy && destination.CloudConnectorLocationId !== undefined
      ? { ...btpProxy, locationId: destination.CloudConnectorLocationId }
      : btpProxy;

  const adtConfig = buildAdtConfig(config, effectiveProxy);
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
 * Run a one-time feature probe against the SAP system using the shared/default client.
 * Returns a promise that resolves once probe results are stored in cachedFeatures.
 * In PP mode (when btpConfig is available for per-user client creation), auth failures
 * (401/403) on textSearch are treated as "unknown" so the tool schema doesn't hide
 * source_code from users who might have authorization.  Without btpConfig, PP cannot
 * create per-user clients, so shared-client auth failures are definitive.
 */
export function runStartupProbe(
  config: ServerConfig,
  btpProxy?: BTPProxyConfig,
  bearerTokenProvider?: () => Promise<string>,
  btpConfig?: BTPConfig,
): Promise<void> {
  const client = new AdtClient(buildAdtConfig(config, btpProxy, bearerTokenProvider));
  return (async () => {
    try {
      const { defaultFeatureConfig } = await import('../adt/config.js');
      const { probeFeatures } = await import('../adt/features.js');
      const fc = defaultFeatureConfig();
      fc.hana = config.featureHana as 'auto' | 'on' | 'off';
      fc.abapGit = config.featureAbapGit as 'auto' | 'on' | 'off';
      fc.rap = config.featureRap as 'auto' | 'on' | 'off';
      fc.amdp = config.featureAmdp as 'auto' | 'on' | 'off';
      fc.ui5 = config.featureUi5 as 'auto' | 'on' | 'off';
      fc.transport = config.featureTransport as 'auto' | 'on' | 'off';
      fc.ui5repo = config.featureUi5Repo as 'auto' | 'on' | 'off';
      fc.flp = config.featureFlp as 'auto' | 'on' | 'off';
      const features = await probeFeatures(client.http, fc, config.systemType);
      if (config.ppEnabled && btpConfig && features.textSearch && !features.textSearch.available) {
        const reason = features.textSearch.reason ?? '';
        if (reason.includes('authorization') || reason.includes('401') || reason.includes('403')) {
          features.textSearch = undefined;
        }
      }
      // Log authorization probe results
      if (features.authProbe) {
        const ap = features.authProbe;
        if (ap.searchAccess) {
          logger.info('Authorization probe: object search access is available');
        } else {
          logger.warn(`Authorization probe: object search access denied — ${ap.searchReason ?? 'unknown reason'}`);
        }
        if (ap.transportAccess) {
          logger.info('Authorization probe: transport access is available');
        } else {
          logger.info(
            `Authorization probe: transport access is not available — ${ap.transportReason ?? 'unknown reason'}`,
          );
        }
      }
      setCachedFeatures(features);
    } catch {
      // Probe failed (e.g., SAP system unreachable) — continue with default tool set
    }
  })();
}

/**
 * Create the MCP server with registered tool handlers.
 * @param config Server configuration
 * @param btpProxy Optional BTP connectivity proxy config (resolved at startup)
 * @param btpConfig Optional BTP service config (for per-user destination lookup)
 * @param bearerTokenProvider Optional OAuth bearer token provider (BTP ABAP Environment)
 * @param cachingLayer Optional object cache layer
 * @param startupProbePromise Promise from runStartupProbe() — ListTools waits on this
 */
export function createServer(
  config: ServerConfig,
  btpProxy?: BTPProxyConfig,
  btpConfig?: BTPConfig,
  bearerTokenProvider?: () => Promise<string>,
  cachingLayer?: CachingLayer,
  startupProbePromise?: Promise<void>,
): Server {
  const server = new Server({ name: 'arc-1', version: VERSION }, { capabilities: { tools: {} } });

  // Create default ADT client (shared, uses startup-time credentials or OAuth bearer)
  const defaultClient = new AdtClient(buildAdtConfig(config, btpProxy, bearerTokenProvider));

  // Register tool listing — filtered by user's scopes when auth is active
  server.setRequestHandler(ListToolsRequestSchema, async (_request, extra) => {
    // Wait for the startup probe (if provided), but with a timeout so a slow/unreachable
    // SAP system doesn't stall the MCP connection setup. If the probe doesn't finish in
    // time, fall back to the default tool set (textSearch unknown = show source_code).
    if (startupProbePromise) {
      await Promise.race([startupProbePromise, new Promise((resolve) => setTimeout(resolve, 10_000))]);
    }
    const features = getCachedFeatures();
    let tools = getToolDefinitions(config, features?.textSearch?.available);

    // When authenticated, only show tools the user has scopes for
    if (extra.authInfo) {
      tools = tools.filter((tool) => {
        const requiredScope = TOOL_SCOPES[tool.name];
        return !requiredScope || hasRequiredScope(extra.authInfo!, requiredScope);
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
    let isPerUserClient = false;
    const token = extra.authInfo?.token;
    const isJwt = token && token.split('.').length === 3;
    if (config.ppEnabled && btpConfig && isJwt) {
      const ppUser = (extra.authInfo?.extra?.userName ?? extra.authInfo?.clientId) as string | undefined;
      const ppDest = process.env.SAP_BTP_PP_DESTINATION ?? process.env.SAP_BTP_DESTINATION ?? '';
      try {
        client = await createPerUserClient(config, btpConfig, btpProxy, token);
        isPerUserClient = true;
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

    // Per-request safety: merge server ceiling with JWT scopes.
    // Scopes can only restrict further, never expand beyond server config.
    let effectiveClient = client;
    if (extra.authInfo?.scopes) {
      const effectiveSafety = deriveUserSafety(client.safety, extra.authInfo.scopes);
      effectiveClient = client.withSafety(effectiveSafety);
    }

    const result = await handleToolCall(
      effectiveClient,
      config,
      toolName,
      args,
      extra.authInfo,
      server,
      cachingLayer,
      isPerUserClient,
    );
    return { ...result } as Record<string, unknown>;
  });

  return server;
}

/**
 * Create a CachingLayer based on config.
 * Returns undefined if caching is disabled.
 *
 * SqliteCache is loaded dynamically so that better-sqlite3 (a native module)
 * is only required when actually used. This allows the server to start in
 * memory-cache or no-cache mode even when better-sqlite3 is not installed
 * (e.g. cross-platform deploys where native binaries were compiled elsewhere).
 */
async function createCachingLayer(config: ServerConfig): Promise<CachingLayer | undefined> {
  const mode = config.cacheMode;

  if (mode === 'none') return undefined;

  let cache: Cache;
  if (mode === 'sqlite' || (mode === 'auto' && config.transport === 'http-streamable')) {
    // Persistent cache for http-streamable / Docker — load dynamically
    try {
      const { SqliteCache } = await import('../cache/sqlite.js');
      cache = new SqliteCache(config.cacheFile);
    } catch (err) {
      logger.warn('SQLite cache unavailable (better-sqlite3 not loaded) — falling back to memory cache', {
        error: err instanceof Error ? err.message : String(err),
      });
      cache = new MemoryCache();
    }
  } else {
    // Memory cache for stdio (default)
    cache = new MemoryCache();
  }

  return new CachingLayer(cache);
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

  // Pre-flight: warn clearly when no SAP connection is configured so users know
  // why all feature probes will fail (rather than seeing cryptic network errors).
  const hasBtpConnection = !!(config.btpServiceKey || config.btpServiceKeyFile || process.env.SAP_BTP_DESTINATION);
  if (!config.url && !hasBtpConnection) {
    logger.warn(
      'SAP_URL is not configured — no SAP system connection available. ' +
        'Copy .env.example to .env and set SAP_URL, SAP_USER, SAP_PASSWORD (or configure SAP_BTP_DESTINATION / SAP_BTP_SERVICE_KEY_FILE).',
    );
  }

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

  // ─── Cache Setup ───────────────────────────────────────────────────
  const cachingLayer = await createCachingLayer(config);
  if (cachingLayer) {
    const stats = cachingLayer.stats();
    logger.info('Object cache enabled', {
      mode: config.cacheMode,
      sources: stats.sourceCount,
      depGraphs: stats.contractCount,
      edges: stats.edgeCount,
    });
  }

  // Run warmup if configured (before starting transport so it completes before serving)
  if (config.cacheWarmup && cachingLayer && config.url) {
    try {
      const { runWarmup } = await import('../cache/warmup.js');
      const warmupClient = new AdtClient(buildAdtConfig(config, btpProxy, bearerTokenProvider));
      const result = await runWarmup(
        warmupClient,
        cachingLayer,
        config.cacheWarmupPackages || undefined,
        config.systemType,
      );
      logger.info('Cache warmup completed', {
        objects: result.totalObjects,
        fetched: result.fetched,
        skipped: result.skipped,
        failed: result.failed,
        edges: result.edgesCreated,
        durationMs: result.durationMs,
      });
    } catch (err) {
      logger.warn('Cache warmup failed — continuing without warm cache', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Run feature probe once at startup — shared across all requests (stdio and HTTP).
  // This must happen before createServer() so the HTTP factory can close over the same promise.
  const startupProbePromise = runStartupProbe(config, btpProxy, bearerTokenProvider, btpConfig);

  const server = createServer(config, btpProxy, btpConfig, bearerTokenProvider, cachingLayer, startupProbePromise);

  // Shutdown hook for SQLite cache cleanup (guard against double-close from multiple signals).
  // IMPORTANT: registering a SIGINT/SIGTERM listener suppresses Node's default exit behavior,
  // so we must call process.exit() explicitly after cleanup — otherwise Ctrl+C hangs the process.
  if (cachingLayer) {
    let cacheClosed = false;
    const cleanup = (signal: string) => {
      if (cacheClosed) return;
      cacheClosed = true;
      try {
        cachingLayer.cache.close();
      } catch {
        // Ignore close errors during shutdown
      }
      logger.info(`ARC-1 shutting down (${signal})`);
      process.exit(0);
    };
    process.on('SIGTERM', () => cleanup('SIGTERM'));
    process.on('SIGINT', () => cleanup('SIGINT'));
  } else {
    // No cache — still log clean shutdown on explicit signals so operators see it in logs.
    process.on('SIGTERM', () => {
      logger.info('ARC-1 shutting down (SIGTERM)');
      process.exit(0);
    });
    process.on('SIGINT', () => {
      logger.info('ARC-1 shutting down (SIGINT)');
      process.exit(0);
    });
  }

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
      () => createServer(config, btpProxy, btpConfig, bearerTokenProvider, cachingLayer, startupProbePromise),
      config,
      xsuaaCredentials,
    );
  }

  return server;
}
