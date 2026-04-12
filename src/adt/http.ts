/**
 * ADT HTTP Transport for ARC-1.
 *
 * Handles all HTTP communication with SAP ADT REST API:
 * - CSRF token lifecycle (fetch, cache, refresh on 403)
 * - Cookie-based and Basic auth
 * - Stateful sessions (lock → modify → unlock must share session)
 * - Automatic retry on session expiry
 *
 * Design decisions:
 *
 * 1. CSRF token fetch uses HEAD /sap/bc/adt/core/discovery with "X-CSRF-Token: fetch".
 *    HEAD is ~5s vs ~56s for GET on slow systems (learned from Go version benchmarks).
 *
 * 2. Modifying requests (POST/PUT/DELETE/PATCH) auto-include CSRF token.
 *    On 403, token is refreshed and request is retried once.
 *    (Pattern from both abap-adt-api and fr0ster implementations.)
 *
 * 3. Stateful sessions use "X-sap-adt-sessiontype: stateful" header.
 *    Lock/modify/unlock must use the same session cookies.
 *    withStatefulSession() ensures session isolation.
 *
 * 4. sap-client and sap-language are added to every request as query params.
 *    This is an SAP convention, not ADT-specific.
 *
 * 5. Uses native fetch() with undici dispatchers for proxy and TLS configuration.
 *    No external HTTP dependencies — undici ships with Node.js 22+.
 */

import { Agent, Client, type Dispatcher, fetch as undiciFetch } from 'undici';
import { logger } from '../server/logger.js';
import type { BTPProxyConfig } from './btp.js';
import { AdtApiError, AdtNetworkError } from './errors.js';

/** Session type for ADT requests */
export type SessionType = 'stateful' | 'stateless' | undefined;

/** Configuration for the ADT HTTP client */
export interface AdtHttpConfig {
  baseUrl: string;
  username?: string;
  password?: string;
  client?: string;
  language?: string;
  insecure?: boolean;
  cookies?: Record<string, string>;
  sessionType?: SessionType;
  /** BTP Connectivity proxy (Cloud Connector) */
  btpProxy?: BTPProxyConfig;
  /**
   * Per-user SAP-Connectivity-Authentication header value.
   * Set when using BTP Cloud Connector principal propagation.
   * Contains a SAML assertion with the user's identity.
   * When set, this header is sent on EVERY request to the connectivity proxy,
   * which forwards it to the Cloud Connector for user mapping.
   */
  sapConnectivityAuth?: string;
  /** PP Option 1: jwt-bearer exchanged token replacing Proxy-Authorization */
  ppProxyAuth?: string;
  /**
   * Bearer token provider for BTP ABAP Environment (OAuth 2.0).
   * When set, replaces Basic Auth with `Authorization: Bearer <token>`.
   * The function handles token lifecycle (caching, refresh, re-login).
   * Used for direct BTP ABAP connections via service key.
   */
  bearerTokenProvider?: () => Promise<string>;
}

/** Response from an ADT HTTP request */
export interface AdtResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

/**
 * ADT HTTP Client — handles CSRF tokens, sessions, and authentication.
 *
 * Not a generic HTTP client: it's purpose-built for SAP ADT REST API conventions.
 */
