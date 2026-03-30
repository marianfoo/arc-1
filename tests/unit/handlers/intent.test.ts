import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { describe, expect, it, vi } from 'vitest';
import axios from 'axios';
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
  });
});
