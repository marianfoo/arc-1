import { describe, expect, it, vi } from 'vitest';
import {
  activate,
  activateBatch,
  parseActivationResult,
  publishServiceBinding,
  runAtcCheck,
  runUnitTests,
  syntaxCheck,
  unpublishServiceBinding,
} from '../../../src/adt/devtools.js';
import { AdtSafetyError } from '../../../src/adt/errors.js';
import type { AdtHttpClient } from '../../../src/adt/http.js';
import { unrestrictedSafetyConfig } from '../../../src/adt/safety.js';

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

    it('handles reversed attribute order (Issue #3)', async () => {
      const xml = '<checkMessages><msg line="5" col="1" type="E" shortText="Error found"/></checkMessages>';
      const http = mockHttp(xml);
      const result = await syntaxCheck(http, unrestrictedSafetyConfig(), '/sap/bc/adt/programs/programs/ZTEST');
      expect(result.hasErrors).toBe(true);
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0]).toEqual({ severity: 'error', text: 'Error found', line: 5, column: 1 });
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

    it('does not false-positive on adtcore:type="ENHO/E" in URIs (Issue #11)', async () => {
      const xml = `<messages>
        <msg severity="info" shortText="Object activated" adtcore:type="ENHO/E" adtcore:uri="/sap/bc/adt/enhancements/ZENHO_TEST"/>
      </messages>`;
      const http = mockHttp(xml);
      const result = await activate(http, unrestrictedSafetyConfig(), '/sap/bc/adt/enhancements/ZENHO_TEST');
      expect(result.success).toBe(true);
    });

    it('detects severity="fatal" and type="A" as errors', async () => {
      const xml = `<messages>
        <msg severity="fatal" shortText="Fatal activation error"/>
        <msg type="A" shortText="Abend during activation"/>
      </messages>`;
      const http = mockHttp(xml);
      const result = await activate(http, unrestrictedSafetyConfig(), '/sap/bc/adt/programs/programs/ZTEST');
      expect(result.success).toBe(false);
      expect(result.messages).toContain('Fatal activation error');
      expect(result.messages).toContain('Abend during activation');
    });

    it('detects type="A" alone as error without severity attribute', async () => {
      const xml = `<messages>
        <msg type="A" shortText="Abend during activation"/>
      </messages>`;
      const http = mockHttp(xml);
      const result = await activate(http, unrestrictedSafetyConfig(), '/sap/bc/adt/programs/programs/ZTEST');
      expect(result.success).toBe(false);
      expect(result.messages).toContain('Abend during activation');
    });

    it('extracts multiple messages', async () => {
      const xml = '<messages><msg shortText="Warning 1"/><msg shortText="Warning 2"/></messages>';
      const http = mockHttp(xml);
      const result = await activate(http, unrestrictedSafetyConfig(), '/sap/bc/adt/programs/programs/ZTEST');
      expect(result.messages).toHaveLength(2);
    });

    it('returns success for empty response body', async () => {
      const http = mockHttp('');
      const result = await activate(http, unrestrictedSafetyConfig(), '/sap/bc/adt/programs/programs/ZTEST');
      expect(result.success).toBe(true);
      expect(result.messages).toEqual([]);
    });

    it('returns success for whitespace-only response body', () => {
      const result = parseActivationResult('   ');
      expect(result.success).toBe(true);
      expect(result.messages).toEqual([]);
    });

    it('sends activation request to correct endpoint with method param', async () => {
      const http = mockHttp('<activation/>');
      await activate(http, unrestrictedSafetyConfig(), '/sap/bc/adt/programs/programs/ZTEST');
      expect(http.post).toHaveBeenCalledWith(
        '/sap/bc/adt/activation?method=activate&preauditRequested=true',
        expect.stringContaining('objectReference'),
        'application/xml',
        expect.objectContaining({ Accept: 'application/xml' }),
      );
    });
  });

  // ─── activateBatch ────────────────────────────────────────────────

  describe('activateBatch', () => {
    it('returns success when no errors', async () => {
      const http = mockHttp(
        '<chkl:messages xmlns:chkl="http://www.sap.com/abapxml/checklist"><chkl:properties checkExecuted="false" activationExecuted="true" generationExecuted="true"/></chkl:messages>',
      );
      const result = await activateBatch(http, unrestrictedSafetyConfig(), [
        { url: '/sap/bc/adt/ddic/ddl/sources/ZI_TRAVEL', name: 'ZI_TRAVEL' },
        { url: '/sap/bc/adt/bo/behaviordefinitions/ZI_TRAVEL', name: 'ZI_TRAVEL' },
      ]);
      expect(result.success).toBe(true);
    });

    it('includes all objects in activation XML payload', async () => {
      const http = mockHttp('<activation/>');
      await activateBatch(http, unrestrictedSafetyConfig(), [
        { url: '/sap/bc/adt/ddic/ddl/sources/ZI_TRAVEL', name: 'ZI_TRAVEL' },
        { url: '/sap/bc/adt/bo/behaviordefinitions/ZI_TRAVEL', name: 'ZI_TRAVEL' },
        { url: '/sap/bc/adt/ddic/srvd/sources/ZSD_TRAVEL', name: 'ZSD_TRAVEL' },
      ]);

      const callArgs = (http.post as any).mock.calls[0];
      const body = callArgs[1] as string;
      expect(body).toContain('adtcore:uri="/sap/bc/adt/ddic/ddl/sources/ZI_TRAVEL"');
      expect(body).toContain('adtcore:uri="/sap/bc/adt/bo/behaviordefinitions/ZI_TRAVEL"');
      expect(body).toContain('adtcore:uri="/sap/bc/adt/ddic/srvd/sources/ZSD_TRAVEL"');
      expect(body).toContain('adtcore:name="ZI_TRAVEL"');
      expect(body).toContain('adtcore:name="ZSD_TRAVEL"');
    });

    it('sends to activation endpoint with method param', async () => {
      const http = mockHttp('<activation/>');
      await activateBatch(http, unrestrictedSafetyConfig(), [
        { url: '/sap/bc/adt/programs/programs/ZTEST', name: 'ZTEST' },
      ]);
      expect(http.post).toHaveBeenCalledWith(
        '/sap/bc/adt/activation?method=activate&preauditRequested=true',
        expect.any(String),
        'application/xml',
        expect.objectContaining({ Accept: 'application/xml' }),
      );
    });

    it('detects errors in batch activation response', async () => {
      const xml = '<messages><msg severity="error" shortText="Activation failed for ZI_TRAVEL"/></messages>';
      const http = mockHttp(xml);
      const result = await activateBatch(http, unrestrictedSafetyConfig(), [
        { url: '/sap/bc/adt/ddic/ddl/sources/ZI_TRAVEL', name: 'ZI_TRAVEL' },
      ]);
      expect(result.success).toBe(false);
      expect(result.messages).toContain('Activation failed for ZI_TRAVEL');
    });

    it('is blocked in read-only mode', async () => {
      const http = mockHttp();
      const safety = { ...unrestrictedSafetyConfig(), readOnly: true };
      await expect(
        activateBatch(http, safety, [{ url: '/sap/bc/adt/programs/programs/ZTEST', name: 'ZTEST' }]),
      ).rejects.toThrow(AdtSafetyError);
    });
  });

  // ─── publishServiceBinding ─────────────────────────────────────────

  describe('publishServiceBinding', () => {
    const okResponse =
      '<asx:abap xmlns:asx="http://www.sap.com/abapxml"><asx:values><DATA><SEVERITY>OK</SEVERITY><SHORT_TEXT>published locally</SHORT_TEXT><LONG_TEXT/></DATA></asx:values></asx:abap>';

    it('sends POST to publishjobs endpoint with objectReferences body', async () => {
      const http = mockHttp(okResponse);
      const result = await publishServiceBinding(http, unrestrictedSafetyConfig(), 'ZSB_BOOKING_V4');
      expect(http.post).toHaveBeenCalledWith(
        '/sap/bc/adt/businessservices/odatav2/publishjobs?servicename=ZSB_BOOKING_V4&serviceversion=0001',
        expect.stringContaining('adtcore:objectReference adtcore:name="ZSB_BOOKING_V4"'),
        'application/xml',
        expect.objectContaining({ Accept: 'application/*' }),
      );
      expect(result.severity).toBe('OK');
      expect(result.shortText).toBe('published locally');
    });

    it('encodes the service binding name in the URL', async () => {
      const http = mockHttp(okResponse);
      await publishServiceBinding(http, unrestrictedSafetyConfig(), '/DMO/UI_FLIGHT_R_V2');
      expect(http.post).toHaveBeenCalledWith(
        '/sap/bc/adt/businessservices/odatav2/publishjobs?servicename=%2FDMO%2FUI_FLIGHT_R_V2&serviceversion=0001',
        expect.any(String),
        'application/xml',
        expect.any(Object),
      );
    });

    it('passes custom service version', async () => {
      const http = mockHttp(okResponse);
      await publishServiceBinding(http, unrestrictedSafetyConfig(), 'ZSB_TEST', '0002');
      expect(http.post).toHaveBeenCalledWith(
        expect.stringContaining('serviceversion=0002'),
        expect.any(String),
        'application/xml',
        expect.any(Object),
      );
    });

    it('parses error responses', async () => {
      const errorXml =
        '<asx:abap xmlns:asx="http://www.sap.com/abapxml"><asx:values><DATA><SEVERITY>ERROR</SEVERITY><SHORT_TEXT>Activating failed</SHORT_TEXT><LONG_TEXT>TADIR check failed</LONG_TEXT></DATA></asx:values></asx:abap>';
      const http = mockHttp(errorXml);
      const result = await publishServiceBinding(http, unrestrictedSafetyConfig(), 'ZSB_TEST');
      expect(result.severity).toBe('ERROR');
      expect(result.shortText).toBe('Activating failed');
      expect(result.longText).toBe('TADIR check failed');
    });

    it('is blocked in read-only mode', async () => {
      const http = mockHttp();
      const safety = { ...unrestrictedSafetyConfig(), readOnly: true };
      await expect(publishServiceBinding(http, safety, 'ZSB_TEST')).rejects.toThrow(AdtSafetyError);
    });
  });

  // ─── unpublishServiceBinding ──────────────────────────────────────

  describe('unpublishServiceBinding', () => {
    const okResponse =
      '<asx:abap xmlns:asx="http://www.sap.com/abapxml"><asx:values><DATA><SEVERITY>OK</SEVERITY><SHORT_TEXT>un-published locally</SHORT_TEXT><LONG_TEXT/></DATA></asx:values></asx:abap>';

    it('sends POST to unpublishjobs endpoint with objectReferences body', async () => {
      const http = mockHttp(okResponse);
      const result = await unpublishServiceBinding(http, unrestrictedSafetyConfig(), 'ZSB_BOOKING_V4');
      expect(http.post).toHaveBeenCalledWith(
        '/sap/bc/adt/businessservices/odatav2/unpublishjobs?servicename=ZSB_BOOKING_V4&serviceversion=0001',
        expect.stringContaining('adtcore:objectReference adtcore:name="ZSB_BOOKING_V4"'),
        'application/xml',
        expect.objectContaining({ Accept: 'application/*' }),
      );
      expect(result.severity).toBe('OK');
      expect(result.shortText).toBe('un-published locally');
    });

    it('encodes the service binding name in the URL', async () => {
      const http = mockHttp(okResponse);
      await unpublishServiceBinding(http, unrestrictedSafetyConfig(), '/DMO/UI_FLIGHT_R_V2');
      expect(http.post).toHaveBeenCalledWith(
        '/sap/bc/adt/businessservices/odatav2/unpublishjobs?servicename=%2FDMO%2FUI_FLIGHT_R_V2&serviceversion=0001',
        expect.any(String),
        'application/xml',
        expect.any(Object),
      );
    });

    it('is blocked in read-only mode', async () => {
      const http = mockHttp();
      const safety = { ...unrestrictedSafetyConfig(), readOnly: true };
      await expect(unpublishServiceBinding(http, safety, 'ZSB_TEST')).rejects.toThrow(AdtSafetyError);
    });
  });

  // ─── runUnitTests ──────────────────────────────────────────────────

  describe('runUnitTests', () => {
    it('parses passing tests with class info', async () => {
      const xml = `<testResult>
        <testClass name="LTCL_TEST" uri="/sap/bc/adt/oo/classes/ZCL_TEST/includes/testclasses">
          <testMethod name="test_success"></testMethod>
        </testClass>
      </testResult>`;
      const http = mockHttp(xml);
      const results = await runUnitTests(http, unrestrictedSafetyConfig(), '/sap/bc/adt/oo/classes/ZCL_TEST');
      expect(results).toHaveLength(1);
      expect(results[0]?.testMethod).toBe('test_success');
      expect(results[0]?.status).toBe('passed');
      expect(results[0]?.testClass).toBe('LTCL_TEST');
      expect(results[0]?.program).toBe('ZCL_TEST');
    });

    it('detects failing tests (with alerts)', async () => {
      const xml = `<testResult>
        <testClass name="LTCL_TEST" uri="/sap/bc/adt/oo/classes/ZCL_TEST/includes/testclasses">
          <testMethod name="test_fail"><alert kind="failedAssertion"><title>Expected X got Y</title></alert></testMethod>
        </testClass>
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
        <testClass name="LTCL_TEST" uri="/sap/bc/adt/oo/classes/ZCL_TEST/includes/testclasses">
          <testMethod name="test_a"></testMethod>
          <testMethod name="test_b"><alert kind="failedAssertion"><title>Assertion failed</title></alert></testMethod>
          <testMethod name="test_c"></testMethod>
        </testClass>
      </testResult>`;
      const http = mockHttp(xml);
      const results = await runUnitTests(http, unrestrictedSafetyConfig(), '/sap/bc/adt/oo/classes/ZCL_TEST');
      expect(results).toHaveLength(3);
      expect(results[0]?.status).toBe('passed');
      expect(results[1]?.status).toBe('failed');
      expect(results[2]?.status).toBe('passed');
    });

    it('extracts alert message from title element', async () => {
      const xml = `<testResult>
        <testClass name="LTCL_TEST" uri="/sap/bc/adt/oo/classes/ZCL_TEST/includes/testclasses">
          <testMethod name="test_fail">
            <alert kind="failedAssertion"><title>Expected 42 got 0</title></alert>
          </testMethod>
        </testClass>
      </testResult>`;
      const http = mockHttp(xml);
      const results = await runUnitTests(http, unrestrictedSafetyConfig(), '/sap/bc/adt/oo/classes/ZCL_TEST');
      expect(results).toHaveLength(1);
      expect(results[0]?.message).toBe('Expected 42 got 0');
    });

    it('parses multiple test classes in one response', async () => {
      const xml = `<testResult>
        <testClass name="LTCL_FIRST" uri="/sap/bc/adt/oo/classes/ZCL_TEST/includes/testclasses">
          <testMethod name="test_one"></testMethod>
        </testClass>
        <testClass name="LTCL_SECOND" uri="/sap/bc/adt/oo/classes/ZCL_TEST/includes/testclasses">
          <testMethod name="test_two"></testMethod>
        </testClass>
      </testResult>`;
      const http = mockHttp(xml);
      const results = await runUnitTests(http, unrestrictedSafetyConfig(), '/sap/bc/adt/oo/classes/ZCL_TEST');
      expect(results).toHaveLength(2);
      expect(results[0]?.testClass).toBe('LTCL_FIRST');
      expect(results[0]?.testMethod).toBe('test_one');
      expect(results[1]?.testClass).toBe('LTCL_SECOND');
      expect(results[1]?.testMethod).toBe('test_two');
    });

    it('extracts program name from URI', async () => {
      const xml = `<testResult>
        <testClass name="LTCL_TEST" uri="/sap/bc/adt/oo/classes/ZCL_MY_CLASS/includes/testclasses">
          <testMethod name="test_it"></testMethod>
        </testClass>
      </testResult>`;
      const http = mockHttp(xml);
      const results = await runUnitTests(http, unrestrictedSafetyConfig(), '/sap/bc/adt/oo/classes/ZCL_MY_CLASS');
      expect(results[0]?.program).toBe('ZCL_MY_CLASS');
    });

    it('extracts duration from executionTime attribute', async () => {
      const xml = `<testResult>
        <testClass name="LTCL_TEST" uri="/sap/bc/adt/oo/classes/ZCL_TEST/includes/testclasses">
          <testMethod name="test_fast" executionTime="0.015"></testMethod>
        </testClass>
      </testResult>`;
      const http = mockHttp(xml);
      const results = await runUnitTests(http, unrestrictedSafetyConfig(), '/sap/bc/adt/oo/classes/ZCL_TEST');
      expect(results[0]?.duration).toBe(0.015);
    });

    it('is blocked when T is disallowed', async () => {
      const http = mockHttp();
      const safety = { ...unrestrictedSafetyConfig(), disallowedOps: 'T' };
      await expect(runUnitTests(http, safety, '/sap/bc/adt/oo/classes/ZCL_TEST')).rejects.toThrow(AdtSafetyError);
    });
  });

  // ─── XML attribute escaping ────────────────────────────────────────

  describe('XML attribute escaping', () => {
    it('syntaxCheck escapes special chars in object URL', async () => {
      const http = mockHttp('<checkMessages/>');
      await syntaxCheck(http, unrestrictedSafetyConfig(), '/sap/bc/adt/oo/classes/CL_TEST&FOO');

      const callArgs = (http.post as any).mock.calls[0];
      const body = callArgs[1] as string;
      expect(body).toContain('&amp;');
      expect(body).not.toContain('CL_TEST&FOO');
    });

    it('activate escapes special chars in object URL', async () => {
      const http = mockHttp('<activation/>');
      await activate(http, unrestrictedSafetyConfig(), '/sap/bc/adt/oo/classes/CL_TEST&FOO');

      const callArgs = (http.post as any).mock.calls[0];
      const body = callArgs[1] as string;
      expect(body).toContain('&amp;');
      expect(body).not.toContain('CL_TEST&FOO');
    });

    it('activateBatch escapes special chars in name and URL', async () => {
      const http = mockHttp('<activation/>');
      await activateBatch(http, unrestrictedSafetyConfig(), [
        { url: '/sap/bc/adt/oo/classes/CL_TEST', name: 'ZCL_"TEST"' },
      ]);

      const callArgs = (http.post as any).mock.calls[0];
      const body = callArgs[1] as string;
      expect(body).toContain('&quot;');
      expect(body).not.toContain('ZCL_"TEST"');
    });

    it('publishServiceBinding escapes name in XML body', async () => {
      const http = mockHttp('');
      await publishServiceBinding(http, unrestrictedSafetyConfig(), 'ZSRV<TEST');

      const callArgs = (http.post as any).mock.calls[0];
      const body = callArgs[1] as string;
      expect(body).toContain('&lt;');
      expect(body).not.toContain('ZSRV<TEST');
    });
  });

  // ─── runAtcCheck ───────────────────────────────────────────────────

  describe('runAtcCheck', () => {
    it('parses ATC findings', async () => {
      const createResp = '<atc:run xmlns:atc="http://www.sap.com/adt/atc" id="42" worklistId="42"/>';
      const resultResp = `<worklist>
        <finding priority="1" checkTitle="Extended Check" messageTitle="Unused variable" uri="/sap/bc/adt/oo/classes/ZCL_TEST/source/main#start=42,1"/>
        <finding priority="2" checkTitle="Naming" messageTitle="Non-standard naming" uri="/sap/bc/adt/oo/classes/ZCL_TEST/source/main#start=10,5"/>
      </worklist>`;
      const http = {
        ...mockHttp(createResp),
        get: vi.fn().mockResolvedValue({ statusCode: 200, headers: {}, body: resultResp }),
      } as unknown as AdtHttpClient;

      const result = await runAtcCheck(http, unrestrictedSafetyConfig(), '/sap/bc/adt/oo/classes/ZCL_TEST');
      expect(result.findings).toHaveLength(2);
      expect(result.findings[0]?.priority).toBe(1);
      expect(result.findings[0]?.checkTitle).toBe('Extended Check');
      expect(result.findings[0]?.uri).toContain('/sap/bc/adt/oo/classes/ZCL_TEST');
      expect(result.findings[0]?.line).toBe(42);
      expect(result.findings[1]?.priority).toBe(2);
      expect(result.findings[1]?.line).toBe(10);
    });

    it('handles empty ATC results', async () => {
      const createResp = '<atc:run xmlns:atc="http://www.sap.com/adt/atc" id="42" worklistId="42"/>';
      const resultResp = '<worklist/>';
      const http = {
        ...mockHttp(createResp),
        get: vi.fn().mockResolvedValue({ statusCode: 200, headers: {}, body: resultResp }),
      } as unknown as AdtHttpClient;

      const result = await runAtcCheck(http, unrestrictedSafetyConfig(), '/sap/bc/adt/oo/classes/ZCL_TEST');
      expect(result.findings).toEqual([]);
    });

    it('sends create request and fetches worklist', async () => {
      const createResp = '<atc:run xmlns:atc="http://www.sap.com/adt/atc" id="123" worklistId="123"/>';
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
        '/sap/bc/adt/atc/worklists/123',
        expect.objectContaining({ Accept: expect.stringContaining('atc.worklist') }),
      );
    });

    it('prefers worklistId over id attribute', async () => {
      const createResp = '<atc:run id="run123" worklistId="wl456"/>';
      const resultResp = '<worklist/>';
      const http = {
        ...mockHttp(createResp),
        get: vi.fn().mockResolvedValue({ statusCode: 200, headers: {}, body: resultResp }),
      } as unknown as AdtHttpClient;

      await runAtcCheck(http, unrestrictedSafetyConfig(), '/sap/bc/adt/oo/classes/ZCL_TEST');

      expect(http.get).toHaveBeenCalledWith(
        '/sap/bc/adt/atc/worklists/wl456',
        expect.objectContaining({ Accept: expect.stringContaining('atc.worklist') }),
      );
    });

    it('extracts URI and line from #start= fragment', async () => {
      const createResp = '<atc:run xmlns:atc="http://www.sap.com/adt/atc" id="42" worklistId="42"/>';
      const resultResp = `<worklist>
        <finding priority="1" checkTitle="Check" messageTitle="Issue" uri="/sap/bc/adt/oo/classes/ZCL_X/source/main#start=42,1"/>
      </worklist>`;
      const http = {
        ...mockHttp(createResp),
        get: vi.fn().mockResolvedValue({ statusCode: 200, headers: {}, body: resultResp }),
      } as unknown as AdtHttpClient;

      const result = await runAtcCheck(http, unrestrictedSafetyConfig(), '/sap/bc/adt/oo/classes/ZCL_X');
      expect(result.findings[0]?.uri).toBe('/sap/bc/adt/oo/classes/ZCL_X/source/main#start=42,1');
      expect(result.findings[0]?.line).toBe(42);
    });

    it('returns empty uri and line 0 for finding without URI', async () => {
      const createResp = '<atc:run xmlns:atc="http://www.sap.com/adt/atc" id="42" worklistId="42"/>';
      const resultResp = `<worklist>
        <finding priority="3" checkTitle="Check" messageTitle="General issue"/>
      </worklist>`;
      const http = {
        ...mockHttp(createResp),
        get: vi.fn().mockResolvedValue({ statusCode: 200, headers: {}, body: resultResp }),
      } as unknown as AdtHttpClient;

      const result = await runAtcCheck(http, unrestrictedSafetyConfig(), '/sap/bc/adt/oo/classes/ZCL_X');
      expect(result.findings[0]?.uri).toBe('');
      expect(result.findings[0]?.line).toBe(0);
    });

    it('parses correctly regardless of attribute order', async () => {
      const createResp = '<atc:run xmlns:atc="http://www.sap.com/adt/atc" id="42" worklistId="42"/>';
      const resultResp = `<worklist>
        <finding messageTitle="Wrong order" priority="2" uri="/sap/bc/adt/programs/programs/ZTEST#start=7,3" checkTitle="Order Check"/>
      </worklist>`;
      const http = {
        ...mockHttp(createResp),
        get: vi.fn().mockResolvedValue({ statusCode: 200, headers: {}, body: resultResp }),
      } as unknown as AdtHttpClient;

      const result = await runAtcCheck(http, unrestrictedSafetyConfig(), '/sap/bc/adt/programs/programs/ZTEST');
      expect(result.findings[0]?.priority).toBe(2);
      expect(result.findings[0]?.checkTitle).toBe('Order Check');
      expect(result.findings[0]?.messageTitle).toBe('Wrong order');
      expect(result.findings[0]?.line).toBe(7);
    });
  });
});
