/**
 * E2E Tests for CDS Context Features
 *
 * Tests SAPContext(type='DDLS') and SAPRead(type='DDLS', include='elements').
 * Uses /DMO/ Flight Reference Scenario CDS views available on demo systems.
 */

import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { callTool, connectClient, expectToolError, expectToolSuccess } from './helpers.js';

describe('E2E CDS Context Tests', () => {
  let client: Client;

  beforeAll(async () => {
    client = await connectClient();
  });

  afterAll(async () => {
    try {
      await client?.close();
    } catch {
      // Ignore close errors
    }
  });

  // ── SAPRead DDLS ──────────────────────────────────────────────────

  describe('SAPRead DDLS', () => {
    it('reads raw DDL source for a CDS view', async () => {
      const result = await callTool(client, 'SAPRead', {
        type: 'DDLS',
        name: '/DMO/I_TRAVEL',
      });
      const text = expectToolSuccess(result);
      expect(text).toContain('define');
      expect(text).toContain('select from');
    });

    it('returns structured elements with include="elements"', async () => {
      const result = await callTool(client, 'SAPRead', {
        type: 'DDLS',
        name: '/DMO/I_TRAVEL',
        include: 'elements',
      });
      const text = expectToolSuccess(result);
      expect(text).toContain('=== /DMO/I_TRAVEL elements ===');
      expect(text).toContain('key');
    });

    it('returns 404 error for non-existent DDLS', async () => {
      const result = await callTool(client, 'SAPRead', {
        type: 'DDLS',
        name: 'ZZZNOTEXIST_DDLS_999',
      });
      expectToolError(result, 'ZZZNOTEXIST_DDLS_999');
    });
  });

  // ── SAPContext DDLS ───────────────────────────────────────────────

  describe('SAPContext DDLS', () => {
    it('returns CDS dependency context', async () => {
      const result = await callTool(client, 'SAPContext', {
        type: 'DDLS',
        name: '/DMO/I_TRAVEL',
      });
      const text = expectToolSuccess(result);
      expect(text).toContain('CDS dependency context for /DMO/I_TRAVEL');
      expect(text).toContain('Stats:');
      expect(text).toContain('resolved');
    });

    it('returns CDS dependency context with depth=2', async () => {
      const result = await callTool(client, 'SAPContext', {
        type: 'DDLS',
        name: '/DMO/I_TRAVEL',
        depth: 2,
      });
      const text = expectToolSuccess(result);
      expect(text).toContain('CDS dependency context for /DMO/I_TRAVEL');
      // Depth=2 should resolve more dependencies
      expect(text).toContain('resolved');
    });

    it('returns error for non-existent DDLS', async () => {
      const result = await callTool(client, 'SAPContext', {
        type: 'DDLS',
        name: 'ZZZNOTEXIST_DDLS_999',
      });
      expectToolError(result, 'ZZZNOTEXIST_DDLS_999');
    });
  });
});