export class AdtHttpClient {
  private csrfToken = '';
  private dispatcher: Dispatcher | undefined;
  private config: AdtHttpConfig;
  /**
   * Cookie jar — stores Set-Cookie headers from responses and sends them back.
   *
   * SAP ties CSRF tokens to session cookies (SAP_SESSIONID_*).
   * Without cookie persistence, CSRF-protected requests (POST/PUT/DELETE) fail with 403.
   * This was the root cause of integration test failures: token was fetched via HEAD,
   * but the subsequent POST didn't include the session cookie, so SAP rejected it.
   *
   * Design: simple Map<name, value> — we don't need full cookie jar semantics
   * (domain, path, expiry) because all requests go to the same SAP host.
   */
  private cookieJar: Map<string, string> = new Map();
  /** Guard to prevent infinite retry loops for DB connection errors */
  private dbRetryInProgress = false;
  constructor(config: AdtHttpConfig) {
    this.config = config;

    // Set up undici dispatcher for TLS configuration (non-proxy mode only).
    // Proxy requests use a dedicated Client connected to the connectivity proxy
    // (see doProxyRequest()) — undici 8.x ProxyAgent always uses CONNECT tunneling,
    // which BTP's connectivity proxy doesn't support (HTTP 405).
    if (!config.btpProxy && config.insecure) {
      this.dispatcher = new Agent({ connect: { rejectUnauthorized: false } });
    }
  }

  /** GET request */
  async get(path: string, headers?: Record<string, string>): Promise<AdtResponse> {
    return this.request('GET', path, undefined, undefined, headers);
  }

  /** POST request (includes CSRF token) */
  async post(
    path: string,
    body?: string,
    contentType?: string,
    headers?: Record<string, string>,
  ): Promise<AdtResponse> {
    return this.request('POST', path, body, contentType, headers);
  }

  /** PUT request (includes CSRF token) */
  async put(path: string, body: string, contentType?: string, headers?: Record<string, string>): Promise<AdtResponse> {
    return this.request('PUT', path, body, contentType, headers);
  }

  /** DELETE request (includes CSRF token) */
  async delete(path: string, headers?: Record<string, string>): Promise<AdtResponse> {
    return this.request('DELETE', path, undefined, undefined, headers);
  }

  /**
   * Execute a function within an isolated stateful session.
   * Ensures lock/modify/unlock share the same SAP session cookies.
   *
   * Creates a new client instance with stateful session header,
   * shares CSRF token with the main client.
   */
  async withStatefulSession<T>(fn: (client: AdtHttpClient) => Promise<T>): Promise<T> {
    const sessionConfig: AdtHttpConfig = {
      ...this.config,
      sessionType: 'stateful',
    };
    const sessionClient = new AdtHttpClient(sessionConfig);
    // Share CSRF token and cookies so we don't need to re-fetch
    sessionClient.csrfToken = this.csrfToken;
    sessionClient.cookieJar = new Map(this.cookieJar);
    return fn(sessionClient);
  }

