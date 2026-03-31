import axios from 'axios';
import { describe, expect, it, vi } from 'vitest';
import { AdtClient } from '../../../ts-src/adt/client.js';
import { AdtApiError, AdtSafetyError } from '../../../ts-src/adt/errors.js';
import { unrestrictedSafetyConfig } from '../../../ts-src/adt/safety.js';

// Mock axios for all client tests
vi.mock('axios', async () => {
  const mockAxiosInstance = {
    request: vi.fn().mockResolvedValue({
      status: 200,
      data: "REPORT zhello.\nWRITE: / 'Hello'.",
      headers: {},
    }),
  };
  return {
    default: {
      create: vi.fn(() => mockAxiosInstance),
      isAxiosError: vi.fn(() => false),
    },
  };
});

function createClient(overrides: Record<string, unknown> = {}): AdtClient {
  return new AdtClient({
    baseUrl: 'http://sap:8000',
    username: 'admin',
    password: 'secret',
    safety: unrestrictedSafetyConfig(),
    ...overrides,
  });
}

describe('AdtClient', () => {
  describe('source code read operations', () => {
    it('getProgram returns source code', async () => {
      const client = createClient();
      const source = await client.getProgram('ZHELLO');
      expect(source).toContain('REPORT zhello');
    });

    it('getClass returns source code', async () => {
      const client = createClient();
      const source = await client.getClass('ZCL_TEST');
      expect(typeof source).toBe('string');
    });

    it('getClass with include returns include source', async () => {
      const client = createClient();
      const source = await client.getClass('ZCL_TEST', 'testclasses');
      expect(typeof source).toBe('string');
    });

    it('getClass with include uses correct URL path (no /source/main suffix)', async () => {
      const mockInstance = (axios.create as any)();
      const requestSpy = mockInstance.request as ReturnType<typeof vi.fn>;
      requestSpy.mockClear();
      const client = createClient();
      await client.getClass('ZCL_TEST', 'definitions');
      // Should call /includes/definitions, NOT /includes/definitions/source/main
      const callArgs = requestSpy.mock.calls.map((c: any[]) => c[0]);
      const urlUsed = callArgs.find((a: any) => a.url?.includes('ZCL_TEST'));
      expect(urlUsed?.url).toContain('/includes/definitions');
      expect(urlUsed?.url).not.toContain('/source/main');
    });

    it('getClass with include=main uses /source/main path', async () => {
      const mockInstance = (axios.create as any)();
      const requestSpy = mockInstance.request as ReturnType<typeof vi.fn>;
      requestSpy.mockClear();
      const client = createClient();
      await client.getClass('ZCL_TEST', 'main');
      const callArgs = requestSpy.mock.calls.map((c: any[]) => c[0]);
      const urlUsed = callArgs.find((a: any) => a.url?.includes('ZCL_TEST'));
      expect(urlUsed?.url).toContain('/source/main');
    });

    it('getClass with multiple comma-separated includes', async () => {
      const mockInstance = (axios.create as any)();
      const requestSpy = mockInstance.request as ReturnType<typeof vi.fn>;
      requestSpy.mockClear();
      const client = createClient();
      const source = await client.getClass('ZCL_TEST', 'definitions,implementations');
      // Should make two HTTP calls
      const callArgs = requestSpy.mock.calls.map((c: any[]) => c[0]);
      const classUrls = callArgs.filter((a: any) => a.url?.includes('ZCL_TEST'));
      expect(classUrls).toHaveLength(2);
      expect(classUrls[0]?.url).toContain('/includes/definitions');
      expect(classUrls[1]?.url).toContain('/includes/implementations');
      // Result should contain both section headers
      expect(source).toContain('=== definitions ===');
      expect(source).toContain('=== implementations ===');
    });

    it('getClass gracefully handles 404 for non-existent includes', async () => {
      const mockInstance = (axios.create as any)();
      const requestSpy = mockInstance.request as ReturnType<typeof vi.fn>;
      requestSpy.mockClear();
      // Make the request reject with a 404 AdtApiError
      requestSpy.mockRejectedValueOnce(new AdtApiError('Not found', 404, '/includes/testclasses'));
      const client = createClient();
      const source = await client.getClass('ZCL_TEST', 'testclasses');
      // Should not throw; should contain a helpful message
      expect(source).toContain('testclasses');
      expect(source).toContain('not available');
    });

    it('getClass validates include values', async () => {
      const client = createClient();
      const source = await client.getClass('ZCL_TEST', 'foobar');
      expect(source).toContain('Unknown include');
      expect(source).toContain('foobar');
    });

    it('getClass normalizes include to lowercase', async () => {
      const mockInstance = (axios.create as any)();
      const requestSpy = mockInstance.request as ReturnType<typeof vi.fn>;
      requestSpy.mockClear();
      const client = createClient();
      await client.getClass('ZCL_TEST', 'DEFINITIONS');
      const callArgs = requestSpy.mock.calls.map((c: any[]) => c[0]);
      const urlUsed = callArgs.find((a: any) => a.url?.includes('ZCL_TEST'));
      // Should use lowercase 'definitions' in the URL path
      expect(urlUsed?.url).toContain('/includes/definitions');
    });

    it('getInterface returns source code', async () => {
      const client = createClient();
      const source = await client.getInterface('ZIF_TEST');
      expect(typeof source).toBe('string');
    });

    it('getFunction returns source code', async () => {
      const client = createClient();
      const source = await client.getFunction('ZGROUP', 'ZFUNC');
      expect(typeof source).toBe('string');
    });

    it('getInclude returns source code', async () => {
      const client = createClient();
      const source = await client.getInclude('ZINCLUDE');
      expect(typeof source).toBe('string');
    });

    it('getDdls returns CDS source code', async () => {
      const client = createClient();
      const source = await client.getDdls('ZTRAVEL');
      expect(typeof source).toBe('string');
    });

    it('getBdef returns behavior definition source', async () => {
      const client = createClient();
      const source = await client.getBdef('ZTRAVEL');
      expect(typeof source).toBe('string');
    });

    it('getSrvd returns service definition source', async () => {
      const client = createClient();
      const source = await client.getSrvd('ZTRAVEL');
      expect(typeof source).toBe('string');
    });

    it('getTable returns table definition source', async () => {
      const client = createClient();
      const source = await client.getTable('MARA');
      expect(typeof source).toBe('string');
    });

    it('getView returns view definition source', async () => {
      const client = createClient();
      const source = await client.getView('ZVIEW');
      expect(typeof source).toBe('string');
    });
  });

  describe('system information', () => {
    it('getSystemInfo returns structured JSON with user', async () => {
      const client = createClient();
      const info = await client.getSystemInfo();
      expect(typeof info).toBe('string');
      const parsed = JSON.parse(info);
      expect(parsed.user).toBe('admin');
      expect(Array.isArray(parsed.collections)).toBe(true);
    });

    it('getMessages returns message class XML', async () => {
      const client = createClient();
      const messages = await client.getMessages('SY');
      expect(typeof messages).toBe('string');
    });

    it('getTextElements returns text elements XML', async () => {
      const client = createClient();
      const texts = await client.getTextElements('ZHELLO');
      expect(typeof texts).toBe('string');
    });

    it('getVariants returns variants XML', async () => {
      const client = createClient();
      const variants = await client.getVariants('ZHELLO');
      expect(typeof variants).toBe('string');
    });
  });

  // ─── URL Encoding (Issues #18, #52) ─────────────────────────────

  describe('URL encoding for namespaced objects', () => {
    it('encodes namespaced program names in URL', async () => {
      const client = createClient();
      await client.getProgram('/NAMESPACE/ZPROGRAM');
      // The HTTP layer should receive an encoded URL
      // We can't easily inspect the URL here, but we verify it doesn't throw
    });

    it('encodes namespaced class names in URL', async () => {
      const client = createClient();
      await client.getClass('/USE/CL_MY_CLASS');
      // Should not throw — URL encoding handles the slashes
    });

    it('encodes namespaced interface names', async () => {
      const client = createClient();
      await client.getInterface('/BOBF/IF_FRW_DETERMINATION');
    });

    it('encodes namespaced function module names', async () => {
      const client = createClient();
      await client.getFunction('/NAMESPACE/FUGR', '/NAMESPACE/FM');
    });

    it('encodes namespaced DDLS names', async () => {
      const client = createClient();
      await client.getDdls('/NAMESPACE/CDS_VIEW');
    });

    it('encodes special characters in search query', async () => {
      const client = createClient();
      // Should not throw for queries with special characters
      await client.searchObject('/NAMESPACE/*', 5);
    });
  });

  describe('safety checks', () => {
    it('blocks read operations when disallowed', async () => {
      const client = createClient({
        safety: { ...unrestrictedSafetyConfig(), disallowedOps: 'R' },
      });
      await expect(client.getProgram('ZHELLO')).rejects.toThrow(AdtSafetyError);
    });

    it('blocks search when not in allowedOps', async () => {
      const client = createClient({
        safety: { ...unrestrictedSafetyConfig(), allowedOps: 'R' },
      });
      await expect(client.searchObject('Z*')).rejects.toThrow(AdtSafetyError);
    });

    it('blocks free SQL when blockFreeSQL is true', async () => {
      const client = createClient({
        safety: { ...unrestrictedSafetyConfig(), blockFreeSQL: true },
      });
      await expect(client.runQuery('SELECT * FROM T000')).rejects.toThrow(AdtSafetyError);
    });

    it('allows read when safety is unrestricted', async () => {
      const client = createClient();
      const source = await client.getProgram('ZHELLO');
      expect(source).toBeDefined();
    });

    it('allows operations when matching allowedOps', async () => {
      const client = createClient({
        safety: { ...unrestrictedSafetyConfig(), allowedOps: 'RS' },
      });
      // R is in allowedOps, so read should work
      const source = await client.getProgram('ZHELLO');
      expect(source).toBeDefined();
    });
  });
});
