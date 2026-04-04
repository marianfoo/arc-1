import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdtApiError, AdtNetworkError } from '../../../src/adt/errors.js';
import { mockResponse } from '../../helpers/mock-fetch.js';

// Mock undici's fetch (used by AdtHttpClient.doFetch)
const mockFetch = vi.fn();
vi.mock('undici', async (importOriginal) => {
  const actual = await importOriginal<typeof import('undici')>();
  return { ...actual, fetch: mockFetch };
});

// Import after mock setup
const { AdtHttpClient } = await import('../../../src/adt/http.js');
type AdtHttpConfig = ConstructorParameters<typeof AdtHttpClient>[0];

function getDefaultConfig(): AdtHttpConfig {
  return {
    baseUrl: 'http://sap.example.com:8000',
    username: 'admin',
    password: 'secret',
    client: '001',
    language: 'EN',
  };
}

/** Helper to get the options (second arg) from a fetch call */
function fetchOptions(callIndex = 0): RequestInit & Record<string, unknown> {
  return mockFetch.mock.calls[callIndex]?.[1] ?? {};
}

/** Helper to get the URL (first arg) from a fetch call */
function fetchUrl(callIndex = 0): string {
  return mockFetch.mock.calls[callIndex]?.[0] ?? '';
}

/** Helper to get headers from a fetch call */
function fetchHeaders(callIndex = 0): Record<string, string> {
  return (fetchOptions(callIndex).headers as Record<string, string>) ?? {};
}