  /** Core request method */
  private async request(
    method: string,
    path: string,
    body?: string,
    contentType?: string,
    extraHeaders?: Record<string, string>,
  ): Promise<AdtResponse> {
    // Auto-fetch CSRF token for modifying requests
    if (isModifyingMethod(method) && !this.csrfToken) {
      await this.fetchCsrfToken();
    }

    const headers: Record<string, string> = {
      Accept: '*/*',
      ...extraHeaders,
    };

    if (isModifyingMethod(method)) {
      headers['X-CSRF-Token'] = this.csrfToken;
    }

    if (this.config.sessionType === 'stateful') {
      headers['X-sap-adt-sessiontype'] = 'stateful';
    }

    if (contentType) {
      headers['Content-Type'] = contentType;
    }

    // Auth: Bearer token (BTP ABAP) or Basic Auth (on-premise)
    this.applyAuthHeader(headers);
    if (this.config.bearerTokenProvider) {
      const token = await this.config.bearerTokenProvider();
      headers.Authorization = `Bearer ${token}`;
    }

    // Build cookie header from: config cookies + cookie jar (jar takes precedence)
    const cookieParts: string[] = [];
    if (this.config.cookies) {
      for (const [k, v] of Object.entries(this.config.cookies)) {
        cookieParts.push(`${k}=${v}`);
      }
    }
    for (const [k, v] of this.cookieJar) {
      cookieParts.push(`${k}=${v}`);
    }
    if (cookieParts.length > 0) {
      headers.Cookie = cookieParts.join('; ');
    }

    // BTP Connectivity proxy: Proxy-Authorization is handled in doProxyRequest().
    // Not set here because the proxy uses standard HTTP proxy protocol (not CONNECT).

    // Principal Propagation via SAP-Connectivity-Authentication header (Option 2).
    // Contains the ORIGINAL user JWT (not exchanged). The Cloud Connector reads
    // this header, extracts the user identity (email), generates a short-lived
    // X.509 certificate (CN=<email>), and injects it as SSL_CLIENT_CERT when
    // connecting to SAP's HTTPS port. SAP CERTRULE maps the cert to a SAP user.
    // See: https://help.sap.com/docs/connectivity/sap-btp-connectivity-cf/configure-principal-propagation-via-user-exchange-token
    if (this.config.sapConnectivityAuth && !this.config.ppProxyAuth) {
      headers['SAP-Connectivity-Authentication'] = this.config.sapConnectivityAuth;
    }

    const url = this.buildUrl(path);
    const httpStart = Date.now();

    // Per-request guards to prevent infinite retry loops
    let negotiationRetried = false;
    let authRetried = false;

    try {
      let response = await this.doFetch(url, method, headers, body);
      let responseBody = await response.text();

      // Persist any Set-Cookie headers from the response
      this.storeCookies(response);

      // Detect broken DB connection on the assigned work process.
      // SAP's ICM routes all requests with the same session cookie to the same
      // work process. If that WP has a broken HANA connection, every request fails
      // with "database connection is not open". Fix: clear the session to force
      // ICM to assign a different work process on retry.
      if (this.isDbConnectionError(responseBody) && !this.dbRetryInProgress) {
        this.dbRetryInProgress = true;
        try {
          logger.emitAudit({
            timestamp: new Date().toISOString(),
            level: 'warn',
            event: 'http_request',
            method,
            path,
            statusCode: response.status,
            durationMs: Date.now() - httpStart,
            errorBody: 'DB connection broken — resetting session and retrying',
          });

          // Clear session to get a different work process
          this.resetSession();

          // Re-fetch CSRF token (needed for modifying requests, harmless for reads)
          if (isModifyingMethod(method)) {
            await this.fetchCsrfToken();
            headers['X-CSRF-Token'] = this.csrfToken;
          }

          // Rebuild cookie header from fresh jar
          const freshCookieParts: string[] = [];
          for (const [k, v] of this.cookieJar) {
            freshCookieParts.push(`${k}=${v}`);
          }
          if (freshCookieParts.length > 0) {
            headers.Cookie = freshCookieParts.join('; ');
          } else {
            delete headers.Cookie;
          }

          const retryResp = await this.doFetch(url, method, headers, body);
          const retryBody = await retryResp.text();
          this.storeCookies(retryResp);
          const retryResult = this.handleResponse(retryResp.status, retryResp.headers, retryBody, path);

          logger.emitAudit({
            timestamp: new Date().toISOString(),
            level: 'info',
            event: 'http_request',
            method,
            path,
            statusCode: retryResp.status,
            durationMs: Date.now() - httpStart,
            errorBody: 'DB connection retry succeeded',
          });

          return retryResult;
        } finally {
          this.dbRetryInProgress = false;
        }
      }

      // Handle 401 session timeout — reset session and retry once.
      // Uses per-request guard (not instance-level) so concurrent requests each get their own retry.
      // On success, reassigns response/responseBody and falls through to downstream handlers
      // (403 CSRF, 406/415 negotiation) so combined-failure recovery works.
      if (response.status === 401 && !authRetried) {
        authRetried = true;

        logger.emitAudit({
          timestamp: new Date().toISOString(),
          level: 'warn',
          event: 'http_request',
          method,
          path,
          statusCode: 401,
          durationMs: Date.now() - httpStart,
          errorBody: '401 session expired — resetting session and retrying',
        });

        // Clear session to force fresh authentication
        this.resetSession();

        // Re-apply auth credentials
        this.applyAuthHeader(headers);
        if (this.config.bearerTokenProvider) {
          const token = await this.config.bearerTokenProvider();
          headers.Authorization = `Bearer ${token}`;
        }

        // Re-fetch CSRF token for modifying requests
        if (isModifyingMethod(method)) {
          await this.fetchCsrfToken();
          headers['X-CSRF-Token'] = this.csrfToken;
        }

        // Rebuild cookie header from config cookies + fresh jar
        const freshCookieParts: string[] = [];
        if (this.config.cookies) {
          for (const [k, v] of Object.entries(this.config.cookies)) {
            freshCookieParts.push(`${k}=${v}`);
          }
        }
        for (const [k, v] of this.cookieJar) {
          freshCookieParts.push(`${k}=${v}`);
        }
        if (freshCookieParts.length > 0) {
          headers.Cookie = freshCookieParts.join('; ');
        } else {
          delete headers.Cookie;
        }

        response = await this.doFetch(url, method, headers, body);
        responseBody = await response.text();
        this.storeCookies(response);

        logger.emitAudit({
          timestamp: new Date().toISOString(),
          level: 'info',
          event: 'http_request',
          method,
          path,
          statusCode: response.status,
          durationMs: Date.now() - httpStart,
          errorBody: '401 session retry completed',
        });
        // Fall through to downstream handlers (403/406/415/normal)
      }

      // Handle CSRF token refresh on 403 (modifying requests only)
      if (response.status === 403 && isModifyingMethod(method)) {
        await this.fetchCsrfToken();
        headers['X-CSRF-Token'] = this.csrfToken;
        // Update cookie header after CSRF fetch may have set new cookies
        const updatedCookieParts: string[] = [];
        for (const [k, v] of this.cookieJar) {
          updatedCookieParts.push(`${k}=${v}`);
        }
        if (updatedCookieParts.length > 0) {
          headers.Cookie = updatedCookieParts.join('; ');
        }
        const retryResponse = await this.doFetch(url, method, headers, body);
        const retryBody = await retryResponse.text();
        this.storeCookies(retryResponse);
        const result = this.handleResponse(retryResponse.status, retryResponse.headers, retryBody, path);

        logger.emitAudit({
          timestamp: new Date().toISOString(),
          level: 'info',
          event: 'http_request',
          method,
          path,
          statusCode: retryResponse.status,
          durationMs: Date.now() - httpStart,
        });

        return result;
      }

      // Handle 406/415 content negotiation failure — retry once with fallback headers
      if ((response.status === 406 || response.status === 415) && !negotiationRetried) {
        negotiationRetried = true;
        const fallbackHeaders = { ...headers };

        let headersChanged = false;

        if (response.status === 406) {
          // Server rejected our Accept header — try fallback
          const inferred = inferAcceptFromError(responseBody);
          if (inferred && inferred !== fallbackHeaders.Accept) {
            fallbackHeaders.Accept = inferred;
            headersChanged = true;
          } else if (
            fallbackHeaders.Accept &&
            fallbackHeaders.Accept !== '*/*' &&
            fallbackHeaders.Accept !== 'application/xml'
          ) {
            // Fall back to generic XML first
            fallbackHeaders.Accept = 'application/xml';
            headersChanged = true;
          } else if (fallbackHeaders.Accept === 'application/xml') {
            // application/xml was already rejected — fall back to wildcard
            fallbackHeaders.Accept = '*/*';
            headersChanged = true;
          }
          // If Accept is already */* and no inferred type, no useful fallback — skip retry
        } else {
          // 415: Server rejected our Content-Type — try application/xml fallback
          if (contentType && contentType !== 'application/xml') {
            fallbackHeaders['Content-Type'] = 'application/xml';
            headersChanged = true;
          }
          // If Content-Type is already application/xml or absent, no useful fallback — skip retry
        }

        if (headersChanged) {
          logger.emitAudit({
            timestamp: new Date().toISOString(),
            level: 'warn',
            event: 'http_request',
            method,
            path,
            statusCode: response.status,
            durationMs: Date.now() - httpStart,
            errorBody: `Content negotiation ${response.status} — retrying with fallback headers`,
          });

          const retryResp = await this.doFetch(url, method, fallbackHeaders, body);
          const retryBody = await retryResp.text();
          this.storeCookies(retryResp);

          // Store CSRF token from retry response
          const retryToken = retryResp.headers.get('x-csrf-token');
          if (retryToken && retryToken !== 'Required') {
            this.csrfToken = retryToken;
          }

          const retryResult = this.handleResponse(retryResp.status, retryResp.headers, retryBody, path);

          logger.emitAudit({
            timestamp: new Date().toISOString(),
            level: 'info',
            event: 'http_request',
            method,
            path,
            statusCode: retryResp.status,
            durationMs: Date.now() - httpStart,
            errorBody: `Content negotiation retry succeeded (${response.status} → ${retryResp.status})`,
          });

          return retryResult;
        }
        // No meaningful header change — fall through to normal error handling
      }

      // Store CSRF token from response
      const responseToken = response.headers.get('x-csrf-token');
      if (responseToken && responseToken !== 'Required') {
        this.csrfToken = responseToken;
      }

      const result = this.handleResponse(response.status, response.headers, responseBody, path);

      logger.emitAudit({
        timestamp: new Date().toISOString(),
        level: 'debug',
        event: 'http_request',
        method,
        path,
        statusCode: response.status,
        durationMs: Date.now() - httpStart,
      });

      return result;
    } catch (err) {
      // Log failed HTTP requests
      const durationMs = Date.now() - httpStart;
      if (err instanceof AdtApiError) {
        logger.emitAudit({
          timestamp: new Date().toISOString(),
          level: 'warn',
          event: 'http_request',
          method,
          path,
          statusCode: err.statusCode,
          durationMs,
          errorBody: err.responseBody?.slice(0, 200),
        });
        throw err;
      }

      const message = err instanceof Error ? err.message : String(err);
      throw new AdtNetworkError(message, err instanceof Error ? err : undefined);
    }
  }

