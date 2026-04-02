/**
 * E2E Tests for RAP Completeness Features
 *
 * Tests DDLX (metadata extensions), SRVB (service bindings), and batch activation.
 * Uses standard /DMO/ Flight Reference Scenario objects that exist on any demo system.
 *
 * Write lifecycle tests use the persistent PROG fixture (ZARC1_TEST_REPORT) to verify
 * the update → activate flow, since CDS object creation requires real packages.
 */

import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { callTool, connectClient, expectToolError, expectToolSuccess } from './helpers.js';
import { ensureTestObjects } from './setup.js';

describe('E2E RAP Completeness Tests', () => {
  let client: Client;

  beforeAll(async () => {
    client = await connectClient();
    await ensureTestObjects(client);
  });

  afterAll(async () => {
    try {
      await client?.close();
    } catch {
      // Ignore close errors
    }
  });

  // ── DDLX Read ─────────────────────────────────────────────────────

  describe('SAPRead DDLX (Metadata Extensions)', () => {
    it('reads a DDLX metadata extension source', async () => {
      const result = await callTool(client, 'SAPRead', {
        type: 'DDLX',
        name: '/DMO/C_AGENCYTP',
      });
      const text = expectToolSuccess(result);
      // DDLX source contains annotation layer and annotate keyword
      expect(text).toContain('@Metadata.layer');
      expect(text).toContain('annotate');
    });

    it('reads a DDLX with UI annotations for Fiori Elements', async () => {
      const result = await callTool(client, 'SAPRead', {
        type: 'DDLX',
        name: '/DMO/C_TRAVEL_A_D',
      });
      const text = expectToolSuccess(result);
      expect(text).toContain('@UI');
      // Should contain facet definitions and line item annotations
      expect(text).toContain('lineItem');
    });

    it('returns 404 error for non-existent DDLX', async () => {
      const result = await callTool(client, 'SAPRead', {
        type: 'DDLX',
        name: 'ZZZNOTEXIST_DDLX_999',
      });
      expectToolError(result, 'ZZZNOTEXIST_DDLX_999');
    });
  });

  // ── SRVB Read ─────────────────────────────────────────────────────

  describe('SAPRead SRVB (Service Bindings)', () => {
    it('reads a V4 service binding as structured JSON', async () => {
      const result = await callTool(client, 'SAPRead', {
        type: 'SRVB',
        name: '/DMO/UI_AGENCY_O4',
      });
      const text = expectToolSuccess(result);
      const parsed = JSON.parse(text);

      expect(parsed.name).toBe('/DMO/UI_AGENCY_O4');
      expect(parsed.type).toBe('SRVB/SVB');
      expect(parsed.odataVersion).toBe('V4');
      expect(parsed.bindingType).toBe('ODATA');
      expect(parsed.bindingCategory).toBe('UI');
      expect(parsed.serviceDefinition).toBeTruthy();
      expect(parsed.package).toBeTruthy();
    });

    it('reads a V2 service binding', async () => {
      const result = await callTool(client, 'SAPRead', {
        type: 'SRVB',
        name: '/DMO/UI_TRAVEL_U_V2',
      });
      const text = expectToolSuccess(result);
      const parsed = JSON.parse(text);

      expect(parsed.name).toBe('/DMO/UI_TRAVEL_U_V2');
      expect(parsed.odataVersion).toBe('V2');
      expect(parsed.bindingType).toBe('ODATA');
    });

    it('returns publish status for service bindings', async () => {
      const result = await callTool(client, 'SAPRead', {
        type: 'SRVB',
        name: '/DMO/UI_TRAVEL_D_D_O4',
      });
      const text = expectToolSuccess(result);
      const parsed = JSON.parse(text);

      // Binding should have publish status and service definition reference
      expect(typeof parsed.published).toBe('boolean');
      expect(typeof parsed.bindingCreated).toBe('boolean');
      expect(parsed.serviceDefinition).toBeTruthy();
      expect(parsed.releaseState).toBeTruthy();
    });

    it('returns 404 error for non-existent SRVB', async () => {
      const result = await callTool(client, 'SAPRead', {
        type: 'SRVB',
        name: 'ZZZNOTEXIST_SRVB_999',
      });
      expectToolError(result, 'ZZZNOTEXIST_SRVB_999');
    });
  });

  // ── SAPActivate: Single + Batch ───────────────────────────────────

  describe('SAPActivate', () => {
    it('activates a single object', async () => {
      // Activate the persistent test report — it's already active, so this is a no-op
      const result = await callTool(client, 'SAPActivate', {
        type: 'PROG',
        name: 'ZARC1_TEST_REPORT',
      });
      const text = expectToolSuccess(result);
      expect(text).toContain('ZARC1_TEST_REPORT');
    });

    it('batch activates multiple objects together', async () => {
      // Batch-activate both persistent test objects
      const result = await callTool(client, 'SAPActivate', {
        objects: [
          { type: 'PROG', name: 'ZARC1_TEST_REPORT' },
          { type: 'CLAS', name: 'ZCL_ARC1_TEST' },
        ],
      });
      const text = expectToolSuccess(result);
      expect(text).toContain('2 objects');
      expect(text).toContain('ZARC1_TEST_REPORT');
      expect(text).toContain('ZCL_ARC1_TEST');
    });

    it('batch activates with mixed object types', async () => {
      // Test that different types in a single batch call works
      const result = await callTool(client, 'SAPActivate', {
        objects: [
          { type: 'PROG', name: 'ZARC1_TEST_REPORT' },
          { type: 'INTF', name: 'ZIF_ARC1_TEST' },
          { type: 'CLAS', name: 'ZCL_ARC1_TEST' },
        ],
      });
      const text = expectToolSuccess(result);
      expect(text).toContain('3 objects');
    });
  });

  // ── Write + Activate Lifecycle ────────────────────────────────────

  describe('SAPWrite + SAPActivate lifecycle', () => {
    const WRITE_NAME = 'ZARC1_E2E_WRITE';

    it('creates a program, updates source, activates, reads back, deletes', async () => {
      // Step 1: Create the transient program
      const createResult = await callTool(client, 'SAPWrite', {
        action: 'create',
        type: 'PROG',
        name: WRITE_NAME,
        source: "REPORT zarc1_e2e_write.\nWRITE: / 'original'.",
        package: '$TMP',
      });
      expectToolSuccess(createResult);

      // Step 2: Activate the created program
      const activateResult = await callTool(client, 'SAPActivate', {
        type: 'PROG',
        name: WRITE_NAME,
      });
      // May have warnings — that's OK
      const activateText = activateResult.content[0]?.text ?? '';
      expect(activateText).toContain(WRITE_NAME);

      // Step 3: Update the source
      const updatedSource = "REPORT zarc1_e2e_write.\nWRITE: / 'updated by E2E test'.";
      const updateResult = await callTool(client, 'SAPWrite', {
        action: 'update',
        type: 'PROG',
        name: WRITE_NAME,
        source: updatedSource,
      });
      expectToolSuccess(updateResult);

      // Step 4: Activate the updated program
      const reactivateResult = await callTool(client, 'SAPActivate', {
        type: 'PROG',
        name: WRITE_NAME,
      });
      expect(reactivateResult.content[0]?.text).toContain(WRITE_NAME);

      // Step 5: Read back and verify the update took effect
      const readResult = await callTool(client, 'SAPRead', {
        type: 'PROG',
        name: WRITE_NAME,
      });
      const readText = expectToolSuccess(readResult);
      expect(readText).toContain('updated by E2E test');

      // Step 6: Delete the transient object
      const deleteResult = await callTool(client, 'SAPWrite', {
        action: 'delete',
        type: 'PROG',
        name: WRITE_NAME,
      });
      expectToolSuccess(deleteResult);

      // Step 7: Verify deletion — read should fail
      const readAfterDelete = await callTool(client, 'SAPRead', {
        type: 'PROG',
        name: WRITE_NAME,
      });
      expect(readAfterDelete.isError).toBe(true);
    });
  });
});
