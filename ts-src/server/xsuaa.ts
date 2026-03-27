/**
 * XSUAA OAuth proxy for MCP-native clients.
 *
 * Enables Claude Desktop, Cursor, VS Code, and MCP Inspector to authenticate
 * via BTP XSUAA using the MCP specification's OAuth discovery (RFC 8414).
 *
 * Uses the MCP SDK's ProxyOAuthServerProvider to delegate the OAuth flow
 * to XSUAA, and @sap/xssec for SAP-specific JWT validation.
 *
 * Design decisions:
 *
 * 1. @sap/xssec for token validation (not jose):
 *    - SAP-specific x5t thumbprint and proof-of-possession validation
 *    - Proper XSUAA audience format handling
 *    - Offline validation with automatic JWKS caching
 *    - checkLocalScope() for scope enforcement
 *
 * 2. In-memory client store for dynamic registration:
 *    - MCP clients (Claude Desktop, Cursor) register dynamically via RFC 7591
 *    - Registrations are lost on restart — clients re-register on reconnect
 *    - XSUAA clientId is pre-registered as the default client
 *
 * 3. Chained token verifier:
 *    - Tries XSUAA → Entra ID OIDC → API key in order
 *    - All three auth modes coexist on the same /mcp endpoint
 */

import { ProxyOAuthServerProvider } from '@modelcontextprotocol/sdk/server/auth/providers/proxyProvider.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type { OAuthClientInformationFull } from '@modelcontextprotocol/sdk/shared/auth.js';
import type { OAuthRegisteredClientsStore } from '@modelcontextprotocol/sdk/server/auth/clients.js';
import { XsuaaService } from '@sap/xssec';
import { logger } from './logger.js';

// ─── Types ───────────────────────────────────────────────────────────

/** XSUAA credentials from VCAP_SERVICES */
export interface XsuaaCredentials {
  url: string;
  clientid: string;
  clientsecret: string;
  xsappname: string;
  uaadomain: string;
  verificationkey?: string;
}

// ─── In-Memory Client Store ──────────────────────────────────────────

/**
 * In-memory store for OAuth client registrations.
 *
 * MCP clients dynamically register via RFC 7591. The XSUAA service binding
 * clientId is pre-registered as the default client so that clients can
 * use it directly without registration.
 */
export class InMemoryClientStore implements OAuthRegisteredClientsStore {
  private clients = new Map<string, OAuthClientInformationFull>();

  constructor(xsuaaClientId: string, xsuaaClientSecret: string) {
    // Pre-register the XSUAA client so MCP clients that use it directly work
    this.clients.set(xsuaaClientId, {
      client_id: xsuaaClientId,
      client_secret: xsuaaClientSecret,
      redirect_uris: [],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'client_secret_post',
      client_name: 'ARC-1 XSUAA Default Client',
    });
  }

  async getClient(clientId: string): Promise<OAuthClientInformationFull | undefined> {
    return this.clients.get(clientId);
  }

  async registerClient(
    client: Omit<OAuthClientInformationFull, 'client_id' | 'client_id_issued_at'>,
  ): Promise<OAuthClientInformationFull> {
    const clientId = `arc1-${crypto.randomUUID().slice(0, 8)}`;
    const clientSecret = crypto.randomUUID();

    const fullClient: OAuthClientInformationFull = {
      ...client,
      client_id: clientId,
      client_secret: clientSecret,
      client_id_issued_at: Math.floor(Date.now() / 1000),
    };
    this.clients.set(clientId, fullClient);
    logger.debug('OAuth client registered', { clientId, clientName: client.client_name });
    return fullClient;
  }
}

// ─── XSUAA Token Verifier ────────────────────────────────────────────

/**
 * Verify a JWT token using @sap/xssec.
 *
 * Creates a security context from the token using the XSUAA service,
 * then maps it to the MCP SDK's AuthInfo format.
 */