  /** Handle response: throw on error status, return normalized response */
  private handleResponse(status: number, headers: Headers, body: string, path: string): AdtResponse {
    if (status >= 400) {
      throw new AdtApiError(body.slice(0, 500), status, path, body);
    }

    // Flatten headers to Record<string, string>
    const flatHeaders: Record<string, string> = {};
    for (const [key, value] of headers.entries()) {
      flatHeaders[key] = value;
    }

    return {
      statusCode: status,
      headers: flatHeaders,
      body,
    };
  }

  /**
   * Fetch CSRF token from SAP.
   * Uses HEAD /sap/bc/adt/core/discovery for speed.
   */
  async fetchCsrfToken(): Promise<void> {
    const url = this.buildUrl('/sap/bc/adt/core/discovery');
    const headers: Record<string, string> = {
      'X-CSRF-Token': 'fetch',
      Accept: '*/*',
    };

    if (this.config.sessionType === 'stateful') {
      headers['X-sap-adt-sessiontype'] = 'stateful';
    }

    // Auth: Bearer token (BTP ABAP) or Basic Auth (on-premise)
    this.applyAuthHeader(headers);
    if (this.config.bearerTokenProvider) {
      const token = await this.config.bearerTokenProvider();
      headers.Authorization = `Bearer ${token}`;
    }

    // Include existing cookies (config + jar) so session is maintained
    const cookieParts: string[] = [];
    if (this.config.cookies) {
      for (const [k, v] of Object.entries(this.config.cookies)) {
        cookieParts.push(`${k}=${v}`);
      }
    }
    for (const [k, v] of this.cookieJar) {
      cookieParts.push(`${k}=${v}`);
    }
    if (cookieParts.length > 0) {
      headers.Cookie = cookieParts.join('; ');
    }

    try {
      const response = await this.doFetch(url, 'HEAD', headers);

      // Store cookies from CSRF response — critical for session correlation
      this.storeCookies(response);

      const token = response.headers.get('x-csrf-token');
      if (!token || token === 'Required') {
        if (response.status === 401) {
          throw new AdtApiError(
            `Authentication failed (401) using sap-client=${this.config.client ?? '100'}. Check SAP_CLIENT, SAP_USER, and SAP_PASSWORD.`,
            401,
            '/sap/bc/adt/core/discovery',
          );
        }
        if (response.status === 403) {
          throw new AdtApiError(
            `Access forbidden (403) using sap-client=${this.config.client ?? '100'}. Check user authorizations.`,
            403,
            '/sap/bc/adt/core/discovery',
          );
        }
        throw new AdtApiError(
          `No CSRF token in response (HTTP ${response.status})`,
          response.status,
          '/sap/bc/adt/core/discovery',
        );
      }

      this.csrfToken = token;
    } catch (err) {
      if (err instanceof AdtApiError) throw err;
      const message = err instanceof Error ? err.message : String(err);
      throw new AdtNetworkError(`CSRF token fetch failed: ${message}`, err instanceof Error ? err : undefined);
    }
  }

