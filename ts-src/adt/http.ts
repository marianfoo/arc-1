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
 *    (fr0ster uses AsyncLocalStorage for this — we use a simpler approach
 *    with an isolated axios instance per session.)
 *
 * 4. sap-client and sap-language are added to every request as query params.
 *    This is an SAP convention, not ADT-specific.
 */

import { Agent as HttpAgent } from 'node:http';
import { Agent as HttpsAgent } from 'node:https';
import axios, { type AxiosInstance, type AxiosRequestConfig, type AxiosResponse } from 'axios';
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
  private axios: AxiosInstance;
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

  constructor(config: AdtHttpConfig) {
    this.config = config;

    const axiosConfig: AxiosRequestConfig = {
      baseURL: config.baseUrl,
      // SAP ADT can be slow — 60s timeout
      timeout: 60000,
      // Don't throw on non-2xx (we handle errors ourselves)
      validateStatus: () => true,
      headers: {
        Accept: '*/*',
      },
    };

    // Basic auth
    if (config.username && config.password) {
      axiosConfig.auth = {
        username: config.username,
        password: config.password,
      };
    }

    // Skip TLS verification (for self-signed SAP certs)
    if (config.insecure) {
      axiosConfig.httpsAgent = new HttpsAgent({ rejectUnauthorized: false });
    }

    // BTP Connectivity proxy (Cloud Connector)
    // Routes requests through the BTP connectivity service to reach on-premise SAP.
    // The Proxy-Authorization header is injected per-request in the request() method.
    if (config.btpProxy) {
      axiosConfig.proxy = {
        host: config.btpProxy.host,
        port: config.btpProxy.port,
        protocol: config.btpProxy.protocol,
      };
      // Need an HTTP agent for the proxy connection (not HTTPS)
      axiosConfig.httpAgent = new HttpAgent({ keepAlive: true });
    }

    this.axios = axios.create(axiosConfig);
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
   * Creates a new axios instance with stateful session header,
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

    // BTP Connectivity proxy: inject Proxy-Authorization JWT for Cloud Connector tunnel
    if (this.config.btpProxy) {
      if (this.config.ppProxyAuth) {
        // PP Option 1 (not currently used — kept for future compatibility):
        // The jwt-bearer exchanged token replaces the regular proxy token.
        headers['Proxy-Authorization'] = this.config.ppProxyAuth;
      } else {
        // Regular proxy auth — used for both non-PP and PP Option 2.
        // For PP Option 2, this is the standard connectivity service token;
        // the user identity is carried separately in SAP-Connectivity-Authentication.
        const proxyToken = await this.config.btpProxy.getProxyToken();
        headers['Proxy-Authorization'] = `Bearer ${proxyToken}`;
      }
    }

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

    try {
      const response = await this.axios.request({
        method,
        url,
        data: body,
        headers,
      });

      // Persist any Set-Cookie headers from the response
      this.storeCookies(response);

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
        const retryResponse = await this.axios.request({
          method,
          url,
          data: body,
          headers,
        });
        this.storeCookies(retryResponse);
        const result = this.handleResponse(retryResponse, path);

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

      // Store CSRF token from response
      const responseToken = response.headers['x-csrf-token'];
      if (responseToken && responseToken !== 'Required') {
        this.csrfToken = responseToken;
      }

      const result = this.handleResponse(response, path);

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
      }

      if (axios.isAxiosError(err)) {
        throw new AdtNetworkError(err.message, err);
      }
      throw err;
    }
  }

  /** Handle response: throw on error status, return normalized response */
  private handleResponse(response: AxiosResponse, path: string): AdtResponse {
    const body = typeof response.data === 'string' ? response.data : String(response.data ?? '');

    if (response.status >= 400) {
      throw new AdtApiError(body.slice(0, 500), response.status, path, body);
    }

    // Flatten headers to Record<string, string>
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(response.headers)) {
      if (typeof value === 'string') {
        headers[key] = value;
      }
    }

    return {
      statusCode: response.status,
      headers,
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
      const response = await this.axios.request({
        method: 'HEAD',
        url,
        headers,
      });

      // Store cookies from CSRF response — critical for session correlation
      this.storeCookies(response);

      const token = response.headers['x-csrf-token'];
      if (!token || token === 'Required') {
        if (response.status === 401) {
          throw new AdtApiError(
            'Authentication failed (401): check username/password',
            401,
            '/sap/bc/adt/core/discovery',
          );
        }
        if (response.status === 403) {
          throw new AdtApiError('Access forbidden (403): check user authorizations', 403, '/sap/bc/adt/core/discovery');
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
      if (axios.isAxiosError(err)) {
        throw new AdtNetworkError(`CSRF token fetch failed: ${err.message}`, err);
      }
      throw err;
    }
  }

  /**
   * Extract and store cookies from a response's Set-Cookie headers.
   * Only stores the name=value part; ignores path, domain, expiry
   * since all requests go to the same SAP host.
   */
  private storeCookies(response: AxiosResponse): void {
    const setCookieHeaders = response.headers['set-cookie'];
    if (!setCookieHeaders || !Array.isArray(setCookieHeaders)) return;

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
}

/** HTTP methods that modify server state and require CSRF token */
function isModifyingMethod(method: string): boolean {
  return ['POST', 'PUT', 'DELETE', 'PATCH'].includes(method.toUpperCase());
}
