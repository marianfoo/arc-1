import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { callTool, connectClient, expectToolError, expectToolSuccess } from './helpers.js';

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

  it('SAPWrite create DOMA with fixed values', async () => {
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
    expectToolSuccess(createResult);

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

  it('SAPWrite create DTEL (domain-based + predefined)', async () => {
    const domainName = uniqueName('ZARC1_DMD');
    const dtelDomain = uniqueName('ZARC1_DTD');
    const dtelPredef = uniqueName('ZARC1_DTP');

    await callTool(client, 'SAPWrite', {
      action: 'create',
      type: 'DOMA',
      name: domainName,
      package: '$TMP',
      dataType: 'CHAR',
      length: 3,
    });

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
      expectToolSuccess(byDomain);

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
      expectToolSuccess(byType);
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

  it('SAPWrite update DOMA and verify via SAPRead', async () => {
    const domainName = uniqueName('ZARC1_UPD');

    await callTool(client, 'SAPWrite', {
      action: 'create',
      type: 'DOMA',
      name: domainName,
      package: '$TMP',
      dataType: 'CHAR',
      length: 1,
      fixedValues: [{ low: 'A', description: 'Active' }],
    });

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

  it('SAPWrite delete DOMA/DTEL removes objects', async () => {
    const domainName = uniqueName('ZARC1_DEL');
    const dtelName = uniqueName('ZARC1_DELD');

    await callTool(client, 'SAPWrite', {
      action: 'create',
      type: 'DOMA',
      name: domainName,
      package: '$TMP',
      dataType: 'CHAR',
      length: 1,
    });
    await callTool(client, 'SAPWrite', {
      action: 'create',
      type: 'DTEL',
      name: dtelName,
      package: '$TMP',
      typeKind: 'domain',
      typeName: domainName,
      shortLabel: 'Del',
    });

    await callTool(client, 'SAPWrite', { action: 'delete', type: 'DTEL', name: dtelName });
    await callTool(client, 'SAPWrite', { action: 'delete', type: 'DOMA', name: domainName });

    const readDtel = await callTool(client, 'SAPRead', { type: 'DTEL', name: dtelName });
    expectToolError(readDtel, dtelName);
    const readDomain = await callTool(client, 'SAPRead', { type: 'DOMA', name: domainName });
    expectToolError(readDomain, domainName);
  });

  it('SAPWrite batch_create supports DOMA + DTEL dependency chain', async () => {
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
    expectToolSuccess(batchResult);

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
