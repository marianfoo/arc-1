import { describe, expect, it, vi } from 'vitest';
import {
  createObject,
  deleteObject,
  lockObject,
  safeUpdateSource,
  unlockObject,
  updateSource,
} from '../../../ts-src/adt/crud.js';
import { AdtSafetyError } from '../../../ts-src/adt/errors.js';
import type { AdtHttpClient } from '../../../ts-src/adt/http.js';
import { unrestrictedSafetyConfig } from '../../../ts-src/adt/safety.js';

function mockHttp(body = ''): AdtHttpClient {
  return {
    get: vi.fn().mockResolvedValue({ statusCode: 200, headers: {}, body }),
    post: vi.fn().mockResolvedValue({
      statusCode: 200,
      headers: {},
      body: '<asx:abap xmlns:asx="http://www.sap.com/abapxml"><asx:values><DATA><LOCK_HANDLE>HANDLE123</LOCK_HANDLE><CORRNR></CORRNR><IS_LOCAL>X</IS_LOCAL></DATA></asx:values></asx:abap>',
    }),
    put: vi.fn().mockResolvedValue({ statusCode: 200, headers: {}, body: '' }),
    delete: vi.fn().mockResolvedValue({ statusCode: 200, headers: {}, body: '' }),
    fetchCsrfToken: vi.fn().mockResolvedValue(undefined),
    withStatefulSession: vi.fn().mockImplementation(async (fn: any) => {
      const session = {
        get: vi.fn().mockResolvedValue({ statusCode: 200, headers: {}, body }),
        post: vi.fn().mockResolvedValue({
          statusCode: 200,
          headers: {},
          body: '<asx:abap xmlns:asx="http://www.sap.com/abapxml"><asx:values><DATA><LOCK_HANDLE>SESS_HANDLE</LOCK_HANDLE><CORRNR></CORRNR><IS_LOCAL>X</IS_LOCAL></DATA></asx:values></asx:abap>',
        }),
        put: vi.fn().mockResolvedValue({ statusCode: 200, headers: {}, body: '' }),
        delete: vi.fn().mockResolvedValue({ statusCode: 200, headers: {}, body: '' }),
      };
      return fn(session);
    }),
  } as unknown as AdtHttpClient;
}

