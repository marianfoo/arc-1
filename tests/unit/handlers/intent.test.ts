import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import axios from 'axios';
import { describe, expect, it, vi } from 'vitest';
import { AdtClient } from '../../../ts-src/adt/client.js';
import { AdtApiError } from '../../../ts-src/adt/errors.js';
import { unrestrictedSafetyConfig } from '../../../ts-src/adt/safety.js';
import { handleToolCall, TOOL_SCOPES } from '../../../ts-src/handlers/intent.js';
import { DEFAULT_CONFIG } from '../../../ts-src/server/types.js';

// Mock axios so AdtClient doesn't make real requests
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

function createClient(): AdtClient {
  return new AdtClient({
    baseUrl: 'http://sap:8000',
    username: 'admin',
    password: 'secret',
    safety: unrestrictedSafetyConfig(),
  });
}

describe('Intent Handler', () => {
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

    it('returns error for unknown type', async () => {
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPRead', {
        type: 'UNKNOWN',
        name: 'TEST',
      });
      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain('Unknown SAPRead type');
      // Should list supported types
      expect(result.content[0]?.text).toContain('PROG');
      expect(result.content[0]?.text).toContain('CLAS');
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

    it('returns error for unknown action', async () => {
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPLint', {
        action: 'unknown',
      });
      expect(result.isError).toBe(true);
    });

    it('returns error for missing action', async () => {
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPLint', {});
      expect(result.isError).toBe(true);
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

    const adminAuth: AuthInfo = {
      token: 'test-token',
      clientId: 'test-client',
      scopes: ['read', 'write', 'admin'],
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

    it('blocks SAPTransport with write-only scope', async () => {
      const result = await handleToolCall(
        createClient(),
        DEFAULT_CONFIG,
        'SAPTransport',
        { action: 'list' },
        writeAuth,
      );
      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain("Insufficient scope: 'admin'");
    });

    it('allows SAPTransport with admin scope', async () => {
      const result = await handleToolCall(
        createClient(),
        DEFAULT_CONFIG,
        'SAPTransport',
        { action: 'list' },
        adminAuth,
      );
      // Should reach the switch, not blocked by scope
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
  });

  // ─── TOOL_SCOPES mapping ──────────────────────────────────────────

  describe('TOOL_SCOPES', () => {
    it('maps all read tools to read scope', () => {
      for (const tool of ['SAPRead', 'SAPSearch', 'SAPQuery', 'SAPNavigate', 'SAPContext', 'SAPLint', 'SAPDiagnose']) {
        expect(TOOL_SCOPES[tool]).toBe('read');
      }
    });

    it('maps write tools to write scope', () => {
      for (const tool of ['SAPWrite', 'SAPActivate', 'SAPManage']) {
        expect(TOOL_SCOPES[tool]).toBe('write');
      }
    });

    it('maps transport to admin scope', () => {
      expect(TOOL_SCOPES.SAPTransport).toBe('admin');
    });

    it('covers all 11 tools', () => {
      expect(Object.keys(TOOL_SCOPES)).toHaveLength(11);
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
  });

  // ─── SAPManage ─────────────────────────────────────────────────────

  describe('SAPManage', () => {
    it('returns message when features not yet probed', async () => {
      const { resetCachedFeatures } = await import('../../../ts-src/handlers/intent.js');
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
      const mockInstance = (axios.create as any)();
      const requestSpy = mockInstance.request as ReturnType<typeof vi.fn>;
      // Make the mock reject with a 404 AdtApiError
      requestSpy.mockRejectedValueOnce(
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
      const mockInstance = (axios.create as any)();
      const requestSpy = mockInstance.request as ReturnType<typeof vi.fn>;
      requestSpy.mockRejectedValueOnce(new AdtApiError('Auth failed', 401, '/sap/bc/adt/core/discovery'));
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
      const mockInstance = (axios.create as any)();
      const requestSpy = mockInstance.request as ReturnType<typeof vi.fn>;
      // First call: search for FM → returns result with URI containing group
      requestSpy.mockResolvedValueOnce({
        status: 200,
        data: `<objectReferences><objectReference type="FUGR/FF" name="Z_MY_FUNC" uri="/sap/bc/adt/functions/groups/zgroup/fmodules/z_my_func" packageName="ZTEST" description="Test FM"/></objectReferences>`,
        headers: {},
      });
      // Second call: read the FM source
      requestSpy.mockResolvedValueOnce({
        status: 200,
        data: 'FUNCTION z_my_func.\nENDFUNCTION.',
        headers: {},
      });
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPRead', {
        type: 'FUNC',
        name: 'Z_MY_FUNC',
      });
      expect(result.isError).toBeUndefined();
      expect(result.content[0]?.text).toContain('FUNCTION z_my_func');
    });

    it('returns error when FUNC group cannot be resolved', async () => {
      const mockInstance = (axios.create as any)();
      const requestSpy = mockInstance.request as ReturnType<typeof vi.fn>;
      // Search returns empty results
      requestSpy.mockResolvedValueOnce({
        status: 200,
        data: '<objectReferences/>',
        headers: {},
      });
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
      const mockInstance = (axios.create as any)();
      const requestSpy = mockInstance.request as ReturnType<typeof vi.fn>;
      // First call: read FUGR main source
      requestSpy.mockResolvedValueOnce({
        status: 200,
        data: 'INCLUDE LZ_TESTTOP.\nINCLUDE LZ_TESTI01.',
        headers: {},
      });
      // Second call: read first include
      requestSpy.mockResolvedValueOnce({
        status: 200,
        data: 'DATA: gv_test TYPE string.',
        headers: {},
      });
      // Third call: read second include
      requestSpy.mockResolvedValueOnce({
        status: 200,
        data: 'MODULE user_command_0100 INPUT.\nENDMODULE.',
        headers: {},
      });
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
      const mockInstance = (axios.create as any)();
      const requestSpy = mockInstance.request as ReturnType<typeof vi.fn>;
      // Main source
      requestSpy.mockResolvedValueOnce({
        status: 200,
        data: 'INCLUDE LZ_BADINCL.',
        headers: {},
      });
      // Include read fails
      requestSpy.mockRejectedValueOnce(
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
      const mockInstance = (axios.create as any)();
      const requestSpy = mockInstance.request as ReturnType<typeof vi.fn>;
      requestSpy.mockResolvedValueOnce({
        status: 200,
        data: `<objectReferences><objectReference type="CLAS/OC" name="ZCL_TEST" uri="/sap/bc/adt/oo/classes/zcl_test"/></objectReferences>`,
        headers: {},
      });
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
      const mockInstance = (axios.create as any)();
      const requestSpy = mockInstance.request as ReturnType<typeof vi.fn>;
      requestSpy.mockRejectedValueOnce(
        new AdtApiError('Not found', 404, '/sap/bc/adt/repository/informationsystem/textSearch'),
      );
      const result = await handleToolCall(createClient(), DEFAULT_CONFIG, 'SAPSearch', {
        query: 'test_pattern',
        searchType: 'source_code',
      });
      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain('not available on this SAP system');
    });
  });

  // ─── Issue 5: SOBJ/BOR reading ──────────────────────────────────────

  describe('SAPRead SOBJ', () => {
    it('lists BOR methods when no method specified', async () => {
      const mockInstance = (axios.create as any)();
      const requestSpy = mockInstance.request as ReturnType<typeof vi.fn>;
      // CSRF HEAD request (POST triggers CSRF fetch)
      requestSpy.mockResolvedValueOnce({
        status: 200,
        data: '',
        headers: { 'x-csrf-token': 'TOKEN123' },
      });
      // runQuery POST returns SWOTLV data
      requestSpy.mockResolvedValueOnce({
        status: 200,
        data: `<abap><values><COLUMNS>
          <COLUMN><METADATA name="VERB"/><DATASET><DATA>CREATE</DATA><DATA>DISPLAY</DATA></DATASET></COLUMN>
          <COLUMN><METADATA name="PROGNAME"/><DATASET><DATA>ZPROG1</DATA><DATA>ZPROG2</DATA></DATASET></COLUMN>
          <COLUMN><METADATA name="FORMNAME"/><DATASET><DATA>CREATE_OBJ</DATA><DATA>DISPLAY_OBJ</DATA></DATASET></COLUMN>
          <COLUMN><METADATA name="DESCRIPT"/><DATASET><DATA>Create</DATA><DATA>Display</DATA></DATASET></COLUMN>
        </COLUMNS></values></abap>`,
        headers: {},
      });
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
      const mockInstance = (axios.create as any)();
      const requestSpy = mockInstance.request as ReturnType<typeof vi.fn>;
      // CSRF HEAD request
      requestSpy.mockResolvedValueOnce({
        status: 200,
        data: '',
        headers: { 'x-csrf-token': 'TOKEN123' },
      });
      // SWOTLV query POST returns program+form
      requestSpy.mockResolvedValueOnce({
        status: 200,
        data: `<abap><values><COLUMNS>
          <COLUMN><METADATA name="PROGNAME"/><DATASET><DATA>ZPROG1</DATA></DATASET></COLUMN>
          <COLUMN><METADATA name="FORMNAME"/><DATASET><DATA>CREATE_OBJ</DATA></DATASET></COLUMN>
        </COLUMNS></values></abap>`,
        headers: {},
      });
      // Read program source (GET - no CSRF needed)
      requestSpy.mockResolvedValueOnce({
        status: 200,
        data: 'REPORT zprog1.\nFORM create_obj.\nENDFORM.',
        headers: {},
      });
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
    it('resolves type+name to URI for references action', async () => {
      const mockInstance = (axios.create as any)();
      const requestSpy = mockInstance.request as ReturnType<typeof vi.fn>;
      requestSpy.mockResolvedValueOnce({
        status: 200,
        data: `<usageReferences><objectReference uri="/sap/bc/adt/programs/programs/zcaller" type="PROG/P" name="ZCALLER"/></usageReferences>`,
        headers: {},
      });
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
});