export function createXsuaaTokenVerifier(credentials: XsuaaCredentials): (token: string) => Promise<AuthInfo> {
  const xsuaaService = new XsuaaService({
    clientid: credentials.clientid,
    clientsecret: credentials.clientsecret,
    url: credentials.url,
    xsappname: credentials.xsappname,
    uaadomain: credentials.uaadomain,
  });

  return async (token: string): Promise<AuthInfo> => {
    const securityContext = await xsuaaService.createSecurityContext(token, { jwt: token });

    // Extract scopes (remove xsappname prefix for local scope names)
    const grantedScopes: string[] = [];
    // The token contains scopes like "arc1-mcp!b12345.read"
    // checkLocalScope strips the prefix for us
    for (const scope of ['read', 'write', 'admin']) {
      if (securityContext.checkLocalScope(scope)) {
        grantedScopes.push(scope);
      }
    }

    const expiresAt = securityContext.token?.payload?.exp;

    return {
      token,
      clientId: securityContext.getClientId(),
      scopes: grantedScopes,
      expiresAt: typeof expiresAt === 'number' ? expiresAt : undefined,
      extra: {
        userName: securityContext.getLogonName?.() ?? undefined,
        email: securityContext.getEmail?.() ?? undefined,
      },
    };
  };
}

// ─── Chained Token Verifier ──────────────────────────────────────────

/**
 * Create a token verifier that chains multiple auth methods.
 *
 * Tries in order:
 * 1. XSUAA (@sap/xssec) — if XSUAA credentials are available
 * 2. Entra ID OIDC (jose) — if SAP_OIDC_ISSUER is configured
 * 3. API Key — if ARC1_API_KEY is configured
 */
export function createChainedTokenVerifier(
  config: { apiKey?: string; oidcIssuer?: string; oidcAudience?: string },
  xsuaaVerifier?: (token: string) => Promise<AuthInfo>,
  oidcVerifier?: (token: string) => Promise<AuthInfo>,
): (token: string) => Promise<AuthInfo> {
  return async (token: string): Promise<AuthInfo> => {
    // 1. Try XSUAA
    if (xsuaaVerifier) {
      try {
        return await xsuaaVerifier(token);
      } catch {
        // Not an XSUAA token, try next
      }
    }

    // 2. Try Entra ID OIDC
    if (oidcVerifier) {
      try {
        return await oidcVerifier(token);
      } catch {
        // Not an Entra ID token, try next
      }
    }

    // 3. Try API key
    if (config.apiKey && token === config.apiKey) {
      return {
        token,
        clientId: 'api-key',
        scopes: ['read', 'write', 'admin'],
        extra: {},
      };
    }

    throw new Error('Token validation failed: not a valid XSUAA, OIDC, or API key token');
  };
}

// ─── OAuth Provider Factory ──────────────────────────────────────────

/**
 * Create a ProxyOAuthServerProvider that proxies OAuth to XSUAA.
 */
export function createXsuaaOAuthProvider(
  credentials: XsuaaCredentials,
  appUrl: string,
): { provider: ProxyOAuthServerProvider; clientStore: InMemoryClientStore } {
  const clientStore = new InMemoryClientStore(credentials.clientid, credentials.clientsecret);
  const verifier = createXsuaaTokenVerifier(credentials);

  const provider = new ProxyOAuthServerProvider({
    endpoints: {
      authorizationUrl: `${credentials.url}/oauth/authorize`,
      tokenUrl: `${credentials.url}/oauth/token`,
      revocationUrl: `${credentials.url}/oauth/revoke`,
    },
    verifyAccessToken: verifier,
    getClient: (clientId: string) => clientStore.getClient(clientId),
  });

  // XSUAA handles PKCE validation server-side
  provider.skipLocalPkceValidation = true;

  logger.info('XSUAA OAuth provider created', {
    xsappname: credentials.xsappname,
    authorizationUrl: `${credentials.url}/oauth/authorize`,
    appUrl,
  });

  return { provider, clientStore };
}
