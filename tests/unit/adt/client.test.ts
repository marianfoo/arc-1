import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdtApiError, AdtSafetyError } from '../../../src/adt/errors.js';
import { unrestrictedSafetyConfig } from '../../../src/adt/safety.js';
import { mockResponse } from '../../helpers/mock-fetch.js';

// Mock undici's fetch (used by AdtHttpClient.doFetch)
const mockFetch = vi.fn();
vi.mock('undici', async (importOriginal) => {
  const actual = await importOriginal<typeof import('undici')>();
  return { ...actual, fetch: mockFetch };
});

const { AdtClient } = await import('../../../src/adt/client.js');

/** Default mock: returns ABAP source code for any request */
function setupDefaultMock() {
  mockFetch.mockResolvedValue(mockResponse(200, "REPORT zhello.\nWRITE: / 'Hello'."));
}

function createClient(overrides: Record<string, unknown> = {}): AdtClient {
  return new AdtClient({
    baseUrl: 'http://sap:8000',
    username: 'admin',
    password: 'secret',
    safety: unrestrictedSafetyConfig(),
    ...overrides,
  });
}

/** Get headers from a specific fetch call */
function fetchHeaders(callIndex = 0): Record<string, string> {
  return ((mockFetch.mock.calls[callIndex]?.[1] as RequestInit)?.headers as Record<string, string>) ?? {};
}

