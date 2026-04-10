/**
 * E2E Tests for SAPTransport tool and transportable SAPWrite operations.
 *
 * Validates the full MCP JSON-RPC path for:
 * - SAPTransport create + get (Issues #9, #26, #70)
 * - SAPWrite update in a transportable package without explicit transport (Issue #56)
 *
 * Transport tests require the MCP server to be running with --enable-transports.
 * Transportable-package write tests additionally require TEST_TRANSPORT_PACKAGE env var.
 *
 * Run: npm run test:e2e -- tests/e2e/saptransport.e2e.test.ts
 */

import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { requireOrSkip, SkipReason } from '../helpers/skip-policy.js';
import { callTool, connectClient, expectToolError, expectToolSuccess } from './helpers.js';

describe('E2E SAPTransport Tests', () => {
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

  // ── SAPTransport create + get ─────────────────────────────────────

  describe('SAPTransport create + get', () => {
    let createdTransportId: string | undefined;
    let transportsEnabled = true;

    it('creates a transport and returns a valid transport ID', async (ctx) => {
      const desc = `ARC-1 E2E test ${Date.now()}`;
      const result = await callTool(client, 'SAPTransport', {
        action: 'create',
        description: desc,
      });

      // Skip gracefully when transports aren't enabled on the MCP server
      if (result.isError && result.content?.[0]?.text?.includes('transports not enabled')) {
        transportsEnabled = false;
        return ctx.skip('Transports not enabled on MCP server (--enable-transports)');
      }

      const text = expectToolSuccess(result);

      // Response should contain a transport ID (pattern: <SID>K<number>)
      expect(text).toContain('Created transport request:');
      const match = text.match(/([A-Z0-9]+K\d+)/);
      expect(match, 'Response should contain a transport ID').toBeTruthy();
      createdTransportId = match![1];
    });

    it('retrieves the created transport with correct details', async (ctx) => {
      if (!transportsEnabled) return ctx.skip('Transports not enabled on MCP server');
      requireOrSkip(ctx, createdTransportId, 'No transport was created in previous test');

      const result = await callTool(client, 'SAPTransport', {
        action: 'get',
        id: createdTransportId,
      });
      const text = expectToolSuccess(result);

      // Response should be valid JSON with transport details, no raw XML
      const transport = JSON.parse(text);
      expect(transport.id).toBe(createdTransportId);
      expect(transport.description).toContain('ARC-1 E2E test');
      expect(transport.owner).toBeTruthy();
      expect(transport.status).toBeTruthy();
    });

    it('returns not-found message for non-existent transport', async (ctx) => {
      if (!transportsEnabled) return ctx.skip('Transports not enabled on MCP server');
      const result = await callTool(client, 'SAPTransport', {
        action: 'get',
        id: 'ZZZK999999',
      });
      // May return success with "not found" text or an error — both are acceptable
      const text = result.content?.[0]?.text ?? '';
      expect(text).toBeTruthy();
      // Must not contain raw XML
      expect(text).not.toContain('<?xml');
    });

    it('lists transports without errors', async (ctx) => {
      if (!transportsEnabled) return ctx.skip('Transports not enabled on MCP server');
      const result = await callTool(client, 'SAPTransport', {
        action: 'list',
      });
      const text = expectToolSuccess(result);

      // Response should be valid JSON array
      const transports = JSON.parse(text);
      expect(Array.isArray(transports)).toBe(true);
      console.log(`    Listed ${transports.length} transports`);
      if (transports.length > 0) {
        // Verify structure of first entry
        expect(transports[0]).toHaveProperty('id');
      }
    });

    it('returns error for missing required parameters', async () => {
      // create without description
      const createResult = await callTool(client, 'SAPTransport', {
        action: 'create',
      });
      expectToolError(createResult);

      // get without id
      const getResult = await callTool(client, 'SAPTransport', {
        action: 'get',
      });
      expectToolError(getResult);
    });

    it('returns error for unknown action', async () => {
      const result = await callTool(client, 'SAPTransport', {
        action: 'nonexistent',
      });
      expectToolError(result, 'Invalid arguments for SAPTransport');
    });
  });

  // ── Transportable SAPWrite with auto-corrNr ─────────────────────

  describe('SAPWrite in transportable package (auto-corrNr)', () => {
    it('updates a program without explicit transport via lock corrNr propagation', async (ctx) => {
      const pkg = process.env.TEST_TRANSPORT_PACKAGE;
      requireOrSkip(ctx, pkg, SkipReason.NO_TRANSPORT_PACKAGE);

      const testName = `ZARC1_E2E_TR_${Date.now().toString(36).toUpperCase().slice(-6)}`;

      // Step 1: Create a transport for the create operation
      const createTransportResult = await callTool(client, 'SAPTransport', {
        action: 'create',
        description: `ARC-1 E2E transportable write ${Date.now()}`,
      });
      const transportText = expectToolSuccess(createTransportResult);
      const transportMatch = transportText.match(/([A-Z0-9]+K\d+)/);
      expect(transportMatch, 'Should get a transport ID').toBeTruthy();
      const transportId = transportMatch![1];

      // Step 2: Create a program in the transportable package
      const createResult = await callTool(client, 'SAPWrite', {
        action: 'create',
        type: 'PROG',
        name: testName,
        source: `REPORT ${testName.toLowerCase()}.\nWRITE: / 'original'.`,
        package: pkg,
        transport: transportId,
      });
      expectToolSuccess(createResult);

      try {
        // Step 3: Update WITHOUT explicit transport — should auto-use lock corrNr
        const updateResult = await callTool(client, 'SAPWrite', {
          action: 'update',
          type: 'PROG',
          name: testName,
          source: `REPORT ${testName.toLowerCase()}.\nWRITE: / 'auto-corrNr propagated'.`,
        });
        expectToolSuccess(updateResult);

        // Step 4: Read back and verify
        const readResult = await callTool(client, 'SAPRead', {
          type: 'PROG',
          name: testName,
        });
        const readText = expectToolSuccess(readResult);
        expect(readText).toContain('auto-corrNr propagated');
      } finally {
        // Best-effort cleanup — delete the test program
        try {
          await callTool(client, 'SAPWrite', {
            action: 'delete',
            type: 'PROG',
            name: testName,
            transport: transportId,
          });
        } catch {
          // best-effort-cleanup
          console.error(`Failed to clean up test program ${testName}`);
        }
      }
    });
  });
});
