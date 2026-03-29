/**
 * HTTP Streamable transport for ARC-1.
 *
 * Provides an Express HTTP server that:
 * - Serves MCP Streamable HTTP protocol on /mcp
 * - Health check endpoint on /health
 * - API key authentication via Bearer token
 * - OIDC/JWT validation via JWKS discovery (Entra ID, etc.)
 * - XSUAA OAuth proxy for MCP-native clients (Claude Desktop, Cursor)
 *
 * When XSUAA auth is enabled, the MCP SDK's mcpAuthRouter installs standard
 * OAuth endpoints (authorize, token, register, revoke, discovery metadata).
 *
 * Design decisions:
 *
 * 1. Express is used because the MCP SDK's auth infrastructure (mcpAuthRouter,
 *    requireBearerAuth) requires Express. Express 5.x is already a transitive
 *    dependency of the MCP SDK.
 *
 * 2. Per-request server pattern: each MCP request gets a fresh Server + Transport.
 *    This avoids "already connected" errors from concurrent clients.
 *
 * 3. Auth is checked BEFORE creating the MCP transport to avoid wasting resources.
 *
 * 4. Health endpoint is always unauthenticated — needed for CF health checks.
 */

import type { Server as McpServer } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { NextFunction, Request, Response } from 'express';
import express from 'express';
import { logger } from './logger.js';
import { VERSION } from './server.js';
import type { ServerConfig } from './types.js';
import type { XsuaaCredentials } from './xsuaa.js';

// ─── JWKS / JWT types (lazy-loaded from jose) ────────────────────────

let joseModule: typeof import('jose') | null = null;
let jwksClient: ReturnType<typeof import('jose').createRemoteJWKSet> | null = null;

// ─── MCP Request Handler ─────────────────────────────────────────────

/**
 * Create an Express handler that processes MCP requests.
 * Each request gets a fresh Server + Transport pair.
 */
function createMcpHandler(serverFactory: () => McpServer) {
  return async (req: Request, res: Response) => {
    try {
      const server = serverFactory();
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined, // Stateless mode
      });
      await server.connect(transport);
      await transport.handleRequest(req, res);
    } catch (err) {
      logger.error('MCP request error', { error: err instanceof Error ? err.message : String(err) });
      if (!res.headersSent) {
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  };
}

/**
 * Start the HTTP Streamable server.
 */
export async function startHttpServer(
  serverFactory: () => McpServer,
  config: ServerConfig,
  xsuaaCredentials?: XsuaaCredentials,
): Promise<void> {
  const [host, portStr] = config.httpAddr.split(':');
  const port = Number.parseInt(portStr || '8080', 10);
  const bindHost = host || '0.0.0.0';

  const app = express();
  // Trust first proxy (CF gorouter) — required for express-rate-limit
  // and correct client IP detection behind CF's reverse proxy.
  app.set('trust proxy', 1);
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  const mcpHandler = createMcpHandler(serverFactory);

  // ─── Health Check (always unauthenticated) ───────────────
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', version: VERSION });
  });

  // ─── XSUAA OAuth Proxy Mode ──────────────────────────────
  if (config.xsuaaAuth && xsuaaCredentials) {
    const { mcpAuthRouter } = await import('@modelcontextprotocol/sdk/server/auth/router.js');
    const { requireBearerAuth } = await import('@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js');
    const { createXsuaaOAuthProvider, createChainedTokenVerifier, createXsuaaTokenVerifier } = await import(
      './xsuaa.js'
    );
    const { getAppUrl } = await import('../adt/btp.js');

    // Determine app URL for OAuth metadata
    const appUrl = getAppUrl() ?? `http://${bindHost}:${port}`;

    // Create XSUAA provider + chained verifier
    const { provider } = createXsuaaOAuthProvider(xsuaaCredentials, appUrl);
    const xsuaaVerifier = createXsuaaTokenVerifier(xsuaaCredentials);
    const oidcVerifier = config.oidcIssuer ? await createOidcVerifier(config) : undefined;
    const chainedVerifier = createChainedTokenVerifier(config, xsuaaVerifier, oidcVerifier);

    // ─── OAuth authorize normalization ────────────────────────
    // The MCP SDK's authorize handler reads POST params from req.body
    // and GET params from req.query. Some OAuth clients (e.g. Copilot
    // Studio) send POST /authorize with params in the query string or
    // with an unexpected Content-Type, leaving req.body empty.
    // This middleware merges query params into body as a fallback.
    app.use('/authorize', (req, _res, next) => {
      logger.debug('OAuth authorize request', {
        method: req.method,
        contentType: req.headers['content-type'],
        hasBody: !!req.body,
        bodyKeys: req.body ? Object.keys(req.body) : [],
        queryKeys: Object.keys(req.query),
      });
      if (req.method === 'POST' && req.query.client_id && (!req.body || !req.body.client_id)) {
        req.body = { ...req.query, ...(req.body || {}) };
        logger.debug('OAuth authorize: merged query params into body', {
          client_id: req.body.client_id,
        });
      }
      next();
    });

    // Install MCP SDK auth router at root (OAuth endpoints + DCR)
    app.use(
      mcpAuthRouter({
        provider,
        issuerUrl: new URL(appUrl),
        baseUrl: new URL(appUrl),
        scopesSupported: ['read', 'write', 'admin'],
        resourceName: 'ARC-1 SAP MCP Server',
      }),
    );

    // Protected MCP endpoint with chained token verification
    const bearerAuth = requireBearerAuth({ verifier: { verifyAccessToken: chainedVerifier } });
    app.all('/mcp', bearerAuth, mcpHandler);

    logger.info('XSUAA OAuth proxy enabled', {
      xsappname: xsuaaCredentials.xsappname,
      appUrl,
    });
  } else {
    // ─── Standard Auth Mode (API key / OIDC) ─────────────────
    if (config.oidcIssuer) {
      await initJwks(config.oidcIssuer);
    }

    // Auth middleware for standard mode
    const authMiddleware = async (req: Request, res: Response, next: NextFunction) => {
      const authResult = await checkAuth(req, config);
      if (!authResult.ok) {
        res.status(authResult.status).json({ error: authResult.message });
        return;
      }
      next();
    };

    app.all('/mcp', authMiddleware, mcpHandler);
  }

  // ─── 404 for anything else ─────────────────────────────────
  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found. Use /mcp for MCP protocol, /health for health check.' });
  });

  // ─── Start listening ───────────────────────────────────────
  app.listen(port, bindHost, () => {
    let authMode = 'NONE (open)';
    if (config.xsuaaAuth && xsuaaCredentials) authMode = 'XSUAA OAuth proxy';
    else if (config.apiKey && config.oidcIssuer) authMode = 'API key + OIDC';
    else if (config.apiKey) authMode = 'API key';
    else if (config.oidcIssuer) authMode = 'OIDC';

    logger.info('ARC-1 HTTP server started', {
      addr: `${bindHost}:${port}`,
      health: `http://${bindHost}:${port}/health`,
      mcp: `http://${bindHost}:${port}/mcp`,
      auth: authMode,
    });
  });
}

