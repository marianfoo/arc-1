import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdtApiError } from '../../../src/adt/errors.js';
import { unrestrictedSafetyConfig } from '../../../src/adt/safety.js';
import type { ResolvedFeatures } from '../../../src/adt/types.js';
import { DEFAULT_CONFIG } from '../../../src/server/types.js';
import { mockResponse } from '../../helpers/mock-fetch.js';

// Mock undici's fetch (used by AdtHttpClient.doFetch)
const mockFetch = vi.fn();
vi.mock('undici', async (importOriginal) => {
  const actual = await importOriginal<typeof import('undici')>();
  return { ...actual, fetch: mockFetch };
});

const { AdtClient } = await import('../../../src/adt/client.js');
const {
  handleToolCall,
  hasRequiredScope,
  resetCachedFeatures,
  setCachedFeatures,
  TOOL_SCOPES,
  buildCreateXml,
  transliterateQuery,
  looksLikeFieldName,
} = await import('../../../src/handlers/intent.js');

function createClient(): AdtClient {
  return new AdtClient({
    baseUrl: 'http://sap:8000',
    username: 'admin',
    password: 'secret',
    safety: unrestrictedSafetyConfig(),
  });
}

describe('Intent Handler', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Default: return ABAP source with CSRF token for any request
    mockFetch.mockResolvedValue(
      mockResponse(200, "REPORT zhello.\nWRITE: / 'Hello'.", { 'x-csrf-token': 'mock-csrf-token' }),
    );
  });

  // ─── SAPRead ───────────────────────────────────────────────────────

  describe('SAPRead', () => {
    it('reads a program (PROG)', async () => {
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPRead', {
        type: 'PROG',
        name: 'ZHELLO',
      });
      expect(result.isError).toBeUndefined();
      expect(result.content[0]?.text).toContain('REPORT zhello');
    });

    it('reads a class (CLAS)', async () => {
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPRead', {
        type: 'CLAS',
        name: 'ZCL_TEST',
      });
      expect(result.isError).toBeUndefined();
    });

    it('reads a class with include parameter', async () => {
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPRead', {
        type: 'CLAS',
        name: 'ZCL_TEST',
        include: 'testclasses',
      });
      expect(result.isError).toBeUndefined();
    });

    it('reads an interface (INTF)', async () => {
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPRead', {
        type: 'INTF',
        name: 'ZIF_TEST',
      });
      expect(result.isError).toBeUndefined();
    });

    it('reads a function module (FUNC) with group', async () => {
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPRead', {
        type: 'FUNC',
        name: 'Z_MY_FUNC',
        group: 'ZGROUP',
      });
      expect(result.isError).toBeUndefined();
    });

    it('reads a function group (FUGR)', async () => {
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPRead', {
        type: 'FUGR',
        name: 'ZGROUP',
      });
      expect(result.isError).toBeUndefined();
    });

    it('reads an include (INCL)', async () => {
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPRead', {
        type: 'INCL',
        name: 'ZINCLUDE',
      });
      expect(result.isError).toBeUndefined();
    });

    it('reads CDS view (DDLS)', async () => {
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPRead', {
        type: 'DDLS',
        name: 'Z_CDS_VIEW',
      });
      expect(result.isError).toBeUndefined();
    });

    it('reads behavior definition (BDEF)', async () => {
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPRead', {
        type: 'BDEF',
        name: 'Z_BDEF',
      });
      expect(result.isError).toBeUndefined();
    });

    it('reads service definition (SRVD)', async () => {
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPRead', {
        type: 'SRVD',
        name: 'Z_SRVD',
      });
      expect(result.isError).toBeUndefined();
    });

    it('reads metadata extension (DDLX)', async () => {
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPRead', {
        type: 'DDLX',
        name: 'ZC_TRAVEL',
      });
      expect(result.isError).toBeUndefined();
    });

    it('returns soft informational message when DDLX is not found (404)', async () => {
      mockFetch.mockReset();
      mockFetch.mockResolvedValueOnce(mockResponse(404, 'Not Found', { 'x-csrf-token': 'mock-csrf-token' }));
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPRead', {
        type: 'DDLX',
        name: 'ZC_TRAVEL',
      });
      expect(result.isError).toBeUndefined();
      expect(result.content[0]?.text).toContain('No metadata extension (DDLX) found for "ZC_TRAVEL"');
      expect(result.content[0]?.text).toContain('inline annotations');
      expect(result.content[0]?.text).toContain('manifest.json');
    });

    it('reads service binding (SRVB) and returns parsed JSON', async () => {
      mockFetch.mockReset();
      mockFetch.mockResolvedValueOnce(
        mockResponse(
          200,
          `<?xml version="1.0"?><srvb:serviceBinding srvb:contract="C1" srvb:published="true" srvb:bindingCreated="true"
          adtcore:name="ZUI_TRAVEL_O4" adtcore:type="SRVB/SVB" adtcore:description="Travel UI"
          adtcore:language="EN" xmlns:srvb="http://www.sap.com/adt/ddic/ServiceBindings"
          xmlns:adtcore="http://www.sap.com/adt/core">
          <adtcore:packageRef adtcore:name="ZTRAVEL"/>
          <srvb:services srvb:name="ZUI_TRAVEL">
            <srvb:content srvb:version="0001" srvb:releaseState="NOT_RELEASED">
              <srvb:serviceDefinition adtcore:name="ZSD_TRAVEL"/>
            </srvb:content>
          </srvb:services>
          <srvb:binding srvb:type="ODATA" srvb:version="V4" srvb:category="0">
            <srvb:implementation adtcore:name="ZUI_TRAVEL_O4"/>
          </srvb:binding>
        </srvb:serviceBinding>`,
        ),
      );

      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPRead', {
        type: 'SRVB',
        name: 'ZUI_TRAVEL_O4',
      });
      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0]!.text);
      expect(parsed.name).toBe('ZUI_TRAVEL_O4');
      expect(parsed.odataVersion).toBe('V4');
    });

    it('reads table definition (TABL)', async () => {
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPRead', {
        type: 'TABL',
        name: 'ZTABLE',
      });
      expect(result.isError).toBeUndefined();
    });

    it('reads view definition (VIEW)', async () => {
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPRead', {
        type: 'VIEW',
        name: 'ZVIEW',
      });
      expect(result.isError).toBeUndefined();
    });

    it('reads system info (SYSTEM)', async () => {
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPRead', {
        type: 'SYSTEM',
      });
      expect(result.isError).toBeUndefined();
    });

    it('reads installed components (COMPONENTS)', async () => {
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPRead', {
        type: 'COMPONENTS',
      });
      expect(result.isError).toBeUndefined();
    });

    it('reads messages (MESSAGES)', async () => {
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPRead', {
        type: 'MESSAGES',
        name: 'ZMSGCLASS',
      });
      expect(result.isError).toBeUndefined();
    });

    it('reads text elements (TEXT_ELEMENTS)', async () => {
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPRead', {
        type: 'TEXT_ELEMENTS',
        name: 'ZPROG',
      });
      expect(result.isError).toBeUndefined();
    });

    it('reads variants (VARIANTS)', async () => {
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPRead', {
        type: 'VARIANTS',
        name: 'ZPROG',
      });
      expect(result.isError).toBeUndefined();
    });

    it('lists BSP apps when no name provided', async () => {
      mockFetch.mockReset();
      mockFetch.mockResolvedValueOnce(
        mockResponse(
          200,
          `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry><title>/UI5/APP1</title><summary>Booking App</summary></entry>
  <entry><title>/UI5/APP2</title><summary>Travel App</summary></entry>
</feed>`,
        ),
      );
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPRead', {
        type: 'BSP',
      });
      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0]!.text);
      expect(parsed).toHaveLength(2);
      expect(parsed[0].name).toBe('/UI5/APP1');
    });

    it('browses BSP app root structure when name provided without include', async () => {
      mockFetch.mockReset();
      mockFetch.mockResolvedValueOnce(
        mockResponse(
          200,
          `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title>ZAPP_BOOKING/webapp</title>
    <category term="folder"/>
    <content/>
  </entry>
  <entry>
    <title>ZAPP_BOOKING/manifest.json</title>
    <category term="file"/>
    <content afr:etag="abc123" xmlns:afr="http://www.sap.com/adt/filestore"/>
  </entry>
</feed>`,
        ),
      );
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPRead', {
        type: 'BSP',
        name: 'ZAPP_BOOKING',
      });
      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0]!.text);
      expect(parsed).toHaveLength(2);
      expect(parsed[0].type).toBe('folder');
      expect(parsed[1].type).toBe('file');
    });

    it('browses BSP subfolder when include has no dot', async () => {
      mockFetch.mockReset();
      mockFetch.mockResolvedValueOnce(
        mockResponse(
          200,
          `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title>ZAPP_BOOKING/webapp/i18n/i18n.properties</title>
    <category term="file"/>
    <content afr:etag="def456" xmlns:afr="http://www.sap.com/adt/filestore"/>
  </entry>
</feed>`,
        ),
      );
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPRead', {
        type: 'BSP',
        name: 'ZAPP_BOOKING',
        include: 'webapp/i18n',
      });
      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0]!.text);
      expect(parsed).toHaveLength(1);
    });

    it('reads BSP file content when include contains a dot', async () => {
      mockFetch.mockReset();
      mockFetch.mockResolvedValueOnce(mockResponse(200, '{"sap.app": {"id": "zapp.booking"}}'));
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPRead', {
        type: 'BSP',
        name: 'ZAPP_BOOKING',
        include: 'manifest.json',
      });
      expect(result.isError).toBeUndefined();
      expect(result.content[0]!.text).toContain('sap.app');
    });

    it('reads BSP file content for nested path with dot', async () => {
      mockFetch.mockReset();
      mockFetch.mockResolvedValueOnce(mockResponse(200, 'sap.ui.define([], function() { return {}; });'));
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPRead', {
        type: 'BSP',
        name: 'ZAPP_BOOKING',
        include: 'webapp/Component.js',
      });
      expect(result.isError).toBeUndefined();
      expect(result.content[0]!.text).toContain('sap.ui.define');
    });

    it('returns error when ui5 feature is unavailable', async () => {
      setCachedFeatures({
        hana: { available: false },
        abapGit: { available: false },
        rap: { available: false },
        amdp: { available: false },
        ui5: { available: false },
        transport: { available: false },
      });
      try {
        const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPRead', {
          type: 'BSP',
        });
        expect(result.isError).toBe(true);
        expect(result.content[0]!.text).toContain('not available');
      } finally {
        resetCachedFeatures();
      }
    });

    it('reads BSP_DEPLOY metadata for a deployed app', async () => {
      mockFetch.mockReset();
      mockFetch.mockResolvedValueOnce(
        mockResponse(
          200,
          JSON.stringify({
            d: { Name: 'ZAPP_BOOKING', Package: '$TMP', Description: 'Booking App', Info: 'deployed' },
          }),
          { 'x-csrf-token': 'odata-token' },
        ),
      );
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPRead', {
        type: 'BSP_DEPLOY',
        name: 'ZAPP_BOOKING',
      });
      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0]!.text);
      expect(parsed.name).toBe('ZAPP_BOOKING');
      expect(parsed.package).toBe('$TMP');
      expect(parsed.description).toBe('Booking App');
    });

    it('returns "not found" for BSP_DEPLOY when app does not exist', async () => {
      mockFetch.mockReset();
      mockFetch.mockResolvedValueOnce(mockResponse(404, 'Not Found'));
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPRead', {
        type: 'BSP_DEPLOY',
        name: 'ZNONEXISTENT',
      });
      expect(result.isError).toBeUndefined();
      expect(result.content[0]!.text).toContain('not found');
    });

    it('returns error for BSP_DEPLOY when name is missing', async () => {
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPRead', {
        type: 'BSP_DEPLOY',
      });
      expect(result.isError).toBe(true);
      expect(result.content[0]!.text).toContain('requires a name');
    });

    it('returns error for BSP_DEPLOY when ui5repo feature is unavailable', async () => {
      setCachedFeatures({
        hana: { available: false },
        abapGit: { available: false },
        rap: { available: false },
        amdp: { available: false },
        ui5: { available: false },
        ui5repo: { available: false },
        transport: { available: false },
      });
      try {
        const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPRead', {
          type: 'BSP_DEPLOY',
          name: 'ZAPP_BOOKING',
        });
        expect(result.isError).toBe(true);
        expect(result.content[0]!.text).toContain('not available');
      } finally {
        resetCachedFeatures();
      }
    });

    it('reads a structure (STRU)', async () => {
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPRead', {
        type: 'STRU',
        name: 'BAPIRET2',
      });
      expect(result.isError).toBeUndefined();
    });

    it('reads a domain (DOMA)', async () => {
      // Mock domain XML response
      mockFetch.mockReset();
      mockFetch.mockResolvedValueOnce(
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
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPRead', {
        type: 'DOMA',
        name: 'BUKRS',
      });
      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0]!.text);
      expect(parsed.name).toBe('BUKRS');
      expect(parsed.dataType).toBe('CHAR');
      expect(parsed.valueTable).toBe('T001');
    });

    it('reads a data element (DTEL)', async () => {
      mockFetch.mockReset();
      mockFetch.mockResolvedValueOnce(
        mockResponse(
          200,
          `<?xml version="1.0" encoding="utf-8"?>
<blue:wbobj adtcore:name="BUKRS" adtcore:description="Company code" xmlns:blue="http://www.sap.com/wbobj/dictionary/dtel" xmlns:adtcore="http://www.sap.com/adt/core">
  <adtcore:packageRef adtcore:name="BF"/>
  <dtel:dataElement xmlns:dtel="http://www.sap.com/adt/dictionary/dataelements">
    <dtel:typeKind>domain</dtel:typeKind><dtel:typeName>BUKRS</dtel:typeName>
    <dtel:dataType>CHAR</dtel:dataType><dtel:dataTypeLength>000004</dtel:dataTypeLength>
    <dtel:mediumFieldLabel>Company Code</dtel:mediumFieldLabel>
    <dtel:searchHelp>C_T001</dtel:searchHelp>
  </dtel:dataElement>
</blue:wbobj>`,
        ),
      );
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPRead', {
        type: 'DTEL',
        name: 'BUKRS',
      });
      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0]!.text);
      expect(parsed.name).toBe('BUKRS');
      expect(parsed.typeName).toBe('BUKRS');
      expect(parsed.searchHelp).toBe('C_T001');
    });

    it('reads a transaction (TRAN)', async () => {
      mockFetch.mockReset();
      // First call: transaction metadata
      mockFetch.mockResolvedValueOnce(
        mockResponse(
          200,
          `<?xml version="1.0" encoding="utf-8"?>
<adtcore:mainObject adtcore:name="SE38" adtcore:description="ABAP Editor" xmlns:adtcore="http://www.sap.com/adt/core">
  <adtcore:packageRef adtcore:name="SEDT"/>
</adtcore:mainObject>`,
        ),
      );
      // Second call: SQL query for program name (CSRF fetch first, then actual query)
      mockFetch.mockResolvedValueOnce(mockResponse(200, '', { 'x-csrf-token': 'token123' }));
      mockFetch.mockResolvedValueOnce(
        mockResponse(
          200,
          `<?xml version="1.0" encoding="utf-8"?>
<asx:abap xmlns:asx="http://www.sap.com/abapxml" version="1.0"><asx:values>
<COLUMNS><COLUMN><METADATA name="TCODE"/><DATASET><DATA>SE38</DATA></DATASET></COLUMN>
<COLUMN><METADATA name="PGMNA"/><DATASET><DATA>RSABAPPROGRAM</DATA></DATASET></COLUMN></COLUMNS>
</asx:values></asx:abap>`,
        ),
      );
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPRead', {
        type: 'TRAN',
        name: 'SE38',
      });
      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0]!.text);
      expect(parsed.code).toBe('SE38');
      expect(parsed.description).toBe('ABAP Editor');
      expect(parsed.package).toBe('SEDT');
    });

    it('returns error for unknown type with supported types via Zod validation', async () => {
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPRead', {
        type: 'UNKNOWN',
        name: 'TEST',
      });
      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain('Invalid arguments for SAPRead');
      // Should list supported types from Zod enum validation
      expect(result.content[0]?.text).toContain('PROG');
      expect(result.content[0]?.text).toContain('CLAS');
      expect(result.content[0]?.text).toContain('STRU');
      expect(result.content[0]?.text).toContain('DOMA');
      expect(result.content[0]?.text).toContain('DTEL');
      expect(result.content[0]?.text).toContain('TRAN');
    });

    it('returns validation error for empty/missing type', async () => {
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPRead', {
        type: '',
        name: 'TEST',
      });
      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain('Invalid arguments for SAPRead');
    });

    it('handles missing type parameter', async () => {
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPRead', {
        name: 'TEST',
      });
      expect(result.isError).toBe(true);
    });

    it('handles missing name parameter', async () => {
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPRead', {
        type: 'PROG',
      });
      // Should still attempt with empty name (SAP will return error)
      expect(result.isError).toBeUndefined();
    });

    it('reads class with format="structured" returns JSON with metadata and source fields', async () => {
      const classMetadataXml = `<?xml version="1.0" encoding="utf-8"?>
<class:abapClass class:final="true" class:visibility="public" class:category="00" class:fixPointArithmetic="true"
    adtcore:name="ZCL_TEST" adtcore:type="CLAS/OC" adtcore:description="Test class" adtcore:language="EN"
    adtcore:masterLanguage="EN"
    xmlns:class="http://www.sap.com/adt/oo/classes" xmlns:adtcore="http://www.sap.com/adt/core">
  <adtcore:packageRef adtcore:name="$TMP"/>
</class:abapClass>`;
      mockFetch.mockReset();
      mockFetch.mockImplementation(async (url: string) => {
        const urlStr = String(url);
        if (urlStr.includes('/oo/classes/ZCL_TEST') && !urlStr.includes('/source/') && !urlStr.includes('/includes/')) {
          return mockResponse(200, classMetadataXml, { 'x-csrf-token': 'T' });
        }
        if (urlStr.includes('/source/main')) {
          return mockResponse(200, 'CLASS zcl_test DEFINITION.\nENDCLASS.\nCLASS zcl_test IMPLEMENTATION.\nENDCLASS.', {
            'x-csrf-token': 'T',
          });
        }
        if (urlStr.includes('/includes/')) {
          return mockResponse(404, 'Not Found', { 'x-csrf-token': 'T' });
        }
        return mockResponse(200, '', { 'x-csrf-token': 'T' });
      });

      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPRead', {
        type: 'CLAS',
        name: 'ZCL_TEST',
        format: 'structured',
      });

      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0]?.text ?? '');
      expect(parsed.metadata).toBeDefined();
      expect(parsed.metadata.name).toBe('ZCL_TEST');
      expect(parsed.metadata.description).toBe('Test class');
      expect(parsed.main).toContain('CLASS zcl_test');
      expect(parsed.testclasses).toBeNull();
      expect(parsed.definitions).toBeNull();
      expect(parsed.implementations).toBeNull();
      expect(parsed.macros).toBeNull();
    });

    it('reads class with format="text" returns plain source (default behavior)', async () => {
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPRead', {
        type: 'CLAS',
        name: 'ZCL_TEST',
        format: 'text',
      });
      expect(result.isError).toBeUndefined();
      // Plain text, not JSON
      expect(() => JSON.parse(result.content[0]?.text ?? '')).toThrow();
    });

    it('reads class without format returns plain source (backwards compatible)', async () => {
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPRead', {
        type: 'CLAS',
        name: 'ZCL_TEST',
      });
      expect(result.isError).toBeUndefined();
      // Plain text, not JSON — backwards compatible
      expect(result.content[0]?.text).toContain('REPORT');
    });

    it('returns error when format="structured" used with non-CLAS type', async () => {
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPRead', {
        type: 'PROG',
        name: 'ZTEST',
        format: 'structured',
      });
      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain('structured');
      expect(result.content[0]?.text).toContain('CLAS');
    });

    it('reads class with format="structured" and method param — format takes precedence', async () => {
      const classMetadataXml = `<?xml version="1.0" encoding="utf-8"?>
<class:abapClass class:category="00" class:fixPointArithmetic="true"
    adtcore:name="ZCL_TEST" adtcore:description="Test class" adtcore:language="EN"
    adtcore:masterLanguage="EN"
    xmlns:class="http://www.sap.com/adt/oo/classes" xmlns:adtcore="http://www.sap.com/adt/core">
  <adtcore:packageRef adtcore:name="$TMP"/>
</class:abapClass>`;
      mockFetch.mockReset();
      mockFetch.mockImplementation(async (url: string) => {
        const urlStr = String(url);
        if (urlStr.includes('/oo/classes/ZCL_TEST') && !urlStr.includes('/source/') && !urlStr.includes('/includes/')) {
          return mockResponse(200, classMetadataXml, { 'x-csrf-token': 'T' });
        }
        if (urlStr.includes('/source/main')) {
          return mockResponse(200, 'CLASS zcl_test DEFINITION.\nENDCLASS.\nCLASS zcl_test IMPLEMENTATION.\nENDCLASS.', {
            'x-csrf-token': 'T',
          });
        }
        if (urlStr.includes('/includes/')) {
          return mockResponse(404, 'Not Found', { 'x-csrf-token': 'T' });
        }
        return mockResponse(200, '', { 'x-csrf-token': 'T' });
      });

      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPRead', {
        type: 'CLAS',
        name: 'ZCL_TEST',
        format: 'structured',
        method: 'get_name',
      });

      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0]?.text ?? '');
      expect(parsed.metadata).toBeDefined();
      expect(parsed.main).toBeDefined();
    });

    it('structured response is valid JSON with expected keys', async () => {
      const classMetadataXml = `<?xml version="1.0" encoding="utf-8"?>
<class:abapClass class:category="00" class:fixPointArithmetic="true"
    adtcore:name="ZCL_TEST" adtcore:description="Structured test" adtcore:language="EN"
    adtcore:masterLanguage="EN"
    xmlns:class="http://www.sap.com/adt/oo/classes" xmlns:adtcore="http://www.sap.com/adt/core">
  <adtcore:packageRef adtcore:name="ZDEV"/>
</class:abapClass>`;
      mockFetch.mockReset();
      mockFetch.mockImplementation(async (url: string) => {
        const urlStr = String(url);
        if (urlStr.includes('/oo/classes/ZCL_TEST') && !urlStr.includes('/source/') && !urlStr.includes('/includes/')) {
          return mockResponse(200, classMetadataXml, { 'x-csrf-token': 'T' });
        }
        if (urlStr.includes('/source/main')) {
          return mockResponse(200, 'CLASS zcl_test DEFINITION.\nENDCLASS.', { 'x-csrf-token': 'T' });
        }
        if (urlStr.includes('/includes/testclasses')) {
          return mockResponse(200, 'CLASS ltcl_test DEFINITION.\nENDCLASS.', { 'x-csrf-token': 'T' });
        }
        if (urlStr.includes('/includes/')) {
          return mockResponse(404, 'Not Found', { 'x-csrf-token': 'T' });
        }
        return mockResponse(200, '', { 'x-csrf-token': 'T' });
      });

      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPRead', {
        type: 'CLAS',
        name: 'ZCL_TEST',
        format: 'structured',
      });

      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0]?.text ?? '');
      expect(Object.keys(parsed)).toEqual(
        expect.arrayContaining(['metadata', 'main', 'testclasses', 'definitions', 'implementations', 'macros']),
      );
      expect(parsed.metadata.package).toBe('ZDEV');
      expect(parsed.testclasses).toContain('ltcl_test');
    });
  });

  // ─── SAPSearch ─────────────────────────────────────────────────────

  describe('SAPSearch', () => {
    it('executes search', async () => {
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPSearch', {
        query: 'ZCL_*',
      });
      expect(result.isError).toBeUndefined();
    });

    it('respects maxResults parameter', async () => {
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPSearch', {
        query: 'Z*',
        maxResults: 10,
      });
      expect(result.isError).toBeUndefined();
    });

    it('defaults maxResults to 100', async () => {
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPSearch', {
        query: 'Z*',
      });
      expect(result.isError).toBeUndefined();
    });

    // ─── Transliteration ──────────────────────────────────────────────

    describe('transliterateQuery', () => {
      it('transliterates German umlauts', () => {
        expect(transliterateQuery('*Schätz*')).toEqual({ normalized: '*SchAEtz*', changed: true });
      });

      it('transliterates uppercase umlauts', () => {
        expect(transliterateQuery('*Übersicht*')).toEqual({ normalized: '*UEbersicht*', changed: true });
      });

      it('transliterates ß to SS', () => {
        expect(transliterateQuery('*straße*')).toEqual({ normalized: '*straSSe*', changed: true });
      });

      it('transliterates all umlauts in uppercase context', () => {
        expect(transliterateQuery('*SCHÄTZÜNG*')).toEqual({ normalized: '*SCHAETZUENG*', changed: true });
      });

      it('returns unchanged for ASCII-only queries', () => {
        expect(transliterateQuery('*SCHAETZ*')).toEqual({ normalized: '*SCHAETZ*', changed: false });
      });

      it('strips accented Latin characters', () => {
        const result = transliterateQuery('*café*');
        expect(result.normalized).toBe('*cafe*');
        expect(result.changed).toBe(true);
      });
    });

    it('transliterates umlaut query and includes note in response', async () => {
      mockFetch.mockReset();
      // Return a search result for the transliterated query
      mockFetch.mockResolvedValueOnce(
        mockResponse(
          200,
          `<objectReferences><objectReference type="CLAS/OC" name="ZCL_SCHAETZ" uri="/sap/bc/adt/oo/classes/zcl_schaetz" packageName="$TMP" description="Test"/></objectReferences>`,
        ),
      );
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPSearch', {
        query: '*Schätz*',
      });
      expect(result.isError).toBeUndefined();
      expect(result.content[0]?.text).toContain('Transliterated');
      expect(result.content[0]?.text).toContain('*Schätz*');
      expect(result.content[0]?.text).toContain('*SchAEtz*');
      expect(result.content[0]?.text).toContain('ZCL_SCHAETZ');
    });

    it('transliterates umlaut query and includes note when results are empty', async () => {
      mockFetch.mockReset();
      mockFetch.mockResolvedValueOnce(mockResponse(200, '<objectReferences/>'));
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPSearch', {
        query: '*Schätzung*',
      });
      expect(result.isError).toBeUndefined();
      expect(result.content[0]?.text).toContain('Transliterated');
      expect(result.content[0]?.text).toContain('No objects found');
    });

    it('does NOT transliterate source_code search queries', async () => {
      mockFetch.mockReset();
      // Return empty source search results
      mockFetch.mockResolvedValueOnce(mockResponse(200, '<objectReferences/>'));
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPSearch', {
        query: 'Schätzung',
        searchType: 'source_code',
      });
      // Should not contain transliteration note (source code can have umlauts)
      expect(result.content[0]?.text).not.toContain('Transliterated');
    });

    // ─── Field-name detection ─────────────────────────────────────────

    describe('looksLikeFieldName', () => {
      it('detects short uppercase field names', () => {
        expect(looksLikeFieldName('QDSTAT')).toBe(true);
        expect(looksLikeFieldName('MATNR')).toBe(true);
        expect(looksLikeFieldName('BUKRS')).toBe(true);
      });

      it('rejects Z/Y-prefixed names (likely objects)', () => {
        expect(looksLikeFieldName('ZCL_TEST')).toBe(false);
        expect(looksLikeFieldName('Z_MY_FUNC')).toBe(false);
        expect(looksLikeFieldName('YCL_HELPER')).toBe(false);
      });

      it('rejects wildcard patterns', () => {
        expect(looksLikeFieldName('*SCHAETZ*')).toBe(false);
      });

      it('rejects long strings', () => {
        expect(looksLikeFieldName('ABCDEFGHIJKLMNOPQRST')).toBe(false);
      });

      it('rejects lowercase strings', () => {
        expect(looksLikeFieldName('matnr')).toBe(false);
      });
    });

    it('includes field-name hint when empty results look like a field name', async () => {
      mockFetch.mockReset();
      mockFetch.mockResolvedValueOnce(mockResponse(200, '<objectReferences/>'));
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPSearch', {
        query: 'QDSTAT',
      });
      expect(result.isError).toBeUndefined();
      expect(result.content[0]?.text).toContain('dd03l');
      expect(result.content[0]?.text).toContain('field/column name');
    });

    it('does NOT include field-name hint for Z* queries', async () => {
      mockFetch.mockReset();
      mockFetch.mockResolvedValueOnce(mockResponse(200, '<objectReferences/>'));
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPSearch', {
        query: 'ZCL_NONEXIST',
      });
      expect(result.isError).toBeUndefined();
      expect(result.content[0]?.text).not.toContain('field/column name');
    });
  });

  // ─── SAPQuery ──────────────────────────────────────────────────────

  describe('SAPQuery', () => {
    it('attempts to execute SQL query (errors caught from mock)', async () => {
      // The mock returns plain text, but runQuery expects XML for parseTableContents.
      // In a real scenario the POST returns XML. The error gets caught by intent handler.
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPQuery', {
        sql: 'SELECT * FROM T000',
      });
      // Either succeeds (if XML parsed) or error is caught gracefully
      expect(result.content).toHaveLength(1);
      expect(result.content[0]?.type).toBe('text');
    });

    it('returns JOIN-specific hint when a JOIN query fails with 400', async () => {
      mockFetch.mockReset();
      // First call: CSRF token fetch (200)
      mockFetch.mockResolvedValueOnce(mockResponse(200, '', { 'x-csrf-token': 'mock-csrf-token' }));
      // Second call: POST returns 400 (parser error)
      mockFetch.mockResolvedValueOnce(mockResponse(400, '"INTO" is invalid at this position'));
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPQuery', {
        sql: 'SELECT a~field1, b~field2 FROM ztable1 AS a INNER JOIN ztable2 AS b ON a~id = b~id INTO TABLE @DATA(lt_result)',
      });
      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain('SAP Note 3605050');
      expect(result.content[0]?.text).toContain('splitting into separate single-table queries');
    });

    it('does NOT include JOIN hint when a non-JOIN query fails with 400', async () => {
      mockFetch.mockReset();
      // First call: CSRF token fetch (200)
      mockFetch.mockResolvedValueOnce(mockResponse(200, '', { 'x-csrf-token': 'mock-csrf-token' }));
      // Second call: POST returns 400 (some other error)
      mockFetch.mockResolvedValueOnce(mockResponse(400, 'Syntax error in SQL'));
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPQuery', {
        sql: 'SELECT * FROM ztable1 WHERE invalid_syntax',
      });
      // Should NOT have JOIN hint — error falls through to default handler
      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).not.toContain('SAP Note 3605050');
    });

    it('is blocked when free SQL is disallowed', async () => {
      const client = new AdtClient({
        baseUrl: 'http://sap:8000',
        safety: { ...unrestrictedSafetyConfig(), blockFreeSQL: true },
      });
      const result = await handleToolCall(client, DEFAULT_CONFIG, 'SAPQuery', {
        sql: 'SELECT * FROM T000',
      });
      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain('blocked');
    });
  });

  // ─── SAPLint ───────────────────────────────────────────────────────

  describe('SAPLint', () => {
    it('lints ABAP source code', async () => {
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPLint', {
        action: 'lint',
        source: "REPORT ztest.\nWRITE: / 'Hello'.",
        name: 'ZTEST',
      });
      expect(result.isError).toBeUndefined();
      const issues = JSON.parse(result.content[0]?.text);
      expect(Array.isArray(issues)).toBe(true);
    });

    it('auto-detects filename from source', async () => {
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPLint', {
        action: 'lint',
        source: 'CLASS zcl_test DEFINITION.\nENDCLASS.',
        name: 'ZCL_TEST',
      });
      expect(result.isError).toBeUndefined();
    });

    it('returns Zod validation error for unknown action', async () => {
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPLint', {
        action: 'unknown',
      });
      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain('Invalid arguments for SAPLint');
      expect(result.content[0]?.text).toContain('lint');
      expect(result.content[0]?.text).toContain('lint_and_fix');
      expect(result.content[0]?.text).toContain('list_rules');
    });

    it('returns Zod validation error for atc (not a valid SAPLint action)', async () => {
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPLint', {
        action: 'atc',
      });
      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain('Invalid arguments for SAPLint');
    });

    it('returns Zod validation error for syntax (not a valid SAPLint action)', async () => {
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPLint', {
        action: 'syntax',
      });
      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain('Invalid arguments for SAPLint');
    });

    it('returns error for missing action', async () => {
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPLint', {});
      expect(result.isError).toBe(true);
    });

    it('lint_and_fix returns fixed source and applied rules', async () => {
      const source = `CLASS zcl_test DEFINITION PUBLIC.
  PUBLIC SECTION.
    METHODS test.
ENDCLASS.
CLASS zcl_test IMPLEMENTATION.
  METHOD test.
    data lv_x type i.
    lv_x = 1.
  ENDMETHOD.
ENDCLASS.`;
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPLint', {
        action: 'lint_and_fix',
        source,
        name: 'ZCL_TEST',
      });
      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0]?.text);
      expect(parsed).toHaveProperty('fixedSource');
      expect(parsed).toHaveProperty('appliedFixes');
      expect(parsed).toHaveProperty('fixedRules');
      expect(parsed).toHaveProperty('remainingIssues');
      expect(parsed.appliedFixes).toBeGreaterThan(0);
    });

    it('lint_and_fix requires source', async () => {
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPLint', {
        action: 'lint_and_fix',
      });
      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain('source');
    });

    it('list_rules returns rule catalog with counts', async () => {
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPLint', {
        action: 'list_rules',
      });
      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0]?.text);
      expect(parsed).toHaveProperty('preset');
      expect(parsed).toHaveProperty('enabledRules');
      expect(parsed).toHaveProperty('disabledRules');
      expect(parsed).toHaveProperty('rules');
      expect(parsed.enabledRules).toBeGreaterThan(0);
      expect(parsed.disabledRules).toBeGreaterThan(0);
      expect(parsed.disabledRuleNames).toBeInstanceOf(Array);
    });

    it('uses config.systemType=btp even without cached features (no probe)', async () => {
      // Ensure no cached features from a prior probe
      resetCachedFeatures();
      const btpConfig = { ...DEFAULT_CONFIG, systemType: 'btp' as const };
      // Lint a REPORT — should get cloud_types error because config says btp
      const result = await handleToolCall(createClient(), btpConfig, 'SAPLint', {
        action: 'lint',
        source: "REPORT ztest.\nWRITE: / 'Hello'.",
        name: 'ZTEST',
      });
      expect(result.isError).toBeUndefined();
      const issues = JSON.parse(result.content[0]?.text);
      expect(issues.some((i: { rule: string }) => i.rule === 'cloud_types')).toBe(true);
    });

    it('list_rules shows cloud preset when config.systemType=btp without probe', async () => {
      resetCachedFeatures();
      const btpConfig = { ...DEFAULT_CONFIG, systemType: 'btp' as const };
      const result = await handleToolCall(createClient(), btpConfig, 'SAPLint', {
        action: 'list_rules',
      });
      const parsed = JSON.parse(result.content[0]?.text);
      expect(parsed.preset).toBe('cloud');
    });

    it('lint accepts custom rule overrides', async () => {
      const source = `CLASS zcl_test DEFINITION PUBLIC.
  PUBLIC SECTION.
    METHODS test.
ENDCLASS.
CLASS zcl_test IMPLEMENTATION.
  METHOD test.
    DATA lv_x TYPE i.
    lv_x = 1.
  ENDMETHOD.
ENDCLASS.`;
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPLint', {
        action: 'lint',
        source,
        name: 'ZCL_TEST',
        rules: { line_length: { severity: 'Error', length: 10 } },
      });
      expect(result.isError).toBeUndefined();
      const issues = JSON.parse(result.content[0]?.text);
      // With length=10, many lines should trigger line_length
      const lineIssues = issues.filter((i: { rule: string }) => i.rule === 'line_length');
      expect(lineIssues.length).toBeGreaterThan(0);
    });

    it('lint requires source', async () => {
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPLint', {
        action: 'lint',
      });
      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain('source');
    });
  });

  // ─── SAPWrite Package Enforcement ──────────────────────────────

  describe('SAPWrite package enforcement', () => {
    it('rejects create for package not in allowedPackages', async () => {
      const restrictedClient = new AdtClient({
        baseUrl: 'http://sap:8000',
        username: 'admin',
        password: 'secret',
        safety: { ...unrestrictedSafetyConfig(), allowedPackages: ['$TMP'] },
      });
      const result = await handleToolCall(restrictedClient, DEFAULT_CONFIG, 'SAPWrite', {
        action: 'create',
        type: 'CLAS',
        name: 'ZCL_TEST',
        package: 'ZTEST',
        source: 'CLASS zcl_test DEFINITION PUBLIC. ENDCLASS. CLASS zcl_test IMPLEMENTATION. ENDCLASS.',
      });
      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain('ZTEST');
      expect(result.content[0]?.text).toContain('blocked');
    });

    it('allows create for package in allowedPackages', async () => {
      const restrictedClient = new AdtClient({
        baseUrl: 'http://sap:8000',
        username: 'admin',
        password: 'secret',
        safety: { ...unrestrictedSafetyConfig(), allowedPackages: ['$TMP'] },
      });
      const result = await handleToolCall(restrictedClient, DEFAULT_CONFIG, 'SAPWrite', {
        action: 'create',
        type: 'CLAS',
        name: 'ZCL_TEST',
        package: '$TMP',
        source: 'CLASS zcl_test DEFINITION PUBLIC. ENDCLASS. CLASS zcl_test IMPLEMENTATION. ENDCLASS.',
      });
      // Should not be blocked by package check (may fail at HTTP level, but that's OK)
      expect(result.content[0]?.text).not.toContain('blocked by safety');
    });
  });

  // ─── SAPWrite Pre-Write Lint Gate ───────────────────────────────

  describe('SAPWrite pre-write lint gate', () => {
    it('blocks update with parser errors when lintBeforeWrite is enabled', async () => {
      const config = { ...DEFAULT_CONFIG, lintBeforeWrite: true };
      const result = await handleToolCall(createClient(), config, 'SAPWrite', {
        action: 'update',
        type: 'CLAS',
        name: 'ZCL_TEST',
        source: `CLASS zcl_test DEFINITION PUBLIC.
  PUBLIC SECTION.
ENDCLASS.
CLASS zcl_test IMPLEMENTATION.
  METHOD nonexistent.
    INVALID SYNTAX HERE.
  ENDMETHOD.
ENDCLASS.`,
      });
      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain('Pre-write lint check failed');
      expect(result.content[0]?.text).toContain('parser_error');
    });

    it('allows update when lintBeforeWrite is disabled', async () => {
      const config = { ...DEFAULT_CONFIG, lintBeforeWrite: false };
      // With lint disabled, even broken code should attempt the write
      // (it will succeed because our mock returns 200)
      const result = await handleToolCall(createClient(), config, 'SAPWrite', {
        action: 'update',
        type: 'CLAS',
        name: 'ZCL_TEST',
        source: `CLASS zcl_test DEFINITION PUBLIC.
  PUBLIC SECTION.
ENDCLASS.
CLASS zcl_test IMPLEMENTATION.
  METHOD nonexistent.
    INVALID SYNTAX HERE.
  ENDMETHOD.
ENDCLASS.`,
      });
      // Should not be a lint error (write is attempted)
      if (result.isError) {
        // May fail for SAP reasons, but not lint reasons
        expect(result.content[0]?.text).not.toContain('Pre-write lint check failed');
      }
    });

    it('allows valid ABAP through the gate', async () => {
      const config = { ...DEFAULT_CONFIG, lintBeforeWrite: true };
      const result = await handleToolCall(createClient(), config, 'SAPWrite', {
        action: 'update',
        type: 'CLAS',
        name: 'ZCL_TEST',
        source: `CLASS zcl_test DEFINITION PUBLIC.
  PUBLIC SECTION.
    METHODS test.
ENDCLASS.
CLASS zcl_test IMPLEMENTATION.
  METHOD test.
    DATA lv_x TYPE i.
    lv_x = 1.
  ENDMETHOD.
ENDCLASS.`,
      });
      // Should not be a lint error
      if (result.content[0]?.text) {
        expect(result.content[0]?.text).not.toContain('Pre-write lint check failed');
      }
    });
  });

  // ─── Unknown Tool ──────────────────────────────────────────────────

  describe('unknown tool', () => {
    it('returns error for unknown tool name', async () => {
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'UnknownTool', {});
      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain('Unknown tool');
    });
  });

  // ─── Error Handling ────────────────────────────────────────────────

  describe('error handling', () => {
    it('catches safety errors and returns MCP error response', async () => {
      const client = new AdtClient({
        baseUrl: 'http://sap:8000',
        safety: { ...unrestrictedSafetyConfig(), disallowedOps: 'R' },
      });
      const result = await handleToolCall(client, DEFAULT_CONFIG, 'SAPRead', {
        type: 'PROG',
        name: 'ZHELLO',
      });
      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain('blocked by safety');
    });

    it('returns isError=true for all error responses', async () => {
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPRead', {
        type: 'INVALID_TYPE',
        name: 'X',
      });
      expect(result.isError).toBe(true);
      expect(result.content).toHaveLength(1);
      expect(result.content[0]?.type).toBe('text');
    });

    it('catches non-Error exceptions', async () => {
      // This tests the catch(err) path with a non-Error value
      const client = new AdtClient({
        baseUrl: 'http://sap:8000',
        safety: { ...unrestrictedSafetyConfig(), blockFreeSQL: true },
      });
      const result = await handleToolCall(client, DEFAULT_CONFIG, 'SAPQuery', {
        sql: 'SELECT * FROM T000',
      });
      expect(result.isError).toBe(true);
    });
  });

  // ─── Scope Enforcement ────────────────────────────────────────────

  describe('scope enforcement', () => {
    const readAuth: AuthInfo = {
      token: 'test-token',
      clientId: 'test-client',
      scopes: ['read'],
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
    };

    const writeAuth: AuthInfo = {
      token: 'test-token',
      clientId: 'test-client',
      scopes: ['read', 'write'],
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
    };

    const dataAuth: AuthInfo = {
      token: 'test-token',
      clientId: 'test-client',
      scopes: ['read', 'data'],
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
    };

    const sqlAuth: AuthInfo = {
      token: 'test-token',
      clientId: 'test-client',
      scopes: ['read', 'sql'],
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
    };

    const adminAuth: AuthInfo = {
      token: 'test-token',
      clientId: 'test-client',
      scopes: ['read', 'write', 'data', 'sql', 'admin'],
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
      extra: { userName: 'test.user@company.com', email: 'test.user@company.com' },
    };

    it('allows SAPRead with read scope', async () => {
      const result = await handleToolCall(
        createClient(),
        DEFAULT_CONFIG,
        'SAPRead',
        { type: 'PROG', name: 'ZHELLO' },
        readAuth,
      );
      expect(result.isError).toBeUndefined();
    });

    it('blocks SAPWrite with read-only scope', async () => {
      const result = await handleToolCall(
        createClient(),
        DEFAULT_CONFIG,
        'SAPWrite',
        { type: 'PROG', name: 'ZHELLO', source: 'test' },
        readAuth,
      );
      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain("Insufficient scope: 'write'");
      expect(result.content[0]?.text).toContain('SAPWrite');
    });

    it('allows SAPWrite with write scope', async () => {
      // SAPWrite will fail (unknown tool in switch), but it should NOT be blocked by scope
      const result = await handleToolCall(
        createClient(),
        DEFAULT_CONFIG,
        'SAPWrite',
        { type: 'PROG', name: 'ZHELLO', source: 'test' },
        writeAuth,
      );
      // Should reach the switch statement, not be blocked by scope
      expect(result.content[0]?.text).not.toContain('Insufficient scope');
    });

    it('allows SAPTransport with write scope', async () => {
      const result = await handleToolCall(
        createClient(),
        DEFAULT_CONFIG,
        'SAPTransport',
        { action: 'list' },
        writeAuth,
      );
      // Should reach the switch, not blocked by scope
      expect(result.content[0]?.text).not.toContain('Insufficient scope');
    });

    it('blocks SAPTransport with read-only scope', async () => {
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPTransport', { action: 'list' }, readAuth);
      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain("Insufficient scope: 'write'");
    });

    it('blocks SAPQuery with read-only scope (requires sql)', async () => {
      const result = await handleToolCall(
        createClient(),
        DEFAULT_CONFIG,
        'SAPQuery',
        { sql: 'SELECT * FROM t000' },
        readAuth,
      );
      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain("Insufficient scope: 'sql'");
    });

    it('blocks SAPQuery with data-only scope (requires sql)', async () => {
      const result = await handleToolCall(
        createClient(),
        DEFAULT_CONFIG,
        'SAPQuery',
        { sql: 'SELECT * FROM t000' },
        dataAuth,
      );
      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain("Insufficient scope: 'sql'");
    });

    it('allows SAPQuery with sql scope (sql implies data)', async () => {
      const result = await handleToolCall(
        createClient(),
        DEFAULT_CONFIG,
        'SAPQuery',
        { sql: 'SELECT * FROM t000' },
        sqlAuth,
      );
      // Should reach the handler, not blocked by scope
      expect(result.content[0]?.text).not.toContain('Insufficient scope');
    });

    it('allows all tools when no authInfo (backward compat)', async () => {
      // No authInfo = no scope enforcement (stdio mode, API key without XSUAA)
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPRead', { type: 'PROG', name: 'ZHELLO' });
      expect(result.isError).toBeUndefined();
    });

    it('scope enforcement is additive to safety system', async () => {
      // Write scope but readOnly config — safety system should still block
      const client = new AdtClient({
        baseUrl: 'http://sap:8000',
        safety: { ...unrestrictedSafetyConfig(), disallowedOps: 'R' },
      });
      const result = await handleToolCall(
        client,
        DEFAULT_CONFIG,
        'SAPRead',
        { type: 'PROG', name: 'ZHELLO' },
        adminAuth,
      );
      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain('blocked by safety');
    });

    it('includes user scopes in error message', async () => {
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPWrite', {}, readAuth);
      expect(result.content[0]?.text).toContain('Your scopes: [read]');
    });

    it('write scope implies read for SAPRead', async () => {
      // User with only write scope (no explicit read) can access SAPRead
      const writeOnlyAuth: AuthInfo = {
        token: 'test-token',
        clientId: 'test-client',
        scopes: ['write'],
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      };
      const result = await handleToolCall(
        createClient(),
        DEFAULT_CONFIG,
        'SAPRead',
        { type: 'PROG', name: 'ZHELLO' },
        writeOnlyAuth,
      );
      expect(result.isError).toBeUndefined();
    });
  });

  // ─── TOOL_SCOPES mapping ──────────────────────────────────────────

  describe('TOOL_SCOPES', () => {
    it('maps read tools to read scope', () => {
      for (const tool of ['SAPRead', 'SAPSearch', 'SAPNavigate', 'SAPContext', 'SAPLint', 'SAPDiagnose']) {
        expect(TOOL_SCOPES[tool]).toBe('read');
      }
    });

    it('maps write tools to write scope', () => {
      for (const tool of ['SAPWrite', 'SAPActivate', 'SAPManage', 'SAPTransport']) {
        expect(TOOL_SCOPES[tool]).toBe('write');
      }
    });

    it('maps SAPQuery to sql scope', () => {
      expect(TOOL_SCOPES.SAPQuery).toBe('sql');
    });

    it('covers all 11 tools', () => {
      expect(Object.keys(TOOL_SCOPES)).toHaveLength(11);
    });
  });

  // ─── hasRequiredScope ──────────────────────────────────────────────

  describe('hasRequiredScope', () => {
    function makeAuth(scopes: string[]): AuthInfo {
      return {
        token: 'test-token',
        clientId: 'test-client',
        scopes,
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      };
    }

    it('returns true for direct scope match', () => {
      expect(hasRequiredScope(makeAuth(['read']), 'read')).toBe(true);
      expect(hasRequiredScope(makeAuth(['write']), 'write')).toBe(true);
      expect(hasRequiredScope(makeAuth(['data']), 'data')).toBe(true);
      expect(hasRequiredScope(makeAuth(['sql']), 'sql')).toBe(true);
    });

    it('returns false when scope is missing', () => {
      expect(hasRequiredScope(makeAuth(['read']), 'write')).toBe(false);
      expect(hasRequiredScope(makeAuth(['read']), 'data')).toBe(false);
      expect(hasRequiredScope(makeAuth(['data']), 'read')).toBe(false);
    });

    it('write implies read', () => {
      expect(hasRequiredScope(makeAuth(['write']), 'read')).toBe(true);
    });

    it('sql implies data', () => {
      expect(hasRequiredScope(makeAuth(['sql']), 'data')).toBe(true);
    });

    it('write does NOT imply data', () => {
      expect(hasRequiredScope(makeAuth(['write']), 'data')).toBe(false);
    });

    it('sql does NOT imply read', () => {
      expect(hasRequiredScope(makeAuth(['sql']), 'read')).toBe(false);
    });

    it('returns false for empty scopes', () => {
      expect(hasRequiredScope(makeAuth([]), 'read')).toBe(false);
      expect(hasRequiredScope(makeAuth([]), 'write')).toBe(false);
      expect(hasRequiredScope(makeAuth([]), 'data')).toBe(false);
      expect(hasRequiredScope(makeAuth([]), 'sql')).toBe(false);
    });

    it('admin scope does not imply other scopes', () => {
      expect(hasRequiredScope(makeAuth(['admin']), 'read')).toBe(false);
      expect(hasRequiredScope(makeAuth(['admin']), 'write')).toBe(false);
      expect(hasRequiredScope(makeAuth(['admin']), 'data')).toBe(false);
    });
  });

  // ─── SAPContext ──────────────────────────────────────────────────────

  describe('SAPContext', () => {
    it('returns error when type is missing', async () => {
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPContext', {
        name: 'ZCL_TEST',
      });
      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain('type');
    });

    it('returns error when name is missing', async () => {
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPContext', {
        type: 'CLAS',
      });
      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain('name');
    });

    it('returns Zod validation error for unsupported type', async () => {
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPContext', {
        type: 'TABL',
        name: 'MARA',
      });
      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain('Invalid arguments for SAPContext');
      expect(result.content[0]?.text).toContain('CLAS');
    });

    it('dispatches successfully with provided source', async () => {
      const source = `CLASS zcl_standalone DEFINITION PUBLIC.
  PUBLIC SECTION.
    METHODS run.
ENDCLASS.
CLASS zcl_standalone IMPLEMENTATION.
  METHOD run. ENDMETHOD.
ENDCLASS.`;
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPContext', {
        type: 'CLAS',
        name: 'zcl_standalone',
        source,
      });
      // Should not be an error — it processes the source and returns context
      expect(result.isError).toBeUndefined();
      expect(result.content[0]?.text).toContain('Dependency context for zcl_standalone');
    });

    it('dispatches DDLS type for CDS context', async () => {
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPContext', {
        type: 'DDLS',
        name: 'ZI_ORDER',
      });
      // Mock returns generic text which the CDS parser will process
      // It should not error — it calls getDdls and runs CDS context pipeline
      expect(result.isError).toBeUndefined();
      expect(result.content[0]?.text).toContain('CDS dependency context for ZI_ORDER');
    });
  });

  // ─── SAPRead DDLS include="elements" ──────────────────────────────

  describe('SAPRead DDLS include="elements"', () => {
    it('returns raw DDL source when no include param', async () => {
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPRead', {
        type: 'DDLS',
        name: 'ZI_ORDER',
      });
      expect(result.isError).toBeUndefined();
      // Mock returns generic text — just verify no error
    });

    it('returns structured elements when include="elements"', async () => {
      // Override mock to return CDS DDL source
      mockFetch.mockResolvedValueOnce(
        mockResponse(
          200,
          `define view entity ZI_ORDER as select from zsalesorder {
  key order_id as OrderId,
  customer as Customer,
  gross_amount - discount as NetAmount,
  _Items
}`,
        ),
      );

      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPRead', {
        type: 'DDLS',
        name: 'ZI_ORDER',
        include: 'elements',
      });
      expect(result.isError).toBeUndefined();
      expect(result.content[0]?.text).toContain('=== ZI_ORDER elements ===');
      expect(result.content[0]?.text).toContain('OrderId');
      expect(result.content[0]?.text).toContain('Customer');
      expect(result.content[0]?.text).toContain('NetAmount');
    });
  });

  // ─── SAPActivate ───────────────────────────────────────────────────

  describe('SAPActivate', () => {
    it('activates a single object', async () => {
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPActivate', {
        type: 'PROG',
        name: 'ZTEST',
      });
      // Mock returns generic text with no error markers → activation succeeds
      expect(result.isError).toBeUndefined();
      expect(result.content[0]?.text).toContain('Successfully activated PROG ZTEST');
    });

    it('batch activates multiple objects', async () => {
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPActivate', {
        objects: [
          { type: 'DDLS', name: 'ZI_TRAVEL' },
          { type: 'BDEF', name: 'ZI_TRAVEL' },
          { type: 'SRVD', name: 'ZSD_TRAVEL' },
        ],
      });
      expect(result.isError).toBeUndefined();
      expect(result.content[0]?.text).toContain('Successfully activated 3 objects');
      expect(result.content[0]?.text).toContain('ZI_TRAVEL');
      expect(result.content[0]?.text).toContain('ZSD_TRAVEL');
    });

    it('batch activation uses type from individual objects', async () => {
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPActivate', {
        objects: [
          { type: 'DDLX', name: 'ZC_TRAVEL' },
          { type: 'SRVB', name: 'ZUI_TRAVEL_O4' },
        ],
      });
      expect(result.isError).toBeUndefined();
      expect(result.content[0]?.text).toContain('Successfully activated 2 objects');
    });

    it('activates DDIC types with correct object URLs in XML body', async () => {
      // Activate STRU — the object URL should appear in the activation XML body
      await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPActivate', {
        type: 'STRU',
        name: 'ZTEST_STRUCT',
      });
      const lastCallOpts = mockFetch.mock.calls[mockFetch.mock.calls.length - 1]?.[1] as RequestInit;
      expect(lastCallOpts.body).toContain('/sap/bc/adt/ddic/structures/ZTEST_STRUCT');
    });

    it('activates DOMA with correct object URL in XML body', async () => {
      await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPActivate', {
        type: 'DOMA',
        name: 'ZBUKRS',
      });
      const lastCallOpts = mockFetch.mock.calls[mockFetch.mock.calls.length - 1]?.[1] as RequestInit;
      expect(lastCallOpts.body).toContain('/sap/bc/adt/ddic/domains/ZBUKRS');
    });

    it('activates DTEL with correct object URL in XML body', async () => {
      await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPActivate', {
        type: 'DTEL',
        name: 'ZBUKRS_DTEL',
      });
      const lastCallOpts = mockFetch.mock.calls[mockFetch.mock.calls.length - 1]?.[1] as RequestInit;
      expect(lastCallOpts.body).toContain('/sap/bc/adt/ddic/dataelements/ZBUKRS_DTEL');
    });

    it('activates TRAN with correct object URL in XML body', async () => {
      await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPActivate', {
        type: 'TRAN',
        name: 'ZTRAN01',
      });
      const lastCallOpts = mockFetch.mock.calls[mockFetch.mock.calls.length - 1]?.[1] as RequestInit;
      expect(lastCallOpts.body).toContain('/sap/bc/adt/vit/wb/object_type/trant/object_name/ZTRAN01');
    });

    it('publish_srvb action publishes and returns SRVB info', async () => {
      const publishOkXml =
        '<asx:abap xmlns:asx="http://www.sap.com/abapxml"><asx:values><DATA><SEVERITY>OK</SEVERITY><SHORT_TEXT>published locally</SHORT_TEXT><LONG_TEXT/></DATA></asx:values></asx:abap>';
      mockFetch
        .mockResolvedValueOnce(mockResponse(200, '', { 'x-csrf-token': 'T' })) // CSRF fetch for publish
        .mockResolvedValueOnce(mockResponse(200, publishOkXml, {})) // POST publishjobs
        .mockResolvedValueOnce(mockResponse(200, '<serviceBinding />', {})); // GET SRVB readback
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPActivate', {
        action: 'publish_srvb',
        name: 'ZSB_BOOKING_V4',
      });
      expect(result.isError).toBeUndefined();
      expect(result.content[0]?.text).toContain('Successfully published service binding ZSB_BOOKING_V4');
      // Verify readback content (parsed SRVB metadata) is included in the response
      expect(result.content[0]?.text).toContain('bindingCreated');
    });

    it('publish_srvb returns error when SAP reports failure', async () => {
      const publishErrorXml =
        '<asx:abap xmlns:asx="http://www.sap.com/abapxml"><asx:values><DATA><SEVERITY>ERROR</SEVERITY><SHORT_TEXT>Activating failed</SHORT_TEXT><LONG_TEXT>TADIR check failed</LONG_TEXT></DATA></asx:values></asx:abap>';
      mockFetch
        .mockResolvedValueOnce(mockResponse(200, '', { 'x-csrf-token': 'T' }))
        .mockResolvedValueOnce(mockResponse(200, publishErrorXml, {}));
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPActivate', {
        action: 'publish_srvb',
        name: 'ZSB_BOOKING_V4',
      });
      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain('Failed to publish');
      expect(result.content[0]?.text).toContain('TADIR check failed');
    });

    it('unpublish_srvb action unpublishes service binding', async () => {
      const unpublishOkXml =
        '<asx:abap xmlns:asx="http://www.sap.com/abapxml"><asx:values><DATA><SEVERITY>OK</SEVERITY><SHORT_TEXT>un-published locally</SHORT_TEXT><LONG_TEXT/></DATA></asx:values></asx:abap>';
      mockFetch
        .mockResolvedValueOnce(mockResponse(200, '', { 'x-csrf-token': 'T' })) // CSRF fetch for unpublish
        .mockResolvedValueOnce(mockResponse(200, unpublishOkXml, {})); // POST unpublishjobs
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPActivate', {
        action: 'unpublish_srvb',
        name: 'ZSB_BOOKING_V4',
      });
      expect(result.isError).toBeUndefined();
      expect(result.content[0]?.text).toContain('Successfully unpublished service binding ZSB_BOOKING_V4');
      // Verify the POST was made to the unpublishjobs endpoint
      const postCall = mockFetch.mock.calls.find((call) => (call[1] as RequestInit)?.method === 'POST');
      expect(postCall).toBeDefined();
      expect(String(postCall![0])).toContain('unpublishjobs');
    });

    it('publish_srvb returns error when name is missing', async () => {
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPActivate', {
        action: 'publish_srvb',
      });
      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain('Missing required "name"');
    });

    it('unpublish_srvb returns error when name is missing', async () => {
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPActivate', {
        action: 'unpublish_srvb',
      });
      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain('Missing required "name"');
    });

    it('default action still works as activate', async () => {
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPActivate', {
        type: 'PROG',
        name: 'ZTEST',
      });
      expect(result.isError).toBeUndefined();
      expect(result.content[0]?.text).toContain('Successfully activated PROG ZTEST');
    });
  });

  // ─── SAPManage ─────────────────────────────────────────────────────

  describe('SAPManage', () => {
    it('returns message when features not yet probed', async () => {
      const { resetCachedFeatures } = await import('../../../src/handlers/intent.js');
      resetCachedFeatures();

      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPManage', {
        action: 'features',
      });
      expect(result.isError).toBeUndefined();
      expect(result.content[0]?.text).toContain('No features probed yet');
    });

    it('returns error for unknown action', async () => {
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPManage', {
        action: 'invalid',
      });
      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain('Invalid arguments for SAPManage');
    });
  });

  // ─── Cache Hit Indicator ───────────────────────────────────────────

  describe('SAPRead cache hit indicator', () => {
    it('shows [cached] prefix on second read of same object', async () => {
      const { CachingLayer } = await import('../../../src/cache/caching-layer.js');
      const { MemoryCache } = await import('../../../src/cache/memory.js');
      const layer = new CachingLayer(new MemoryCache());

      // First read — no [cached] prefix
      const result1 = await handleToolCall(
        createClient(),
        DEFAULT_CONFIG,
        'SAPRead',
        { type: 'PROG', name: 'ZHELLO' },
        undefined,
        undefined,
        layer,
      );
      expect(result1.isError).toBeUndefined();
      expect(result1.content[0]?.text).not.toMatch(/^\[cached\]/);

      // Second read — should have [cached] prefix
      const result2 = await handleToolCall(
        createClient(),
        DEFAULT_CONFIG,
        'SAPRead',
        { type: 'PROG', name: 'ZHELLO' },
        undefined,
        undefined,
        layer,
      );
      expect(result2.isError).toBeUndefined();
      expect(result2.content[0]?.text).toMatch(/^\[cached\]/);
    });

    it('does NOT show [cached] when no cachingLayer is provided', async () => {
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPRead', { type: 'PROG', name: 'ZHELLO' });
      expect(result.isError).toBeUndefined();
      expect(result.content[0]?.text).not.toMatch(/^\[cached\]/);
    });

    it('does NOT show [cached] for types that bypass cachedGet (DOMA)', async () => {
      const { CachingLayer } = await import('../../../src/cache/caching-layer.js');
      const { MemoryCache } = await import('../../../src/cache/memory.js');
      const layer = new CachingLayer(new MemoryCache());

      // DOMA uses client.getDomain() directly, not cachedGet
      mockFetch.mockReset();
      mockFetch.mockResolvedValue(
        mockResponse(
          200,
          `<dom:domain xmlns:dom="http://www.sap.com/adt/ddic/domains" xmlns:adtcore="http://www.sap.com/adt/core" adtcore:name="ZTEST_DOMAIN"><dom:typeInformation dom:datatype="CHAR" dom:length="10"/></dom:domain>`,
          { 'x-csrf-token': 'T' },
        ),
      );
      const result = await handleToolCall(
        createClient(),
        DEFAULT_CONFIG,
        'SAPRead',
        { type: 'DOMA', name: 'ZTEST_DOMAIN' },
        undefined,
        undefined,
        layer,
      );
      expect(result.isError).toBeUndefined();
      expect(result.content[0]?.text).not.toMatch(/^\[cached\]/);
    });

    it('shows [cached] for INTF on second read', async () => {
      const { CachingLayer } = await import('../../../src/cache/caching-layer.js');
      const { MemoryCache } = await import('../../../src/cache/memory.js');
      const layer = new CachingLayer(new MemoryCache());

      // First read
      await handleToolCall(
        createClient(),
        DEFAULT_CONFIG,
        'SAPRead',
        { type: 'INTF', name: 'ZIF_TEST' },
        undefined,
        undefined,
        layer,
      );
      // Second read
      const result2 = await handleToolCall(
        createClient(),
        DEFAULT_CONFIG,
        'SAPRead',
        { type: 'INTF', name: 'ZIF_TEST' },
        undefined,
        undefined,
        layer,
      );
      expect(result2.isError).toBeUndefined();
      expect(result2.content[0]?.text).toMatch(/^\[cached\]/);
    });
  });

  // ─── Error Guidance ────────────────────────────────────────────────

  describe('error guidance', () => {
    it('404 error includes SAPSearch hint', async () => {
      mockFetch.mockReset();
      // Make the mock reject with a 404 AdtApiError
      mockFetch.mockRejectedValueOnce(
        new AdtApiError('Not found', 404, '/sap/bc/adt/programs/programs/ZNONEXIST/source/main'),
      );
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPRead', {
        type: 'PROG',
        name: 'ZNONEXIST',
      });
      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain('SAPSearch');
      expect(result.content[0]?.text).toContain('ZNONEXIST');
    });

    it('401 error includes client hint', async () => {
      mockFetch.mockReset();
      mockFetch.mockRejectedValueOnce(new AdtApiError('Auth failed', 401, '/sap/bc/adt/core/discovery'));
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPRead', {
        type: 'PROG',
        name: 'ZTEST',
      });
      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain('SAP_CLIENT');
    });
  });

  // ─── Issue 2: FUNC auto-resolve group ───────────────────────────────

  describe('FUNC auto-resolve group', () => {
    it('reads FUNC without group by auto-resolving via search', async () => {
      mockFetch.mockReset();
      // First call: search for FM → returns result with URI containing group
      mockFetch.mockResolvedValueOnce(
        mockResponse(
          200,
          `<objectReferences><objectReference type="FUGR/FF" name="Z_MY_FUNC" uri="/sap/bc/adt/functions/groups/zgroup/fmodules/z_my_func" packageName="ZTEST" description="Test FM"/></objectReferences>`,
        ),
      );
      // Second call: read the FM source
      mockFetch.mockResolvedValueOnce(mockResponse(200, 'FUNCTION z_my_func.\nENDFUNCTION.'));
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPRead', {
        type: 'FUNC',
        name: 'Z_MY_FUNC',
      });
      expect(result.isError).toBeUndefined();
      expect(result.content[0]?.text).toContain('FUNCTION z_my_func');
    });

    it('returns error when FUNC group cannot be resolved', async () => {
      mockFetch.mockReset();
      // Search returns empty results
      mockFetch.mockResolvedValueOnce(mockResponse(200, '<objectReferences/>'));
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPRead', {
        type: 'FUNC',
        name: 'Z_NONEXIST_FM',
      });
      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain('Cannot resolve function group');
    });
  });

  // ─── Issue 3: FUGR include expansion ────────────────────────────────

  describe('FUGR include expansion', () => {
    it('reads FUGR with expand_includes=true', async () => {
      mockFetch.mockReset();
      // First call: read FUGR main source
      mockFetch.mockResolvedValueOnce(mockResponse(200, 'INCLUDE LZ_TESTTOP.\nINCLUDE LZ_TESTI01.'));
      // Second call: read first include
      mockFetch.mockResolvedValueOnce(mockResponse(200, 'DATA: gv_test TYPE string.'));
      // Third call: read second include
      mockFetch.mockResolvedValueOnce(mockResponse(200, 'MODULE user_command_0100 INPUT.\nENDMODULE.'));
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPRead', {
        type: 'FUGR',
        name: 'Z_TEST',
        expand_includes: true,
      });
      expect(result.isError).toBeUndefined();
      expect(result.content[0]?.text).toContain('=== FUGR Z_TEST (main) ===');
      expect(result.content[0]?.text).toContain('=== LZ_TESTTOP ===');
      expect(result.content[0]?.text).toContain('DATA: gv_test');
      expect(result.content[0]?.text).toContain('=== LZ_TESTI01 ===');
    });

    it('handles failed includes gracefully', async () => {
      mockFetch.mockReset();
      // Main source
      mockFetch.mockResolvedValueOnce(mockResponse(200, 'INCLUDE LZ_BADINCL.'));
      // Include read fails
      mockFetch.mockRejectedValueOnce(
        new AdtApiError('Not found', 404, '/sap/bc/adt/programs/includes/LZ_BADINCL/source/main'),
      );
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPRead', {
        type: 'FUGR',
        name: 'Z_TEST',
        expand_includes: true,
      });
      expect(result.isError).toBeUndefined();
      expect(result.content[0]?.text).toContain('Could not read include');
    });
  });

  // ─── Issue 4: Source code search ────────────────────────────────────

  describe('SAPSearch source code', () => {
    it('searches source code with searchType=source_code', async () => {
      mockFetch.mockReset();
      mockFetch.mockResolvedValueOnce(
        mockResponse(
          200,
          `<objectReferences><objectReference type="CLAS/OC" name="ZCL_TEST" uri="/sap/bc/adt/oo/classes/zcl_test"/></objectReferences>`,
        ),
      );
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPSearch', {
        query: 'cl_lsapi_manager',
        searchType: 'source_code',
      });
      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0]?.text);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].objectName).toBe('ZCL_TEST');
    });

    it('returns helpful error when source search is not available', async () => {
      mockFetch.mockReset();
      mockFetch.mockRejectedValueOnce(
        new AdtApiError('Not found', 404, '/sap/bc/adt/repository/informationsystem/textSearch'),
      );
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPSearch', {
        query: 'test_pattern',
        searchType: 'source_code',
      });
      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain('not available on this SAP system');
    });

    it('returns precise probe reason when textSearch probe says unavailable', async () => {
      setCachedFeatures({
        hana: { id: 'hana', available: true, mode: 'auto' },
        abapGit: { id: 'abapGit', available: false, mode: 'auto' },
        rap: { id: 'rap', available: true, mode: 'auto' },
        amdp: { id: 'amdp', available: false, mode: 'auto' },
        ui5: { id: 'ui5', available: false, mode: 'auto' },
        transport: { id: 'transport', available: true, mode: 'auto' },
        textSearch: {
          available: false,
          reason:
            'textSearch ICF service not activated — activate /sap/bc/adt/repository/informationsystem/textSearch in SICF.',
        },
      });
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPSearch', {
        query: 'test_pattern',
        searchType: 'source_code',
      });
      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain('SICF');
      expect(result.content[0]?.text).toContain('not available');
    });

    it('searches normally when textSearch probe says available', async () => {
      setCachedFeatures({
        hana: { id: 'hana', available: true, mode: 'auto' },
        abapGit: { id: 'abapGit', available: false, mode: 'auto' },
        rap: { id: 'rap', available: true, mode: 'auto' },
        amdp: { id: 'amdp', available: false, mode: 'auto' },
        ui5: { id: 'ui5', available: false, mode: 'auto' },
        transport: { id: 'transport', available: true, mode: 'auto' },
        textSearch: { available: true },
      });
      mockFetch.mockReset();
      mockFetch.mockResolvedValueOnce(
        mockResponse(
          200,
          `<objectReferences><objectReference type="CLAS/OC" name="ZCL_FOUND" uri="/sap/bc/adt/oo/classes/zcl_found"/></objectReferences>`,
        ),
      );
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPSearch', {
        query: 'some_pattern',
        searchType: 'source_code',
      });
      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0]?.text);
      expect(parsed[0].objectName).toBe('ZCL_FOUND');
    });

    it('re-throws transient errors (e.g. 503) instead of claiming unavailable', async () => {
      setCachedFeatures({
        hana: { id: 'hana', available: true, mode: 'auto' },
        abapGit: { id: 'abapGit', available: false, mode: 'auto' },
        rap: { id: 'rap', available: true, mode: 'auto' },
        amdp: { id: 'amdp', available: false, mode: 'auto' },
        ui5: { id: 'ui5', available: false, mode: 'auto' },
        transport: { id: 'transport', available: true, mode: 'auto' },
        textSearch: { available: true },
      });
      mockFetch.mockReset();
      mockFetch.mockResolvedValueOnce(mockResponse(503, 'Service Unavailable'));
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPSearch', {
        query: 'test_pattern',
        searchType: 'source_code',
      });
      // Transient 503 should be caught by outer handleToolCall and reported as error,
      // NOT classified as "source code search is not available"
      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).not.toContain('not available');
    });
  });

  // ─── Issue 5: SOBJ/BOR reading ──────────────────────────────────────

  describe('SAPRead SOBJ', () => {
    it('lists BOR methods when no method specified', async () => {
      mockFetch.mockReset();
      // CSRF HEAD request (POST triggers CSRF fetch)
      mockFetch.mockResolvedValueOnce(mockResponse(200, '', { 'x-csrf-token': 'TOKEN123' }));
      // runQuery POST returns SWOTLV data
      mockFetch.mockResolvedValueOnce(
        mockResponse(
          200,
          `<abap><values><COLUMNS>
          <COLUMN><METADATA name="VERB"/><DATASET><DATA>CREATE</DATA><DATA>DISPLAY</DATA></DATASET></COLUMN>
          <COLUMN><METADATA name="PROGNAME"/><DATASET><DATA>ZPROG1</DATA><DATA>ZPROG2</DATA></DATASET></COLUMN>
          <COLUMN><METADATA name="FORMNAME"/><DATASET><DATA>CREATE_OBJ</DATA><DATA>DISPLAY_OBJ</DATA></DATASET></COLUMN>
          <COLUMN><METADATA name="DESCRIPT"/><DATASET><DATA>Create</DATA><DATA>Display</DATA></DATASET></COLUMN>
        </COLUMNS></values></abap>`,
        ),
      );
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPRead', {
        type: 'SOBJ',
        name: 'ZBUS_OBJ',
      });
      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0]?.text);
      expect(parsed.columns).toContain('VERB');
      expect(parsed.rows).toHaveLength(2);
    });

    it('reads specific BOR method implementation', async () => {
      mockFetch.mockReset();
      // CSRF HEAD request
      mockFetch.mockResolvedValueOnce(mockResponse(200, '', { 'x-csrf-token': 'TOKEN123' }));
      // SWOTLV query POST returns program+form
      mockFetch.mockResolvedValueOnce(
        mockResponse(
          200,
          `<abap><values><COLUMNS>
          <COLUMN><METADATA name="PROGNAME"/><DATASET><DATA>ZPROG1</DATA></DATASET></COLUMN>
          <COLUMN><METADATA name="FORMNAME"/><DATASET><DATA>CREATE_OBJ</DATA></DATASET></COLUMN>
        </COLUMNS></values></abap>`,
        ),
      );
      // Read program source (GET - no CSRF needed)
      mockFetch.mockResolvedValueOnce(mockResponse(200, 'REPORT zprog1.\nFORM create_obj.\nENDFORM.'));
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPRead', {
        type: 'SOBJ',
        name: 'ZBUS_OBJ',
        method: 'CREATE',
      });
      expect(result.isError).toBeUndefined();
      expect(result.content[0]?.text).toContain('BOR ZBUS_OBJ.CREATE');
      expect(result.content[0]?.text).toContain('REPORT zprog1');
    });
  });

  // ─── Issue 7: SAPNavigate symbolic references ──────────────────────

  describe('SAPNavigate symbolic references', () => {
    it('resolves type+name to URI for references action (scope-based Where-Used fails, falls back to simple)', async () => {
      mockFetch.mockReset();
      // First call: CSRF token fetch for the POST
      mockFetch.mockResolvedValueOnce(mockResponse(200, '', { 'x-csrf-token': 'mock-csrf-token' }));
      // Second call: findWhereUsed POST fails with 404 (simulating older SAP system without scope endpoint)
      mockFetch.mockRejectedValueOnce(new AdtApiError('Not found', 404, '/usageReferences'));
      // Third call: findReferences GET succeeds (fallback)
      mockFetch.mockResolvedValueOnce(
        mockResponse(
          200,
          `<usageReferences><objectReference uri="/sap/bc/adt/programs/programs/zcaller" type="PROG/P" name="ZCALLER"/></usageReferences>`,
        ),
      );
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPNavigate', {
        action: 'references',
        type: 'CLAS',
        name: 'ZCL_TEST',
      });
      expect(result.isError).toBeUndefined();
      // Should not get "No references found" since we have a match
      const parsed = JSON.parse(result.content[0]?.text);
      expect(parsed).toHaveLength(1);
    });

    it('falls back to simple references with objectType (returns warning note about dropped filter)', async () => {
      mockFetch.mockReset();
      // First call: CSRF token fetch for the POST
      mockFetch.mockResolvedValueOnce(mockResponse(200, '', { 'x-csrf-token': 'mock-csrf-token' }));
      // Second call: findWhereUsed POST fails with 404 (older SAP system)
      mockFetch.mockRejectedValueOnce(new AdtApiError('Not found', 404, '/usageReferences'));
      // Third call: findReferences GET succeeds (fallback) — includes CLAS/OC to prove results are unfiltered
      mockFetch.mockResolvedValueOnce(
        mockResponse(
          200,
          `<usageReferences><objectReference uri="/sap/bc/adt/programs/programs/zcaller" type="PROG/P" name="ZCALLER"/><objectReference uri="/sap/bc/adt/oo/classes/zcl_other" type="CLAS/OC" name="ZCL_OTHER"/></usageReferences>`,
        ),
      );
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPNavigate', {
        action: 'references',
        type: 'CLAS',
        name: 'ZCL_TEST',
        objectType: 'PROG/P',
      });
      expect(result.isError).toBeUndefined();
      expect(result.content).toHaveLength(1);
      const text = result.content[0]?.text;
      // Response should be valid JSON with note and results
      const parsed = JSON.parse(text);
      expect(parsed.note).toContain('objectType filter');
      expect(parsed.note).toContain('PROG/P');
      expect(parsed.note).toContain('ignored');
      expect(parsed.results).toHaveLength(2);
    });

    it('falls back to simple references without objectType (no warning note)', async () => {
      mockFetch.mockReset();
      // First call: CSRF token fetch for the POST
      mockFetch.mockResolvedValueOnce(mockResponse(200, '', { 'x-csrf-token': 'mock-csrf-token' }));
      // Second call: findWhereUsed POST fails with 404 (older SAP system)
      mockFetch.mockRejectedValueOnce(new AdtApiError('Not found', 404, '/usageReferences'));
      // Third call: findReferences GET succeeds (fallback)
      mockFetch.mockResolvedValueOnce(
        mockResponse(
          200,
          `<usageReferences><objectReference uri="/sap/bc/adt/programs/programs/zcaller" type="PROG/P" name="ZCALLER"/></usageReferences>`,
        ),
      );
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPNavigate', {
        action: 'references',
        type: 'CLAS',
        name: 'ZCL_TEST',
      });
      expect(result.isError).toBeUndefined();
      expect(result.content).toHaveLength(1);
      const text = result.content[0]?.text;
      // No warning — objectType was not requested
      expect(text).not.toContain('objectType filter');
      const parsed = JSON.parse(text);
      expect(parsed).toHaveLength(1);
    });

    it('uses scope-based Where-Used successfully with objectType filter', async () => {
      mockFetch.mockReset();
      // First call: CSRF token fetch
      mockFetch.mockResolvedValueOnce(mockResponse(200, '', { 'x-csrf-token': 'mock-csrf-token' }));
      // Second call: findWhereUsed POST succeeds (real SAP response format)
      mockFetch.mockResolvedValueOnce(
        mockResponse(
          200,
          `<?xml version="1.0" encoding="utf-8"?>
<usageReferences:usageReferenceResult numberOfResults="1" xmlns:usageReferences="http://www.sap.com/adt/ris/usageReferences">
  <usageReferences:referencedObjects>
    <usageReferences:referencedObject uri="/sap/bc/adt/programs/programs/ZPROG1/source/main" isResult="true">
      <usageReferences:adtObject adtcore:name="ZPROG1" adtcore:type="PROG/P" adtcore:description="Test Program" xmlns:adtcore="http://www.sap.com/adt/core">
        <adtcore:packageRef adtcore:name="$TMP"/>
      </usageReferences:adtObject>
    </usageReferences:referencedObject>
  </usageReferences:referencedObjects>
</usageReferences:usageReferenceResult>`,
        ),
      );
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPNavigate', {
        action: 'references',
        type: 'CLAS',
        name: 'ZCL_TEST',
        objectType: 'PROG/P',
      });
      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0]?.text);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].name).toBe('ZPROG1');
      expect(parsed[0].packageName).toBe('$TMP');
      expect(parsed[0].objectDescription).toBe('Test Program');
    });

    it('returns error when neither uri nor type+name provided for references', async () => {
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPNavigate', {
        action: 'references',
      });
      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain('Provide uri or type+name');
    });

    it('returns error when neither uri nor type+name provided for definition', async () => {
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPNavigate', {
        action: 'definition',
      });
      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain('Provide uri');
    });
  });

  // ─── BTP ABAP Handler Adaptation ────────────────────────────────────

  describe('BTP ABAP handler adaptation', () => {
    /** Create minimal BTP-detected features for testing */
    function setBtpMode(): void {
      const btpFeatures: ResolvedFeatures = {
        hana: { id: 'hana', available: true, mode: 'auto' },
        abapGit: { id: 'abapGit', available: false, mode: 'auto' },
        rap: { id: 'rap', available: true, mode: 'auto' },
        amdp: { id: 'amdp', available: false, mode: 'auto' },
        ui5: { id: 'ui5', available: false, mode: 'auto' },
        transport: { id: 'transport', available: true, mode: 'auto' },
        abapRelease: '758',
        systemType: 'btp',
      };
      setCachedFeatures(btpFeatures);
    }

    afterEach(() => {
      resetCachedFeatures();
    });

    it('returns helpful error for PROG read on BTP', async () => {
      setBtpMode();
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPRead', {
        type: 'PROG',
        name: 'RSHOWTIM',
      });
      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain('not available on BTP');
      expect(result.content[0]?.text).toContain('IF_OO_ADT_CLASSRUN');
    });

    it('returns helpful error for INCL read on BTP', async () => {
      setBtpMode();
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPRead', {
        type: 'INCL',
        name: 'ZSOME_INCLUDE',
      });
      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain('not available on BTP');
      expect(result.content[0]?.text).toContain('ABAP Cloud');
    });

    it('returns helpful error for VIEW read on BTP', async () => {
      setBtpMode();
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPRead', {
        type: 'VIEW',
        name: 'V_T002',
      });
      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain('not available on BTP');
      expect(result.content[0]?.text).toContain('CDS views');
    });

    it('returns helpful error for TEXT_ELEMENTS read on BTP', async () => {
      setBtpMode();
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPRead', {
        type: 'TEXT_ELEMENTS',
        name: 'RSHOWTIM',
      });
      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain('not available on BTP');
    });

    it('returns helpful error for VARIANTS read on BTP', async () => {
      setBtpMode();
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPRead', {
        type: 'VARIANTS',
        name: 'RSHOWTIM',
      });
      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain('not available on BTP');
    });

    it('returns helpful error for SOBJ read on BTP', async () => {
      setBtpMode();
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPRead', {
        type: 'SOBJ',
        name: 'BUS2032',
      });
      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain('not available on BTP');
      expect(result.content[0]?.text).toContain('BDEF');
    });

    it('allows CLAS read on BTP (works normally)', async () => {
      setBtpMode();
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPRead', {
        type: 'CLAS',
        name: 'ZCL_TEST',
      });
      // Should succeed (not an error about BTP)
      expect(result.isError).toBeUndefined();
    });

    it('returns helpful error for TRAN read on BTP', async () => {
      setBtpMode();
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPRead', {
        type: 'TRAN',
        name: 'SE38',
      });
      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain('not available on BTP');
    });

    it('allows STRU read on BTP', async () => {
      setBtpMode();
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPRead', {
        type: 'STRU',
        name: 'BAPIRET2',
      });
      expect(result.isError).toBeUndefined();
    });
  });

  // ─── Method-Level Surgery ──────────────────────────────────────────

  describe('method-level SAPRead', () => {
    it('lists methods with method="*"', async () => {
      // Mock response: a class with methods
      const classSource = `CLASS zcl_test DEFINITION PUBLIC.
  PUBLIC SECTION.
    METHODS get_name RETURNING VALUE(rv) TYPE string.
    METHODS run.
ENDCLASS.
CLASS zcl_test IMPLEMENTATION.
  METHOD get_name.
    rv = 'test'.
  ENDMETHOD.
  METHOD run.
    " run logic
  ENDMETHOD.
ENDCLASS.`;

      mockFetch.mockReset();
      mockFetch.mockResolvedValueOnce(mockResponse(200, classSource));

      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPRead', {
        type: 'CLAS',
        name: 'ZCL_TEST',
        method: '*',
      });
      expect(result.isError).toBeUndefined();
      expect(result.content[0]?.text).toContain('ZCL_TEST');
      expect(result.content[0]?.text).toContain('get_name');
      expect(result.content[0]?.text).toContain('run');
      expect(result.content[0]?.text).toContain('methods');
    });

    it('extracts single method with method="get_name"', async () => {
      const classSource = `CLASS zcl_test DEFINITION PUBLIC.
  PUBLIC SECTION.
    METHODS get_name RETURNING VALUE(rv) TYPE string.
    METHODS run.
ENDCLASS.
CLASS zcl_test IMPLEMENTATION.
  METHOD get_name.
    rv = 'test'.
  ENDMETHOD.
  METHOD run.
    " run logic
  ENDMETHOD.
ENDCLASS.`;

      mockFetch.mockReset();
      mockFetch.mockResolvedValueOnce(mockResponse(200, classSource));

      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPRead', {
        type: 'CLAS',
        name: 'ZCL_TEST',
        method: 'get_name',
      });
      expect(result.isError).toBeUndefined();
      expect(result.content[0]?.text).toContain('METHOD get_name');
      expect(result.content[0]?.text).toContain('ENDMETHOD');
      // Should NOT contain the other method
      expect(result.content[0]?.text).not.toContain('METHOD run');
    });

    it('returns error for nonexistent method', async () => {
      const classSource = `CLASS zcl_test DEFINITION PUBLIC.
  PUBLIC SECTION.
    METHODS get_name RETURNING VALUE(rv) TYPE string.
ENDCLASS.
CLASS zcl_test IMPLEMENTATION.
  METHOD get_name.
    rv = 'test'.
  ENDMETHOD.
ENDCLASS.`;

      mockFetch.mockReset();
      mockFetch.mockResolvedValueOnce(mockResponse(200, classSource));

      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPRead', {
        type: 'CLAS',
        name: 'ZCL_TEST',
        method: 'nonexistent',
      });
      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain('not found');
    });
  });

  describe('SAPWrite edit_method', () => {
    it('rejects edit_method without method param', async () => {
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPWrite', {
        action: 'edit_method',
        type: 'CLAS',
        name: 'ZCL_TEST',
        source: 'rv = 1.',
      });
      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain('method');
    });

    it('rejects edit_method without source param', async () => {
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPWrite', {
        action: 'edit_method',
        type: 'CLAS',
        name: 'ZCL_TEST',
        method: 'get_name',
      });
      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain('source');
    });

    it('rejects edit_method for non-CLAS type', async () => {
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPWrite', {
        action: 'edit_method',
        type: 'PROG',
        name: 'ZTEST',
        method: 'get_name',
        source: 'rv = 1.',
      });
      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain('CLAS');
    });
  });

  describe('hyperfocused mode (SAP tool)', () => {
    it('routes SAP(read) to SAPRead', async () => {
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAP', {
        action: 'read',
        type: 'PROG',
        name: 'ZHELLO',
      });
      expect(result.isError).toBeUndefined();
      // Should get the same result as SAPRead(PROG)
      expect(result.content[0]?.text).toBeTruthy();
    });

    it('returns error for unknown SAP action', async () => {
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAP', {
        action: 'invalid_action',
      });
      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain('Unknown action');
    });

    it('routes SAP(search) with params', async () => {
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAP', {
        action: 'search',
        params: { query: 'ZCL*' },
      });
      // Should succeed (mock returns data)
      expect(result.isError).toBeUndefined();
    });
  });

  // ─── SAPWrite batch_create ──────────────────────────────────────────

  describe('SAPWrite batch_create', () => {
    it('creates all objects in order', async () => {
      // Mock: CSRF fetch, create POST, lock GET (for safeUpdateSource), update PUT, unlock POST, activation POST
      // Use a simple mock that returns 200 for everything
      mockFetch.mockResolvedValue(mockResponse(200, '<xml>ok</xml>', { 'x-csrf-token': 'mock-csrf-token' }));

      // Disable lint to avoid CDS source being rejected by ABAP parser
      const config = { ...DEFAULT_CONFIG, lintBeforeWrite: false };
      const result = await handleToolCall(createClient(), config, 'SAPWrite', {
        action: 'batch_create',
        package: '$TMP',
        objects: [
          { type: 'DDLS', name: 'ZI_TEST', source: 'define root view entity ZI_TEST {}' },
          { type: 'BDEF', name: 'ZI_TEST', source: 'managed implementation in class zbp_i_test;' },
          { type: 'SRVD', name: 'ZSD_TEST', source: 'define service ZSD_TEST {}' },
        ],
      });

      // Should mention all 3 objects in the summary
      const text = result.content[0]?.text ?? '';
      expect(text).toContain('ZI_TEST (DDLS)');
      expect(text).toContain('ZI_TEST (BDEF)');
      expect(text).toContain('ZSD_TEST (SRVD)');
      expect(text).toContain('3 objects');
    });

    it('stops on first failure and reports partial results', async () => {
      let callCount = 0;
      mockFetch.mockImplementation(() => {
        callCount++;
        // First few calls succeed (CSRF, create #1, lock, update, unlock, activate)
        // Then fail on second object create
        if (callCount <= 7) {
          return Promise.resolve(mockResponse(200, '<xml>ok</xml>', { 'x-csrf-token': 'T' }));
        }
        // Fail on subsequent calls (second object)
        return Promise.resolve(mockResponse(500, 'Internal Server Error', { 'x-csrf-token': 'T' }));
      });

      const config = { ...DEFAULT_CONFIG, lintBeforeWrite: false };
      const result = await handleToolCall(createClient(), config, 'SAPWrite', {
        action: 'batch_create',
        package: '$TMP',
        objects: [
          { type: 'PROG', name: 'ZPROG1', source: "REPORT zprog1.\nWRITE: / 'hi'." },
          { type: 'PROG', name: 'ZPROG2', source: "REPORT zprog2.\nWRITE: / 'hi'." },
          { type: 'PROG', name: 'ZPROG3', source: "REPORT zprog3.\nWRITE: / 'hi'." },
        ],
      });

      expect(result.isError).toBe(true);
      const text = result.content[0]?.text ?? '';
      // Third object should appear as skipped
      expect(text).toContain('ZPROG3');
      expect(text).toContain('skipped');
    });

    it('returns error for empty objects array', async () => {
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPWrite', {
        action: 'batch_create',
        package: '$TMP',
        objects: [],
      });
      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain('non-empty');
    });

    it('respects read-only safety mode', async () => {
      const client = new AdtClient({
        baseUrl: 'http://sap:8000',
        username: 'admin',
        password: 'secret',
        safety: { ...unrestrictedSafetyConfig(), readOnly: true },
      });

      const result = await handleToolCall(client, DEFAULT_CONFIG, 'SAPWrite', {
        action: 'batch_create',
        package: '$TMP',
        objects: [{ type: 'PROG', name: 'ZPROG1', source: 'REPORT zprog1.' }],
      });

      expect(result.isError).toBe(true);
      const text = result.content[0]?.text ?? '';
      expect(text).toContain('blocked');
    });

    it('applies package filter', async () => {
      const client = new AdtClient({
        baseUrl: 'http://sap:8000',
        username: 'admin',
        password: 'secret',
        safety: { ...unrestrictedSafetyConfig(), allowedPackages: ['ZALLOWED*'] },
      });

      const result = await handleToolCall(client, DEFAULT_CONFIG, 'SAPWrite', {
        action: 'batch_create',
        package: 'ZBLOCKED',
        objects: [{ type: 'PROG', name: 'ZPROG1', source: 'REPORT zprog1.' }],
      });

      expect(result.isError).toBe(true);
      const text = result.content[0]?.text ?? '';
      expect(text).toContain('blocked');
    });

    it('activates each object after creation', async () => {
      const fetchCalls: string[] = [];
      mockFetch.mockImplementation((_url: string | URL, options?: { method?: string }) => {
        const urlStr = typeof _url === 'string' ? _url : _url.toString();
        fetchCalls.push(`${options?.method ?? 'GET'} ${urlStr}`);
        return Promise.resolve(mockResponse(200, '<xml>ok</xml>', { 'x-csrf-token': 'T' }));
      });

      await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPWrite', {
        action: 'batch_create',
        package: '$TMP',
        objects: [{ type: 'PROG', name: 'ZPROG1' }],
      });

      // Should have an activation POST call
      const activationCalls = fetchCalls.filter((c) => c.includes('activation'));
      expect(activationCalls.length).toBeGreaterThanOrEqual(1);
    });

    it('skips source update when no source provided', async () => {
      const fetchCalls: string[] = [];
      mockFetch.mockImplementation((_url: string | URL, options?: { method?: string }) => {
        const urlStr = typeof _url === 'string' ? _url : _url.toString();
        fetchCalls.push(`${options?.method ?? 'GET'} ${urlStr}`);
        return Promise.resolve(mockResponse(200, '<xml>ok</xml>', { 'x-csrf-token': 'T' }));
      });

      await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPWrite', {
        action: 'batch_create',
        package: '$TMP',
        objects: [{ type: 'SRVD', name: 'ZSD_TEST' }],
      });

      // No PUT call for source update (only POST for create + POST for activation)
      const putCalls = fetchCalls.filter((c) => c.startsWith('PUT'));
      expect(putCalls.length).toBe(0);
    });

    it('batch_create succeeds with multiple objects', async () => {
      mockFetch.mockResolvedValue(mockResponse(200, '<xml>ok</xml>', { 'x-csrf-token': 'T' }));
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPWrite', {
        action: 'batch_create',
        package: '$TMP',
        objects: [
          { type: 'PROG', name: 'ZPROG1', source: 'REPORT zprog1.' },
          { type: 'PROG', name: 'ZPROG2', source: 'REPORT zprog2.' },
        ],
      });

      const text = result.content[0]?.text ?? '';
      expect(text).toContain('2 objects');
      expect(result.isError).toBeUndefined();
    });
  });

  // ─── AFF validation in SAPWrite ─────────────────────────────────────

  describe('SAPWrite AFF validation', () => {
    it('create with valid metadata proceeds normally', async () => {
      mockFetch.mockResolvedValue(mockResponse(200, '<xml>ok</xml>', { 'x-csrf-token': 'T' }));
      const config = { ...DEFAULT_CONFIG, lintBeforeWrite: false };
      const result = await handleToolCall(createClient(), config, 'SAPWrite', {
        action: 'create',
        type: 'CLAS',
        name: 'ZCL_TEST',
        package: '$TMP',
        description: 'Test class',
        source: 'CLASS zcl_test DEFINITION PUBLIC.\nENDCLASS.\nCLASS zcl_test IMPLEMENTATION.\nENDCLASS.',
      });
      expect(result.isError).toBeUndefined();
      expect(result.content[0]?.text).toContain('Created CLAS ZCL_TEST');
    });

    it('create with description > 60 chars fails AFF validation', async () => {
      const longDesc = 'A'.repeat(61);
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPWrite', {
        action: 'create',
        type: 'CLAS',
        name: 'ZCL_TEST',
        package: '$TMP',
        description: longDesc,
      });
      expect(result.isError).toBe(true);
      const text = result.content[0]?.text ?? '';
      expect(text).toContain('AFF metadata validation failed');
      expect(text).toContain('CLAS ZCL_TEST');
    });

    it('create for type without AFF schema skips validation', async () => {
      mockFetch.mockResolvedValue(mockResponse(200, '<xml>ok</xml>', { 'x-csrf-token': 'T' }));
      const config = { ...DEFAULT_CONFIG, lintBeforeWrite: false };
      const result = await handleToolCall(createClient(), config, 'SAPWrite', {
        action: 'create',
        type: 'INCL',
        name: 'Z_TEST_INCL',
        package: '$TMP',
        description: 'A'.repeat(100), // Long description, but no AFF schema for INCL
      });
      // Should not fail due to AFF validation (INCL has no schema)
      expect(result.isError).toBeUndefined();
    });

    it('batch_create stops on first AFF validation failure', async () => {
      mockFetch.mockResolvedValue(mockResponse(200, '<xml>ok</xml>', { 'x-csrf-token': 'T' }));
      const config = { ...DEFAULT_CONFIG, lintBeforeWrite: false };
      const longDesc = 'A'.repeat(61);
      const result = await handleToolCall(createClient(), config, 'SAPWrite', {
        action: 'batch_create',
        package: '$TMP',
        objects: [
          { type: 'PROG', name: 'ZPROG1', description: 'Valid desc', source: 'REPORT zprog1.' },
          { type: 'CLAS', name: 'ZCL_BAD', description: longDesc },
          { type: 'PROG', name: 'ZPROG2', source: 'REPORT zprog2.' },
        ],
      });
      expect(result.isError).toBe(true);
      const text = result.content[0]?.text ?? '';
      expect(text).toContain('ZPROG1');
      expect(text).toContain('ZCL_BAD');
      expect(text).toContain('AFF metadata validation failed');
      // Third object should appear as skipped
      expect(text).toContain('ZPROG2');
      expect(text).toContain('skipped');
    });

    it('AFF validation errors include field path and details', async () => {
      const longDesc = 'A'.repeat(71); // PROG maxLength is 70
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPWrite', {
        action: 'create',
        type: 'PROG',
        name: 'ZPROG1',
        package: '$TMP',
        description: longDesc,
      });
      expect(result.isError).toBe(true);
      const text = result.content[0]?.text ?? '';
      // Should mention the field path and constraint
      expect(text).toContain('/header/description');
      expect(text).toContain('Fix the metadata and retry');
    });
  });

  // ─── buildCreateXml ─────────────────────────────────────────────────

  describe('buildCreateXml', () => {
    it('returns correct XML for PROG', () => {
      const xml = buildCreateXml('PROG', 'ZHELLO', 'ZPACKAGE', 'Hello Program');
      expect(xml).toContain('<program:abapProgram');
      expect(xml).toContain('xmlns:program="http://www.sap.com/adt/programs/programs"');
      expect(xml).toContain('adtcore:type="PROG/P"');
      expect(xml).toContain('adtcore:name="ZHELLO"');
      expect(xml).toContain('adtcore:description="Hello Program"');
      expect(xml).toContain('<adtcore:packageRef adtcore:name="ZPACKAGE"/>');
    });

    it('returns correct XML for CLAS', () => {
      const xml = buildCreateXml('CLAS', 'ZCL_TEST', 'ZPACKAGE', 'Test Class');
      expect(xml).toContain('<class:abapClass');
      expect(xml).toContain('xmlns:class="http://www.sap.com/adt/oo/classes"');
      expect(xml).toContain('adtcore:type="CLAS/OC"');
      expect(xml).toContain('adtcore:name="ZCL_TEST"');
      expect(xml).toContain('adtcore:description="Test Class"');
      expect(xml).toContain('<adtcore:packageRef adtcore:name="ZPACKAGE"/>');
    });

    it('returns correct XML for INTF', () => {
      const xml = buildCreateXml('INTF', 'ZIF_TEST', 'ZPACKAGE', 'Test Interface');
      expect(xml).toContain('<intf:abapInterface');
      expect(xml).toContain('xmlns:intf="http://www.sap.com/adt/oo/interfaces"');
      expect(xml).toContain('adtcore:type="INTF/OI"');
      expect(xml).toContain('adtcore:name="ZIF_TEST"');
      expect(xml).toContain('adtcore:description="Test Interface"');
      expect(xml).toContain('<adtcore:packageRef adtcore:name="ZPACKAGE"/>');
    });

    it('returns correct XML for INCL', () => {
      const xml = buildCreateXml('INCL', 'ZHELLO_TOP', 'ZPACKAGE', 'Include Program');
      expect(xml).toContain('<include:abapInclude');
      expect(xml).toContain('xmlns:include="http://www.sap.com/adt/programs/includes"');
      expect(xml).toContain('adtcore:type="PROG/I"');
      expect(xml).toContain('adtcore:name="ZHELLO_TOP"');
      expect(xml).toContain('adtcore:description="Include Program"');
      expect(xml).toContain('<adtcore:packageRef adtcore:name="ZPACKAGE"/>');
    });

    it('returns correct XML for DDLS', () => {
      const xml = buildCreateXml('DDLS', 'ZI_TRAVEL', 'ZPACKAGE', 'Travel CDS View');
      expect(xml).toContain('<ddl:ddlSource');
      expect(xml).toContain('xmlns:ddl="http://www.sap.com/adt/ddic/ddlsources"');
      expect(xml).toContain('adtcore:type="DDLS/DF"');
      expect(xml).toContain('adtcore:name="ZI_TRAVEL"');
      expect(xml).toContain('adtcore:description="Travel CDS View"');
      expect(xml).toContain('<adtcore:packageRef adtcore:name="ZPACKAGE"/>');
    });

    it('returns correct XML for BDEF', () => {
      const xml = buildCreateXml('BDEF', 'ZI_TRAVEL', 'ZPACKAGE', 'Travel Behavior');
      expect(xml).toContain('<bdef:behaviorDefinition');
      expect(xml).toContain('xmlns:bdef="http://www.sap.com/adt/bo/behaviordefinitions"');
      expect(xml).toContain('adtcore:type="BDEF/BDO"');
      expect(xml).toContain('adtcore:name="ZI_TRAVEL"');
      expect(xml).toContain('adtcore:description="Travel Behavior"');
      expect(xml).toContain('<adtcore:packageRef adtcore:name="ZPACKAGE"/>');
    });

    it('returns correct XML for SRVD', () => {
      const xml = buildCreateXml('SRVD', 'ZSD_TRAVEL', 'ZPACKAGE', 'Travel Service Def');
      expect(xml).toContain('<srvd:srvdSource');
      expect(xml).toContain('xmlns:srvd="http://www.sap.com/adt/ddic/srvd/sources"');
      expect(xml).toContain('adtcore:type="SRVD/SRV"');
      expect(xml).toContain('adtcore:name="ZSD_TRAVEL"');
      expect(xml).toContain('adtcore:description="Travel Service Def"');
      expect(xml).toContain('<adtcore:packageRef adtcore:name="ZPACKAGE"/>');
    });

    it('returns correct XML for DDLX', () => {
      const xml = buildCreateXml('DDLX', 'ZC_TRAVEL', 'ZPACKAGE', 'Travel Metadata Ext');
      expect(xml).toContain('<ddlx:ddlxSource');
      expect(xml).toContain('xmlns:ddlx="http://www.sap.com/adt/ddic/ddlx/sources"');
      expect(xml).toContain('adtcore:type="DDLX/EX"');
      expect(xml).toContain('adtcore:name="ZC_TRAVEL"');
      expect(xml).toContain('adtcore:description="Travel Metadata Ext"');
      expect(xml).toContain('<adtcore:packageRef adtcore:name="ZPACKAGE"/>');
    });

    it('default fallback uses objectUrlForType instead of hardcoded path', () => {
      const xml = buildCreateXml('TABL', 'ZTABLE', 'ZPACKAGE', 'A Table');
      expect(xml).toContain('<adtcore:objectReferences');
      expect(xml).toContain('/sap/bc/adt/ddic/tables/ZTABLE');
      expect(xml).not.toContain('/sap/bc/adt/programs/programs/');
    });

    it('escapes XML special characters in attributes', () => {
      const xml = buildCreateXml('DDLS', 'ZTEST', 'ZPKG', 'Desc with "quotes" & <angle>');
      expect(xml).toContain('adtcore:description="Desc with &quot;quotes&quot; &amp; &lt;angle&gt;"');
    });

    it('escapes apostrophes in XML attributes', () => {
      const xml = buildCreateXml('PROG', 'ZTEST', 'ZPKG', "It's a test");
      expect(xml).toContain('adtcore:description="It&apos;s a test"');
    });
  });
});
