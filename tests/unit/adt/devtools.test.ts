import { describe, expect, it, vi } from 'vitest';
import { activate, runAtcCheck, runUnitTests, syntaxCheck } from '../../../ts-src/adt/devtools.js';
import { AdtSafetyError } from '../../../ts-src/adt/errors.js';
import type { AdtHttpClient } from '../../../ts-src/adt/http.js';
import { unrestrictedSafetyConfig } from '../../../ts-src/adt/safety.js';

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

describe('DevTools', () => {
  // ─── syntaxCheck ───────────────────────────────────────────────────

  describe('syntaxCheck', () => {
    it('returns no errors for clean code', async () => {
      const http = mockHttp('<checkMessages/>');
      const result = await syntaxCheck(http, unrestrictedSafetyConfig(), '/sap/bc/adt/programs/programs/ZTEST');
      expect(result.hasErrors).toBe(false);
      expect(result.messages).toEqual([]);
    });

    it('detects syntax errors', async () => {
      const xml = '<checkMessages><msg type="E" line="5" col="1" shortText="Syntax error"/></checkMessages>';
      const http = mockHttp(xml);
      const result = await syntaxCheck(http, unrestrictedSafetyConfig(), '/sap/bc/adt/programs/programs/ZTEST');
      expect(result.hasErrors).toBe(true);
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0]?.severity).toBe('error');
      expect(result.messages[0]?.line).toBe(5);
      expect(result.messages[0]?.column).toBe(1);
    });

    it('distinguishes warnings from errors (Issue #33: EditSource treats warnings as errors)', async () => {
      // This test ensures we correctly classify severity — critical for Issue #33
      // where syntax warnings like "Redundant conversion" blocked saves
      const xml = `<checkMessages>
        <msg type="W" line="10" col="5" shortText="Redundant conversion for type STRING"/>
        <msg type="I" line="15" col="1" shortText="Informational message"/>
      </checkMessages>`;
      const http = mockHttp(xml);
      const result = await syntaxCheck(http, unrestrictedSafetyConfig(), '/sap/bc/adt/programs/programs/ZTEST');
      expect(result.hasErrors).toBe(false); // Only warnings + info, no errors
      expect(result.messages).toHaveLength(2);
      expect(result.messages[0]?.severity).toBe('warning');
      expect(result.messages[1]?.severity).toBe('info');
    });

    it('handles mixed errors and warnings', async () => {
      const xml = `<checkMessages>
        <msg type="E" line="5" col="1" shortText="Unknown type"/>
        <msg type="W" line="10" col="3" shortText="Unused variable"/>
      </checkMessages>`;
      const http = mockHttp(xml);
      const result = await syntaxCheck(http, unrestrictedSafetyConfig(), '/sap/bc/adt/programs/programs/ZTEST');
      expect(result.hasErrors).toBe(true);
      expect(result.messages).toHaveLength(2);
    });

    it('sends correct XML payload and headers', async () => {
      const http = mockHttp('<checkMessages/>');
      await syntaxCheck(http, unrestrictedSafetyConfig(), '/sap/bc/adt/programs/programs/ZTEST');
      expect(http.post).toHaveBeenCalledWith(
        '/sap/bc/adt/checkruns',
        expect.stringContaining('checkObjectList'),
        'application/vnd.sap.adt.checkobjects+xml',
        expect.objectContaining({ Accept: 'application/vnd.sap.adt.checkmessages+xml' }),
      );
    });

    it('is blocked when Read is disallowed', async () => {
      const http = mockHttp();
      const safety = { ...unrestrictedSafetyConfig(), disallowedOps: 'R' };
      await expect(syntaxCheck(http, safety, '/sap/bc/adt/programs/programs/ZTEST')).rejects.toThrow(AdtSafetyError);
    });
  });

  // ─── activate ──────────────────────────────────────────────────────

  describe('activate', () => {
    it('returns success when no errors', async () => {
      const http = mockHttp('<activation/>');
      const result = await activate(http, unrestrictedSafetyConfig(), '/sap/bc/adt/programs/programs/ZTEST');
      expect(result.success).toBe(true);
    });

    it('is blocked in read-only mode', async () => {
      const http = mockHttp();
      const safety = { ...unrestrictedSafetyConfig(), readOnly: true };
      await expect(activate(http, safety, '/sap/bc/adt/programs/programs/ZTEST')).rejects.toThrow(AdtSafetyError);
    });

    it('detects activation errors from severity="error"', async () => {
      const xml = '<messages><msg severity="error" shortText="Cannot activate"/></messages>';
      const http = mockHttp(xml);
      const result = await activate(http, unrestrictedSafetyConfig(), '/sap/bc/adt/programs/programs/ZTEST');
      expect(result.success).toBe(false);
      expect(result.messages).toContain('Cannot activate');
    });

    it('detects activation errors from type="E"', async () => {
      const xml = '<messages><msg type="E" shortText="Syntax error in object"/></messages>';
      const http = mockHttp(xml);
      const result = await activate(http, unrestrictedSafetyConfig(), '/sap/bc/adt/programs/programs/ZTEST');
      expect(result.success).toBe(false);
    });

    it('extracts multiple messages', async () => {
      const xml = '<messages><msg shortText="Warning 1"/><msg shortText="Warning 2"/></messages>';
      const http = mockHttp(xml);
      const result = await activate(http, unrestrictedSafetyConfig(), '/sap/bc/adt/programs/programs/ZTEST');
      expect(result.messages).toHaveLength(2);
    });

    it('sends activation request to correct endpoint', async () => {
      const http = mockHttp('<activation/>');
      await activate(http, unrestrictedSafetyConfig(), '/sap/bc/adt/programs/programs/ZTEST');
      expect(http.post).toHaveBeenCalledWith(
        '/sap/bc/adt/activation',
        expect.stringContaining('objectReference'),
        'application/xml',
        expect.objectContaining({ Accept: 'application/xml' }),
      );
    });
  });

  // ─── runUnitTests ──────────────────────────────────────────────────

  describe('runUnitTests', () => {
    it('parses passing tests', async () => {
      const xml = `<testResult>
        <testMethod name="test_success"></testMethod>
      </testResult>`;
      const http = mockHttp(xml);
      const results = await runUnitTests(http, unrestrictedSafetyConfig(), '/sap/bc/adt/oo/classes/ZCL_TEST');
      expect(results).toHaveLength(1);
      expect(results[0]?.testMethod).toBe('test_success');
      expect(results[0]?.status).toBe('passed');
    });

    it('detects failing tests (with alerts)', async () => {
      const xml = `<testResult>
        <testMethod name="test_fail"><alert kind="failedAssertion"/></testMethod>
      </testResult>`;
      const http = mockHttp(xml);
      const results = await runUnitTests(http, unrestrictedSafetyConfig(), '/sap/bc/adt/oo/classes/ZCL_TEST');
      expect(results).toHaveLength(1);
      expect(results[0]?.status).toBe('failed');
    });

    it('handles empty results (no test methods)', async () => {
      const http = mockHttp('<testResult/>');
      const results = await runUnitTests(http, unrestrictedSafetyConfig(), '/sap/bc/adt/oo/classes/ZCL_TEST');
      expect(results).toEqual([]);
    });

    it('handles multiple test methods', async () => {
      const xml = `<testResult>
        <testMethod name="test_a"></testMethod>
        <testMethod name="test_b"><alert kind="failedAssertion"/></testMethod>
        <testMethod name="test_c"></testMethod>
      </testResult>`;
      const http = mockHttp(xml);
      const results = await runUnitTests(http, unrestrictedSafetyConfig(), '/sap/bc/adt/oo/classes/ZCL_TEST');
      expect(results).toHaveLength(3);
      expect(results[0]?.status).toBe('passed');
      expect(results[1]?.status).toBe('failed');
      expect(results[2]?.status).toBe('passed');
    });

    it('is blocked when T is disallowed', async () => {
      const http = mockHttp();
      const safety = { ...unrestrictedSafetyConfig(), disallowedOps: 'T' };
      await expect(runUnitTests(http, safety, '/sap/bc/adt/oo/classes/ZCL_TEST')).rejects.toThrow(AdtSafetyError);
    });
  });

  // ─── runAtcCheck ───────────────────────────────────────────────────

  describe('runAtcCheck', () => {
    it('parses ATC findings', async () => {
      const createResp = '<atcResult id="42"/>';
      const resultResp = `<worklist>
        <finding priority="1" checkTitle="Extended Check" messageTitle="Unused variable"/>
        <finding priority="2" checkTitle="Naming" messageTitle="Non-standard naming"/>
      </worklist>`;
      const http = {
        ...mockHttp(createResp),
        get: vi.fn().mockResolvedValue({ statusCode: 200, headers: {}, body: resultResp }),
      } as unknown as AdtHttpClient;

      const result = await runAtcCheck(http, unrestrictedSafetyConfig(), '/sap/bc/adt/oo/classes/ZCL_TEST');
      expect(result.findings).toHaveLength(2);
      expect(result.findings[0]?.priority).toBe(1);
      expect(result.findings[0]?.checkTitle).toBe('Extended Check');
      expect(result.findings[1]?.priority).toBe(2);
    });

    it('handles empty ATC results', async () => {
      const createResp = '<atcResult id="42"/>';
      const resultResp = '<worklist/>';
      const http = {
        ...mockHttp(createResp),
        get: vi.fn().mockResolvedValue({ statusCode: 200, headers: {}, body: resultResp }),
      } as unknown as AdtHttpClient;

      const result = await runAtcCheck(http, unrestrictedSafetyConfig(), '/sap/bc/adt/oo/classes/ZCL_TEST');
      expect(result.findings).toEqual([]);
    });

    it('sends create request and fetches worklist', async () => {
      const createResp = '<atcResult id="123"/>';
      const resultResp = '<worklist/>';
      const http = {
        ...mockHttp(createResp),
        get: vi.fn().mockResolvedValue({ statusCode: 200, headers: {}, body: resultResp }),
      } as unknown as AdtHttpClient;

      await runAtcCheck(http, unrestrictedSafetyConfig(), '/sap/bc/adt/oo/classes/ZCL_TEST');

      // Should POST to create run, then GET worklist
      expect(http.post).toHaveBeenCalledWith(
        expect.stringContaining('/sap/bc/adt/atc/runs'),
        expect.stringContaining('objectReference'),
        'application/xml',
        expect.objectContaining({ Accept: 'application/xml' }),
      );
      expect(http.get).toHaveBeenCalledWith(
        expect.stringContaining('/sap/bc/adt/atc/worklists/'),
        expect.objectContaining({ Accept: expect.stringContaining('atc.worklist') }),
      );
    });
  });
});