// ─── OIDC Verifier Factory ───────────────────────────────────────────

/**
 * Create an Entra ID / OIDC token verifier using jose.
 * Returns a function compatible with the chained verifier.
 */
async function createOidcVerifier(
  config: ServerConfig,
): Promise<(token: string) => Promise<import('@modelcontextprotocol/sdk/server/auth/types.js').AuthInfo>> {
  await initJwks(config.oidcIssuer!);

  return async (token: string) => {
    if (!joseModule || !jwksClient) {
      throw new Error('OIDC not initialized');
    }
    const { payload } = await joseModule.jwtVerify(token, jwksClient, {
      issuer: config.oidcIssuer,
      audience: config.oidcAudience,
    });

    logger.debug('OIDC JWT validated', { sub: payload.sub, iss: payload.iss });

    return {
      token,
      clientId: (payload.azp as string) ?? (payload.sub as string) ?? 'oidc-user',
      scopes: ['read', 'write', 'admin'], // OIDC tokens get full access (scopes managed by OIDC provider)
      expiresAt: payload.exp,
      extra: { sub: payload.sub, iss: payload.iss },
    };
  };
}

// ─── Standard Auth (API Key + OIDC) ──────────────────────────────────

interface AuthResult {
  ok: boolean;
  status: number;
  message: string;
}

/**
 * Check authentication for standard mode (API key + OIDC).
 * Used when XSUAA auth is NOT enabled.
 */
async function checkAuth(req: Request, config: ServerConfig): Promise<AuthResult> {
  // No auth configured — allow all
  if (!config.apiKey && !config.oidcIssuer) {
    return { ok: true, status: 200, message: '' };
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return {
      ok: false,
      status: 401,
      message: 'Missing or invalid Authorization header. Expected: Bearer <token>',
    };
  }

  const token = authHeader.slice(7);

  // API Key check
  if (config.apiKey) {
    if (token === config.apiKey) {
      return { ok: true, status: 200, message: '' };
    }
    if (!config.oidcIssuer) {
      return { ok: false, status: 403, message: 'Invalid API key' };
    }
  }

  // OIDC / JWT validation
  if (config.oidcIssuer) {
    try {
      await validateJwt(token, config);
      return { ok: true, status: 200, message: '' };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'JWT validation failed';
      logger.debug('JWT validation failed', { error: msg });
      return { ok: false, status: 403, message: `Authentication failed: ${msg}` };
    }
  }

  return { ok: false, status: 403, message: 'Authentication failed' };
}

/**
 * Initialize JWKS client from OIDC discovery.
 */
async function initJwks(issuer: string): Promise<void> {
  if (joseModule) return;

  try {
    joseModule = await import('jose');
    const jwksUri = new URL('.well-known/openid-configuration', issuer.endsWith('/') ? issuer : `${issuer}/`);
    const discoveryResp = await fetch(jwksUri.toString());
    const discovery = (await discoveryResp.json()) as { jwks_uri: string };

    if (!discovery.jwks_uri) {
      throw new Error(`No jwks_uri in OIDC discovery response from ${jwksUri}`);
    }

    jwksClient = joseModule.createRemoteJWKSet(new URL(discovery.jwks_uri));
    logger.info('OIDC JWKS initialized', { issuer, jwksUri: discovery.jwks_uri });
  } catch (err) {
    logger.error('Failed to initialize OIDC JWKS', {
      issuer,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Validate a JWT token against the configured OIDC issuer.
 */
async function validateJwt(token: string, config: ServerConfig): Promise<void> {
  if (!joseModule || !jwksClient) {
    if (config.oidcIssuer) {
      await initJwks(config.oidcIssuer);
    }
    if (!joseModule || !jwksClient) {
      throw new Error('OIDC not initialized — check SAP_OIDC_ISSUER configuration');
    }
  }

  const { payload } = await joseModule.jwtVerify(token, jwksClient, {
    issuer: config.oidcIssuer,
    audience: config.oidcAudience,
  });

  logger.debug('JWT validated', {
    sub: payload.sub,
    iss: payload.iss,
    exp: payload.exp,
  });
}