describe('CRUD Operations', () => {
  // ─── lockObject ────────────────────────────────────────────────────

  describe('lockObject', () => {
    it('parses lock handle from response', async () => {
      const http = mockHttp();
      const result = await lockObject(http, unrestrictedSafetyConfig(), '/sap/bc/adt/programs/programs/ZTEST');
      expect(result.lockHandle).toBe('HANDLE123');
      expect(result.isLocal).toBe(true);
      expect(result.corrNr).toBe('');
    });

    it('parses transport number from lock response', async () => {
      const lockBody =
        '<asx:abap xmlns:asx="http://www.sap.com/abapxml"><asx:values><DATA><LOCK_HANDLE>H1</LOCK_HANDLE><CORRNR>A4HK900100</CORRNR><IS_LOCAL></IS_LOCAL></DATA></asx:values></asx:abap>';
      const http = {
        ...mockHttp(),
        post: vi.fn().mockResolvedValue({ statusCode: 200, headers: {}, body: lockBody }),
      } as unknown as AdtHttpClient;
      const result = await lockObject(http, unrestrictedSafetyConfig(), '/sap/bc/adt/programs/programs/ZTEST');
      expect(result.corrNr).toBe('A4HK900100');
      expect(result.isLocal).toBe(false);
    });

    it('sends LOCK action to correct URL', async () => {
      const http = mockHttp();
      await lockObject(http, unrestrictedSafetyConfig(), '/sap/bc/adt/programs/programs/ZTEST');
      expect(http.post).toHaveBeenCalledWith(
        expect.stringContaining('_action=LOCK'),
        undefined,
        undefined,
        expect.objectContaining({ Accept: expect.stringContaining('com.sap.adt.lock.result') }),
      );
    });

    it('uses accessMode parameter', async () => {
      const http = mockHttp();
      await lockObject(http, unrestrictedSafetyConfig(), '/sap/bc/adt/programs/programs/ZTEST', 'MODIFY');
      const url = (http.post as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string;
      expect(url).toContain('accessMode=MODIFY');
    });

    it('is blocked when safety disallows Lock', async () => {
      const http = mockHttp();
      const safety = { ...unrestrictedSafetyConfig(), disallowedOps: 'L' };
      await expect(lockObject(http, safety, '/url')).rejects.toThrow(AdtSafetyError);
    });

    it('Lock type L is not in WRITE_OPS — readOnly does not block lock', async () => {
      // Lock is gated by its own operation type 'L', not by readOnly flag.
      // readOnly blocks CDUAW (Create, Delete, Update, Activate, Workflow).
      // This is intentional: lock is needed for read operations like syntax check.
      const http = mockHttp();
      const safety = { ...unrestrictedSafetyConfig(), readOnly: true };
      await expect(lockObject(http, safety, '/url')).resolves.toBeDefined();
    });

    it('is blocked when Lock ops are explicitly disallowed', async () => {
      const http = mockHttp();
      const safety = { ...unrestrictedSafetyConfig(), disallowedOps: 'L' };
      await expect(lockObject(http, safety, '/url')).rejects.toThrow(AdtSafetyError);
    });

    it('handles namespaced objects (Issue #18)', async () => {
      const http = mockHttp();
      const url = '/sap/bc/adt/oo/classes/%2fUSE%2fCL_MY_CLASS';
      await lockObject(http, unrestrictedSafetyConfig(), url);
      expect(http.post).toHaveBeenCalledWith(
        expect.stringContaining('%2fUSE%2fCL_MY_CLASS'),
        undefined,
        undefined,
        expect.any(Object),
      );
    });
  });

  // ─── unlockObject ──────────────────────────────────────────────────

  describe('unlockObject', () => {
    it('sends unlock request with handle', async () => {
      const http = mockHttp();
      await unlockObject(http, '/sap/bc/adt/programs/programs/ZTEST', 'HANDLE123');
      expect(http.post).toHaveBeenCalledWith(expect.stringContaining('_action=UNLOCK'));
      expect(http.post).toHaveBeenCalledWith(expect.stringContaining('lockHandle=HANDLE123'));
    });

    it('encodes lock handle in URL', async () => {
      const http = mockHttp();
      await unlockObject(http, '/sap/bc/adt/programs/programs/ZTEST', 'HANDLE WITH SPACE');
      const url = (http.post as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string;
      expect(url).toContain('lockHandle=HANDLE%20WITH%20SPACE');
    });
  });

  // ─── createObject ──────────────────────────────────────────────────

  describe('createObject', () => {
    it('sends create request without transport', async () => {
      const http = mockHttp();
      await createObject(http, unrestrictedSafetyConfig(), '/sap/bc/adt/programs/programs', '<xml/>');
      const url = (http.post as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string;
      expect(url).not.toContain('corrNr');
    });

    it('sends create request with transport', async () => {
      const http = mockHttp();
      const safety = { ...unrestrictedSafetyConfig(), allowTransportableEdits: true };
      await createObject(http, safety, '/sap/bc/adt/programs/programs', '<xml/>', 'application/xml', 'DEVK900001');
      expect(http.post).toHaveBeenCalledWith(expect.stringContaining('corrNr=DEVK900001'), '<xml/>', 'application/xml');
    });

    it('is blocked in read-only mode', async () => {
      const http = mockHttp();
      const safety = { ...unrestrictedSafetyConfig(), readOnly: true };
      await expect(createObject(http, safety, '/url', '<xml/>')).rejects.toThrow(AdtSafetyError);
    });

    it('is blocked when transport not allowed', async () => {
      const http = mockHttp();
      const safety = { ...unrestrictedSafetyConfig(), allowTransportableEdits: false };
      await expect(createObject(http, safety, '/url', '<xml/>', 'application/xml', 'DEVK900001')).rejects.toThrow(
        AdtSafetyError,
      );
    });

    it('allows transport when allowTransportableEdits is true', async () => {
      const http = mockHttp();
      const safety = { ...unrestrictedSafetyConfig(), allowTransportableEdits: true };
      await expect(
        createObject(http, safety, '/url', '<xml/>', 'application/xml', 'A4HK900001'),
      ).resolves.not.toThrow();
    });
  });

  // ─── updateSource ──────────────────────────────────────────────────

  describe('updateSource', () => {
    it('sends PUT with lock handle', async () => {
      const http = mockHttp();
      await updateSource(
        http,
        unrestrictedSafetyConfig(),
        '/sap/bc/adt/programs/programs/ZTEST/source/main',
        'REPORT z.',
        'HANDLE',
      );
      expect(http.put).toHaveBeenCalledWith(expect.stringContaining('lockHandle=HANDLE'), 'REPORT z.', 'text/plain');
    });

    it('includes transport in URL when provided', async () => {
      const http = mockHttp();
      const safety = { ...unrestrictedSafetyConfig(), allowTransportableEdits: true };
      await updateSource(http, safety, '/source/main', 'REPORT z.', 'HANDLE', 'DEVK900001');
      const url = (http.put as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string;
      expect(url).toContain('lockHandle=HANDLE');
      expect(url).toContain('corrNr=DEVK900001');
    });

    it('handles URL that already has query params', async () => {
      const http = mockHttp();
      await updateSource(http, unrestrictedSafetyConfig(), '/source/main?existing=true', 'source', 'HANDLE');
      const url = (http.put as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string;
      expect(url).toContain('existing=true');
      expect(url).toContain('&lockHandle=HANDLE'); // uses & not ?
    });

    it('is blocked in read-only mode', async () => {
      const http = mockHttp();
      const safety = { ...unrestrictedSafetyConfig(), readOnly: true };
      await expect(updateSource(http, safety, '/url', 'source', 'handle')).rejects.toThrow(AdtSafetyError);
    });
  });

  // ─── deleteObject ──────────────────────────────────────────────────

  describe('deleteObject', () => {
    it('sends DELETE with lock handle', async () => {
      const http = mockHttp();
      await deleteObject(http, unrestrictedSafetyConfig(), '/sap/bc/adt/programs/programs/ZTEST', 'HANDLE');
      expect(http.delete).toHaveBeenCalledWith(expect.stringContaining('lockHandle=HANDLE'));
    });

    it('includes transport in URL', async () => {
      const http = mockHttp();
      await deleteObject(http, unrestrictedSafetyConfig(), '/url', 'HANDLE', 'DEVK900001');
      const url = (http.delete as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string;
      expect(url).toContain('corrNr=DEVK900001');
    });

    it('is blocked in read-only mode', async () => {
      const http = mockHttp();
      const safety = { ...unrestrictedSafetyConfig(), readOnly: true };
      await expect(deleteObject(http, safety, '/url', 'handle')).rejects.toThrow(AdtSafetyError);
    });

    it('is blocked when Delete operations are disallowed', async () => {
      const http = mockHttp();
      const safety = { ...unrestrictedSafetyConfig(), disallowedOps: 'D' };
      await expect(deleteObject(http, safety, '/url', 'handle')).rejects.toThrow(AdtSafetyError);
    });
  });

  // ─── safeUpdateSource ──────────────────────────────────────────────

  describe('safeUpdateSource', () => {
    it('performs lock → update → unlock in stateful session', async () => {
      const http = mockHttp();
      await safeUpdateSource(
        http,
        unrestrictedSafetyConfig(),
        '/sap/bc/adt/programs/programs/ZTEST',
        '/sap/bc/adt/programs/programs/ZTEST/source/main',
        'REPORT ztest.',
      );
      expect(http.withStatefulSession).toHaveBeenCalled();
    });

    it('unlocks even if update fails (try-finally)', async () => {
      const postMock = vi
        .fn()
        .mockResolvedValueOnce({
          statusCode: 200,
          headers: {},
          body: '<asx:abap xmlns:asx="http://www.sap.com/abapxml"><asx:values><DATA><LOCK_HANDLE>H1</LOCK_HANDLE><CORRNR></CORRNR><IS_LOCAL>X</IS_LOCAL></DATA></asx:values></asx:abap>',
        })
        // unlock post
        .mockResolvedValueOnce({ statusCode: 200, headers: {}, body: '' });
      const putMock = vi.fn().mockRejectedValueOnce(new Error('Update failed'));

      const http = {
        ...mockHttp(),
        withStatefulSession: vi.fn().mockImplementation(async (fn: any) => {
          const session = {
            post: postMock,
            put: putMock,
          };
          return fn(session);
        }),
      } as unknown as AdtHttpClient;

      await expect(
        safeUpdateSource(http, unrestrictedSafetyConfig(), '/obj', '/obj/source/main', 'source'),
      ).rejects.toThrow('Update failed');

      // Unlock should still have been called (via finally)
      expect(postMock).toHaveBeenCalledTimes(2); // lock + unlock
      const unlockUrl = postMock.mock.calls[1]?.[0] as string;
      expect(unlockUrl).toContain('_action=UNLOCK');
    });
  });
});
