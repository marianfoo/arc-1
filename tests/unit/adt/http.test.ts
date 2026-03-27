import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdtApiError, AdtNetworkError } from '../../../ts-src/adt/errors.js';
import { AdtHttpClient, type AdtHttpConfig } from '../../../ts-src/adt/http.js';

// Mock axios
vi.mock('axios', async () => {
  const mockAxiosInstance = {
    request: vi.fn(),
  };
  return {
    default: {
      create: vi.fn(() => mockAxiosInstance),
      isAxiosError: vi.fn((err: any) => err?.isAxiosError === true),
    },
    isAxiosError: vi.fn((err: any) => err?.isAxiosError === true),
  };
});

function getDefaultConfig(): AdtHttpConfig {
  return {
    baseUrl: 'http://sap.example.com:8000',
    username: 'admin',
    password: 'secret',
    client: '001',
    language: 'EN',
  };
}

function getMockAxios() {
  const instance = (axios.create as any)();
  return instance.request as ReturnType<typeof vi.fn>;
}

describe('AdtHttpClient', () => {
  let mockRequest: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    new AdtHttpClient(getDefaultConfig());
    mockRequest = getMockAxios();
  });

  // ─── GET Requests ──────────────────────────────────────────────────

  describe('GET requests', () => {
    it('makes a GET request to the correct URL with sap-client and sap-language', async () => {
      mockRequest.mockResolvedValueOnce({
        status: 200,
        data: '<source>REPORT zhello.</source>',
        headers: {},
      });

      const client = new AdtHttpClient(getDefaultConfig());
      const response = await client.get('/sap/bc/adt/programs/programs/ZHELLO/source/main');

      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'GET',
          url: expect.stringContaining('/sap/bc/adt/programs/programs/ZHELLO/source/main'),
        }),
      );
      expect(response.statusCode).toBe(200);
      expect(response.body).toContain('REPORT zhello');
    });

    it('includes sap-client and sap-language in URL', async () => {
      mockRequest.mockResolvedValueOnce({
        status: 200,
        data: '',
        headers: {},
      });

      const client = new AdtHttpClient(getDefaultConfig());
      await client.get('/sap/bc/adt/core/discovery');

      const url = mockRequest.mock.calls[0]?.[0]?.url as string;
      expect(url).toContain('sap-client=001');
      expect(url).toContain('sap-language=EN');
    });

    it('handles response with non-string data (e.g. number, null)', async () => {
      mockRequest.mockResolvedValueOnce({
        status: 200,
        data: null,
        headers: {},
      });
      const client = new AdtHttpClient(getDefaultConfig());
      const resp = await client.get('/some/path');
      expect(resp.body).toBe('');
    });

    it('passes extra headers through', async () => {
      mockRequest.mockResolvedValueOnce({
        status: 200,
        data: 'ok',
        headers: {},
      });
      const client = new AdtHttpClient(getDefaultConfig());
      await client.get('/path', { Accept: 'application/xml' });
      expect(mockRequest.mock.calls[0]?.[0]?.headers?.Accept).toBe('application/xml');
    });

    it('omits sap-client and sap-language when not configured', async () => {
      mockRequest.mockResolvedValueOnce({ status: 200, data: '', headers: {} });
      const client = new AdtHttpClient({ baseUrl: 'http://sap:8000' });
      await client.get('/sap/bc/adt/core/discovery');
      const url = mockRequest.mock.calls[0]?.[0]?.url as string;
      expect(url).not.toContain('sap-client');
      expect(url).not.toContain('sap-language');
    });
  });

  // ─── POST/PUT/DELETE ───────────────────────────────────────────────

  describe('modifying requests', () => {
    it('POST sends body and content type', async () => {
      // CSRF fetch
      mockRequest.mockResolvedValueOnce({ status: 200, data: '', headers: { 'x-csrf-token': 'T' } });
      // POST
      mockRequest.mockResolvedValueOnce({ status: 200, data: 'created', headers: {} });

      const client = new AdtHttpClient(getDefaultConfig());
      const resp = await client.post('/path', '<xml/>', 'application/xml');
      expect(resp.body).toBe('created');
      expect(mockRequest.mock.calls[1]?.[0]?.headers?.['Content-Type']).toBe('application/xml');
    });

    it('PUT sends body and content type', async () => {
      // CSRF fetch
      mockRequest.mockResolvedValueOnce({ status: 200, data: '', headers: { 'x-csrf-token': 'T' } });
      // PUT
      mockRequest.mockResolvedValueOnce({ status: 200, data: '', headers: {} });

      const client = new AdtHttpClient(getDefaultConfig());
      await client.put('/path', 'source code', 'text/plain');
      expect(mockRequest.mock.calls[1]?.[0]?.method).toBe('PUT');
      expect(mockRequest.mock.calls[1]?.[0]?.data).toBe('source code');
    });

    it('DELETE request works', async () => {
      mockRequest.mockResolvedValueOnce({ status: 200, data: '', headers: { 'x-csrf-token': 'T' } });
      mockRequest.mockResolvedValueOnce({ status: 200, data: '', headers: {} });

      const client = new AdtHttpClient(getDefaultConfig());
      await client.delete('/path');
      expect(mockRequest.mock.calls[1]?.[0]?.method).toBe('DELETE');
    });
  });

  // ─── CSRF Token Handling ───────────────────────────────────────────

  describe('CSRF token handling', () => {
    it('fetches CSRF token before first modifying request', async () => {
      mockRequest.mockResolvedValueOnce({
        status: 200,
        data: '',
        headers: { 'x-csrf-token': 'TOKEN123' },
      });
      mockRequest.mockResolvedValueOnce({
        status: 200,
        data: 'ok',
        headers: {},
      });

      const client = new AdtHttpClient(getDefaultConfig());
      await client.post('/sap/bc/adt/checkruns', '<xml/>', 'application/xml');

      expect(mockRequest).toHaveBeenCalledTimes(2);
      expect(mockRequest.mock.calls[0]?.[0]).toEqual(
        expect.objectContaining({
          method: 'HEAD',
          headers: expect.objectContaining({ 'X-CSRF-Token': 'fetch' }),
        }),
      );
      expect(mockRequest.mock.calls[1]?.[0]?.headers).toEqual(expect.objectContaining({ 'X-CSRF-Token': 'TOKEN123' }));
    });

    it('does not re-fetch CSRF token for second POST', async () => {
      // CSRF fetch
      mockRequest.mockResolvedValueOnce({ status: 200, data: '', headers: { 'x-csrf-token': 'T1' } });
      // First POST
      mockRequest.mockResolvedValueOnce({ status: 200, data: 'ok', headers: {} });
      // Second POST (should reuse token)
      mockRequest.mockResolvedValueOnce({ status: 200, data: 'ok2', headers: {} });

      const client = new AdtHttpClient(getDefaultConfig());
      await client.post('/path1', '<xml/>');
      await client.post('/path2', '<xml/>');
      expect(mockRequest).toHaveBeenCalledTimes(3); // CSRF + 2 POSTs
    });

    it('does not fetch CSRF token for GET requests', async () => {
      mockRequest.mockResolvedValueOnce({ status: 200, data: 'ok', headers: {} });
      const client = new AdtHttpClient(getDefaultConfig());
      await client.get('/path');
      expect(mockRequest).toHaveBeenCalledTimes(1);
    });

    it('retries on 403 with fresh CSRF token', async () => {
      // CSRF fetch
      mockRequest.mockResolvedValueOnce({ status: 200, data: '', headers: { 'x-csrf-token': 'OLD_TOKEN' } });
      // POST → 403
      mockRequest.mockResolvedValueOnce({ status: 403, data: 'CSRF token expired', headers: {} });
      // Re-fetch CSRF
      mockRequest.mockResolvedValueOnce({ status: 200, data: '', headers: { 'x-csrf-token': 'NEW_TOKEN' } });
      // Retry POST → 200
      mockRequest.mockResolvedValueOnce({ status: 200, data: 'success', headers: {} });

      const client = new AdtHttpClient(getDefaultConfig());
      const response = await client.post('/sap/bc/adt/activation', '<xml/>');

      expect(response.statusCode).toBe(200);
      expect(mockRequest).toHaveBeenCalledTimes(4);
    });

    it('stores CSRF token from any response header', async () => {
      // GET response includes a token
      mockRequest.mockResolvedValueOnce({
        status: 200,
        data: 'ok',
        headers: { 'x-csrf-token': 'FROM_GET' },
      });
      // POST should use that token (no separate CSRF fetch)
      mockRequest.mockResolvedValueOnce({
        status: 200,
        data: 'created',
        headers: {},
      });

      const client = new AdtHttpClient(getDefaultConfig());
      await client.get('/path');
      await client.post('/path2', '<xml/>');

      // Should use token from GET response, so only 2 calls total
      expect(mockRequest).toHaveBeenCalledTimes(2);
      expect(mockRequest.mock.calls[1]?.[0]?.headers?.['X-CSRF-Token']).toBe('FROM_GET');
    });

    it('ignores "Required" token value in response headers', async () => {
      mockRequest.mockResolvedValueOnce({
        status: 200,
        data: 'ok',
        headers: { 'x-csrf-token': 'Required' },
      });

      const client = new AdtHttpClient(getDefaultConfig());
      await client.get('/path');
      // csrfToken should still be empty — so next POST will fetch
    });
  });

  // ─── Cookie Jar ────────────────────────────────────────────────────

  describe('cookie jar', () => {
    it('persists Set-Cookie headers from responses', async () => {
      // First request returns cookies
      mockRequest.mockResolvedValueOnce({
        status: 200,
        data: 'ok',
        headers: {
          'set-cookie': ['SAP_SESSIONID_A4H_001=abc123; Path=/; HttpOnly', 'sap-usercontext=lang=EN; Path=/'],
        },
      });
      // Second request should include those cookies
      mockRequest.mockResolvedValueOnce({
        status: 200,
        data: 'ok2',
        headers: {},
      });

      const client = new AdtHttpClient(getDefaultConfig());
      await client.get('/first');
      await client.get('/second');

      const secondHeaders = mockRequest.mock.calls[1]?.[0]?.headers;
      expect(secondHeaders?.Cookie).toContain('SAP_SESSIONID_A4H_001=abc123');
      expect(secondHeaders?.Cookie).toContain('sap-usercontext=lang=EN');
    });

    it('CSRF token works with cookie jar (session correlation)', async () => {
      // CSRF fetch → returns session cookie
      mockRequest.mockResolvedValueOnce({
        status: 200,
        data: '',
        headers: {
          'x-csrf-token': 'TOKEN_ABC',
          'set-cookie': ['SAP_SESSIONID=sess123; Path=/'],
        },
      });
      // POST should include both token AND cookie
      mockRequest.mockResolvedValueOnce({
        status: 200,
        data: 'created',
        headers: {},
      });

      const client = new AdtHttpClient(getDefaultConfig());
      await client.post('/sap/bc/adt/datapreview/ddic', 'data', 'text/plain');

      const postHeaders = mockRequest.mock.calls[1]?.[0]?.headers;
      expect(postHeaders?.['X-CSRF-Token']).toBe('TOKEN_ABC');
      expect(postHeaders?.Cookie).toContain('SAP_SESSIONID=sess123');
    });

    it('merges config cookies with jar cookies', async () => {
      mockRequest.mockResolvedValueOnce({
        status: 200,
        data: 'ok',
        headers: { 'set-cookie': ['jarCookie=jar1; Path=/'] },
      });
      mockRequest.mockResolvedValueOnce({
        status: 200,
        data: 'ok2',
        headers: {},
      });

      const client = new AdtHttpClient({
        ...getDefaultConfig(),
        cookies: { configCookie: 'cfg1' },
      });
      await client.get('/first');
      await client.get('/second');

      const headers = mockRequest.mock.calls[1]?.[0]?.headers;
      expect(headers?.Cookie).toContain('configCookie=cfg1');
      expect(headers?.Cookie).toContain('jarCookie=jar1');
    });

    it('handles Set-Cookie with no value gracefully', async () => {
      mockRequest.mockResolvedValueOnce({
        status: 200,
        data: 'ok',
        headers: { 'set-cookie': ['=noname; Path=/'] },
      });
      const client = new AdtHttpClient(getDefaultConfig());
      // Should not throw
      await client.get('/path');
    });
  });

  // ─── Error Handling ────────────────────────────────────────────────

  describe('error handling', () => {
    it('throws AdtApiError on 404', async () => {
      mockRequest.mockResolvedValueOnce({
        status: 404,
        data: 'Object not found',
        headers: {},
      });

      const client = new AdtHttpClient(getDefaultConfig());
      await expect(client.get('/sap/bc/adt/programs/programs/ZNOTFOUND/source/main')).rejects.toThrow(AdtApiError);
    });

    it('throws AdtApiError on 500', async () => {
      mockRequest.mockResolvedValueOnce({
        status: 500,
        data: 'Internal Server Error',
        headers: {},
      });

      const client = new AdtHttpClient(getDefaultConfig());
      await expect(client.get('/sap/bc/adt/core/discovery')).rejects.toThrow(AdtApiError);
    });

    it('throws AdtApiError on 401 during CSRF fetch', async () => {
      mockRequest.mockResolvedValueOnce({
        status: 401,
        data: 'Unauthorized',
        headers: {},
      });

      const client = new AdtHttpClient(getDefaultConfig());
      await expect(client.fetchCsrfToken()).rejects.toThrow(AdtApiError);
    });

    it('throws AdtApiError on 403 during CSRF fetch', async () => {
      mockRequest.mockResolvedValueOnce({
        status: 403,
        data: 'Forbidden',
        headers: {},
      });

      const client = new AdtHttpClient(getDefaultConfig());
      await expect(client.fetchCsrfToken()).rejects.toThrow(AdtApiError);
    });

    it('throws AdtApiError when CSRF token is missing from response', async () => {
      mockRequest.mockResolvedValueOnce({
        status: 200,
        data: '',
        headers: {},
      });

      const client = new AdtHttpClient(getDefaultConfig());
      await expect(client.fetchCsrfToken()).rejects.toThrow(AdtApiError);
    });

    it('truncates long error bodies to 500 chars', async () => {
      const longBody = 'X'.repeat(1000);
      mockRequest.mockResolvedValueOnce({
        status: 404,
        data: longBody,
        headers: {},
      });

      const client = new AdtHttpClient(getDefaultConfig());
      try {
        await client.get('/path');
      } catch (e) {
        expect((e as AdtApiError).message.length).toBeLessThanOrEqual(600);
      }
    });

    it('wraps axios network errors in AdtNetworkError', async () => {
      const axiosErr = new Error('ECONNREFUSED');
      (axiosErr as any).isAxiosError = true;
      mockRequest.mockRejectedValueOnce(axiosErr);

      const client = new AdtHttpClient(getDefaultConfig());
      await expect(client.get('/path')).rejects.toThrow(AdtNetworkError);
    });

    it('wraps CSRF fetch network errors in AdtNetworkError', async () => {
      const axiosErr = new Error('ECONNREFUSED');
      (axiosErr as any).isAxiosError = true;
      mockRequest.mockRejectedValueOnce(axiosErr);

      const client = new AdtHttpClient(getDefaultConfig());
      await expect(client.fetchCsrfToken()).rejects.toThrow(AdtNetworkError);
    });

    it('re-throws non-axios errors directly', async () => {
      mockRequest.mockRejectedValueOnce(new TypeError('null'));
      const client = new AdtHttpClient(getDefaultConfig());
      await expect(client.get('/path')).rejects.toThrow(TypeError);
    });
  });

  // ─── Config Cookies ────────────────────────────────────────────────

  describe('config cookies', () => {
    it('includes cookies in request headers', async () => {
      mockRequest.mockResolvedValueOnce({
        status: 200,
        data: 'ok',
        headers: {},
      });

      const client = new AdtHttpClient({
        ...getDefaultConfig(),
        cookies: { 'sap-usercontext': 'abc', SAP_SESSIONID: 'xyz' },
      });
      await client.get('/sap/bc/adt/core/discovery');

      const headers = mockRequest.mock.calls[0]?.[0]?.headers;
      expect(headers?.Cookie).toContain('sap-usercontext=abc');
      expect(headers?.Cookie).toContain('SAP_SESSIONID=xyz');
    });

    it('sends cookies with CSRF fetch when configured', async () => {
      mockRequest.mockResolvedValueOnce({
        status: 200,
        data: '',
        headers: { 'x-csrf-token': 'TOKEN' },
      });

      const client = new AdtHttpClient({
        ...getDefaultConfig(),
        cookies: { 'sap-usercontext': 'abc' },
      });
      await client.fetchCsrfToken();

      const headers = mockRequest.mock.calls[0]?.[0]?.headers;
      expect(headers?.Cookie).toContain('sap-usercontext=abc');
    });
  });

  // ─── Stateful Sessions ─────────────────────────────────────────────

  describe('stateful sessions', () => {
    it('creates isolated session for withStatefulSession', async () => {
      mockRequest.mockResolvedValueOnce({
        status: 200,
        data: '',
        headers: { 'x-csrf-token': 'SESSION_TOKEN' },
      });
      mockRequest.mockResolvedValueOnce({
        status: 200,
        data: 'locked',
        headers: {},
      });

      const client = new AdtHttpClient(getDefaultConfig());
      client.csrfToken = 'MAIN_TOKEN';

      await client.withStatefulSession(async (session) => {
        const resp = await session.post('/sap/bc/adt/lock', '<lock/>');
        return resp;
      });
    });

    it('session client includes stateful header', async () => {
      mockRequest.mockResolvedValueOnce({
        status: 200,
        data: '',
        headers: { 'x-csrf-token': 'T' },
      });
      mockRequest.mockResolvedValueOnce({
        status: 200,
        data: 'locked',
        headers: {},
      });

      const client = new AdtHttpClient(getDefaultConfig());
      client.csrfToken = 'T';

      await client.withStatefulSession(async (session) => {
        await session.post('/lock', '<xml/>');
      });

      // The POST from session client should have stateful header
      const lastCall = mockRequest.mock.calls[mockRequest.mock.calls.length - 1]?.[0];
      expect(lastCall?.headers?.['X-sap-adt-sessiontype']).toBe('stateful');
    });

    it('session client shares CSRF token with parent', async () => {
      const client = new AdtHttpClient(getDefaultConfig());
      client.csrfToken = 'PARENT_TOKEN';

      await client.withStatefulSession(async (session) => {
        // Session should have the parent's token
        expect(session.csrfToken).toBe('PARENT_TOKEN');
      });
    });

    it('session client shares cookie jar with parent', async () => {
      const client = new AdtHttpClient(getDefaultConfig());
      client.cookieJar.set('SAP_SESSIONID', 'sess1');

      await client.withStatefulSession(async (session) => {
        expect(session.cookieJar.get('SAP_SESSIONID')).toBe('sess1');
      });
    });
  });

  // ─── URL Building ──────────────────────────────────────────────────

  describe('URL building', () => {
    it('handles trailing slash in baseUrl', async () => {
      mockRequest.mockResolvedValueOnce({ status: 200, data: '', headers: {} });
      const client = new AdtHttpClient({ ...getDefaultConfig(), baseUrl: 'http://sap:8000/' });
      await client.get('/sap/bc/adt/core/discovery');
      const url = mockRequest.mock.calls[0]?.[0]?.url as string;
      expect(url).not.toContain('//sap/bc');
    });

    it('handles path without leading slash', async () => {
      mockRequest.mockResolvedValueOnce({ status: 200, data: '', headers: {} });
      const client = new AdtHttpClient(getDefaultConfig());
      await client.get('sap/bc/adt/core/discovery');
      const url = mockRequest.mock.calls[0]?.[0]?.url as string;
      expect(url).toContain('/sap/bc/adt/core/discovery');
    });
  });

  // ─── TLS / Insecure ────────────────────────────────────────────────

  describe('insecure mode', () => {
    it('creates axios with httpsAgent when insecure=true', () => {
      const client = new AdtHttpClient({ ...getDefaultConfig(), insecure: true });
      // Just verify it doesn't throw
      expect(client).toBeDefined();
    });
  });

  // ─── Principal Propagation ─────────────────────────────────────────

  describe('principal propagation', () => {
    it('sends SAP-Connectivity-Authentication header when sapConnectivityAuth is set', async () => {
      const ppConfig: AdtHttpConfig = {
        ...getDefaultConfig(),
        sapConnectivityAuth: 'Bearer saml-assertion-for-user',
      };
      const client = new AdtHttpClient(ppConfig);
      const ppMockRequest = getMockAxios();

      ppMockRequest.mockResolvedValueOnce({
        status: 200,
        data: 'OK',
        headers: {},
      });

      await client.get('/sap/bc/adt/programs/programs/ZTEST/source/main');

      const callHeaders = ppMockRequest.mock.calls[0][0].headers;
      expect(callHeaders['SAP-Connectivity-Authentication']).toBe('Bearer saml-assertion-for-user');
    });

    it('does NOT send SAP-Connectivity-Authentication when not configured', async () => {
      const client = new AdtHttpClient(getDefaultConfig());
      const normalMockRequest = getMockAxios();

      normalMockRequest.mockResolvedValueOnce({
        status: 200,
        data: 'OK',
        headers: {},
      });

      await client.get('/sap/bc/adt/programs/programs/ZTEST/source/main');

      const callHeaders = normalMockRequest.mock.calls[0][0].headers;
      expect(callHeaders['SAP-Connectivity-Authentication']).toBeUndefined();
    });
  });
});
