import { describe, expect, it, vi } from 'vitest';
import { AdtSafetyError } from '../../../src/adt/errors.js';
import type { AdtHttpClient } from '../../../src/adt/http.js';
import { unrestrictedSafetyConfig } from '../../../src/adt/safety.js';
import { createTransport, getTransport, listTransports, releaseTransport } from '../../../src/adt/transport.js';

function mockHttp(responseBody = ''): AdtHttpClient {
  return {
    get: vi.fn().mockResolvedValue({ statusCode: 200, headers: {}, body: responseBody }),
    post: vi.fn().mockResolvedValue({ statusCode: 200, headers: {}, body: responseBody }),
    put: vi.fn().mockResolvedValue({ statusCode: 200, headers: {}, body: '' }),
    delete: vi.fn().mockResolvedValue({ statusCode: 200, headers: {}, body: '' }),
    fetchCsrfToken: vi.fn(),
    withStatefulSession: vi.fn(),
  } as unknown as AdtHttpClient;
}

const enabledSafety = { ...unrestrictedSafetyConfig(), enableTransports: true };

describe('Transport Management', () => {
  // ─── listTransports ────────────────────────────────────────────────

  describe('listTransports', () => {
    it('is blocked when transports not enabled', async () => {
      const http = mockHttp();
      const safety = { ...unrestrictedSafetyConfig(), enableTransports: false };
      await expect(listTransports(http, safety)).rejects.toThrow(AdtSafetyError);
    });

    it('works when transports are enabled', async () => {
      const xml = `<tm:root xmlns:tm="http://www.sap.com/cts/transports">
        <tm:request tm:number="DEVK900001" tm:owner="DEVELOPER" tm:desc="Test transport" tm:status="D" tm:type="K"/>
      </tm:root>`;
      const http = mockHttp(xml);
      const transports = await listTransports(http, enabledSafety);
      expect(transports).toHaveLength(1);
      expect(transports[0]?.id).toBe('DEVK900001');
      expect(transports[0]?.owner).toBe('DEVELOPER');
      expect(transports[0]?.description).toBe('Test transport');
      expect(transports[0]?.status).toBe('D');
      expect(transports[0]?.type).toBe('K');
    });

    it('handles multiple transports', async () => {
      const xml = `<tm:root xmlns:tm="http://www.sap.com/cts/transports">
        <tm:request tm:number="DEVK900001" tm:owner="DEV1" tm:desc="First" tm:status="D" tm:type="K"/>
        <tm:request tm:number="DEVK900002" tm:owner="DEV2" tm:desc="Second" tm:status="R" tm:type="K"/>
        <tm:request tm:number="DEVK900003" tm:owner="DEV1" tm:desc="Third" tm:status="D" tm:type="W"/>
      </tm:root>`;
      const http = mockHttp(xml);
      const transports = await listTransports(http, enabledSafety);
      expect(transports).toHaveLength(3);
      expect(transports[1]?.status).toBe('R'); // Released
    });

    it('filters by user when provided', async () => {
      const http = mockHttp('<tm:root xmlns:tm="http://www.sap.com/cts/transports"/>');
      await listTransports(http, enabledSafety, 'TESTUSER');
      const url = (http.get as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string;
      expect(url).toContain('user=TESTUSER');
    });

    it('does not add user param for wildcard', async () => {
      const http = mockHttp('<tm:root xmlns:tm="http://www.sap.com/cts/transports"/>');
      await listTransports(http, enabledSafety, '*');
      const url = (http.get as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string;
      expect(url).not.toContain('user=');
    });

    it('handles empty response', async () => {
      const http = mockHttp('<tm:root xmlns:tm="http://www.sap.com/cts/transports"/>');
      const transports = await listTransports(http, enabledSafety);
      expect(transports).toEqual([]);
    });
  });

  // ─── getTransport ──────────────────────────────────────────────────

  describe('getTransport', () => {
    it('returns transport details', async () => {
      const xml = `<tm:root xmlns:tm="http://www.sap.com/cts/transports">
        <tm:request tm:number="A4HK900100" tm:owner="DEVELOPER" tm:desc="My transport" tm:status="D" tm:type="K"/>
      </tm:root>`;
      const http = mockHttp(xml);
      const transport = await getTransport(http, enabledSafety, 'A4HK900100');
      expect(transport).not.toBeNull();
      expect(transport?.id).toBe('A4HK900100');
    });

    it('returns null when transport not found (Issue #26)', async () => {
      const http = mockHttp('<tm:root xmlns:tm="http://www.sap.com/cts/transports"/>');
      const transport = await getTransport(http, enabledSafety, 'NONEXISTENT');
      expect(transport).toBeNull();
    });

    it('is blocked when transports not enabled', async () => {
      const http = mockHttp();
      const safety = { ...unrestrictedSafetyConfig(), enableTransports: false };
      await expect(getTransport(http, safety, 'A4HK900100')).rejects.toThrow(AdtSafetyError);
    });
  });

  // ─── createTransport ───────────────────────────────────────────────

  describe('createTransport', () => {
    it('is blocked when transports not enabled', async () => {
      const http = mockHttp();
      const safety = { ...unrestrictedSafetyConfig(), enableTransports: false };
      await expect(createTransport(http, safety, 'Test')).rejects.toThrow(AdtSafetyError);
    });

    it('is blocked when transport is read-only', async () => {
      const http = mockHttp();
      const safety = { ...unrestrictedSafetyConfig(), enableTransports: true, transportReadOnly: true };
      await expect(createTransport(http, safety, 'Test')).rejects.toThrow(AdtSafetyError);
    });

    it('creates transport when fully enabled', async () => {
      const xml = '<tm:request tm:number="DEVK900002"/>';
      const http = mockHttp(xml);
      const id = await createTransport(http, enabledSafety, 'New transport');
      expect(id).toBe('DEVK900002');
    });

    it('sends correct XML body (Issue #70: wrong content-type)', async () => {
      const http = mockHttp('<tm:request tm:number="DEV123"/>');
      await createTransport(http, enabledSafety, 'My description', 'ZPACKAGE');
      const body = (http.post as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as string;
      expect(body).toContain('tm:desc="My description"');
      expect(body).toContain('tm:type="K"');
      expect(body).toContain('tm:target="ZPACKAGE"');
    });

    it('escapes special characters in description', async () => {
      const http = mockHttp('<tm:request tm:number="DEV123"/>');
      await createTransport(http, enabledSafety, 'Test with "quotes" & <brackets>');
      const body = (http.post as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as string;
      expect(body).toContain('&amp;');
      expect(body).toContain('&lt;');
      expect(body).toContain('&quot;');
    });

    it('returns empty string when no transport number in response', async () => {
      const http = mockHttp('<tm:root/>');
      const id = await createTransport(http, enabledSafety, 'Test');
      expect(id).toBe('');
    });
  });

  // ─── releaseTransport ──────────────────────────────────────────────

  describe('releaseTransport', () => {
    it('is blocked when transports not enabled', async () => {
      const http = mockHttp();
      const safety = { ...unrestrictedSafetyConfig(), enableTransports: false };
      await expect(releaseTransport(http, safety, 'DEVK900001')).rejects.toThrow(AdtSafetyError);
    });

    it('is blocked in transport read-only mode', async () => {
      const http = mockHttp();
      const safety = { ...unrestrictedSafetyConfig(), enableTransports: true, transportReadOnly: true };
      await expect(releaseTransport(http, safety, 'DEVK900001')).rejects.toThrow(AdtSafetyError);
    });

    it('posts to newreleasejobs endpoint', async () => {
      const http = mockHttp();
      await releaseTransport(http, enabledSafety, 'DEVK900001');
      expect(http.post).toHaveBeenCalledWith(
        expect.stringContaining('/sap/bc/adt/cts/transportrequests/DEVK900001/newreleasejobs'),
      );
    });

    it('encodes transport ID in URL', async () => {
      const http = mockHttp();
      await releaseTransport(http, enabledSafety, 'A4HK900100');
      const url = (http.post as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string;
      expect(url).toContain('A4HK900100');
    });
  });
});