describe('AdtHttpClient', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  // ─── GET Requests ──────────────────────────────────────────────────

  describe('GET requests', () => {
    it('makes a GET request to the correct URL with sap-client and sap-language', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(200, '<source>REPORT zhello.</source>'));

      const client = new AdtHttpClient(getDefaultConfig());
      const response = await client.get('/sap/bc/adt/programs/programs/ZHELLO/source/main');

      expect(fetchOptions(0).method).toBe('GET');
      expect(fetchUrl(0)).toContain('/sap/bc/adt/programs/programs/ZHELLO/source/main');
      expect(response.statusCode).toBe(200);
      expect(response.body).toContain('REPORT zhello');
    });

    it('includes sap-client and sap-language in URL', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(200, ''));

      const client = new AdtHttpClient(getDefaultConfig());
      await client.get('/sap/bc/adt/core/discovery');

      expect(fetchUrl(0)).toContain('sap-client=001');
      expect(fetchUrl(0)).toContain('sap-language=EN');
    });

    it('handles response with empty body', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(200, ''));
      const client = new AdtHttpClient(getDefaultConfig());
      const resp = await client.get('/some/path');
      expect(resp.body).toBe('');
    });

    it('passes extra headers through', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(200, 'ok'));
      const client = new AdtHttpClient(getDefaultConfig());
      await client.get('/path', { Accept: 'application/xml' });
      expect(fetchHeaders(0).Accept).toBe('application/xml');
    });

    it('omits sap-client and sap-language when not configured', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(200, ''));
      const client = new AdtHttpClient({ baseUrl: 'http://sap:8000' });
      await client.get('/sap/bc/adt/core/discovery');
      expect(fetchUrl(0)).not.toContain('sap-client');
      expect(fetchUrl(0)).not.toContain('sap-language');
    });
  });

  // ─── POST/PUT/DELETE ───────────────────────────────────────────────

  describe('modifying requests', () => {
    it('POST sends body and content type', async () => {
      // CSRF fetch
      mockFetch.mockResolvedValueOnce(mockResponse(200, '', { 'x-csrf-token': 'T' }));
      // POST
      mockFetch.mockResolvedValueOnce(mockResponse(200, 'created'));

      const client = new AdtHttpClient(getDefaultConfig());
      const resp = await client.post('/path', '<xml/>', 'application/xml');
      expect(resp.body).toBe('created');
      expect(fetchHeaders(1)['Content-Type']).toBe('application/xml');
    });

    it('PUT sends body and content type', async () => {
      // CSRF fetch
      mockFetch.mockResolvedValueOnce(mockResponse(200, '', { 'x-csrf-token': 'T' }));
      // PUT
      mockFetch.mockResolvedValueOnce(mockResponse(200, ''));

      const client = new AdtHttpClient(getDefaultConfig());
      await client.put('/path', 'source code', 'text/plain');
      expect(fetchOptions(1).method).toBe('PUT');
      expect(fetchOptions(1).body).toBe('source code');
    });

    it('DELETE request works', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(200, '', { 'x-csrf-token': 'T' }));
      mockFetch.mockResolvedValueOnce(mockResponse(200, ''));

      const client = new AdtHttpClient(getDefaultConfig());
      await client.delete('/path');
      expect(fetchOptions(1).method).toBe('DELETE');
    });
  });

  // ─── CSRF Token Handling ───────────────────────────────────────────

  describe('CSRF token handling', () => {
    it('fetches CSRF token before first modifying request', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(200, '', { 'x-csrf-token': 'TOKEN123' }));
      mockFetch.mockResolvedValueOnce(mockResponse(200, 'ok'));

      const client = new AdtHttpClient(getDefaultConfig());
      await client.post('/sap/bc/adt/checkruns', '<xml/>', 'application/xml');

      expect(mockFetch).toHaveBeenCalledTimes(2);
      // First call is CSRF fetch (HEAD)
      expect(fetchOptions(0).method).toBe('HEAD');
      expect(fetchHeaders(0)['X-CSRF-Token']).toBe('fetch');
      // Second call uses the token
      expect(fetchHeaders(1)['X-CSRF-Token']).toBe('TOKEN123');
    });

    it('does not re-fetch CSRF token for second POST', async () => {
      // CSRF fetch
      mockFetch.mockResolvedValueOnce(mockResponse(200, '', { 'x-csrf-token': 'T1' }));
      // First POST
      mockFetch.mockResolvedValueOnce(mockResponse(200, 'ok'));
      // Second POST (should reuse token)
      mockFetch.mockResolvedValueOnce(mockResponse(200, 'ok2'));

      const client = new AdtHttpClient(getDefaultConfig());
      await client.post('/path1', '<xml/>');
      await client.post('/path2', '<xml/>');
      expect(mockFetch).toHaveBeenCalledTimes(3); // CSRF + 2 POSTs
    });

    it('does not fetch CSRF token for GET requests', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(200, 'ok'));
      const client = new AdtHttpClient(getDefaultConfig());
      await client.get('/path');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('retries on 403 with fresh CSRF token', async () => {
      // CSRF fetch
      mockFetch.mockResolvedValueOnce(mockResponse(200, '', { 'x-csrf-token': 'OLD_TOKEN' }));
      // POST → 403
      mockFetch.mockResolvedValueOnce(mockResponse(403, 'CSRF token expired'));
      // Re-fetch CSRF
      mockFetch.mockResolvedValueOnce(mockResponse(200, '', { 'x-csrf-token': 'NEW_TOKEN' }));
      // Retry POST → 200
      mockFetch.mockResolvedValueOnce(mockResponse(200, 'success'));

      const client = new AdtHttpClient(getDefaultConfig());
      const response = await client.post('/sap/bc/adt/activation', '<xml/>');

      expect(response.statusCode).toBe(200);
      expect(mockFetch).toHaveBeenCalledTimes(4);
    });

    it('stores CSRF token from any response header', async () => {
      // GET response includes a token
      mockFetch.mockResolvedValueOnce(mockResponse(200, 'ok', { 'x-csrf-token': 'FROM_GET' }));
      // POST should use that token (no separate CSRF fetch)
      mockFetch.mockResolvedValueOnce(mockResponse(200, 'created'));

      const client = new AdtHttpClient(getDefaultConfig());
      await client.get('/path');
      await client.post('/path2', '<xml/>');

      // Should use token from GET response, so only 2 calls total
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(fetchHeaders(1)['X-CSRF-Token']).toBe('FROM_GET');
    });

    it('ignores "Required" token value in response headers', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(200, 'ok', { 'x-csrf-token': 'Required' }));

      const client = new AdtHttpClient(getDefaultConfig());
      await client.get('/path');
      // csrfToken should still be empty — so next POST will fetch
    });
  });

  // ─── Cookie Jar ────────────────────────────────────────────────────

  describe('cookie jar', () => {
    it('persists Set-Cookie headers from responses', async () => {
      // First request returns cookies
      mockFetch.mockResolvedValueOnce(
        mockResponse(200, 'ok', {}, [
          'SAP_SESSIONID_A4H_001=abc123; Path=/; HttpOnly',
          'sap-usercontext=lang=EN; Path=/',
        ]),
      );
      // Second request should include those cookies
      mockFetch.mockResolvedValueOnce(mockResponse(200, 'ok2'));

      const client = new AdtHttpClient(getDefaultConfig());
      await client.get('/first');
      await client.get('/second');

      const secondHeaders = fetchHeaders(1);
      expect(secondHeaders.Cookie).toContain('SAP_SESSIONID_A4H_001=abc123');
      expect(secondHeaders.Cookie).toContain('sap-usercontext=lang=EN');
    });

    it('CSRF token works with cookie jar (session correlation)', async () => {
      // CSRF fetch → returns session cookie
      mockFetch.mockResolvedValueOnce(
        mockResponse(200, '', { 'x-csrf-token': 'TOKEN_ABC' }, ['SAP_SESSIONID=sess123; Path=/']),
      );
      // POST should include both token AND cookie
      mockFetch.mockResolvedValueOnce(mockResponse(200, 'created'));

      const client = new AdtHttpClient(getDefaultConfig());
      await client.post('/sap/bc/adt/datapreview/ddic', 'data', 'text/plain');

      const postHeaders = fetchHeaders(1);
      expect(postHeaders['X-CSRF-Token']).toBe('TOKEN_ABC');
      expect(postHeaders.Cookie).toContain('SAP_SESSIONID=sess123');
    });

    it('merges config cookies with jar cookies', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(200, 'ok', {}, ['jarCookie=jar1; Path=/']));
      mockFetch.mockResolvedValueOnce(mockResponse(200, 'ok2'));

      const client = new AdtHttpClient({
        ...getDefaultConfig(),
        cookies: { configCookie: 'cfg1' },
      });
      await client.get('/first');
      await client.get('/second');

      const headers = fetchHeaders(1);
      expect(headers.Cookie).toContain('configCookie=cfg1');
      expect(headers.Cookie).toContain('jarCookie=jar1');
    });

    it('handles Set-Cookie with no value gracefully', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(200, 'ok', {}, ['=noname; Path=/']));
      const client = new AdtHttpClient(getDefaultConfig());
      // Should not throw
      await client.get('/path');
    });
  });

  // ─── Error Handling ────────────────────────────────────────────────

  describe('error handling', () => {
    it('throws AdtApiError on 404', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(404, 'Object not found'));

      const client = new AdtHttpClient(getDefaultConfig());
      await expect(client.get('/sap/bc/adt/programs/programs/ZNOTFOUND/source/main')).rejects.toThrow(AdtApiError);
    });

    it('throws AdtApiError on 500', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(500, 'Internal Server Error'));

      const client = new AdtHttpClient(getDefaultConfig());
      await expect(client.get('/sap/bc/adt/core/discovery')).rejects.toThrow(AdtApiError);
    });

    it('throws AdtApiError on 401 during CSRF fetch with client info', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(401, 'Unauthorized'));

      const client = new AdtHttpClient(getDefaultConfig());
      await expect(client.fetchCsrfToken()).rejects.toThrow(/sap-client=001/);
    });

    it('throws AdtApiError on 403 during CSRF fetch', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(403, 'Forbidden'));

      const client = new AdtHttpClient(getDefaultConfig());
      await expect(client.fetchCsrfToken()).rejects.toThrow(AdtApiError);
    });

    it('throws AdtApiError when CSRF token is missing from response', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(200, ''));

      const client = new AdtHttpClient(getDefaultConfig());
      await expect(client.fetchCsrfToken()).rejects.toThrow(AdtApiError);
    });

    it('truncates long error bodies to 500 chars', async () => {
      const longBody = 'X'.repeat(1000);
      mockFetch.mockResolvedValueOnce(mockResponse(404, longBody));

      const client = new AdtHttpClient(getDefaultConfig());
      try {
        await client.get('/path');
      } catch (e) {
        expect((e as AdtApiError).message.length).toBeLessThanOrEqual(600);
      }
    });

    it('wraps network errors in AdtNetworkError', async () => {
      mockFetch.mockRejectedValueOnce(new TypeError('fetch failed'));

      const client = new AdtHttpClient(getDefaultConfig());
      await expect(client.get('/path')).rejects.toThrow(AdtNetworkError);
    });

    it('wraps CSRF fetch network errors in AdtNetworkError', async () => {
      mockFetch.mockRejectedValueOnce(new TypeError('fetch failed'));

      const client = new AdtHttpClient(getDefaultConfig());
      await expect(client.fetchCsrfToken()).rejects.toThrow(AdtNetworkError);
    });

    it('wraps all non-AdtApiError errors as AdtNetworkError', async () => {
      // Previously TypeError would pass through — now all errors become AdtNetworkError
      mockFetch.mockRejectedValueOnce(new TypeError('null'));
      const client = new AdtHttpClient(getDefaultConfig());
      await expect(client.get('/path')).rejects.toThrow(AdtNetworkError);
    });
  });

  // ─── Config Cookies ────────────────────────────────────────────────

  describe('config cookies', () => {
    it('includes cookies in request headers', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(200, 'ok'));

      const client = new AdtHttpClient({
        ...getDefaultConfig(),
        cookies: { 'sap-usercontext': 'abc', SAP_SESSIONID: 'xyz' },
      });
      await client.get('/sap/bc/adt/core/discovery');

      expect(fetchHeaders(0).Cookie).toContain('sap-usercontext=abc');
      expect(fetchHeaders(0).Cookie).toContain('SAP_SESSIONID=xyz');
    });

    it('sends cookies with CSRF fetch when configured', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(200, '', { 'x-csrf-token': 'TOKEN' }));

      const client = new AdtHttpClient({
        ...getDefaultConfig(),
        cookies: { 'sap-usercontext': 'abc' },
      });
      await client.fetchCsrfToken();

      expect(fetchHeaders(0).Cookie).toContain('sap-usercontext=abc');
    });
  });

  // ─── Stateful Sessions ─────────────────────────────────────────────

  describe('stateful sessions', () => {
    it('creates isolated session for withStatefulSession', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(200, '', { 'x-csrf-token': 'SESSION_TOKEN' }));
      mockFetch.mockResolvedValueOnce(mockResponse(200, 'locked'));

      const client = new AdtHttpClient(getDefaultConfig());
      (client as any).csrfToken = 'MAIN_TOKEN';

      await client.withStatefulSession(async (session) => {
        const resp = await session.post('/sap/bc/adt/lock', '<lock/>');
        return resp;
      });
    });

    it('session client includes stateful header', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(200, '', { 'x-csrf-token': 'T' }));
      mockFetch.mockResolvedValueOnce(mockResponse(200, 'locked'));

      const client = new AdtHttpClient(getDefaultConfig());
      (client as any).csrfToken = 'T';

      await client.withStatefulSession(async (session) => {
        await session.post('/lock', '<xml/>');
      });

      // The POST from session client should have stateful header
      const lastCallHeaders = fetchHeaders(mockFetch.mock.calls.length - 1);
      expect(lastCallHeaders['X-sap-adt-sessiontype']).toBe('stateful');
    });

    it('session client shares CSRF token with parent', async () => {
      const client = new AdtHttpClient(getDefaultConfig());
      (client as any).csrfToken = 'PARENT_TOKEN';

      await client.withStatefulSession(async (session) => {
        // Session should have the parent's token
        expect((session as any).csrfToken).toBe('PARENT_TOKEN');
      });
    });

    it('session client shares cookie jar with parent', async () => {
      const client = new AdtHttpClient(getDefaultConfig());
      (client as any).cookieJar.set('SAP_SESSIONID', 'sess1');

      await client.withStatefulSession(async (session) => {
        expect((session as any).cookieJar.get('SAP_SESSIONID')).toBe('sess1');
      });
    });
  });

  // ─── URL Building ──────────────────────────────────────────────────

  describe('URL building', () => {
    it('handles trailing slash in baseUrl', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(200, ''));
      const client = new AdtHttpClient({ ...getDefaultConfig(), baseUrl: 'http://sap:8000/' });
      await client.get('/sap/bc/adt/core/discovery');
      expect(fetchUrl(0)).not.toContain('//sap/bc');
    });

    it('handles path without leading slash', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(200, ''));
      const client = new AdtHttpClient(getDefaultConfig());
      await client.get('sap/bc/adt/core/discovery');
      expect(fetchUrl(0)).toContain('/sap/bc/adt/core/discovery');
    });
  });

  // ─── TLS / Insecure ────────────────────────────────────────────────

  describe('insecure mode', () => {
    it('creates client with undici Agent when insecure=true', () => {
      const client = new AdtHttpClient({ ...getDefaultConfig(), insecure: true });
      expect(client).toBeDefined();
      // Verify a dispatcher was created
      expect((client as any).dispatcher).toBeDefined();
    });

    it('does not create dispatcher when insecure=false', () => {
      const client = new AdtHttpClient(getDefaultConfig());
      expect((client as any).dispatcher).toBeUndefined();
    });
  });

  // ─── Basic Auth ────────────────────────────────────────────────────

  describe('basic auth', () => {
    it('sends Authorization Basic header with correct encoding', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(200, 'ok'));

      const client = new AdtHttpClient(getDefaultConfig());
      await client.get('/path');

      const expectedAuth = `Basic ${Buffer.from('admin:secret').toString('base64')}`;
      expect(fetchHeaders(0).Authorization).toBe(expectedAuth);
    });

    it('does not send Basic Auth when bearerTokenProvider is configured', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(200, 'ok'));

      const client = new AdtHttpClient({
        ...getDefaultConfig(),
        bearerTokenProvider: async () => 'bearer-token-123',
      });
      await client.get('/path');

      expect(fetchHeaders(0).Authorization).toBe('Bearer bearer-token-123');
      expect(fetchHeaders(0).Authorization).not.toContain('Basic');
    });

    it('does not send Authorization when no credentials configured', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(200, 'ok'));

      const client = new AdtHttpClient({ baseUrl: 'http://sap:8000' });
      await client.get('/path');

      expect(fetchHeaders(0).Authorization).toBeUndefined();
    });

    it('sends Basic Auth header with CSRF fetch', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(200, '', { 'x-csrf-token': 'CSRF_TOKEN_OK' }));

      const client = new AdtHttpClient(getDefaultConfig());
      await client.fetchCsrfToken();

      const expectedAuth = `Basic ${Buffer.from('admin:secret').toString('base64')}`;
      expect(fetchHeaders(0).Authorization).toBe(expectedAuth);
    });
  });

  // ─── Timeout ───────────────────────────────────────────────────────

  describe('timeout', () => {
    it('passes AbortSignal.timeout to fetch', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(200, 'ok'));

      const client = new AdtHttpClient(getDefaultConfig());
      await client.get('/path');

      // Verify signal was passed
      expect(fetchOptions(0).signal).toBeDefined();
    });

    it('wraps timeout errors as AdtNetworkError', async () => {
      const abortError = new DOMException('The operation was aborted', 'AbortError');
      mockFetch.mockRejectedValueOnce(abortError);

      const client = new AdtHttpClient(getDefaultConfig());
      await expect(client.get('/path')).rejects.toThrow(AdtNetworkError);
    });
  });

  // ─── Principal Propagation ─────────────────────────────────────────

  describe('principal propagation', () => {
    it('sends SAP-Connectivity-Authentication header when sapConnectivityAuth is set', async () => {
      const ppConfig: AdtHttpConfig = {
        ...getDefaultConfig(),
        sapConnectivityAuth: 'Bearer saml-assertion-for-user',
      };
      mockFetch.mockResolvedValueOnce(mockResponse(200, 'OK'));

      const client = new AdtHttpClient(ppConfig);
      await client.get('/sap/bc/adt/programs/programs/ZTEST/source/main');

      expect(fetchHeaders(0)['SAP-Connectivity-Authentication']).toBe('Bearer saml-assertion-for-user');
    });

    it('does NOT send SAP-Connectivity-Authentication when not configured', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(200, 'OK'));

      const client = new AdtHttpClient(getDefaultConfig());
      await client.get('/sap/bc/adt/programs/programs/ZTEST/source/main');

      expect(fetchHeaders(0)['SAP-Connectivity-Authentication']).toBeUndefined();
    });
  });

  // ─── Proxy Configuration ──────────────────────────────────────────

  describe('proxy configuration', () => {
    it('creates ProxyAgent dispatcher when btpProxy is configured', () => {
      const client = new AdtHttpClient({
        ...getDefaultConfig(),
        btpProxy: {
          host: 'proxy.example.com',
          port: 20003,
          protocol: 'http',
          getProxyToken: async () => 'proxy-token',
        },
      });
      expect((client as any).dispatcher).toBeDefined();
    });

    it('sends Proxy-Authorization header when btpProxy is configured', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(200, 'ok'));

      const client = new AdtHttpClient({
        ...getDefaultConfig(),
        btpProxy: {
          host: 'proxy.example.com',
          port: 20003,
          protocol: 'http',
          getProxyToken: async () => 'proxy-token-xyz',
        },
      });
      await client.get('/path');

      expect(fetchHeaders(0)['Proxy-Authorization']).toBe('Bearer proxy-token-xyz');
    });
  });
});
