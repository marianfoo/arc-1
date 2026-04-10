import { describe, expect, it, vi } from 'vitest';
import { AdtSafetyError } from '../../../src/adt/errors.js';
import type { AdtHttpClient } from '../../../src/adt/http.js';
import { unrestrictedSafetyConfig } from '../../../src/adt/safety.js';
import {
  CTS_ACCEPT_TREE,
  CTS_CONTENT_TYPE_ORGANIZER,
  CTS_NAMESPACE_TM,
  createTransport,
  getTransport,
  listTransports,
  releaseTransport,
} from '../../../src/adt/transport.js';

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

    it('extracts tasks from transport requests', async () => {
      const xml = `<tm:root xmlns:tm="http://www.sap.com/cts/transports">
        <tm:request tm:number="DEVK900001" tm:owner="DEVELOPER" tm:desc="Test transport" tm:status="D" tm:type="K">
          <tm:task tm:number="DEVK900001T" tm:owner="DEV1" tm:desc="Task 1" tm:status="D"/>
          <tm:task tm:number="DEVK900002T" tm:owner="DEV2" tm:desc="Task 2" tm:status="R"/>
        </tm:request>
      </tm:root>`;
      const http = mockHttp(xml);
      const transports = await listTransports(http, enabledSafety);
      expect(transports).toHaveLength(1);
      expect(transports[0]?.tasks).toHaveLength(2);
      expect(transports[0]?.tasks[0]).toEqual({
        id: 'DEVK900001T',
        description: 'Task 1',
        owner: 'DEV1',
        status: 'D',
      });
      expect(transports[0]?.tasks[1]).toEqual({
        id: 'DEVK900002T',
        description: 'Task 2',
        owner: 'DEV2',
        status: 'R',
      });
    });

    it('parses attributes in different order', async () => {
      const xml = `<tm:root xmlns:tm="http://www.sap.com/cts/transports">
        <tm:request tm:desc="Reversed order" tm:type="K" tm:status="D" tm:owner="DEVELOPER" tm:number="DEVK900099"/>
      </tm:root>`;
      const http = mockHttp(xml);
      const transports = await listTransports(http, enabledSafety);
      expect(transports).toHaveLength(1);
      expect(transports[0]?.id).toBe('DEVK900099');
      expect(transports[0]?.owner).toBe('DEVELOPER');
      expect(transports[0]?.description).toBe('Reversed order');
      expect(transports[0]?.status).toBe('D');
      expect(transports[0]?.type).toBe('K');
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
      const url = (http.post as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string;
      expect(url).toContain('/sap/bc/adt/cts/transportrequests/DEVK900001/newreleasejobs');
    });

    it('encodes transport ID in URL', async () => {
      const http = mockHttp();
      await releaseTransport(http, enabledSafety, 'A4HK900100');
      const url = (http.post as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string;
      expect(url).toContain('A4HK900100');
    });
  });

  // ─── Media Type & Namespace Assertions ─────────────────────────────

  describe('CTS media types and namespaces', () => {
    it('listTransports sends tree Accept header', async () => {
      const http = mockHttp('<tm:root xmlns:tm="http://www.sap.com/cts/transports"/>');
      await listTransports(http, enabledSafety);
      const headers = (http.get as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as Record<string, string>;
      expect(headers.Accept).toBe(CTS_ACCEPT_TREE);
    });

    it('getTransport sends tree Accept header', async () => {
      const http = mockHttp('<tm:root xmlns:tm="http://www.sap.com/cts/transports"/>');
      await getTransport(http, enabledSafety, 'DEVK900001');
      const headers = (http.get as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as Record<string, string>;
      expect(headers.Accept).toBe(CTS_ACCEPT_TREE);
    });

    it('createTransport sends organizer Accept and Content-Type', async () => {
      const http = mockHttp('<tm:request tm:number="DEV123"/>');
      await createTransport(http, enabledSafety, 'Test');
      const calls = (http.post as ReturnType<typeof vi.fn>).mock.calls[0];
      const contentType = calls?.[2] as string;
      const headers = calls?.[3] as Record<string, string>;
      expect(contentType).toBe(CTS_CONTENT_TYPE_ORGANIZER);
      expect(headers.Accept).toBe(CTS_CONTENT_TYPE_ORGANIZER);
    });

    it('createTransport uses correct TM namespace in payload', async () => {
      const http = mockHttp('<tm:request tm:number="DEV123"/>');
      await createTransport(http, enabledSafety, 'Test');
      const body = (http.post as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as string;
      expect(body).toContain(`xmlns:tm="${CTS_NAMESPACE_TM}"`);
      expect(body).not.toContain('http://www.sap.com/cts/transports');
    });

    it('releaseTransport sends tree Accept header', async () => {
      const http = mockHttp();
      await releaseTransport(http, enabledSafety, 'DEVK900001');
      const headers = (http.post as ReturnType<typeof vi.fn>).mock.calls[0]?.[3] as Record<string, string>;
      expect(headers.Accept).toBe(CTS_ACCEPT_TREE);
    });

    it('createTransport endpoint is /sap/bc/adt/cts/transportrequests', async () => {
      const http = mockHttp('<tm:request tm:number="DEV123"/>');
      await createTransport(http, enabledSafety, 'Test');
      const url = (http.post as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string;
      expect(url).toBe('/sap/bc/adt/cts/transportrequests');
    });

    it('response parsing handles both old and new namespace attributes', async () => {
      // Responses may use either namespace — parser should handle both
      const xmlOldNs = `<tm:root xmlns:tm="http://www.sap.com/cts/transports">
        <tm:request tm:number="DEVK900001" tm:owner="DEV" tm:desc="Old ns" tm:status="D" tm:type="K"/>
      </tm:root>`;
      const http = mockHttp(xmlOldNs);
      const transports = await listTransports(http, enabledSafety);
      expect(transports).toHaveLength(1);
      expect(transports[0]?.id).toBe('DEVK900001');

      // New namespace
      const xmlNewNs = `<tm:root xmlns:tm="${CTS_NAMESPACE_TM}">
        <tm:request tm:number="DEVK900002" tm:owner="DEV" tm:desc="New ns" tm:status="D" tm:type="K"/>
      </tm:root>`;
      const http2 = mockHttp(xmlNewNs);
      const transports2 = await listTransports(http2, enabledSafety);
      expect(transports2).toHaveLength(1);
      expect(transports2[0]?.id).toBe('DEVK900002');
    });

    it('exported constants have correct values', () => {
      expect(CTS_ACCEPT_TREE).toBe('application/vnd.sap.adt.transportorganizertree.v1+xml');
      expect(CTS_CONTENT_TYPE_ORGANIZER).toBe('application/vnd.sap.adt.transportorganizer.v1+xml');
      expect(CTS_NAMESPACE_TM).toBe('http://www.sap.com/cts/adt/tm');
    });
  });
});
