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
const { handleToolCall, hasRequiredScope, resetCachedFeatures, setCachedFeatures, TOOL_SCOPES } = await import(
  '../../../src/handlers/intent.js'
);

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

    it('returns error for unknown type with supported types and mapping tip', async () => {
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPRead', {
        type: 'UNKNOWN',
        name: 'TEST',
      });
      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain('Unknown SAPRead type');
      // Should list supported types
      expect(result.content[0]?.text).toContain('PROG');
      expect(result.content[0]?.text).toContain('CLAS');
      expect(result.content[0]?.text).toContain('STRU');
      expect(result.content[0]?.text).toContain('DOMA');
      expect(result.content[0]?.text).toContain('DTEL');
      expect(result.content[0]?.text).toContain('TRAN');
      // Should include objectType mapping tip
      expect(result.content[0]?.text).toContain('DDLS/DF');
      expect(result.content[0]?.text).toContain('CLAS/OC');
      expect(result.content[0]?.text).toContain('drop');
    });

    it('returns error with mapping tip for empty/missing type', async () => {
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPRead', {
        type: '',
        name: 'TEST',
      });
      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain('Unknown SAPRead type');
      expect(result.content[0]?.text).toContain('Supported types');
      expect(result.content[0]?.text).toContain('slash suffix');
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

    it('returns error for unknown action with SAPDiagnose redirect hint', async () => {
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPLint', {
        action: 'unknown',
      });
      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain('SAPDiagnose');
    });

    it('redirects atc users to SAPDiagnose', async () => {
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPLint', {
        action: 'atc',
      });
      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain('SAPDiagnose');
    });

    it('redirects syntax users to SAPDiagnose', async () => {
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPLint', {
        action: 'syntax',
      });
      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain('SAPDiagnose');
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

    it('returns error for unsupported type', async () => {
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPContext', {
        type: 'TABL',
        name: 'MARA',
      });
      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain('SAPContext supports types');
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
      expect(result.content[0]?.text).toContain('Unknown SAPManage action');
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
});
