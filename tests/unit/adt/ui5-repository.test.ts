import { describe, expect, it, vi } from 'vitest';
import { AdtApiError } from '../../../src/adt/errors.js';
import type { AdtHttpClient, AdtResponse } from '../../../src/adt/http.js';
import { defaultSafetyConfig, unrestrictedSafetyConfig } from '../../../src/adt/safety.js';
import { getAppInfo, SERVICE_PATH } from '../../../src/adt/ui5-repository.js';

function mockHttp(responseBody = '', statusCode = 200): AdtHttpClient {
  return {
    get: vi.fn().mockResolvedValue({ statusCode, headers: {}, body: responseBody } satisfies AdtResponse),
    post: vi.fn().mockResolvedValue({ statusCode: 200, headers: {}, body: '' }),
    put: vi.fn().mockResolvedValue({ statusCode: 200, headers: {}, body: '' }),
    delete: vi.fn().mockResolvedValue({ statusCode: 200, headers: {}, body: '' }),
    fetchCsrfToken: vi.fn(),
    withStatefulSession: vi.fn(),
  } as unknown as AdtHttpClient;
}

function odataJson(d: Record<string, unknown>): string {
  return JSON.stringify({ d });
}

describe('UI5 Repository', () => {
  describe('getAppInfo', () => {
    it('returns app metadata on success', async () => {
      const body = odataJson({
        Name: 'ZAPP_BOOKING',
        Package: 'ZPACKAGE',
        Description: 'Booking App',
        Info: 'deployed',
      });
      const http = mockHttp(body);
      const result = await getAppInfo(http, unrestrictedSafetyConfig(), 'ZAPP_BOOKING');
      expect(result).toEqual({
        name: 'ZAPP_BOOKING',
        package: 'ZPACKAGE',
        description: 'Booking App',
        info: 'deployed',
      });
    });

    it('returns undefined on 404', async () => {
      const http = mockHttp();
      vi.mocked(http.get).mockRejectedValue(new AdtApiError('Not found', 404, '/test'));
      const result = await getAppInfo(http, unrestrictedSafetyConfig(), 'NONEXISTENT');
      expect(result).toBeUndefined();
    });

    it('parses OData JSON correctly with missing Info field', async () => {
      const body = odataJson({ Name: 'ZAPP', Package: '$TMP', Description: 'Test' });
      const http = mockHttp(body);
      const result = await getAppInfo(http, unrestrictedSafetyConfig(), 'ZAPP');
      expect(result).toEqual({
        name: 'ZAPP',
        package: '$TMP',
        description: 'Test',
        info: '',
      });
    });

    it('sends Accept: application/json header', async () => {
      const body = odataJson({ Name: 'X', Package: 'Y', Description: 'Z', Info: '' });
      const http = mockHttp(body);
      await getAppInfo(http, unrestrictedSafetyConfig(), 'ZAPP');
      expect(http.get).toHaveBeenCalledWith(
        expect.stringContaining(SERVICE_PATH),
        expect.objectContaining({ Accept: 'application/json' }),
      );
    });

    it('throws on safety check when read is blocked', async () => {
      const safety = { ...defaultSafetyConfig(), disallowedOps: 'R' };
      const http = mockHttp();
      await expect(getAppInfo(http, safety, 'ZAPP')).rejects.toThrow('blocked by safety');
    });

    it('re-throws non-404 errors', async () => {
      const http = mockHttp();
      vi.mocked(http.get).mockRejectedValue(new AdtApiError('Internal Server Error', 500, '/test'));
      await expect(getAppInfo(http, unrestrictedSafetyConfig(), 'ZAPP')).rejects.toThrow('Internal Server Error');
    });
  });
});
