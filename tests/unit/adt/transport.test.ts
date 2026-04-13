import { describe, expect, it, vi } from 'vitest';
import { AdtSafetyError } from '../../../src/adt/errors.js';
import type { AdtHttpClient } from '../../../src/adt/http.js';
import { unrestrictedSafetyConfig } from '../../../src/adt/safety.js';
import {
  CTS_ACCEPT_TREE,
  CTS_CONTENT_TYPE_ORGANIZER,
  CTS_NAMESPACE_TM,
  createTransport,
  deleteTransport,
  getTransport,
  getTransportInfo,
  listTransports,
  reassignTransport,
  releaseTransport,
  releaseTransportRecursive,
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

    it('sends requestType=KWT and target=true (sapcli pattern)', async () => {
      const http = mockHttp('<tm:root xmlns:tm="http://www.sap.com/cts/transports"/>');
      await listTransports(http, enabledSafety);
      const url = (http.get as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string;
      expect(url).toContain('requestType=KWT');
      expect(url).toContain('target=true');
    });

    it('sends requestStatus=DR by default', async () => {
      const http = mockHttp('<tm:root xmlns:tm="http://www.sap.com/cts/transports"/>');
      await listTransports(http, enabledSafety);
      const url = (http.get as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string;
      expect(url).toContain('requestStatus=DR');
    });

    it('sends requestStatus=D when status filter is D', async () => {
      const http = mockHttp('<tm:root xmlns:tm="http://www.sap.com/cts/transports"/>');
      await listTransports(http, enabledSafety, undefined, 'D');
      const url = (http.get as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string;
      expect(url).toContain('requestStatus=D');
    });

    it('filters status client-side as fallback', async () => {
      const xml = `<tm:root xmlns:tm="http://www.sap.com/cts/transports">
        <tm:request tm:number="DEVK900001" tm:owner="DEV1" tm:desc="Modifiable" tm:status="D" tm:type="K"/>
        <tm:request tm:number="DEVK900002" tm:owner="DEV2" tm:desc="Released" tm:status="R" tm:type="K"/>
      </tm:root>`;
      const http = mockHttp(xml);
      const transports = await listTransports(http, enabledSafety, undefined, 'D');
      expect(transports).toHaveLength(1);
      expect(transports[0]?.status).toBe('D');
    });

    it('status=* returns all statuses', async () => {
      const xml = `<tm:root xmlns:tm="http://www.sap.com/cts/transports">
        <tm:request tm:number="DEVK900001" tm:owner="DEV1" tm:desc="Modifiable" tm:status="D" tm:type="K"/>
        <tm:request tm:number="DEVK900002" tm:owner="DEV2" tm:desc="Released" tm:status="R" tm:type="K"/>
      </tm:root>`;
      const http = mockHttp(xml);
      const transports = await listTransports(http, enabledSafety, undefined, '*');
      expect(transports).toHaveLength(2);
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
        objects: [],
      });
      expect(transports[0]?.tasks[1]).toEqual({
        id: 'DEVK900002T',
        description: 'Task 2',
        owner: 'DEV2',
        status: 'R',
        objects: [],
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

  // ─── deleteTransport ───────────────────────────────────────────────

  describe('deleteTransport', () => {
    it('is blocked when transports not enabled', async () => {
      const http = mockHttp();
      const safety = { ...unrestrictedSafetyConfig(), enableTransports: false };
      await expect(deleteTransport(http, safety, 'DEVK900001')).rejects.toThrow(AdtSafetyError);
    });

    it('is blocked when transport is read-only', async () => {
      const http = mockHttp();
      const safety = { ...unrestrictedSafetyConfig(), enableTransports: true, transportReadOnly: true };
      await expect(deleteTransport(http, safety, 'DEVK900001')).rejects.toThrow(AdtSafetyError);
    });

    it('sends DELETE to correct URL', async () => {
      const http = mockHttp();
      await deleteTransport(http, enabledSafety, 'DEVK900001');
      const url = (http.delete as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string;
      expect(url).toBe('/sap/bc/adt/cts/transportrequests/DEVK900001');
    });

    it('encodes transport ID in URL', async () => {
      const http = mockHttp();
      await deleteTransport(http, enabledSafety, 'A4HK900100');
      const url = (http.delete as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string;
      expect(url).toContain('A4HK900100');
    });

    it('recursive checks allowedTransports per child task', async () => {
      const xml = `<tm:root xmlns:tm="http://www.sap.com/cts/transports">
        <tm:request tm:number="DEVK900001" tm:owner="DEV" tm:desc="Test" tm:status="D" tm:type="K">
          <tm:task tm:number="DEVK900099" tm:owner="DEV1" tm:desc="Task 1" tm:status="D"/>
        </tm:request>
      </tm:root>`;
      const http = mockHttp(xml);
      // Only parent ID is allowed, child is not
      const safety = { ...enabledSafety, allowedTransports: ['DEVK900001'] };
      await expect(deleteTransport(http, safety, 'DEVK900001', true)).rejects.toThrow(AdtSafetyError);
    });

    it('recursive deletes unreleased tasks before parent', async () => {
      const xml = `<tm:root xmlns:tm="http://www.sap.com/cts/transports">
        <tm:request tm:number="DEVK900001" tm:owner="DEV" tm:desc="Test" tm:status="D" tm:type="K">
          <tm:task tm:number="DEVK900001T1" tm:owner="DEV1" tm:desc="Task 1" tm:status="D"/>
          <tm:task tm:number="DEVK900001T2" tm:owner="DEV2" tm:desc="Task 2" tm:status="D"/>
        </tm:request>
      </tm:root>`;
      const http = mockHttp(xml);
      await deleteTransport(http, enabledSafety, 'DEVK900001', true);
      const deleteCalls = (http.delete as ReturnType<typeof vi.fn>).mock.calls;
      expect(deleteCalls).toHaveLength(3);
      expect(deleteCalls[0]?.[0]).toContain('DEVK900001T1');
      expect(deleteCalls[1]?.[0]).toContain('DEVK900001T2');
      expect(deleteCalls[2]?.[0]).toContain('DEVK900001');
    });

    it('recursive skips already-released tasks', async () => {
      const xml = `<tm:root xmlns:tm="http://www.sap.com/cts/transports">
        <tm:request tm:number="DEVK900001" tm:owner="DEV" tm:desc="Test" tm:status="D" tm:type="K">
          <tm:task tm:number="DEVK900001T1" tm:owner="DEV1" tm:desc="Task 1" tm:status="R"/>
          <tm:task tm:number="DEVK900001T2" tm:owner="DEV2" tm:desc="Task 2" tm:status="D"/>
        </tm:request>
      </tm:root>`;
      const http = mockHttp(xml);
      await deleteTransport(http, enabledSafety, 'DEVK900001', true);
      const deleteCalls = (http.delete as ReturnType<typeof vi.fn>).mock.calls;
      expect(deleteCalls).toHaveLength(2); // Only T2 + parent
      expect(deleteCalls[0]?.[0]).toContain('DEVK900001T2');
      expect(deleteCalls[1]?.[0]).toContain('DEVK900001');
    });
  });

  // ─── reassignTransport ────────────────────────────────────────────

  describe('reassignTransport', () => {
    it('is blocked when transports not enabled', async () => {
      const http = mockHttp();
      const safety = { ...unrestrictedSafetyConfig(), enableTransports: false };
      await expect(reassignTransport(http, safety, 'DEVK900001', 'NEWUSER')).rejects.toThrow(AdtSafetyError);
    });

    it('is blocked when transport is read-only', async () => {
      const http = mockHttp();
      const safety = { ...unrestrictedSafetyConfig(), enableTransports: true, transportReadOnly: true };
      await expect(reassignTransport(http, safety, 'DEVK900001', 'NEWUSER')).rejects.toThrow(AdtSafetyError);
    });

    it('sends PUT with correct XML body', async () => {
      const http = mockHttp();
      await reassignTransport(http, enabledSafety, 'DEVK900001', 'NEWUSER');
      const body = (http.put as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as string;
      expect(body).toContain('tm:useraction="changeowner"');
      expect(body).toContain('tm:targetuser="NEWUSER"');
      expect(body).toContain('tm:number="DEVK900001"');
    });

    it('escapes special characters in owner name', async () => {
      const http = mockHttp();
      await reassignTransport(http, enabledSafety, 'DEVK900001', 'USER<&>');
      const body = (http.put as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as string;
      expect(body).toContain('&lt;');
      expect(body).toContain('&amp;');
    });

    it('uses correct CTS_CONTENT_TYPE_ORGANIZER media type', async () => {
      const http = mockHttp();
      await reassignTransport(http, enabledSafety, 'DEVK900001', 'NEWUSER');
      const calls = (http.put as ReturnType<typeof vi.fn>).mock.calls[0];
      const contentType = calls?.[2] as string;
      const headers = calls?.[3] as Record<string, string>;
      expect(contentType).toBe(CTS_CONTENT_TYPE_ORGANIZER);
      expect(headers.Accept).toBe(CTS_CONTENT_TYPE_ORGANIZER);
    });

    it('recursive reassigns unreleased tasks before parent', async () => {
      const xml = `<tm:root xmlns:tm="http://www.sap.com/cts/transports">
        <tm:request tm:number="DEVK900001" tm:owner="DEV" tm:desc="Test" tm:status="D" tm:type="K">
          <tm:task tm:number="DEVK900001T1" tm:owner="DEV1" tm:desc="Task 1" tm:status="D"/>
          <tm:task tm:number="DEVK900001T2" tm:owner="DEV2" tm:desc="Task 2" tm:status="D"/>
        </tm:request>
      </tm:root>`;
      const http = mockHttp(xml);
      await reassignTransport(http, enabledSafety, 'DEVK900001', 'NEWUSER', true);
      const putCalls = (http.put as ReturnType<typeof vi.fn>).mock.calls;
      // get call uses http.get, put calls are: task1, task2, parent
      expect(putCalls).toHaveLength(3);
      expect(putCalls[0]?.[0] as string).toContain('DEVK900001T1');
      expect(putCalls[1]?.[0] as string).toContain('DEVK900001T2');
      expect(putCalls[2]?.[0] as string).toContain('DEVK900001');
    });

    it('recursive skips already-released tasks', async () => {
      const xml = `<tm:root xmlns:tm="http://www.sap.com/cts/transports">
        <tm:request tm:number="DEVK900001" tm:owner="DEV" tm:desc="Test" tm:status="D" tm:type="K">
          <tm:task tm:number="DEVK900001T1" tm:owner="DEV1" tm:desc="Task 1" tm:status="R"/>
          <tm:task tm:number="DEVK900001T2" tm:owner="DEV2" tm:desc="Task 2" tm:status="D"/>
        </tm:request>
      </tm:root>`;
      const http = mockHttp(xml);
      await reassignTransport(http, enabledSafety, 'DEVK900001', 'NEWUSER', true);
      const putCalls = (http.put as ReturnType<typeof vi.fn>).mock.calls;
      expect(putCalls).toHaveLength(2); // Only T2 + parent
      expect(putCalls[0]?.[0] as string).toContain('DEVK900001T2');
      expect(putCalls[1]?.[0] as string).toContain('DEVK900001');
    });
  });

  // ─── createTransport with type ────────────────────────────────────

  describe('createTransport with transport type', () => {
    it('defaults to type K when not specified', async () => {
      const http = mockHttp('<tm:request tm:number="DEV123"/>');
      await createTransport(http, enabledSafety, 'Test');
      const body = (http.post as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as string;
      expect(body).toContain('tm:type="K"');
    });

    it('type W included in XML body', async () => {
      const http = mockHttp('<tm:request tm:number="DEV123"/>');
      await createTransport(http, enabledSafety, 'Test', undefined, 'W');
      const body = (http.post as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as string;
      expect(body).toContain('tm:type="W"');
    });

    it('type T included in XML body', async () => {
      const http = mockHttp('<tm:request tm:number="DEV123"/>');
      await createTransport(http, enabledSafety, 'Test', undefined, 'T');
      const body = (http.post as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as string;
      expect(body).toContain('tm:type="T"');
    });
  });

  // ─── releaseTransportRecursive ────────────────────────────────────

  describe('releaseTransportRecursive', () => {
    it('is blocked when transports not enabled', async () => {
      const http = mockHttp();
      const safety = { ...unrestrictedSafetyConfig(), enableTransports: false };
      await expect(releaseTransportRecursive(http, safety, 'DEVK900001')).rejects.toThrow(AdtSafetyError);
    });

    it('releases unreleased tasks before parent', async () => {
      const xml = `<tm:root xmlns:tm="http://www.sap.com/cts/transports">
        <tm:request tm:number="DEVK900001" tm:owner="DEV" tm:desc="Test" tm:status="D" tm:type="K">
          <tm:task tm:number="DEVK900001T1" tm:owner="DEV1" tm:desc="Task 1" tm:status="D"/>
          <tm:task tm:number="DEVK900001T2" tm:owner="DEV2" tm:desc="Task 2" tm:status="D"/>
        </tm:request>
      </tm:root>`;
      const http = mockHttp(xml);
      const result = await releaseTransportRecursive(http, enabledSafety, 'DEVK900001');
      const postCalls = (http.post as ReturnType<typeof vi.fn>).mock.calls;
      // Posts: task1 release, task2 release, parent release
      expect(postCalls).toHaveLength(3);
      expect(postCalls[0]?.[0] as string).toContain('DEVK900001T1');
      expect(postCalls[1]?.[0] as string).toContain('DEVK900001T2');
      expect(postCalls[2]?.[0] as string).toContain('DEVK900001');
      expect(result.released).toEqual(['DEVK900001T1', 'DEVK900001T2', 'DEVK900001']);
    });

    it('skips already-released tasks', async () => {
      const xml = `<tm:root xmlns:tm="http://www.sap.com/cts/transports">
        <tm:request tm:number="DEVK900001" tm:owner="DEV" tm:desc="Test" tm:status="D" tm:type="K">
          <tm:task tm:number="DEVK900001T1" tm:owner="DEV1" tm:desc="Task 1" tm:status="R"/>
          <tm:task tm:number="DEVK900001T2" tm:owner="DEV2" tm:desc="Task 2" tm:status="D"/>
        </tm:request>
      </tm:root>`;
      const http = mockHttp(xml);
      const result = await releaseTransportRecursive(http, enabledSafety, 'DEVK900001');
      expect(result.released).toEqual(['DEVK900001T2', 'DEVK900001']);
    });

    it('returns list of all released IDs in order', async () => {
      const xml = `<tm:root xmlns:tm="http://www.sap.com/cts/transports">
        <tm:request tm:number="DEVK900001" tm:owner="DEV" tm:desc="Test" tm:status="D" tm:type="K"/>
      </tm:root>`;
      const http = mockHttp(xml);
      const result = await releaseTransportRecursive(http, enabledSafety, 'DEVK900001');
      expect(result.released).toEqual(['DEVK900001']);
    });

    it('skips already-released parent (retry-safe)', async () => {
      const xml = `<tm:root xmlns:tm="http://www.sap.com/cts/transports">
        <tm:request tm:number="DEVK900001" tm:owner="DEV" tm:desc="Test" tm:status="R" tm:type="K"/>
      </tm:root>`;
      const http = mockHttp(xml);
      const result = await releaseTransportRecursive(http, enabledSafety, 'DEVK900001');
      // Parent already released — no release calls, empty result
      expect(result.released).toEqual([]);
      expect((http.post as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
    });
  });

  // ─── Transport object parsing ─────────────────────────────────────

  describe('transport object parsing', () => {
    it('parses tm:abap_object elements from tasks', async () => {
      const xml = `<tm:root xmlns:tm="http://www.sap.com/cts/transports">
        <tm:request tm:number="DEVK900001" tm:owner="DEV" tm:desc="Test" tm:status="D" tm:type="K">
          <tm:task tm:number="DEVK900001T1" tm:owner="DEV1" tm:desc="Task 1" tm:status="D">
            <tm:abap_object tm:pgmid="R3TR" tm:type="PROG" tm:name="ZTEST_PROGRAM" tm:wbtype="PR" tm:obj_desc="Test program" tm:lock_status="X" tm:position="000001"/>
          </tm:task>
        </tm:request>
      </tm:root>`;
      const http = mockHttp(xml);
      const transports = await listTransports(http, enabledSafety);
      const objects = transports[0]?.tasks[0]?.objects;
      expect(objects).toHaveLength(1);
      expect(objects?.[0]).toEqual({
        pgmid: 'R3TR',
        type: 'PROG',
        name: 'ZTEST_PROGRAM',
        wbtype: 'PR',
        description: 'Test program',
        locked: true,
        position: '000001',
      });
    });

    it('tasks without objects return empty array', async () => {
      const xml = `<tm:root xmlns:tm="http://www.sap.com/cts/transports">
        <tm:request tm:number="DEVK900001" tm:owner="DEV" tm:desc="Test" tm:status="D" tm:type="K">
          <tm:task tm:number="DEVK900001T1" tm:owner="DEV1" tm:desc="Task 1" tm:status="D"/>
        </tm:request>
      </tm:root>`;
      const http = mockHttp(xml);
      const transports = await listTransports(http, enabledSafety);
      expect(transports[0]?.tasks[0]?.objects).toEqual([]);
    });

    it('lock_status X parses as locked true, missing as false', async () => {
      const xml = `<tm:root xmlns:tm="http://www.sap.com/cts/transports">
        <tm:request tm:number="DEVK900001" tm:owner="DEV" tm:desc="Test" tm:status="D" tm:type="K">
          <tm:task tm:number="DEVK900001T1" tm:owner="DEV1" tm:desc="Task 1" tm:status="D">
            <tm:abap_object tm:pgmid="R3TR" tm:type="PROG" tm:name="ZLOCKED" tm:lock_status="X" tm:position="000001"/>
            <tm:abap_object tm:pgmid="R3TR" tm:type="PROG" tm:name="ZUNLOCKED" tm:position="000002"/>
          </tm:task>
        </tm:request>
      </tm:root>`;
      const http = mockHttp(xml);
      const transports = await listTransports(http, enabledSafety);
      const objects = transports[0]?.tasks[0]?.objects;
      expect(objects?.[0]?.locked).toBe(true);
      expect(objects?.[1]?.locked).toBe(false);
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

    it('getTransport sends organizer Accept header', async () => {
      const http = mockHttp('<tm:root xmlns:tm="http://www.sap.com/cts/transports"/>');
      await getTransport(http, enabledSafety, 'DEVK900001');
      const headers = (http.get as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as Record<string, string>;
      expect(headers.Accept).toBe(CTS_CONTENT_TYPE_ORGANIZER);
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

    it('releaseTransport sends organizer Accept header', async () => {
      const http = mockHttp();
      await releaseTransport(http, enabledSafety, 'DEVK900001');
      const headers = (http.post as ReturnType<typeof vi.fn>).mock.calls[0]?.[3] as Record<string, string>;
      expect(headers.Accept).toBe(CTS_CONTENT_TYPE_ORGANIZER);
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

  // ─── getTransportInfo ─────────────────────────────────────────────

  describe('getTransportInfo', () => {
    it('posts to /sap/bc/adt/cts/transportchecks endpoint', async () => {
      const xml = `<asx:abap xmlns:asx="http://www.sap.com/abapxml" version="1.0">
        <asx:values><DATA>
          <RECORDING/>
          <DLVUNIT>LOCAL</DLVUNIT>
          <DEVCLASS>$TMP</DEVCLASS>
        </DATA></asx:values>
      </asx:abap>`;
      const http = mockHttp(xml);
      await getTransportInfo(http, unrestrictedSafetyConfig(), '/sap/bc/adt/oo/classes/zcl_test', '$TMP');
      const url = (http.post as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string;
      expect(url).toBe('/sap/bc/adt/cts/transportchecks');
    });

    it('sends correct content type and accept headers', async () => {
      const xml = `<asx:abap xmlns:asx="http://www.sap.com/abapxml"><asx:values><DATA>
        <RECORDING/>
        <DLVUNIT>LOCAL</DLVUNIT>
        <DEVCLASS>$TMP</DEVCLASS>
      </DATA></asx:values></asx:abap>`;
      const http = mockHttp(xml);
      await getTransportInfo(http, unrestrictedSafetyConfig(), '/sap/bc/adt/oo/classes/zcl_test', '$TMP');
      const calls = (http.post as ReturnType<typeof vi.fn>).mock.calls[0];
      const contentType = calls?.[2] as string;
      expect(contentType).toContain('application/vnd.sap.as+xml');
      expect(contentType).toContain('dataname=com.sap.adt.transport.service.checkData');
    });

    it('includes object URI and devclass in request body', async () => {
      const xml = `<asx:abap xmlns:asx="http://www.sap.com/abapxml"><asx:values><DATA>
        <RECORDING/>
        <DLVUNIT>LOCAL</DLVUNIT>
        <DEVCLASS>$TMP</DEVCLASS>
      </DATA></asx:values></asx:abap>`;
      const http = mockHttp(xml);
      await getTransportInfo(http, unrestrictedSafetyConfig(), '/sap/bc/adt/oo/classes/zcl_test', 'Z_MY_PKG');
      const body = (http.post as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as string;
      expect(body).toContain('<URI>/sap/bc/adt/oo/classes/zcl_test</URI>');
      expect(body).toContain('<DEVCLASS>Z_MY_PKG</DEVCLASS>');
      expect(body).toContain('<OPERATION>I</OPERATION>');
    });

    it('parses local package response (no transport needed)', async () => {
      const xml = `<asx:abap xmlns:asx="http://www.sap.com/abapxml" version="1.0">
        <asx:values><DATA>
          <PGMID>R3TR</PGMID>
          <OBJECT>CLAS</OBJECT>
          <OBJECTNAME>ZCL_TEST</OBJECTNAME>
          <DEVCLASS>$TMP</DEVCLASS>
          <DLVUNIT>LOCAL</DLVUNIT>
          <RECORDING/>
          <KORRFLAG/>
        </DATA></asx:values>
      </asx:abap>`;
      const http = mockHttp(xml);
      const info = await getTransportInfo(http, unrestrictedSafetyConfig(), '/sap/bc/adt/oo/classes/zcl_test', '$TMP');
      expect(info.isLocal).toBe(true);
      expect(info.recording).toBe(false);
      expect(info.deliveryUnit).toBe('LOCAL');
      expect(info.devclass).toBe('$TMP');
      expect(info.existingTransports).toEqual([]);
      expect(info.lockedTransport).toBeUndefined();
    });

    it('parses transportable package response (transport required)', async () => {
      const xml = `<asx:abap xmlns:asx="http://www.sap.com/abapxml" version="1.0">
        <asx:values><DATA>
          <PGMID>R3TR</PGMID>
          <OBJECT>DDLS</OBJECT>
          <OBJECTNAME>ZI_TRAVEL</OBJECTNAME>
          <DEVCLASS>Z_RAP_VB_1</DEVCLASS>
          <DLVUNIT>SAP</DLVUNIT>
          <RECORDING>X</RECORDING>
          <KORRFLAG>X</KORRFLAG>
          <TRANSPORTS>
            <headers>
              <TRKORR>A4HK900502</TRKORR>
              <AS4TEXT>RAP development</AS4TEXT>
              <AS4USER>DEVELOPER</AS4USER>
            </headers>
            <headers>
              <TRKORR>A4HK900503</TRKORR>
              <AS4TEXT>CDS views</AS4TEXT>
              <AS4USER>DEVELOPER</AS4USER>
            </headers>
          </TRANSPORTS>
        </DATA></asx:values>
      </asx:abap>`;
      const http = mockHttp(xml);
      const info = await getTransportInfo(
        http,
        unrestrictedSafetyConfig(),
        '/sap/bc/adt/ddic/ddl/sources/zi_travel',
        'Z_RAP_VB_1',
      );
      expect(info.isLocal).toBe(false);
      expect(info.recording).toBe(true);
      expect(info.deliveryUnit).toBe('SAP');
      expect(info.devclass).toBe('Z_RAP_VB_1');
      expect(info.existingTransports).toHaveLength(2);
      expect(info.existingTransports[0]).toEqual({
        id: 'A4HK900502',
        description: 'RAP development',
        owner: 'DEVELOPER',
      });
    });

    it('parses locked transport from response', async () => {
      const xml = `<asx:abap xmlns:asx="http://www.sap.com/abapxml" version="1.0">
        <asx:values><DATA>
          <DEVCLASS>Z_MY_PKG</DEVCLASS>
          <DLVUNIT>SAP</DLVUNIT>
          <RECORDING>X</RECORDING>
          <LOCKS>
            <HEADER>
              <TRKORR>A4HK900999</TRKORR>
              <AS4TEXT>Locked transport</AS4TEXT>
            </HEADER>
          </LOCKS>
        </DATA></asx:values>
      </asx:abap>`;
      const http = mockHttp(xml);
      const info = await getTransportInfo(
        http,
        unrestrictedSafetyConfig(),
        '/sap/bc/adt/oo/classes/zcl_test',
        'Z_MY_PKG',
      );
      expect(info.lockedTransport).toBe('A4HK900999');
    });

    it('does not require enableTransports flag (read-only check)', async () => {
      const xml = `<asx:abap xmlns:asx="http://www.sap.com/abapxml"><asx:values><DATA>
        <RECORDING/>
        <DLVUNIT>LOCAL</DLVUNIT>
        <DEVCLASS>$TMP</DEVCLASS>
      </DATA></asx:values></asx:abap>`;
      const http = mockHttp(xml);
      const safety = { ...unrestrictedSafetyConfig(), enableTransports: false };
      // Should NOT throw — transportInfo is a read operation
      const info = await getTransportInfo(http, safety, '/sap/bc/adt/oo/classes/zcl_test', '$TMP');
      expect(info.isLocal).toBe(true);
    });

    it('defaults operation to I (insert)', async () => {
      const xml = `<asx:abap xmlns:asx="http://www.sap.com/abapxml"><asx:values><DATA>
        <RECORDING/>
        <DLVUNIT>LOCAL</DLVUNIT>
        <DEVCLASS>$TMP</DEVCLASS>
      </DATA></asx:values></asx:abap>`;
      const http = mockHttp(xml);
      await getTransportInfo(http, unrestrictedSafetyConfig(), '/sap/bc/adt/oo/classes/zcl_test', '$TMP');
      const body = (http.post as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as string;
      expect(body).toContain('<OPERATION>I</OPERATION>');
    });

    it('handles empty transport list', async () => {
      const xml = `<asx:abap xmlns:asx="http://www.sap.com/abapxml"><asx:values><DATA>
        <DEVCLASS>Z_MY_PKG</DEVCLASS>
        <DLVUNIT>SAP</DLVUNIT>
        <RECORDING>X</RECORDING>
      </DATA></asx:values></asx:abap>`;
      const http = mockHttp(xml);
      const info = await getTransportInfo(
        http,
        unrestrictedSafetyConfig(),
        '/sap/bc/adt/oo/classes/zcl_test',
        'Z_MY_PKG',
      );
      expect(info.existingTransports).toEqual([]);
      expect(info.recording).toBe(true);
    });
  });
});
