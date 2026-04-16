import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { requireOrSkip, SkipReason } from '../helpers/skip-policy.js';
import { callTool, connectClient, expectToolError, expectToolSuccess } from './helpers.js';

describe('E2E CDS impact analysis', () => {
  let client: Client;
  let rapAvailable: true | undefined;

  beforeAll(async () => {
    client = await connectClient();
    const probeResult = await callTool(client, 'SAPManage', { action: 'probe' });
    const probeText = expectToolSuccess(probeResult);
    const features = JSON.parse(probeText);
    rapAvailable = features.rap?.available === true ? true : undefined;
  }, 90000);

  afterAll(async () => {
    try {
      await client?.close();
    } catch {
      // best-effort-cleanup
    }
  });

  it('returns root-view impact with deterministic upstream and projection consumer', async (ctx) => {
    requireOrSkip(ctx, rapAvailable, SkipReason.BACKEND_UNSUPPORTED);

    const result = await callTool(client, 'SAPContext', {
      action: 'impact',
      type: 'DDLS',
      name: 'ZI_ARC1_I33_ROOT',
    });
    const text = expectToolSuccess(result);
    const impact = JSON.parse(text);

    expect(impact.downstream.projectionViews.map((item: { name: string }) => item.name)).toContain('ZI_ARC1_I33_PROJ');
    expect(impact.upstream.tables.map((item: { name: string }) => item.name)).toContain('ZTABL_ARC1_I33');
  });

  it('returns leaf-view impact with root upstream view and empty downstream', async (ctx) => {
    requireOrSkip(ctx, rapAvailable, SkipReason.BACKEND_UNSUPPORTED);

    const result = await callTool(client, 'SAPContext', {
      action: 'impact',
      type: 'DDLS',
      name: 'ZI_ARC1_I33_PROJ',
    });
    const text = expectToolSuccess(result);
    const impact = JSON.parse(text);

    expect(impact.upstream.views.map((item: { name: string }) => item.name)).toContain('ZI_ARC1_I33_ROOT');
    expect(impact.downstream.summary.total).toBe(0);
  });

  it('rejects non-DDLS impact requests with guidance', async () => {
    const result = await callTool(client, 'SAPContext', {
      action: 'impact',
      type: 'CLAS',
      name: 'ZCL_ARC1_TEST',
    });

    expectToolError(result, 'SAPNavigate', 'DDLS only');
  });
});
