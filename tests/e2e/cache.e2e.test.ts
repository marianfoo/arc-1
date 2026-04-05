/**
 * E2E cache tests — verify caching behavior through the live MCP server.
 *
 * The e2e server runs with ARC1_CACHE=memory (no SQLite needed in CI).
 * These tests verify:
 *  - SAPManage cache_stats returns valid structure
 *  - Repeated SAPRead calls for the same object are faster on second call
 *  - SAPContext(deps) second call returns [cached] output
 *  - Warmup is off by default (warmupAvailable: false)
 */

import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { callTool, connectClient, expectToolSuccess } from './helpers.js';

describe('E2E Cache Tests', () => {
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

  // ── SAPManage cache_stats ─────────────────────────────────────

  it('SAPManage cache_stats — returns valid cache statistics', async () => {
    const result = await callTool(client, 'SAPManage', { action: 'cache_stats' });
    const text = expectToolSuccess(result);
    const stats = JSON.parse(text);

    // Required fields
    expect(stats).toHaveProperty('sourceCount');
    expect(stats).toHaveProperty('contractCount');
    expect(stats).toHaveProperty('nodeCount');
    expect(stats).toHaveProperty('edgeCount');
    expect(stats).toHaveProperty('warmupAvailable');

    // All counts are non-negative integers
    expect(typeof stats.sourceCount).toBe('number');
    expect(stats.sourceCount).toBeGreaterThanOrEqual(0);
    expect(typeof stats.contractCount).toBe('number');
    expect(stats.contractCount).toBeGreaterThanOrEqual(0);

    // Warmup is disabled by default in e2e
    expect(stats.warmupAvailable).toBe(false);

    console.log(`    Cache stats: ${JSON.stringify(stats)}`);
  });

  // ── SAPRead cache hit ─────────────────────────────────────────

  it('SAPRead — second call for same object is served from cache', async () => {
    const args = { type: 'CLAS', name: 'CL_ABAP_CHAR_UTILITIES' };

    // First call — fetches from SAP
    const t0 = Date.now();
    const r1 = await callTool(client, 'SAPRead', args);
    const firstMs = Date.now() - t0;
    const text1 = expectToolSuccess(r1);
    expect(text1.length).toBeGreaterThan(0);

    // Second call — should be served from memory cache
    const t1 = Date.now();
    const r2 = await callTool(client, 'SAPRead', args);
    const cachedMs = Date.now() - t1;
    const text2 = expectToolSuccess(r2);

    // Both responses should be identical
    expect(text2).toBe(text1);

    // Cache hit should be significantly faster (at least 5x, or within 300ms absolute).
    // The 300ms cap accounts for network RTT to the remote e2e server (~50-150ms)
    // even when there is no SAP call. We still verify the content is identical.
    expect(cachedMs).toBeLessThan(Math.max(firstMs / 5, 300));

    console.log(`    SAPRead first: ${firstMs}ms, cached: ${cachedMs}ms`);
  });

  it('SAPRead cache_stats — sourceCount increases after reads', async () => {
    // Read a known object
    await callTool(client, 'SAPRead', { type: 'PROG', name: 'RSHOWTIM' });

    const result = await callTool(client, 'SAPManage', { action: 'cache_stats' });
    const text = expectToolSuccess(result);
    const stats = JSON.parse(text);

    // After reading, sourceCount must be at least 1
    expect(stats.sourceCount).toBeGreaterThanOrEqual(1);
  });

  // ── SAPContext dep graph caching ──────────────────────────────

  it('SAPContext deps — second call returns [cached] output', async () => {
    // Use RSHOWTIM (a standard program guaranteed to exist on any SAP system).
    // The dep graph is cached after the first resolution regardless of how many
    // deps are resolved (empty dep graphs are also cached to avoid re-fetching).
    const args = { action: 'deps', type: 'PROG', name: 'RSHOWTIM', depth: 1 };

    // First call — resolve deps live; should NOT be marked [cached]
    const r1 = await callTool(client, 'SAPContext', args);
    const out1 = expectToolSuccess(r1);
    expect(out1).toContain('Dependency context for');
    expect(out1).not.toContain('[cached]');

    // Second call — should hit dep graph cache and be marked [cached]
    const t0 = Date.now();
    const r2 = await callTool(client, 'SAPContext', args);
    const cachedMs = Date.now() - t0;
    const out2 = expectToolSuccess(r2);

    expect(out2).toContain('[cached]');
    // Cached response completes well within 500ms (just HTTP overhead, no SAP calls)
    expect(cachedMs).toBeLessThan(500);

    console.log(`    SAPContext cached in ${cachedMs}ms`);
  });

  it('SAPContext deps — cached output refers to same object', async () => {
    const args = { action: 'deps', type: 'CLAS', name: 'CL_ABAP_CHAR_UTILITIES', depth: 1 };

    const r1 = await callTool(client, 'SAPContext', args);
    const out1 = expectToolSuccess(r1);

    const r2 = await callTool(client, 'SAPContext', args);
    const out2 = expectToolSuccess(r2);

    // Both should mention the object name
    expect(out1).toContain('CL_ABAP_CHAR_UTILITIES');
    expect(out2).toContain('CL_ABAP_CHAR_UTILITIES');
    // Second call must be served from cache
    expect(out2).toContain('[cached]');
  });

  // ── SAPContext usages — warmup required ───────────────────────

  it('SAPContext usages — returns informative error when warmup not run', async () => {
    const result = await callTool(client, 'SAPContext', {
      action: 'usages',
      type: 'CLAS',
      name: 'CL_ABAP_CHAR_UTILITIES',
    });

    // Without warmup the handler returns errorResult with guidance — isError=true
    expect(result.isError).toBe(true);
    const text = result.content[0]?.text ?? '';

    // Should explain warmup, not crash with a generic 500
    expect(text.toLowerCase()).toMatch(/warmup|arc1_cache_warmup|cache.*warmup/);
    // Should NOT leak internals
    expect(text).not.toContain('<?xml');
    expect(text).not.toMatch(/\.ts:\d+/);

    console.log(`    Usages without warmup: ${text.slice(0, 120)}`);
  });
});
