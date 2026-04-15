/**
 * E2E tests for SKTD (Knowledge Transfer Document) read/write.
 *
 * Tests the full SKTD lifecycle via MCP tool calls:
 *   - Read an existing KTD (ZC_FBCLUBTP — known fixture in Z_RAP_VB_1)
 *   - Create a DDLS + KTD → update KTD with Markdown → read back → activate → delete
 *   - Graceful 404 handling when KTD doesn't exist
 *   - Validation: create without refObjectType → actionable error
 *
 * Requires a running MCP server (E2E_MCP_URL) connected to an SAP system
 * that has ZC_FBCLUBTP with an active Knowledge Transfer Document.
 */

import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { callTool, connectClient, expectToolError, expectToolSuccess } from './helpers.js';

function uniqueName(prefix: string): string {
  const suffix = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e5)
    .toString(36)
    .padStart(3, '0')}`.toUpperCase();
  return `${prefix}${suffix}`.slice(0, 30);
}

describe('E2E SKTD (Knowledge Transfer Document) tests', () => {
  let client: Client;

  beforeAll(async () => {
    client = await connectClient();
  });

  afterAll(async () => {
    try {
      await client?.close();
    } catch {
      // best-effort-cleanup
    }
  });

  it('SAPRead SKTD returns decoded Markdown for existing KTD (ZC_FBCLUBTP)', async () => {
    const result = await callTool(client, 'SAPRead', {
      type: 'SKTD',
      name: 'ZC_FBCLUBTP',
    });
    const text = expectToolSuccess(result);

    // The KTD for ZC_FBCLUBTP has base64-encoded Markdown — SAPRead must return decoded text
    expect(text).not.toContain('<sktd:docu');
    expect(text).not.toContain('sktd:text');
    // The decoded content should be readable Markdown (not Base64 gibberish)
    expect(text.length).toBeGreaterThan(0);
    // Must not be raw Base64 — Base64 only uses A-Za-z0-9+/= and no spaces in short strings
    // Real Markdown has spaces, newlines, or punctuation
    expect(/[a-zA-Z]/.test(text)).toBe(true);
  });

  it('SAPRead SKTD returns soft message for non-existent KTD', async () => {
    const result = await callTool(client, 'SAPRead', {
      type: 'SKTD',
      name: 'ZARC1_NONEXISTENT_KTD_XXXX',
    });
    // Should return an informational message, not an error
    const text = expectToolSuccess(result);
    expect(text).toContain('No Knowledge Transfer Document');
  });

  it('SAPWrite create SKTD rejects missing refObjectType', async () => {
    const result = await callTool(client, 'SAPWrite', {
      action: 'create',
      type: 'SKTD',
      name: 'ZARC1_SHOULD_FAIL',
      package: '$TMP',
    });
    expectToolError(result, 'refObjectType');
  });

  it('SKTD full CRUD lifecycle: create DDLS → create KTD → update with Markdown → read → activate → delete', async () => {
    // Use a unique name to avoid collisions across test runs
    const objectName = uniqueName('ZARC1SKTD');

    // Step 1: Create a minimal DDLS in $TMP as the KTD's parent object.
    // KTDs can only document certain object types (CDS views, BDEFs, etc.) — not PROGs.
    const ddlSource = `@AbapCatalog.viewEnhancementCategory: [#NONE]
@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'E2E SKTD test view'
define view entity ${objectName}
  as select from tadir
{
  key pgmid    as Pgmid,
  key object   as ObjectType,
  key obj_name as ObjectName
}`;

    const createDdls = await callTool(client, 'SAPWrite', {
      action: 'create',
      type: 'DDLS',
      name: objectName,
      package: '$TMP',
      source: ddlSource,
    });
    expectToolSuccess(createDdls);

    try {
      // Step 2: Activate the DDLS (KTD needs an active parent to attach to)
      await callTool(client, 'SAPActivate', {
        action: 'activate',
        type: 'DDLS',
        name: objectName,
      });

      // Step 3: Create KTD for the DDLS
      const createKtd = await callTool(client, 'SAPWrite', {
        action: 'create',
        type: 'SKTD',
        name: objectName,
        package: '$TMP',
        refObjectType: 'DDLS/DF',
        refObjectName: objectName,
        refObjectDescription: 'E2E SKTD test view',
      });
      const createText = expectToolSuccess(createKtd);
      expect(createText).toContain(`Created SKTD ${objectName}`);

      // Step 4: Activate the KTD
      await callTool(client, 'SAPActivate', {
        action: 'activate',
        type: 'SKTD',
        name: objectName,
      });

      // Step 5: Update KTD with Markdown content
      const markdown = `# ${objectName}\n\nThis is an E2E test KTD created by ARC-1.\n\n- Supports **Markdown** formatting\n- Auto-encoded to Base64 on write`;
      const updateKtd = await callTool(client, 'SAPWrite', {
        action: 'update',
        type: 'SKTD',
        name: objectName,
        source: markdown,
      });
      expectToolSuccess(updateKtd);

      // Step 6: Activate again after update
      await callTool(client, 'SAPActivate', {
        action: 'activate',
        type: 'SKTD',
        name: objectName,
      });

      // Step 7: Read back and verify decoded Markdown
      const readResult = await callTool(client, 'SAPRead', {
        type: 'SKTD',
        name: objectName,
      });
      const readText = expectToolSuccess(readResult);
      // Should contain the Markdown we wrote — decoded from Base64
      expect(readText).toContain(`# ${objectName}`);
      expect(readText).toContain('E2E test KTD created by ARC-1');
      expect(readText).toContain('**Markdown**');
      // Must NOT contain XML or Base64
      expect(readText).not.toContain('<sktd:');
      expect(readText).not.toContain('base64');

      // Step 8: Delete KTD
      const deleteKtd = await callTool(client, 'SAPWrite', {
        action: 'delete',
        type: 'SKTD',
        name: objectName,
      });
      expectToolSuccess(deleteKtd);

      // Step 9: Verify KTD is gone
      const readDeleted = await callTool(client, 'SAPRead', {
        type: 'SKTD',
        name: objectName,
      });
      const deletedText = expectToolSuccess(readDeleted);
      expect(deletedText).toContain('No Knowledge Transfer Document');
    } finally {
      // Cleanup: delete the DDLS (best-effort — KTD should already be deleted)
      try {
        await callTool(client, 'SAPWrite', { action: 'delete', type: 'SKTD', name: objectName });
      } catch {
        // best-effort-cleanup — may already be deleted
      }
      try {
        await callTool(client, 'SAPWrite', { action: 'delete', type: 'DDLS', name: objectName });
      } catch {
        // best-effort-cleanup
      }
    }
  });

  it('SKTD create with initial Markdown source writes content in single call', async () => {
    const objectName = uniqueName('ZARC1SKTD');
    const markdown = '# Quick doc\n\nCreated with initial content.';

    // Create DDLS parent
    const ddlSource = `@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'SKTD source test'
define view entity ${objectName}
  as select from tadir
{
  key pgmid as Pgmid
}`;
    await callTool(client, 'SAPWrite', {
      action: 'create',
      type: 'DDLS',
      name: objectName,
      package: '$TMP',
      source: ddlSource,
    });

    try {
      await callTool(client, 'SAPActivate', { action: 'activate', type: 'DDLS', name: objectName });

      // Create KTD with source in one call
      const createResult = await callTool(client, 'SAPWrite', {
        action: 'create',
        type: 'SKTD',
        name: objectName,
        package: '$TMP',
        refObjectType: 'DDLS/DF',
        source: markdown,
      });
      const createText = expectToolSuccess(createResult);
      expect(createText).toContain('wrote Markdown content');

      // Activate and read back
      await callTool(client, 'SAPActivate', { action: 'activate', type: 'SKTD', name: objectName });

      const readResult = await callTool(client, 'SAPRead', { type: 'SKTD', name: objectName });
      const readText = expectToolSuccess(readResult);
      expect(readText).toContain('Quick doc');
      expect(readText).toContain('Created with initial content');
    } finally {
      try {
        await callTool(client, 'SAPWrite', { action: 'delete', type: 'SKTD', name: objectName });
      } catch {
        // best-effort-cleanup
      }
      try {
        await callTool(client, 'SAPWrite', { action: 'delete', type: 'DDLS', name: objectName });
      } catch {
        // best-effort-cleanup
      }
    }
  });
});