  /**
   * Detect "database connection is not open" error from SAP.
   * This happens when a work process loses its HANA DB connection.
   * SAP returns a 500 with this message in the body (plain text or XML).
   */
  private isDbConnectionError(body: string): boolean {
    return body.toLowerCase().includes('database connection is not open');
  }

  /**
   * Reset HTTP session state to force SAP's ICM to assign a new work process.
   * Clears session cookies and CSRF token so the next request gets a fresh session.
   */
  private resetSession(): void {
    this.cookieJar.clear();
    this.csrfToken = '';
  }

  private storeCookies(response: Response): void {
    const setCookieHeaders = response.headers.getSetCookie();
    if (!setCookieHeaders || setCookieHeaders.length === 0) return;

    for (const cookie of setCookieHeaders) {
      // Set-Cookie: name=value; Path=/; HttpOnly; ...
      const nameValue = cookie.split(';')[0];
      if (!nameValue) continue;
      const eqIdx = nameValue.indexOf('=');
      if (eqIdx <= 0) continue;
      const name = nameValue.substring(0, eqIdx).trim();
      const value = nameValue.substring(eqIdx + 1).trim();
      this.cookieJar.set(name, value);
    }
  }

  /** Build full URL with sap-client and sap-language query params */
  private buildUrl(path: string): string {
    const base = this.config.baseUrl.replace(/\/$/, '');
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const url = new URL(base + normalizedPath);

    if (this.config.client) {
      url.searchParams.set('sap-client', this.config.client);
    }
    if (this.config.language) {
      url.searchParams.set('sap-language', this.config.language);
    }

    return url.toString();
  }

