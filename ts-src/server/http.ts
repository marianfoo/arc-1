/**
 * HTTP Streamable transport for ARC-1.
 *
 * Provides a Node.js HTTP server that:
 * - Serves MCP Streamable HTTP protocol on /mcp
 * - Health check endpoint on /health
 * - API key authentication via Bearer token
 * - OIDC/JWT validation via JWKS discovery
 *
 * The MCP SDK's StreamableHTTPServerTransport handles the protocol details.
 * We just wire up the HTTP server, routing, and auth middleware.
 *
 * Design decisions:
 *
 * 1. Auth is checked BEFORE creating the MCP transport for each request.
 *    This prevents unauthenticated requests from consuming server resources.
 *
 * 2. JWKS keys are cached and refreshed automatically via jose library.
 *    First request may be slower (JWKS fetch), subsequent ones are fast.
 *
 * 3. Health endpoint is unauthenticated — needed for CF health checks.
 *
 * 4. Stateless mode (no session ID) — each request is independent.
 *    This is simpler and sufficient for our use case where the MCP client
 *    sends complete requests each time.
 */

import { createServer as createHttpServer, type IncomingMessage } from 'node:http';
import type { Server as McpServer } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { logger } from './logger.js';
import { VERSION } from './server.js';
import type { ServerConfig } from './types.js';

// ─── JWKS / JWT types (lazy-loaded from jose) ────────────────────────

let joseModule: typeof import('jose') | null = null;
let jwksClient: ReturnType<typeof import('jose').createRemoteJWKSet> | null = null;

/**
 * Start the HTTP Streamable server.
 *
 * Uses a per-request server pattern: each incoming MCP request gets a fresh
 * Server + Transport pair. This is necessary because:
 * 1. MCP SDK's Server can only connect to one transport at a time
 * 2. Clients like Copilot Studio send multiple concurrent requests
 * 3. Stateless mode means no session state to preserve between requests
 *
 * The serverFactory creates a new configured MCP server for each request,
 * sharing the same ADT client and config but with independent transport state.
 */
export async function startHttpServer(serverFactory: () => McpServer, config: ServerConfig): Promise<void> {
  const [host, portStr] = config.httpAddr.split(':');
  const port = Number.parseInt(portStr || '8080', 10);
  const bindHost = host || '0.0.0.0';

  // Pre-initialize JWKS client if OIDC is configured
  if (config.oidcIssuer) {
    await initJwks(config.oidcIssuer);
  }

  const httpServer = createHttpServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`);

    // ─── Health Check (unauthenticated) ────────────────────
    if (url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', version: VERSION }));
      return;
    }

    // ─── MCP Endpoint ──────────────────────────────────────
    if (url.pathname === '/mcp') {
      // Auth check
      const authResult = await checkAuth(req, config);
      if (!authResult.ok) {
        res.writeHead(authResult.status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: authResult.message }));
        return;
      }

      // Create a fresh server + transport per request.
      // This avoids "already connected" errors when clients send
      // concurrent requests (e.g., Copilot Studio).
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
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Internal server error' }));
        }
      }
      return;
    }

    // ─── 404 for anything else ─────────────────────────────
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found. Use /mcp for MCP protocol, /health for health check.' }));
  });

  httpServer.listen(port, bindHost, () => {
    const authMode = config.apiKey ? 'API key' : config.oidcIssuer ? 'OIDC' : 'NONE (open)';
    logger.info('ARC-1 HTTP server started', {
      addr: `${bindHost}:${port}`,
      health: `http://${bindHost}:${port}/health`,
      mcp: `http://${bindHost}:${port}/mcp`,
      auth: authMode,
    });
  });
}

// ─── Authentication ──────────────────────────────────────────────────

interface AuthResult {
  ok: boolean;
  status: number;
  message: string;
}

/**
 * Check authentication for an incoming request.
 *
 * Auth methods (checked in order):
 * 1. API key: Bearer token must match ARC1_API_KEY / VSP_API_KEY
 * 2. OIDC: Bearer JWT validated against issuer JWKS + audience
 * 3. No auth configured: allow all requests
 */
async function checkAuth(req: IncomingMessage, config: ServerConfig): Promise<AuthResult> {
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

  const token = authHeader.slice(7); // Remove "Bearer " prefix

  // ─── API Key check ─────────────────────────────────────
  if (config.apiKey) {
    if (token === config.apiKey) {
      return { ok: true, status: 200, message: '' };
    }
    // If OIDC is also configured, fall through to try JWT validation
    if (!config.oidcIssuer) {
      return { ok: false, status: 403, message: 'Invalid API key' };
    }
  }

  // ─── OIDC / JWT validation ─────────────────────────────
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
  if (joseModule) return; // Already initialized

  try {
    joseModule = await import('jose');
    // Build JWKS URI from OIDC issuer (standard .well-known path)
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
    // Don't throw — server can still work with API key auth
  }
}

/**
 * Validate a JWT token against the configured OIDC issuer.
 */
async function validateJwt(token: string, config: ServerConfig): Promise<void> {
  if (!joseModule || !jwksClient) {
    // Try lazy init
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
