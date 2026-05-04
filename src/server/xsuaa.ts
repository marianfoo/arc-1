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

import type { OAuthRegisteredClientsStore } from '@modelcontextprotocol/sdk/server/auth/clients.js';
import { InvalidTokenError } from '@modelcontextprotocol/sdk/server/auth/errors.js';
import { ProxyOAuthServerProvider } from '@modelcontextprotocol/sdk/server/auth/providers/proxyProvider.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type { OAuthClientInformationFull } from '@modelcontextprotocol/sdk/shared/auth.js';
import { XsuaaService } from '@sap/xssec';
import { expandScopes } from '../authz/policy.js';
import { API_KEY_PROFILES } from './config.js';
import { logger } from './logger.js';

// ─── Types ───────────────────────────────────────────────────────────

/** OAuth token endpoint response shape */
interface TokenResponse {
  access_token: string;
  token_type?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
}

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
 * Canonicalize a redirect URI for semantic comparison.
 *
 * Compares scheme + host + port + decoded path + sorted decoded query.
 * Fragments are dropped (servers never see them). Returns undefined if
 * the URI doesn't parse.
 */
function normalizeRedirectUri(uri: string): string | undefined {
  try {
    const url = new URL(uri);
    const pathname = decodeURIComponent(url.pathname);
    const entries = [...url.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b));
    const query = entries.map(([k, v]) => `${k}=${v}`).join('&');
    return `${url.protocol}//${url.host}${pathname}${query ? `?${query}` : ''}`;
  } catch {
    return undefined;
  }
}

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
    // Pre-register the XSUAA client so MCP clients that use it directly work.
    // The redirect_uris MUST include all URIs that MCP clients will use,
    // because the MCP SDK validates redirect_uri against this list BEFORE
    // calling our authorize override. These must also be registered in xs-security.json.
    this.clients.set(xsuaaClientId, {
      client_id: xsuaaClientId,
      client_secret: xsuaaClientSecret,
      redirect_uris: [
        'http://localhost:6274/oauth/callback', // MCP Inspector
        'http://localhost:3000/oauth/callback', // Local dev servers
        'https://claude.ai/api/mcp/auth_callback', // Claude Desktop
        'cursor://anysphere.cursor-retrieval/oauth/callback', // Cursor
        'vscode://vscode.microsoft-authentication/callback', // VS Code
      ],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'client_secret_post',
      client_name: 'ARC-1 XSUAA Default Client',
    });
  }

  /**
   * Dynamically add a redirect URI to a client's allow list.
   *
   * The MCP SDK validates redirect_uri with byte-exact matching for
   * non-loopback HTTPS URIs, but two classes of clients need relaxation:
   *
   * 1. Pre-registered XSUAA client: XSUAA itself is the authoritative
   *    redirect-URI validator (via xs-security.json wildcard patterns),
   *    so any URI is accepted here and forwarded.
   *
   * 2. DCR clients (arc1-*): only accept URIs that are semantically
   *    equivalent to one the client registered. This handles clients that
   *    use different percent-encoding at /register vs /authorize — notably
   *    BAS/Cline via Theia's OAuth proxy, which registers `/callback?x=1`
   *    but requests with `/callback%3Fx=1`. Security: hostname, port, and
   *    decoded path/query must all match a previously-registered URI.
   */
  ensureRedirectUri(clientId: string, uri: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;
    if (client.redirect_uris.includes(uri)) return;

    if (!client.client_id.startsWith('arc1-')) {
      client.redirect_uris.push(uri);
      logger.debug('Dynamic redirect_uri registered for XSUAA client', { clientId, uri });
      return;
    }

    const normalizedRequested = normalizeRedirectUri(uri);
    if (!normalizedRequested) return;
    const match = client.redirect_uris.find((reg) => normalizeRedirectUri(reg) === normalizedRequested);
    if (match) {
      client.redirect_uris.push(uri);
      logger.debug('OAuth redirect_uri loose-match: registered encoding variant', {
        clientId,
        registered: match,
        requested: uri,
      });
    }
  }

  async getClient(clientId: string): Promise<OAuthClientInformationFull | undefined> {
    const client = this.clients.get(clientId);
    // Lazy TTL eviction: expire dynamically registered clients after 24 hours
    if (client?.client_id_issued_at) {
      const ageSeconds = Math.floor(Date.now() / 1000) - client.client_id_issued_at;
      if (ageSeconds > 86400 && client.client_id.startsWith('arc1-')) {
        this.clients.delete(clientId);
        logger.debug('OAuth client expired (24h TTL)', { clientId });
        return undefined;
      }
    }
    logger.debug('OAuth client lookup', {
      clientId,
      found: !!client,
      clientName: client?.client_name,
      registeredClients: [...this.clients.keys()],
    });
    return client;
  }

  async registerClient(
    client: Omit<OAuthClientInformationFull, 'client_id' | 'client_id_issued_at'>,
  ): Promise<OAuthClientInformationFull> {
    // Registration cap: prevent memory exhaustion from unbounded DCR
    const dynamicClients = [...this.clients.keys()].filter((k) => k.startsWith('arc1-'));
    if (dynamicClients.length >= 100) {
      throw new Error('Client registration limit reached (100). Restart the server to clear expired registrations.');
    }

    // Validate redirect URIs against allowlist policy
    if (client.redirect_uris) {
      for (const uri of client.redirect_uris) {
        this.validateRedirectUri(uri);
      }
    }

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

  /**
   * Validate a redirect URI against allowed scheme/host policy.
   * Allowed: https://* , http://localhost or 127.0.0.1 or [::1], custom MCP client schemes.
   * Rejected: javascript:, data:, file:, ftp:, and any http:// to non-loopback hosts.
   */
  private validateRedirectUri(uri: string): void {
    const ALLOWED_CUSTOM_SCHEMES = ['claude:', 'cursor:', 'vscode:', 'vscode-insiders:'];
    const BLOCKED_SCHEMES = ['javascript:', 'data:', 'file:', 'ftp:'];

    for (const scheme of BLOCKED_SCHEMES) {
      if (uri.toLowerCase().startsWith(scheme)) {
        throw new Error(
          `Redirect URI rejected: '${scheme}' scheme is not allowed. Use https:// or a registered custom scheme.`,
        );
      }
    }

    // Allow known custom MCP client schemes
    for (const scheme of ALLOWED_CUSTOM_SCHEMES) {
      if (uri.toLowerCase().startsWith(scheme)) return;
    }

    try {
      const parsed = new URL(uri);
      if (parsed.protocol === 'https:') return;
      if (parsed.protocol === 'http:') {
        const host = parsed.hostname.toLowerCase();
        if (host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1') return;
        throw new Error(`Redirect URI rejected: http:// is only allowed for localhost/127.0.0.1. Got: '${uri}'`);
      }
      // Unknown protocol — allow if it looks like a custom scheme (no dots in protocol)
      return;
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('Redirect URI rejected')) throw err;
      // URL parsing failed — likely a custom scheme; allow it
    }
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
    logger.debug('XSUAA token verification: creating security context');
    const securityContext = await xsuaaService.createSecurityContext(token, { jwt: token });

    // Extract scopes (remove xsappname prefix for local scope names)
    const grantedScopes: string[] = [];
    // The token contains scopes like "arc1-mcp!b12345.read"
    // checkLocalScope strips the prefix for us
    for (const scope of ['read', 'write', 'data', 'sql', 'transports', 'git', 'admin']) {
      if (securityContext.checkLocalScope(scope)) {
        grantedScopes.push(scope);
      }
    }
    // Apply implied scope expansion: admin→all, write→read, sql→data
    const expandedScopes = expandScopes(grantedScopes);

    const expiresAt = securityContext.token?.payload?.exp;

    const authInfo = {
      token,
      clientId: securityContext.getClientId(),
      scopes: expandedScopes,
      expiresAt: typeof expiresAt === 'number' ? expiresAt : undefined,
      extra: {
        userName: securityContext.getLogonName?.() ?? undefined,
        email: securityContext.getEmail?.() ?? undefined,
      },
    };
    logger.debug('XSUAA token verified', {
      clientId: authInfo.clientId,
      scopes: expandedScopes,
      userName: authInfo.extra.userName,
      email: authInfo.extra.email,
    });
    return authInfo;
  };
}