  /** Apply Basic Auth header if username/password are configured (and no bearer provider) */
  private applyAuthHeader(headers: Record<string, string>): void {
    if (this.config.username && this.config.password && !this.config.bearerTokenProvider) {
      headers.Authorization = `Basic ${Buffer.from(`${this.config.username}:${this.config.password}`).toString('base64')}`;
    }
  }

  /**
   * Execute a fetch request with the configured dispatcher and timeout.
   *
   * For BTP Connectivity proxy: uses doProxyRequest() which sends standard
   * HTTP proxy requests via undici.Client. This is necessary because undici 8.x
   * ProxyAgent always uses HTTP CONNECT tunneling, but the BTP connectivity
   * proxy only supports standard HTTP proxy protocol (returns 405 on CONNECT).
   *
   * For non-proxy: uses undici's own fetch rather than the global fetch because
   * Node 22's built-in fetch embeds an older undici version whose dispatcher
   * interface is incompatible with npm undici@8 Agent/ProxyAgent instances.
   */
  private async doFetch(
    url: string,
    method: string,
    headers: Record<string, string>,
    body?: string,
  ): Promise<Response> {
    // BTP Connectivity proxy: use standard HTTP proxy protocol (not CONNECT)
    if (this.config.btpProxy) {
      return this.doProxyRequest(url, method, headers, body);
    }

    return undiciFetch(url, {
      method,
      headers,
      body,
      signal: AbortSignal.timeout(120_000),
      ...(this.dispatcher ? { dispatcher: this.dispatcher } : {}),
    }) as Promise<Response>;
  }

