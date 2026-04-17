import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { callTool, connectClient, expectToolError, expectToolSuccess } from './helpers.js';

describe('E2E Revisions (SAPRead VERSIONS / VERSION_SOURCE)', () => {
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

  it('SAPRead VERSIONS returns a revision list for ZARC1_TEST_REPORT', async () => {
    const result = await callTool(client, 'SAPRead', { type: 'VERSIONS', name: 'ZARC1_TEST_REPORT' });
    const text = expectToolSuccess(result);
    const parsed = JSON.parse(text);
    expect(parsed.object.name).toBe('ZARC1_TEST_REPORT');
    expect(Array.isArray(parsed.revisions)).toBe(true);
    expect(parsed.revisions.length).toBeGreaterThanOrEqual(1);
  });

  it('SAPRead VERSIONS returns revisions for ZCL_ARC1_TEST', async () => {
    const result = await callTool(client, 'SAPRead', { type: 'VERSIONS', name: 'ZCL_ARC1_TEST', include: 'main' });
    const text = expectToolSuccess(result);
    const parsed = JSON.parse(text);
    expect(parsed.object.name).toBe('ZCL_ARC1_TEST');
    expect(Array.isArray(parsed.revisions)).toBe(true);
    expect(parsed.revisions.length).toBeGreaterThanOrEqual(1);
  });

  it('SAPRead VERSIONS returns revisions for ZIF_ARC1_TEST', async () => {
    const result = await callTool(client, 'SAPRead', { type: 'VERSIONS', name: 'ZIF_ARC1_TEST' });
    const text = expectToolSuccess(result);
    const parsed = JSON.parse(text);
    expect(parsed.object.name).toBe('ZIF_ARC1_TEST');
    expect(Array.isArray(parsed.revisions)).toBe(true);
    expect(parsed.revisions.length).toBeGreaterThanOrEqual(1);
    expect(parsed.revisions[0].uri).toContain('/source/main/versions/');
  });

  it('SAPRead VERSION_SOURCE returns source for a specific revision', async () => {
    const versions = await callTool(client, 'SAPRead', { type: 'VERSIONS', name: 'ZARC1_TEST_REPORT' });
    const versionsText = expectToolSuccess(versions);
    const parsed = JSON.parse(versionsText);
    const uri = String(parsed.revisions[0]?.uri ?? '');
    expect(uri.startsWith('/sap/bc/adt/')).toBe(true);

    const sourceResult = await callTool(client, 'SAPRead', { type: 'VERSION_SOURCE', versionUri: uri });
    const sourceText = expectToolSuccess(sourceResult);
    expect(sourceText).toMatch(/report/i);
  });

  it('SAPRead VERSION_SOURCE without versionUri returns an error', async () => {
    const result = await callTool(client, 'SAPRead', { type: 'VERSION_SOURCE' });
    expectToolError(result, 'versionUri');
  });

  it('SAPRead VERSION_SOURCE blocks non-ADT URI values', async () => {
    const result = await callTool(client, 'SAPRead', { type: 'VERSION_SOURCE', versionUri: 'https://evil.example/x' });
    expectToolError(result, '/sap/bc/adt/');
  });
});