// ─── API Key Matching Helper ─────────────────────────────────────────

/**
 * Match a token against configured API keys (multi-key or single).
 * Used by both the chained verifier (XSUAA mode) and standard verifier.
 */
function matchApiKeyFromConfig(
  config: { apiKeys?: Array<{ key: string; profile: string }> },
  token: string,
): { scopes: string[]; clientId: string } | undefined {
  if (config.apiKeys) {
    for (const entry of config.apiKeys) {
      if (token === entry.key) {
        const profile = API_KEY_PROFILES[entry.profile];
        if (!profile) return undefined;
        const scopes = expandScopes(profile.scopes);
        return { scopes, clientId: `api-key:${entry.profile}` };
      }
    }
  }
  return undefined;
}

// ─── Chained Token Verifier ──────────────────────────────────────────

/**
 * Create a token verifier that chains multiple auth methods.
 *
 * Tries in order:
 * 1. XSUAA (@sap/xssec) — if XSUAA credentials are available
 * 2. Entra ID OIDC (jose) — if SAP_OIDC_ISSUER is configured
 * 3. API Key — if ARC1_API_KEYS is configured
 */
export function createChainedTokenVerifier(
  config: {
    apiKeys?: Array<{ key: string; profile: string }>;
    oidcIssuer?: string;
    oidcAudience?: string;
  },
  xsuaaVerifier?: (token: string) => Promise<AuthInfo>,
  oidcVerifier?: (token: string) => Promise<AuthInfo>,
): (token: string) => Promise<AuthInfo> {
  return async (token: string): Promise<AuthInfo> => {
    const tokenPreview = `${token.slice(0, 20)}...${token.slice(-10)}`;
    logger.debug('Chained token verifier: starting', { tokenPreview });

    // 1. Try XSUAA
    if (xsuaaVerifier) {
      try {
        const result = await xsuaaVerifier(token);
        logger.debug('Chained token verifier: XSUAA succeeded', {
          clientId: result.clientId,
          scopes: result.scopes,
          user: result.extra?.email || result.extra?.userName,
        });
        return result;
      } catch (err) {
        logger.debug('Chained token verifier: XSUAA failed, trying next', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // 2. Try Entra ID OIDC
    if (oidcVerifier) {
      try {
        const result = await oidcVerifier(token);
        logger.debug('Chained token verifier: OIDC succeeded', {
          clientId: result.clientId,
          scopes: result.scopes,
        });
        return result;
      } catch (err) {
        logger.debug('Chained token verifier: OIDC failed, trying next', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // 3. Try API key (multi-key with profiles)
    const apiKeyMatch = matchApiKeyFromConfig(config, token);
    if (apiKeyMatch) {
      logger.debug('Chained token verifier: API key matched', { clientId: apiKeyMatch.clientId });
      return {
        token,
        clientId: apiKeyMatch.clientId,
        scopes: apiKeyMatch.scopes,
        // MCP SDK's requireBearerAuth requires expiresAt — set to 1 year
        expiresAt: Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60,
        extra: {},
      };
    }

    logger.debug('Chained token verifier: all methods failed', { tokenPreview });
    throw new InvalidTokenError('Token validation failed: not a valid XSUAA, OIDC, or API key token');
  };
}

// ─── OAuth Provider Factory ──────────────────────────────────────────

/**
 * Create a ProxyOAuthServerProvider that proxies OAuth to XSUAA.
 */
/**
 * XSUAA-proxying OAuth provider.
 *
 * Extends ProxyOAuthServerProvider to replace the MCP client's local client_id
 * with the XSUAA service binding client_id when forwarding to XSUAA.
 *
 * Problem: MCP clients register via DCR and get a local client_id (e.g., "arc1-f63afbab").
 * But XSUAA only knows about its own client_id ("sb-arc1-mcp!t498139").
 * The standard ProxyOAuthServerProvider forwards the local client_id to XSUAA, which rejects it.
 *
 * Solution: Override authorize() to swap the client_id and use a custom fetch() for
 * the token exchange to inject the XSUAA credentials.
 */
class XsuaaProxyOAuthProvider extends ProxyOAuthServerProvider {
  private xsuaaClientId: string;
  private xsuaaClientSecret: string;
  private xsuaaTokenUrl: string;
  private xsuaaAuthUrl: string;
  private xsuaaXsappname: string;
  private _localClientStore: InMemoryClientStore;

  constructor(
    credentials: XsuaaCredentials,
    verifier: (token: string) => Promise<AuthInfo>,
    localClientStore: InMemoryClientStore,
  ) {
    const authUrl = `${credentials.url}/oauth/authorize`;
    const tokenUrl = `${credentials.url}/oauth/token`;

    super({
      endpoints: {
        authorizationUrl: authUrl,
        tokenUrl: tokenUrl,
        revocationUrl: `${credentials.url}/oauth/revoke`,
      },
      verifyAccessToken: verifier,
      getClient: (clientId: string) => localClientStore.getClient(clientId),
    });

    this.xsuaaClientId = credentials.clientid;
    this.xsuaaClientSecret = credentials.clientsecret;
    this.xsuaaTokenUrl = tokenUrl;
    this.xsuaaAuthUrl = authUrl;
    this.xsuaaXsappname = credentials.xsappname;
    this._localClientStore = localClientStore;
    this.skipLocalPkceValidation = true;
  }

  /**
   * Override clientsStore to expose registerClient for DCR.
   * The MCP SDK checks this to decide whether to advertise
   * registration_endpoint in OAuth metadata and handle POST /register.
   */
  override get clientsStore() {
    return this._localClientStore;
  }

  /**
   * Override authorize to replace the MCP client's local client_id
   * with the XSUAA service binding client_id.
   */
  override async authorize(
    _client: OAuthClientInformationFull,
    params: {
      state?: string;
      scopes?: string[];
      codeChallenge: string;
      redirectUri: string;
      resource?: URL;
    },
    res: { redirect(url: string): void },
  ): Promise<void> {
    // XSUAA only allows http://localhost for redirect URIs, never http://127.0.0.1.
    // Some MCP clients (e.g., MCP Inspector) use 127.0.0.1, so rewrite to localhost
    // before forwarding to XSUAA. The token exchange must use the same rewritten URI.
    const xsuaaRedirectUri = params.redirectUri.replace('://127.0.0.1:', '://localhost:');

    const targetUrl = new URL(this.xsuaaAuthUrl);
    const searchParams = new URLSearchParams({
      client_id: this.xsuaaClientId, // Use XSUAA client, not local DCR client
      response_type: 'code',
      redirect_uri: xsuaaRedirectUri,
      code_challenge: params.codeChallenge,
      code_challenge_method: 'S256',
    });

    if (params.state) searchParams.set('state', params.state);
    if (params.scopes?.length) {
      // Qualify short scope names (read, write, admin) with XSUAA xsappname prefix.
      // XSUAA rejects unqualified scopes like "admin" — it needs "arc1-mcp!t498139.admin".
      // Filter out empty strings (Copilot Studio sends scope="" which splits to [""]).
      const qualifiedScopes = params.scopes
        .filter((s) => s.length > 0)
        .map((s) => (s.includes('.') ? s : `${this.xsuaaXsappname}.${s}`));
      if (qualifiedScopes.length > 0) {
        searchParams.set('scope', qualifiedScopes.join(' '));
      }
    }
    if (params.resource) searchParams.set('resource', params.resource.toString());

    targetUrl.search = searchParams.toString();

    logger.debug('XSUAA authorize redirect', {
      xsuaaClient: this.xsuaaClientId,
      redirectUri: params.redirectUri,
    });

    res.redirect(targetUrl.toString());
  }

  /**
   * Override exchangeAuthorizationCode to use XSUAA credentials
   * instead of the local DCR client credentials.
   */
  override async exchangeAuthorizationCode(
    _client: OAuthClientInformationFull,
    authorizationCode: string,
    codeVerifier?: string,
    redirectUri?: string,
  ) {
    logger.debug('XSUAA token exchange: authorization_code', {
      hasCodeVerifier: !!codeVerifier,
      redirectUri,
    });
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code: authorizationCode,
      client_id: this.xsuaaClientId,
      client_secret: this.xsuaaClientSecret,
    });
    if (codeVerifier) params.set('code_verifier', codeVerifier);
    // Must match the rewritten redirect_uri sent during authorize
    if (redirectUri) params.set('redirect_uri', redirectUri.replace('://127.0.0.1:', '://localhost:'));

    const response = await fetch(this.xsuaaTokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    if (!response.ok) {
      const text = await response.text();
      logger.error('XSUAA token exchange failed', { status: response.status, body: text.slice(0, 200) });
      throw new Error(`XSUAA token exchange failed: ${response.status}`);
    }

    const data = (await response.json()) as TokenResponse;
    logger.debug('XSUAA token exchange: success', {
      tokenType: data.token_type,
      expiresIn: data.expires_in,
      hasRefreshToken: !!data.refresh_token,
      scope: data.scope,
    });
    return {
      access_token: data.access_token,
      token_type: data.token_type ?? 'bearer',
      expires_in: data.expires_in,
      refresh_token: data.refresh_token,
      scope: data.scope,
    };
  }

  /**
   * Override exchangeRefreshToken to use XSUAA credentials.
   */
  override async exchangeRefreshToken(_client: OAuthClientInformationFull, refreshToken: string, _scopes?: string[]) {
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: this.xsuaaClientId,
      client_secret: this.xsuaaClientSecret,
    });

    const response = await fetch(this.xsuaaTokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    if (!response.ok) {
      throw new Error(`XSUAA refresh token exchange failed: ${response.status}`);
    }

    const data = (await response.json()) as TokenResponse;
    return {
      access_token: data.access_token,
      token_type: data.token_type ?? 'bearer',
      expires_in: data.expires_in,
      refresh_token: data.refresh_token,
      scope: data.scope,
    };
  }

  /**
   * Override revokeToken to use XSUAA service credentials consistently.
   * Without this override, the base class would attempt revocation with
   * the local client credentials, which don't match the XSUAA binding.
   *
   * Declared as a property (arrow function) to match the base class declaration.
   */
  override revokeToken = async (
    _client: OAuthClientInformationFull,
    request: { token: string; token_type_hint?: string },
  ): Promise<void> => {
    const revokeUrl = this.xsuaaTokenUrl.replace('/oauth/token', '/oauth/revoke');

    const params = new URLSearchParams({ token: request.token });
    if (request.token_type_hint) {
      params.set('token_type_hint', request.token_type_hint);
    }

    try {
      const response = await fetch(revokeUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${Buffer.from(`${this.xsuaaClientId}:${this.xsuaaClientSecret}`).toString('base64')}`,
        },
        body: params.toString(),
      });

      if (!response.ok) {
        logger.warn('XSUAA token revocation failed', { status: response.status, url: revokeUrl });
      } else {
        logger.debug('XSUAA token revoked successfully');
      }
    } catch (err) {
      logger.warn('XSUAA token revocation error', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  };
}

export function createXsuaaOAuthProvider(
  credentials: XsuaaCredentials,
  appUrl: string,
): { provider: ProxyOAuthServerProvider; clientStore: InMemoryClientStore } {
  const clientStore = new InMemoryClientStore(credentials.clientid, credentials.clientsecret);
  const verifier = createXsuaaTokenVerifier(credentials);

  const provider = new XsuaaProxyOAuthProvider(credentials, verifier, clientStore);

  logger.info('XSUAA OAuth provider created', {
    xsappname: credentials.xsappname,
    authorizationUrl: `${credentials.url}/oauth/authorize`,
    appUrl,
  });

  return { provider, clientStore };
}