  /**
   * Execute an HTTP request through the BTP connectivity proxy using standard
   * HTTP proxy protocol (RFC 7230).
   *
   * Standard HTTP proxying sends the full URL as the request path:
   *   GET http://target:port/path HTTP/1.1
   *   Host: target:port
   *   Proxy-Authorization: Bearer <token>
   *
   * This is different from CONNECT tunneling (which undici 8.x ProxyAgent uses).
   * The BTP connectivity proxy (Cloud Connector) only supports standard proxying
   * for HTTP targets, returning 405 Method Not Allowed for CONNECT requests.
   *
   * Uses undici.Client connected to the proxy host. The Client sends requests
   * to the proxy, and by setting the `path` to the full target URL, the proxy
   * forwards it to the Cloud Connector → on-premise SAP system.
   */
  private async doProxyRequest(
    url: string,
    method: string,
    headers: Record<string, string>,
    body?: string,
  ): Promise<Response> {
    const proxy = this.config.btpProxy!;
    const proxyOrigin = `${proxy.protocol}://${proxy.host}:${proxy.port}`;

    // Get proxy auth token
    let proxyAuth: string;
    if (this.config.ppProxyAuth) {
      proxyAuth = this.config.ppProxyAuth;
    } else {
      const proxyToken = await proxy.getProxyToken();
      proxyAuth = `Bearer ${proxyToken}`;
    }

    // Extract host from target URL for the Host header
    const targetUrl = new URL(url);
    const hostHeader = targetUrl.port ? `${targetUrl.hostname}:${targetUrl.port}` : targetUrl.hostname;

    // Merge proxy headers with request headers
    const proxyHeaders: Record<string, string> = {
      ...headers,
      Host: hostHeader,
      'Proxy-Authorization': proxyAuth,
    };

    const client = new Client(proxyOrigin);
    try {
      const resp = await client.request({
        method: method as Dispatcher.HttpMethod,
        // Full URL as path — standard HTTP proxy protocol
        path: url,
        headers: proxyHeaders,
        body: body ?? undefined,
        signal: AbortSignal.timeout(120_000),
      });

      // Convert undici response to a Response-like object that matches
      // what fetch() returns, so the rest of AdtHttpClient works unchanged.
      const responseBody = await resp.body.text();
      const responseHeaders = new Headers();
      for (const [key, value] of Object.entries(resp.headers)) {
        if (value !== undefined) {
          const vals = Array.isArray(value) ? value : [String(value)];
          for (const v of vals) {
            responseHeaders.append(key, v);
          }
        }
      }

      return new Response(responseBody, {
        status: resp.statusCode,
        headers: responseHeaders,
      });
    } finally {
      await client.close();
    }
  }
}

/** HTTP methods that modify server state and require CSRF token */
function isModifyingMethod(method: string): boolean {
  return ['POST', 'PUT', 'DELETE', 'PATCH'].includes(method.toUpperCase());
}

/**
 * Try to extract an accepted media type from a SAP 406 error response body.
 *
 * SAP sometimes includes the expected media type in error text, e.g.:
 *   "...expected application/vnd.sap.adt.transportorganizertree.v1+xml..."
 * Returns the extracted media type or undefined if none found.
 */
function inferAcceptFromError(body: string): string | undefined {
  const match = body.match(/application\/[\w.+-]+(?:\/[\w.+-]+)?/);
  return match?.[0];
}
