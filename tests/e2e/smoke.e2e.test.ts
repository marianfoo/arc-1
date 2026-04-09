/**
 * E2E Smoke Tests
 *
 * Quick sanity check that the MCP server is running, connected to SAP,
 * and basic tool calls work. Run these first before the full suite.
 *
 * These tests use only standard SAP objects (no custom Z objects needed).
 */

import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { callTool, connectClient, expectToolError, expectToolSuccess } from './helpers.js';

describe('E2E Smoke Tests', () => {
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

  // ── Connection ─────────────────────────────────────────────────

  it('connects to MCP server and lists tools', async () => {
    const tools = await client.listTools();
    expect(tools.tools.length).toBeGreaterThan(0);

    const toolNames = tools.tools.map((t) => t.name);
    expect(toolNames).toContain('SAPRead');
    expect(toolNames).toContain('SAPSearch');
    expect(toolNames).toContain('SAPQuery');
    expect(toolNames).toContain('SAPContext');

    console.log(`    Tools available: ${toolNames.join(', ')}`);
  });

  // ── SAPRead: System info (no SAP object needed) ────────────────

  it('SAPRead SYSTEM — returns system info', async () => {
    const result = await callTool(client, 'SAPRead', { type: 'SYSTEM' });
    const text = expectToolSuccess(result);
    const parsed = JSON.parse(text);
    expect(parsed.user).toBeTruthy();
    // User depends on server config — just verify it's set
    expect(typeof parsed.user).toBe('string');
  });

  it('SAPRead COMPONENTS — returns installed components', async () => {
    const result = await callTool(client, 'SAPRead', { type: 'COMPONENTS' });
    const text = expectToolSuccess(result);
    const components = JSON.parse(text);
    expect(components.length).toBeGreaterThan(0);
    const basis = components.find((c: { name: string }) => c.name === 'SAP_BASIS');
    expect(basis).toBeDefined();
    expect(basis.release).toBeTruthy();
    console.log(`    SAP_BASIS release: ${basis.release}`);
  });

  // ── SAPRead: Standard program ──────────────────────────────────

  it('SAPRead PROG — reads standard SAP program RSHOWTIM', async () => {
    const result = await callTool(client, 'SAPRead', { type: 'PROG', name: 'RSHOWTIM' });
    const text = expectToolSuccess(result);
    expect(text.length).toBeGreaterThan(10);
  });

  // ── SAPRead: Standard class ────────────────────────────────────

  it('SAPRead CLAS — reads standard class CL_ABAP_CHAR_UTILITIES', async () => {
    const result = await callTool(client, 'SAPRead', { type: 'CLAS', name: 'CL_ABAP_CHAR_UTILITIES' });
    const text = expectToolSuccess(result);
    expect(text.length).toBeGreaterThan(0);
  });

  // ── SAPRead: Table structure ───────────────────────────────────

  it('SAPRead TABL — reads T000 table structure', async () => {
    const result = await callTool(client, 'SAPRead', { type: 'TABL', name: 'T000' });
    const text = expectToolSuccess(result);
    expect(text).toBeTruthy();
  });

  // ── SAPRead: Table contents ────────────────────────────────────

  it('SAPRead TABLE_CONTENTS — reads T000 data', async () => {
    const result = await callTool(client, 'SAPRead', { type: 'TABLE_CONTENTS', name: 'T000', maxRows: 5 });
    const text = expectToolSuccess(result);
    const data = JSON.parse(text);
    expect(data.columns).toContain('MANDT');
    expect(data.rows.length).toBeGreaterThan(0);
  });

  // ── SAPRead: DDIC objects ───────────────────────────────────────

  it('SAPRead STRU — reads BAPIRET2 structure definition', async () => {
    const result = await callTool(client, 'SAPRead', { type: 'STRU', name: 'BAPIRET2' });
    const text = expectToolSuccess(result);
    expect(text).toContain('bapiret2');
    expect(text).toContain('message');
  });

  it('SAPRead DOMA — reads BUKRS domain metadata', async () => {
    const result = await callTool(client, 'SAPRead', { type: 'DOMA', name: 'BUKRS' });
    const text = expectToolSuccess(result);
    const domain = JSON.parse(text);
    expect(domain.name).toBe('BUKRS');
    expect(domain.dataType).toBe('CHAR');
    expect(domain.length).toBeTruthy();
  });

  it('SAPRead DTEL — reads BUKRS data element metadata', async () => {
    const result = await callTool(client, 'SAPRead', { type: 'DTEL', name: 'BUKRS' });
    const text = expectToolSuccess(result);
    const dtel = JSON.parse(text);
    expect(dtel.name).toBe('BUKRS');
    expect(dtel.typeKind).toBe('domain');
    expect(dtel.typeName).toBe('BUKRS');
    expect(dtel.mediumLabel).toBeTruthy();
  });

  it('SAPRead TRAN — reads SE38 transaction metadata', async () => {
    const result = await callTool(client, 'SAPRead', { type: 'TRAN', name: 'SE38' });
    const text = expectToolSuccess(result);
    const tran = JSON.parse(text);
    expect(tran.code).toBe('SE38');
    expect(tran.description).toBeTruthy();
    expect(tran.program).toBe('RSABAPPROGRAM');
  });

  // ── SAPSearch ──────────────────────────────────────────────────

  it('SAPSearch — finds standard classes', async () => {
    const result = await callTool(client, 'SAPSearch', { query: 'CL_ABAP_CHAR*', maxResults: 5 });
    const text = expectToolSuccess(result);
    const results = JSON.parse(text);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].objectName).toMatch(/^CL_ABAP_CHAR/);
    expect(results[0]).toHaveProperty('objectType');
    expect(results[0]).toHaveProperty('uri');
  });

  it('SAPSearch — returns empty for non-existent', async () => {
    const result = await callTool(client, 'SAPSearch', { query: 'ZZZNONEXISTENT999*', maxResults: 5 });
    const text = expectToolSuccess(result);
    // Response starts with "[]" JSON but may include LLM guidance hints after it
    expect(text).toMatch(/^\[\]\s*/);
  });

  // ── SAPQuery ───────────────────────────────────────────────────

  it('SAPQuery — SELECT from T000', async () => {
    const result = await callTool(client, 'SAPQuery', { sql: 'SELECT * FROM T000', maxRows: 5 });
    const text = expectToolSuccess(result);
    const data = JSON.parse(text);
    expect(data.columns).toContain('MANDT');
    expect(data.rows.length).toBeGreaterThan(0);
  });

  // ── SAPLint ────────────────────────────────────────────────────

  it('SAPLint — lints ABAP source locally', async () => {
    const result = await callTool(client, 'SAPLint', {
      action: 'lint',
      source: 'REPORT ztest.\nWRITE: / sy-datum.',
    });
    const text = expectToolSuccess(result);
    // Returns JSON array of issues (may be empty for clean code)
    const issues = JSON.parse(text);
    expect(Array.isArray(issues)).toBe(true);
  });

  // ── SAPManage ──────────────────────────────────────────────────

  it('SAPManage probe — detects system features', async () => {
    const result = await callTool(client, 'SAPManage', { action: 'probe' });
    const text = expectToolSuccess(result);
    const features = JSON.parse(text);
    // Should have feature entries with expected shape
    expect(typeof features).toBe('object');
  });

  // ── Error handling ─────────────────────────────────────────────

  it('SAPRead — 404 for non-existent program returns error with hint', async () => {
    const result = await callTool(client, 'SAPRead', { type: 'PROG', name: 'ZZZNOTEXIST999' });
    expectToolError(result, 'ZZZNOTEXIST999');
    const text = result.content[0].text;
    expect(text).toContain('SAPSearch'); // LLM remediation hint
  });

  it('SAPRead — unknown type returns Zod validation error', async () => {
    const result = await callTool(client, 'SAPRead', { type: 'FOOBAR' });
    expectToolError(result, 'Invalid arguments for SAPRead');
  });

  it('SAPLint — unknown action returns Zod validation error', async () => {
    const result = await callTool(client, 'SAPLint', { action: 'foobar' });
    expectToolError(result, 'Invalid arguments for SAPLint');
  });

  it('SAPLint — atc action returns Zod validation error', async () => {
    const result = await callTool(client, 'SAPLint', { action: 'atc' });
    expectToolError(result, 'Invalid arguments for SAPLint');
  });

  it('SAPLint — syntax action returns Zod validation error', async () => {
    const result = await callTool(client, 'SAPLint', { action: 'syntax' });
    expectToolError(result, 'Invalid arguments for SAPLint');
  });
});
