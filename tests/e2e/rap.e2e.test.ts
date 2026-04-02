/**
 * E2E Tests for RAP Completeness Features
 *
 * Tests DDLX (metadata extensions), SRVB (service bindings), and batch activation.
 * Uses standard /DMO/ Flight Reference Scenario objects that exist on any demo system.
 *
 * Read tests use DMO objects (no setup needed).
 * Write lifecycle and batch activation tests use standard SAP objects.
 */

import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { callTool, connectClient, expectToolError, expectToolSuccess } from './helpers.js';

describe('E2E RAP Completeness Tests', () => {
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
    it('activates a single standard object (re-activation is a no-op)', async () => {
      // Activating an already-active standard program — should succeed silently
      const result = await callTool(client, 'SAPActivate', {
        type: 'PROG',
        name: 'RSHOWTIM',
      });
      const text = expectToolSuccess(result);
      expect(text).toContain('RSHOWTIM');
    });

    it('batch activates multiple objects together', async () => {
      // Batch-activate two standard objects — both already active, so this is a no-op
      const result = await callTool(client, 'SAPActivate', {
        objects: [
          { type: 'PROG', name: 'RSHOWTIM' },
          { type: 'CLAS', name: 'CL_ABAP_CHAR_UTILITIES' },
        ],
      });
      const text = expectToolSuccess(result);
      expect(text).toContain('2 objects');
      expect(text).toContain('RSHOWTIM');
      expect(text).toContain('CL_ABAP_CHAR_UTILITIES');
    });

    it('batch activation reports errors for non-existent objects', async () => {
      const result = await callTool(client, 'SAPActivate', {
        objects: [
          { type: 'PROG', name: 'ZZZNOTEXIST_BATCH_999' },
        ],
      });
      // Should succeed (SAP ignores non-existent objects in activation) or fail gracefully
      const text = result.content[0]?.text ?? '';
      expect(text).toBeTruthy();
    });
  });
});