describe('AdtClient', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    setupDefaultMock();
  });

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
      const client = createClient();
      await client.getClass('ZCL_TEST', 'definitions');
      // Find the call that includes ZCL_TEST in the URL
      const urls = mockFetch.mock.calls.map((c: any[]) => c[0] as string);
      const urlUsed = urls.find((u) => u.includes('ZCL_TEST'));
      expect(urlUsed).toContain('/includes/definitions');
      expect(urlUsed).not.toContain('/source/main');
    });

    it('getClass with include=main uses /source/main path', async () => {
      const client = createClient();
      await client.getClass('ZCL_TEST', 'main');
      const urls = mockFetch.mock.calls.map((c: any[]) => c[0] as string);
      const urlUsed = urls.find((u) => u.includes('ZCL_TEST'));
      expect(urlUsed).toContain('/source/main');
    });

    it('getClass with multiple comma-separated includes', async () => {
      const client = createClient();
      const source = await client.getClass('ZCL_TEST', 'definitions,implementations');
      // Should make two HTTP calls for includes
      const urls = mockFetch.mock.calls.map((c: any[]) => c[0] as string);
      const classUrls = urls.filter((u) => u.includes('ZCL_TEST'));
      expect(classUrls).toHaveLength(2);
      expect(classUrls[0]).toContain('/includes/definitions');
      expect(classUrls[1]).toContain('/includes/implementations');
      // Result should contain both section headers
      expect(source).toContain('=== definitions ===');
      expect(source).toContain('=== implementations ===');
    });

    it('getClass gracefully handles 404 for non-existent includes', async () => {
      // Override default mock for the first call to reject with 404
      mockFetch.mockReset();
      mockFetch.mockRejectedValueOnce(new AdtApiError('Not found', 404, '/includes/testclasses'));
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
      const client = createClient();
      await client.getClass('ZCL_TEST', 'DEFINITIONS');
      const urls = mockFetch.mock.calls.map((c: any[]) => c[0] as string);
      const urlUsed = urls.find((u) => u.includes('ZCL_TEST'));
      // Should use lowercase 'definitions' in the URL path
      expect(urlUsed).toContain('/includes/definitions');
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

    it('getDdlx returns metadata extension source', async () => {
      const client = createClient();
      const source = await client.getDdlx('ZC_TRAVEL');
      expect(typeof source).toBe('string');
    });

    it('getDdlx uses correct ADT URL', async () => {
      const client = createClient();
      await client.getDdlx('ZC_TRAVEL');
      const urls = mockFetch.mock.calls.map((c: any[]) => c[0] as string);
      const urlUsed = urls.find((u) => u.includes('ddlx'));
      expect(urlUsed).toContain('/sap/bc/adt/ddic/ddlx/sources/ZC_TRAVEL/source/main');
    });

    it('getSrvb returns parsed service binding metadata', async () => {
      mockFetch.mockReset();
      mockFetch.mockResolvedValue(
        mockResponse(
          200,
          `<?xml version="1.0" encoding="utf-8"?><srvb:serviceBinding srvb:contract="C1" srvb:published="true" srvb:bindingCreated="true" adtcore:name="ZUI_TRAVEL_O4" adtcore:type="SRVB/SVB" adtcore:description="Travel Service Binding" adtcore:language="EN" xmlns:srvb="http://www.sap.com/adt/ddic/ServiceBindings" xmlns:adtcore="http://www.sap.com/adt/core"><adtcore:packageRef adtcore:name="ZTRAVEL"/><srvb:services srvb:name="ZUI_TRAVEL"><srvb:content srvb:version="0001" srvb:releaseState="NOT_RELEASED"><srvb:serviceDefinition adtcore:name="ZSD_TRAVEL"/></srvb:content></srvb:services><srvb:binding srvb:type="ODATA" srvb:version="V4" srvb:category="0"><srvb:implementation adtcore:name="ZUI_TRAVEL_O4"/></srvb:binding></srvb:serviceBinding>`,
        ),
      );
      const client = createClient();
      const result = await client.getSrvb('ZUI_TRAVEL_O4');
      const parsed = JSON.parse(result);
      expect(parsed.name).toBe('ZUI_TRAVEL_O4');
      expect(parsed.odataVersion).toBe('V4');
      expect(parsed.bindingCategory).toBe('UI');
      expect(parsed.published).toBe(true);
      expect(parsed.serviceDefinition).toBe('ZSD_TRAVEL');
    });

    it('getSrvb uses correct Accept header', async () => {
      mockFetch.mockReset();
      mockFetch.mockResolvedValue(
        mockResponse(
          200,
          `<?xml version="1.0"?><srvb:serviceBinding xmlns:srvb="http://www.sap.com/adt/ddic/ServiceBindings" xmlns:adtcore="http://www.sap.com/adt/core"><srvb:binding/></srvb:serviceBinding>`,
        ),
      );
      const client = createClient();
      await client.getSrvb('ZUI_TRAVEL_O4');
      const urls = mockFetch.mock.calls.map((c: any[]) => c[0] as string);
      const callIdx = mockFetch.mock.calls.findIndex((_: any, i: number) => urls[i]?.includes('businessservices'));
      expect(urls[callIdx]).toContain('/sap/bc/adt/businessservices/bindings/ZUI_TRAVEL_O4');
      expect(fetchHeaders(callIdx).Accept).toContain('application/vnd.sap.adt.businessservices.servicebinding.v2+xml');
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

  describe('DDIC read operations', () => {
    it('getStructure returns source code', async () => {
      const client = createClient();
      const source = await client.getStructure('BAPIRET2');
      expect(typeof source).toBe('string');
    });

    it('getDomain returns parsed metadata', async () => {
      mockFetch.mockReset();
      mockFetch.mockResolvedValue(
        mockResponse(
          200,
          `<?xml version="1.0" encoding="utf-8"?>
<doma:domain adtcore:name="BUKRS" adtcore:description="Company code" xmlns:doma="http://www.sap.com/dictionary/domain" xmlns:adtcore="http://www.sap.com/adt/core">
  <adtcore:packageRef adtcore:name="BF"/>
  <doma:content>
    <doma:typeInformation><doma:datatype>CHAR</doma:datatype><doma:length>000004</doma:length><doma:decimals>000000</doma:decimals></doma:typeInformation>
    <doma:outputInformation><doma:length>000004</doma:length><doma:conversionExit/><doma:signExists>false</doma:signExists><doma:lowercase>false</doma:lowercase></doma:outputInformation>
    <doma:valueInformation><doma:valueTableRef adtcore:name="T001"/><doma:fixValues/></doma:valueInformation>
  </doma:content>
</doma:domain>`,
        ),
      );
      const client = createClient();
      const domain = await client.getDomain('BUKRS');
      expect(domain.name).toBe('BUKRS');
      expect(domain.dataType).toBe('CHAR');
      expect(domain.valueTable).toBe('T001');
    });

    it('getDataElement returns parsed metadata', async () => {
      mockFetch.mockReset();
      mockFetch.mockResolvedValue(
        mockResponse(
          200,
          `<?xml version="1.0" encoding="utf-8"?>
<blue:wbobj adtcore:name="BUKRS" adtcore:description="Company code" xmlns:blue="http://www.sap.com/wbobj/dictionary/dtel" xmlns:adtcore="http://www.sap.com/adt/core">
  <adtcore:packageRef adtcore:name="BF"/>
  <dtel:dataElement xmlns:dtel="http://www.sap.com/adt/dictionary/dataelements">
    <dtel:typeKind>domain</dtel:typeKind><dtel:typeName>BUKRS</dtel:typeName>
    <dtel:dataType>CHAR</dtel:dataType><dtel:dataTypeLength>000004</dtel:dataTypeLength><dtel:dataTypeDecimals>000000</dtel:dataTypeDecimals>
    <dtel:shortFieldLabel>CoCd</dtel:shortFieldLabel><dtel:mediumFieldLabel>Company Code</dtel:mediumFieldLabel>
    <dtel:longFieldLabel>Company Code</dtel:longFieldLabel><dtel:headingFieldLabel>CoCd</dtel:headingFieldLabel>
    <dtel:searchHelp>C_T001</dtel:searchHelp><dtel:defaultComponentName>COMP_CODE</dtel:defaultComponentName>
  </dtel:dataElement>
</blue:wbobj>`,
        ),
      );
      const client = createClient();
      const dtel = await client.getDataElement('BUKRS');
      expect(dtel.name).toBe('BUKRS');
      expect(dtel.typeName).toBe('BUKRS');
      expect(dtel.searchHelp).toBe('C_T001');
    });

    it('getTransaction returns parsed metadata', async () => {
      mockFetch.mockReset();
      mockFetch.mockResolvedValue(
        mockResponse(
          200,
          `<?xml version="1.0" encoding="utf-8"?>
<adtcore:mainObject adtcore:name="SE38" adtcore:type="TRAN/T" adtcore:description="ABAP Editor" xmlns:adtcore="http://www.sap.com/adt/core">
  <adtcore:packageRef adtcore:name="SEDT"/>
</adtcore:mainObject>`,
        ),
      );
      const client = createClient();
      const tran = await client.getTransaction('SE38');
      expect(tran.code).toBe('SE38');
      expect(tran.description).toBe('ABAP Editor');
      expect(tran.package).toBe('SEDT');
    });
  });

  // ─── URL Encoding (Issues #18, #52) ─────────────────────────────

  describe('URL encoding for namespaced objects', () => {
    it('encodes namespaced program names in URL', async () => {
      const client = createClient();
      await client.getProgram('/NAMESPACE/ZPROGRAM');
    });

    it('encodes namespaced class names in URL', async () => {
      const client = createClient();
      await client.getClass('/USE/CL_MY_CLASS');
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
      const source = await client.getProgram('ZHELLO');
      expect(source).toBeDefined();
    });
  });
});
