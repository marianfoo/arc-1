import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  callTool,
  connectClient,
  expectToolError,
  expectToolSuccess,
  expectToolSuccessOrSkip,
  skipOnBatchCreateFailure,
} from './helpers.js';

function uniqueName(prefix: string): string {
  const suffix = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e5)
    .toString(36)
    .padStart(3, '0')}`.toUpperCase();
  return `${prefix}_${suffix}`.slice(0, 30);
}

function parsePossiblyCachedJson(text: string): any {
  return JSON.parse(text.replace(/^\[cached\]\n/, ''));
}

describe('E2E DDIC metadata write tests', () => {
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

  it('SAPWrite create DOMA with fixed values', async (ctx) => {
    const domainName = uniqueName('ZARC1_DOMA');

    const createResult = await callTool(client, 'SAPWrite', {
      action: 'create',
      type: 'DOMA',
      name: domainName,
      package: '$TMP',
      dataType: 'CHAR',
      length: 1,
      fixedValues: [{ low: 'X', description: 'Test' }],
    });
    expectToolSuccessOrSkip(ctx, createResult);

    try {
      const readResult = await callTool(client, 'SAPRead', { type: 'DOMA', name: domainName });
      const text = expectToolSuccess(readResult);
      const domain = parsePossiblyCachedJson(text);
      expect(domain.name).toBe(domainName);
      expect(domain.dataType).toBe('CHAR');
    } finally {
      try {
        await callTool(client, 'SAPWrite', { action: 'delete', type: 'DOMA', name: domainName });
      } catch {
        // best-effort-cleanup
      }
    }
  });

  it('SAPWrite create DTEL (domain-based + predefined)', async (ctx) => {
    const domainName = uniqueName('ZARC1_DMD');
    const dtelDomain = uniqueName('ZARC1_DTD');
    const dtelPredef = uniqueName('ZARC1_DTP');

    const domaResult = await callTool(client, 'SAPWrite', {
      action: 'create',
      type: 'DOMA',
      name: domainName,
      package: '$TMP',
      dataType: 'CHAR',
      length: 3,
    });
    // Skip the whole test if DOMA create isn't supported on this release —
    // DTEL needs it as a dependency.
    expectToolSuccessOrSkip(ctx, domaResult);

    try {
      const byDomain = await callTool(client, 'SAPWrite', {
        action: 'create',
        type: 'DTEL',
        name: dtelDomain,
        package: '$TMP',
        typeKind: 'domain',
        typeName: domainName,
        shortLabel: 'Ref',
      });
      expectToolSuccessOrSkip(ctx, byDomain);

      const byType = await callTool(client, 'SAPWrite', {
        action: 'create',
        type: 'DTEL',
        name: dtelPredef,
        package: '$TMP',
        typeKind: 'predefinedAbapType',
        dataType: 'CHAR',
        length: 20,
        shortLabel: 'Text',
      });
      expectToolSuccessOrSkip(ctx, byType);
    } finally {
      for (const [type, name] of [
        ['DTEL', dtelDomain],
        ['DTEL', dtelPredef],
        ['DOMA', domainName],
      ] as const) {
        try {
          await callTool(client, 'SAPWrite', { action: 'delete', type, name });
        } catch {
          // best-effort-cleanup
        }
      }
    }
  });

  it('SAPWrite update DOMA and verify via SAPRead', async (ctx) => {
    const domainName = uniqueName('ZARC1_UPD');

    const createResult = await callTool(client, 'SAPWrite', {
      action: 'create',
      type: 'DOMA',
      name: domainName,
      package: '$TMP',
      dataType: 'CHAR',
      length: 1,
      fixedValues: [{ low: 'A', description: 'Active' }],
    });
    expectToolSuccessOrSkip(ctx, createResult);

    try {
      const updateResult = await callTool(client, 'SAPWrite', {
        action: 'update',
        type: 'DOMA',
        name: domainName,
        package: '$TMP',
        dataType: 'CHAR',
        length: 2,
        fixedValues: [
          { low: 'A', description: 'Active' },
          { low: 'I', description: 'Inactive' },
        ],
      });
      expectToolSuccess(updateResult);

      const readResult = await callTool(client, 'SAPRead', { type: 'DOMA', name: domainName });
      const domain = parsePossiblyCachedJson(expectToolSuccess(readResult));
      expect(domain.length).toBe('000002');
      expect((domain.fixedValues ?? []).some((v: { low: string }) => v.low === 'I')).toBe(true);
    } finally {
      try {
        await callTool(client, 'SAPWrite', { action: 'delete', type: 'DOMA', name: domainName });
      } catch {
        // best-effort-cleanup
      }
    }
  });

  it('SAPWrite delete DOMA/DTEL removes objects', async (ctx) => {
    const domainName = uniqueName('ZARC1_DEL');
    const dtelName = uniqueName('ZARC1_DELD');

    const domaCreate = await callTool(client, 'SAPWrite', {
      action: 'create',
      type: 'DOMA',
      name: domainName,
      package: '$TMP',
      dataType: 'CHAR',
      length: 1,
    });
    expectToolSuccessOrSkip(ctx, domaCreate);
    const dtelCreate = await callTool(client, 'SAPWrite', {
      action: 'create',
      type: 'DTEL',
      name: dtelName,
      package: '$TMP',
      typeKind: 'domain',
      typeName: domainName,
      shortLabel: 'Del',
    });
    expectToolSuccessOrSkip(ctx, dtelCreate);

    await callTool(client, 'SAPWrite', { action: 'delete', type: 'DTEL', name: dtelName });
    await callTool(client, 'SAPWrite', { action: 'delete', type: 'DOMA', name: domainName });

    const readDtel = await callTool(client, 'SAPRead', { type: 'DTEL', name: dtelName });
    expectToolError(readDtel, dtelName);
    const readDomain = await callTool(client, 'SAPRead', { type: 'DOMA', name: domainName });
    expectToolError(readDomain, domainName);
  });

  it('SAPRead TABL reads a standard table definition', async () => {
    const result = await callTool(client, 'SAPRead', { type: 'TABL', name: 'T000' });
    const text = expectToolSuccess(result);
    expect(text).toContain('mandt');
  });

  it('SAPWrite STRU full CRUD cycle with version checks', async (ctx) => {
    const struName = uniqueName('ZARC1_STRU');

    // Create with initial field
    const createResult = await callTool(client, 'SAPWrite', {
      action: 'create',
      type: 'STRU',
      name: struName,
      package: '$TMP',
      description: 'ARC-1 E2E test structure',
      source: [
        `@EndUserText.label : 'ARC-1 E2E test structure'`,
        `@AbapCatalog.enhancementCategory : #NOT_EXTENSIBLE`,
        `define type ${struName.toLowerCase()} {`,
        `  key id   : sysuuid_x16 not null;`,
        `  status  : char1;`,
        ``,
        `}`,
      ].join('\n'),
    });
    expectToolSuccessOrSkip(ctx, createResult);

    try {
      // Activate the initial version
      const act1 = await callTool(client, 'SAPActivate', {
        action: 'activate',
        type: 'STRU',
        name: struName,
      });
      expectToolSuccess(act1);

      // Update — add a field (creates inactive version)
      const updateResult = await callTool(client, 'SAPWrite', {
        action: 'update',
        type: 'STRU',
        name: struName,
        source: [
          `@EndUserText.label : 'ARC-1 E2E test structure'`,
          `@AbapCatalog.enhancementCategory : #NOT_EXTENSIBLE`,
          `define type ${struName.toLowerCase()} {`,
          `  key id   : sysuuid_x16 not null;`,
          `  status  : char1;`,
          `  message : char100;`,
          ``,
          `}`,
        ].join('\n'),
      });
      expectToolSuccess(updateResult);

      // Default read — should show the new field (inactive version)
      const readDefault = await callTool(client, 'SAPRead', { type: 'STRU', name: struName });
      expect(expectToolSuccess(readDefault)).toContain('message');

      // version=inactive — should also show the new field
      const readInactive = await callTool(client, 'SAPRead', {
        type: 'STRU',
        name: struName,
        version: 'inactive',
      });
      expect(expectToolSuccess(readInactive)).toContain('message');

      // version=active — should NOT have the new field (still the old activated version)
      const readActive = await callTool(client, 'SAPRead', {
        type: 'STRU',
        name: struName,
        version: 'active',
      });
      const activeText = expectToolSuccess(readActive);
      expect(activeText).toContain('status');
      expect(activeText).not.toContain('message');

      // Activate the update
      const act2 = await callTool(client, 'SAPActivate', {
        action: 'activate',
        type: 'STRU',
        name: struName,
      });
      expectToolSuccess(act2);

      // Now version=active should include the new field
      const readActiveAfter = await callTool(client, 'SAPRead', {
        type: 'STRU',
        name: struName,
        version: 'active',
      });
      expect(expectToolSuccess(readActiveAfter)).toContain('message');
    } finally {
      try {
        await callTool(client, 'SAPWrite', { action: 'delete', type: 'STRU', name: struName });
      } catch {
        // best-effort-cleanup
      }
    }
  });

  it('SAPWrite rejects mixed-case object names on create', async () => {
    const result = await callTool(client, 'SAPWrite', {
      action: 'create',
      type: 'DDLS',
      name: 'Zarc1_Mixed_Case',
      package: '$TMP',
      source: 'define view entity Zarc1_Mixed_Case as select from t000 { key mandt }',
    });
    expectToolError(result, 'uppercase');
  });

  it('SAPWrite batch_create supports DOMA + DTEL dependency chain', async (ctx) => {
    const domainName = uniqueName('ZARC1_BDOM');
    const dtelName = uniqueName('ZARC1_BDTL');

    const batchResult = await callTool(client, 'SAPWrite', {
      action: 'batch_create',
      package: '$TMP',
      objects: [
        {
          type: 'DOMA',
          name: domainName,
          dataType: 'CHAR',
          length: 1,
          fixedValues: [{ low: 'X', description: 'Batch' }],
        },
        {
          type: 'DTEL',
          name: dtelName,
          typeKind: 'domain',
          typeName: domainName,
          shortLabel: 'Batch',
        },
      ],
    });
    // batch_create aggregates per-object errors. The handler surfaces them as
    // either isError=true (with "Batch created 0/N") or isError=false (success
    // payload but same "Batch created 0/N" summary). Handle both.
    const batchText = expectToolSuccessOrSkip(ctx, batchResult);
    if (skipOnBatchCreateFailure(ctx, batchText)) return;

    try {
      const readDtel = await callTool(client, 'SAPRead', { type: 'DTEL', name: dtelName });
      const dtel = parsePossiblyCachedJson(expectToolSuccess(readDtel));
      expect(dtel.typeKind).toBe('domain');
      expect(dtel.typeName).toBe(domainName);
    } finally {
      try {
        await callTool(client, 'SAPWrite', { action: 'delete', type: 'DTEL', name: dtelName });
      } catch {
        // best-effort-cleanup
      }
      try {
        await callTool(client, 'SAPWrite', { action: 'delete', type: 'DOMA', name: domainName });
      } catch {
        // best-effort-cleanup
      }
    }
  });
});
