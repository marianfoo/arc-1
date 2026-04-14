/**
 * E2E Tests for RAP Object Write Lifecycle (TABL + DDLS + BDEF + SRVD)
 *
 * Creates, reads, activates, and deletes RAP-dependent objects on a real SAP system.
 * Requires rap.available = true on the test system. Skips gracefully if RAP is unavailable.
 *
 * Objects are transient: created with unique names and deleted in finally blocks.
 * Cleanup is best-effort to avoid masking test failures.
 */

import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { requireOrSkip } from '../helpers/skip-policy.js';
import { callTool, connectClient, expectToolSuccess } from './helpers.js';

/** Generate a collision-safe unique name with a given prefix (max 30 chars). */
function uniqueName(prefix: string): string {
  const suffix = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e5)
    .toString(36)
    .padStart(3, '0')}`.toUpperCase();
  return `${prefix}${suffix}`.slice(0, 30);
}

/** Best-effort delete helper. Swallows all errors. */
async function bestEffortDelete(client: Client, type: string, name: string): Promise<void> {
  try {
    await callTool(client, 'SAPWrite', { action: 'delete', type, name });
  } catch {
    // best-effort-cleanup
  }
}

/** Best-effort package delete helper. Swallows all errors. */
async function bestEffortDeletePackage(client: Client, name: string): Promise<void> {
  try {
    await callTool(client, 'SAPManage', { action: 'delete_package', name });
  } catch {
    // best-effort-cleanup
  }
}

describe('E2E RAP write lifecycle tests', () => {
  let client: Client;
  // true when RAP is available, undefined when not (so requireOrSkip can skip on undefined)
  let rapAvailable: true | undefined;

  beforeAll(async () => {
    client = await connectClient();

    // Probe the system to detect RAP availability
    const probeResult = await callTool(client, 'SAPManage', { action: 'probe' });
    const probeText = expectToolSuccess(probeResult);
    const features = JSON.parse(probeText);
    // requireOrSkip only skips on null/undefined, not false — so map false → undefined
    rapAvailable = features.rap?.available === true ? true : undefined;
  });

  afterAll(async () => {
    try {
      await client?.close();
    } catch {
      // best-effort-cleanup
    }
  });

  // ── Test 1: TABL table entity lifecycle (via TABL endpoint) ─────────

  it('SAPManage create_package, verify, delete', async () => {
    // Use $-prefix: $TMP has software component LOCAL which only allows TEST* and $* names.
    // Z-namespace packages need a different software component (system-specific).
    const packageName = uniqueName('$ARC1T_');

    const createResult = await callTool(client, 'SAPManage', {
      action: 'create_package',
      name: packageName,
      description: 'ARC-1 E2E test package',
      superPackage: '$TMP',
    });
    expectToolSuccess(createResult);

    try {
      const readResult = await callTool(client, 'SAPRead', {
        type: 'DEVC',
        name: packageName,
      });
      const readText = expectToolSuccess(readResult);
      const parsed = JSON.parse(readText);
      expect(Array.isArray(parsed)).toBe(true);

      const deleteResult = await callTool(client, 'SAPManage', {
        action: 'delete_package',
        name: packageName,
      });
      expectToolSuccess(deleteResult);
    } finally {
      await bestEffortDeletePackage(client, packageName);
    }
  });

  it('SAPWrite create TABL table entity, activate, read, delete', async (ctx) => {
    requireOrSkip(ctx, rapAvailable, 'RAP/CDS not available on test system');

    // Table entity name = underlying DB table name, max 16 chars
    const tableName = uniqueName('ZART').slice(0, 16);

    const ddlSource = [
      "@EndUserText.label: 'ARC1 RAP test table'",
      '@AbapCatalog.enhancement.category: #NOT_EXTENSIBLE',
      '@AbapCatalog.tableCategory: #TRANSPARENT',
      '@AbapCatalog.deliveryClass: #A',
      '@AbapCatalog.dataMaintenance: #RESTRICTED',
      `define table ${tableName.toLowerCase()} {`,
      '  key client : abap.clnt not null;',
      '  key id     : sysuuid_x16 not null;',
      '  name       : abap.char(40);',
      '}',
    ].join('\n');

    const createResult = await callTool(client, 'SAPWrite', {
      action: 'create',
      type: 'TABL',
      name: tableName,
      source: ddlSource,
      package: '$TMP',
    });
    expectToolSuccess(createResult);

    try {
      // Activate the table entity
      const activateResult = await callTool(client, 'SAPActivate', {
        type: 'TABL',
        name: tableName,
      });
      expectToolSuccess(activateResult);

      // Read back and verify
      const readResult = await callTool(client, 'SAPRead', {
        type: 'TABL',
        name: tableName,
      });
      const readText = expectToolSuccess(readResult);
      expect(readText.toLowerCase()).toContain('define table');
      expect(readText.toLowerCase()).toContain(tableName.toLowerCase());
    } finally {
      await bestEffortDelete(client, 'TABL', tableName);
    }
  });

  // ── Test 2: TABL lifecycle ──────────────────────────────────────────

  it('SAPWrite create TABL, read, update, activate, delete', async (ctx) => {
    requireOrSkip(ctx, rapAvailable, 'RAP/CDS not available on test system');

    const tableName = uniqueName('ZTAB').slice(0, 16);

    const createSource = [
      "@EndUserText.label : 'ARC1 TABL lifecycle'",
      '@AbapCatalog.enhancement.category : #NOT_EXTENSIBLE',
      '@AbapCatalog.tableCategory : #TRANSPARENT',
      '@AbapCatalog.deliveryClass : #A',
      '@AbapCatalog.dataMaintenance : #RESTRICTED',
      `define table ${tableName.toLowerCase()} {`,
      '  key client : abap.clnt not null;',
      '  key id     : abap.numc(8) not null;',
      '  descr      : abap.char(40);',
      '}',
    ].join('\n');

    const updateSource = [
      "@EndUserText.label : 'ARC1 TABL lifecycle updated'",
      '@AbapCatalog.enhancement.category : #NOT_EXTENSIBLE',
      '@AbapCatalog.tableCategory : #TRANSPARENT',
      '@AbapCatalog.deliveryClass : #A',
      '@AbapCatalog.dataMaintenance : #RESTRICTED',
      `define table ${tableName.toLowerCase()} {`,
      '  key client : abap.clnt not null;',
      '  key id     : abap.numc(8) not null;',
      '  descr      : abap.char(40);',
      '  note       : abap.char(80);',
      '}',
    ].join('\n');

    const createResult = await callTool(client, 'SAPWrite', {
      action: 'create',
      type: 'TABL',
      name: tableName,
      package: '$TMP',
      source: createSource,
    });
    expectToolSuccess(createResult);

    try {
      const readCreatedResult = await callTool(client, 'SAPRead', {
        type: 'TABL',
        name: tableName,
      });
      const readCreatedText = expectToolSuccess(readCreatedResult).toLowerCase();
      expect(readCreatedText).toContain('define table');
      expect(readCreatedText).toContain('descr');

      const activateResult = await callTool(client, 'SAPActivate', {
        type: 'TABL',
        name: tableName,
      });
      expectToolSuccess(activateResult);

      const updateResult = await callTool(client, 'SAPWrite', {
        action: 'update',
        type: 'TABL',
        name: tableName,
        source: updateSource,
      });
      expectToolSuccess(updateResult);

      const readUpdatedResult = await callTool(client, 'SAPRead', {
        type: 'TABL',
        name: tableName,
      });
      const readUpdatedText = expectToolSuccess(readUpdatedResult).toLowerCase();
      expect(readUpdatedText).toContain('note');
    } finally {
      await bestEffortDelete(client, 'TABL', tableName);
    }
  });

  // ── Test 3: CDS view entity + BDEF lifecycle ───────────────────────

  it('SAPWrite create DDLS CDS view entity + BDEF, activate, read, delete', async (ctx) => {
    requireOrSkip(ctx, rapAvailable, 'RAP/CDS not available on test system');

    // DDLS table entity name = underlying DB table name, max 16 chars
    const tableName = uniqueName('ZARV').slice(0, 16);
    const viewName = uniqueName('ZARC1_RI_');
    const bdefName = viewName; // BDEF name must match the root CDS view entity
    const bpClassName = uniqueName('ZBP_ARC1_R');

    // Step 1: Create underlying table entity
    const tableSource = [
      `@EndUserText.label: 'ARC1 RAP view test table'`,
      '@AbapCatalog.enhancement.category: #NOT_EXTENSIBLE',
      '@AbapCatalog.tableCategory: #TRANSPARENT',
      '@AbapCatalog.deliveryClass: #A',
      '@AbapCatalog.dataMaintenance: #RESTRICTED',
      `define table ${tableName.toLowerCase()} {`,
      '  key client : abap.clnt not null;',
      '  key id     : sysuuid_x16 not null;',
      '  name       : abap.char(40);',
      '}',
    ].join('\n');

    const createTableResult = await callTool(client, 'SAPWrite', {
      action: 'create',
      type: 'TABL',
      name: tableName,
      source: tableSource,
      package: '$TMP',
    });
    expectToolSuccess(createTableResult);

    // Activate the table before building on top of it
    const activateTableResult = await callTool(client, 'SAPActivate', {
      type: 'TABL',
      name: tableName,
    });
    expectToolSuccess(activateTableResult);

    try {
      // Step 2: Create CDS view entity on top of the table
      const viewSource = [
        `@EndUserText.label: 'ARC1 RAP test view'`,
        '@AccessControl.authorizationCheck: #NOT_ALLOWED',
        `define root view entity ${viewName}`,
        `  as select from ${tableName.toLowerCase()}`,
        '{',
        '  key id   as Id,',
        '  name     as Name',
        '}',
      ].join('\n');

      const createViewResult = await callTool(client, 'SAPWrite', {
        action: 'create',
        type: 'DDLS',
        name: viewName,
        source: viewSource,
        package: '$TMP',
      });
      expectToolSuccess(createViewResult);

      // Activate the view entity
      const activateViewResult = await callTool(client, 'SAPActivate', {
        type: 'DDLS',
        name: viewName,
      });
      expectToolSuccess(activateViewResult);

      // Step 3: Create the behavior pool class (required before BDEF activation)
      const bpClassSource = [
        `CLASS ${bpClassName.toLowerCase()} DEFINITION`,
        '  PUBLIC ABSTRACT FINAL',
        `  FOR BEHAVIOR OF ${viewName.toLowerCase()}.`,
        'ENDCLASS.',
        '',
        `CLASS ${bpClassName.toLowerCase()} IMPLEMENTATION.`,
        'ENDCLASS.',
      ].join('\n');

      const createBpResult = await callTool(client, 'SAPWrite', {
        action: 'create',
        type: 'CLAS',
        name: bpClassName,
        source: bpClassSource,
        package: '$TMP',
      });
      expectToolSuccess(createBpResult);

      // Step 4: Create BDEF for the view entity
      const bdefSource = [
        `managed implementation in class ${bpClassName.toLowerCase()} unique;`,
        'strict;',
        '',
        `define behavior for ${viewName} alias ${viewName.slice(-10)}`,
        `persistent table ${tableName.toLowerCase()}`,
        'lock master',
        'authorization master ( instance )',
        '{',
        '  field ( readonly ) Id;',
        '  create;',
        '  update;',
        '  delete;',
        '}',
      ].join('\n');

      const createBdefResult = await callTool(client, 'SAPWrite', {
        action: 'create',
        type: 'BDEF',
        name: bdefName,
        source: bdefSource,
        package: '$TMP',
      });
      expectToolSuccess(createBdefResult);

      // Activate BDEF and behavior pool together (cross-dependency)
      const activateBdefResult = await callTool(client, 'SAPActivate', {
        objects: [
          { type: 'CLAS', name: bpClassName },
          { type: 'BDEF', name: bdefName },
        ],
      });
      expectToolSuccess(activateBdefResult);

      // Read back the CDS view entity
      const readViewResult = await callTool(client, 'SAPRead', {
        type: 'DDLS',
        name: viewName,
      });
      const viewText = expectToolSuccess(readViewResult);
      expect(viewText.toLowerCase()).toContain('define root view entity');
      expect(viewText.toLowerCase()).toContain(viewName.toLowerCase());

      // Read back the BDEF
      const readBdefResult = await callTool(client, 'SAPRead', {
        type: 'BDEF',
        name: bdefName,
      });
      const bdefText = expectToolSuccess(readBdefResult);
      expect(bdefText.toLowerCase()).toContain('managed');
      expect(bdefText.toLowerCase()).toContain(viewName.toLowerCase());
    } finally {
      // Cleanup in reverse dependency order: BDEF -> class -> view -> table
      await bestEffortDelete(client, 'BDEF', bdefName);
      await bestEffortDelete(client, 'CLAS', bpClassName);
      await bestEffortDelete(client, 'DDLS', viewName);
      await bestEffortDelete(client, 'TABL', tableName);
    }
  });

  // ── Test 4: SRVD service definition lifecycle ──────────────────────

  it('SAPWrite create SRVD service definition, activate, read, delete', async (ctx) => {
    requireOrSkip(ctx, rapAvailable, 'RAP/CDS not available on test system');

    // DDLS table entity name = underlying DB table name, max 16 chars
    const tableName = uniqueName('ZARS').slice(0, 16);
    const viewName = uniqueName('ZARC1_RX_');
    const srvdName = uniqueName('ZARC1_SD_');

    // Step 1: Create underlying table entity
    const tableSource = [
      `@EndUserText.label: 'ARC1 SRVD test table'`,
      '@AbapCatalog.enhancement.category: #NOT_EXTENSIBLE',
      '@AbapCatalog.tableCategory: #TRANSPARENT',
      '@AbapCatalog.deliveryClass: #A',
      '@AbapCatalog.dataMaintenance: #RESTRICTED',
      `define table ${tableName.toLowerCase()} {`,
      '  key client : abap.clnt not null;',
      '  key id     : sysuuid_x16 not null;',
      '  descr      : abap.char(40);',
      '}',
    ].join('\n');

    const createTableResult = await callTool(client, 'SAPWrite', {
      action: 'create',
      type: 'TABL',
      name: tableName,
      source: tableSource,
      package: '$TMP',
    });
    expectToolSuccess(createTableResult);

    const activateTableResult = await callTool(client, 'SAPActivate', {
      type: 'TABL',
      name: tableName,
    });
    expectToolSuccess(activateTableResult);

    try {
      // Step 2: Create CDS view entity
      const viewSource = [
        `@EndUserText.label: 'ARC1 SRVD test view'`,
        '@AccessControl.authorizationCheck: #NOT_ALLOWED',
        `define root view entity ${viewName}`,
        `  as select from ${tableName.toLowerCase()}`,
        '{',
        '  key id    as Id,',
        '  descr     as Description',
        '}',
      ].join('\n');

      const createViewResult = await callTool(client, 'SAPWrite', {
        action: 'create',
        type: 'DDLS',
        name: viewName,
        source: viewSource,
        package: '$TMP',
      });
      expectToolSuccess(createViewResult);

      const activateViewResult = await callTool(client, 'SAPActivate', {
        type: 'DDLS',
        name: viewName,
      });
      expectToolSuccess(activateViewResult);

      // Step 3: Create SRVD exposing the view entity
      const srvdSource = [
        `@EndUserText.label: 'ARC1 test service definition'`,
        `define service ${srvdName} {`,
        `  expose ${viewName} as TestEntity;`,
        '}',
      ].join('\n');

      const createSrvdResult = await callTool(client, 'SAPWrite', {
        action: 'create',
        type: 'SRVD',
        name: srvdName,
        source: srvdSource,
        package: '$TMP',
      });
      expectToolSuccess(createSrvdResult);

      // Activate the SRVD
      const activateSrvdResult = await callTool(client, 'SAPActivate', {
        type: 'SRVD',
        name: srvdName,
      });
      expectToolSuccess(activateSrvdResult);

      // Read back and verify
      const readSrvdResult = await callTool(client, 'SAPRead', {
        type: 'SRVD',
        name: srvdName,
      });
      const srvdText = expectToolSuccess(readSrvdResult);
      expect(srvdText.toLowerCase()).toContain('define service');
      expect(srvdText.toLowerCase()).toContain(viewName.toLowerCase());
    } finally {
      // Cleanup in reverse dependency order: SRVD -> view -> table
      await bestEffortDelete(client, 'SRVD', srvdName);
      await bestEffortDelete(client, 'DDLS', viewName);
      await bestEffortDelete(client, 'TABL', tableName);
    }
  });

  // ── Test 4: SRVB lifecycle (create -> activate -> publish) ────────

  it('SAPWrite create SRVB, activate, publish, unpublish, delete', async (ctx) => {
    requireOrSkip(ctx, rapAvailable, 'RAP/CDS not available on test system');

    const tableName = uniqueName('ZART').slice(0, 16);
    const viewName = uniqueName('ZARC1_SV_');
    const bdefName = viewName;
    const bpClassName = uniqueName('ZBP_ARC1_S');
    const srvdName = uniqueName('ZARC1_SD_');
    const srvbName = uniqueName('ZARC1_SB_');

    const tableSource = [
      `@EndUserText.label: 'ARC1 SRVB stack table'`,
      '@AbapCatalog.enhancement.category: #NOT_EXTENSIBLE',
      '@AbapCatalog.tableCategory: #TRANSPARENT',
      '@AbapCatalog.deliveryClass: #A',
      '@AbapCatalog.dataMaintenance: #RESTRICTED',
      `define table ${tableName.toLowerCase()} {`,
      '  key client : abap.clnt not null;',
      '  key id     : sysuuid_x16 not null;',
      '  name       : abap.char(40);',
      '}',
    ].join('\n');

    const viewSource = [
      `@EndUserText.label: 'ARC1 SRVB stack view'`,
      '@AccessControl.authorizationCheck: #NOT_ALLOWED',
      `define root view entity ${viewName}`,
      `  as select from ${tableName.toLowerCase()}`,
      '{',
      '  key id   as Id,',
      '  name     as Name',
      '}',
    ].join('\n');

    const bpClassSource = [
      `CLASS ${bpClassName.toLowerCase()} DEFINITION`,
      '  PUBLIC ABSTRACT FINAL',
      `  FOR BEHAVIOR OF ${viewName.toLowerCase()}.`,
      'ENDCLASS.',
      '',
      `CLASS ${bpClassName.toLowerCase()} IMPLEMENTATION.`,
      'ENDCLASS.',
    ].join('\n');

    const bdefSource = [
      `managed implementation in class ${bpClassName.toLowerCase()} unique;`,
      'strict;',
      '',
      `define behavior for ${viewName} alias ${viewName.slice(-10)}`,
      `persistent table ${tableName.toLowerCase()}`,
      'lock master',
      'authorization master ( instance )',
      '{',
      '  field ( readonly ) Id;',
      '  create;',
      '  update;',
      '  delete;',
      '}',
    ].join('\n');

    const srvdSource = [
      `@EndUserText.label: 'ARC1 SRVB stack service definition'`,
      `define service ${srvdName} {`,
      `  expose ${viewName} as TestEntity;`,
      '}',
    ].join('\n');

    try {
      expectToolSuccess(
        await callTool(client, 'SAPWrite', {
          action: 'create',
          type: 'TABL',
          name: tableName,
          source: tableSource,
          package: '$TMP',
        }),
      );
      expectToolSuccess(await callTool(client, 'SAPActivate', { type: 'TABL', name: tableName }));

      expectToolSuccess(
        await callTool(client, 'SAPWrite', {
          action: 'create',
          type: 'DDLS',
          name: viewName,
          source: viewSource,
          package: '$TMP',
        }),
      );
      expectToolSuccess(await callTool(client, 'SAPActivate', { type: 'DDLS', name: viewName }));

      expectToolSuccess(
        await callTool(client, 'SAPWrite', {
          action: 'create',
          type: 'CLAS',
          name: bpClassName,
          source: bpClassSource,
          package: '$TMP',
        }),
      );

      expectToolSuccess(
        await callTool(client, 'SAPWrite', {
          action: 'create',
          type: 'BDEF',
          name: bdefName,
          source: bdefSource,
          package: '$TMP',
        }),
      );
      expectToolSuccess(
        await callTool(client, 'SAPActivate', {
          objects: [
            { type: 'CLAS', name: bpClassName },
            { type: 'BDEF', name: bdefName },
          ],
        }),
      );

      expectToolSuccess(
        await callTool(client, 'SAPWrite', {
          action: 'create',
          type: 'SRVD',
          name: srvdName,
          source: srvdSource,
          package: '$TMP',
        }),
      );
      expectToolSuccess(await callTool(client, 'SAPActivate', { type: 'SRVD', name: srvdName }));

      expectToolSuccess(
        await callTool(client, 'SAPWrite', {
          action: 'create',
          type: 'SRVB',
          name: srvbName,
          package: '$TMP',
          serviceDefinition: srvdName,
          category: '0',
        }),
      );
      expectToolSuccess(await callTool(client, 'SAPActivate', { type: 'SRVB', name: srvbName }));

      const readSrvbResult = await callTool(client, 'SAPRead', {
        type: 'SRVB',
        name: srvbName,
      });
      const srvbText = expectToolSuccess(readSrvbResult);
      const parsed = JSON.parse(srvbText);
      expect(parsed.name).toBe(srvbName);
      expect(parsed.serviceDefinition).toBe(srvdName);

      expectToolSuccess(await callTool(client, 'SAPActivate', { action: 'publish_srvb', name: srvbName }));
      expectToolSuccess(await callTool(client, 'SAPActivate', { action: 'unpublish_srvb', name: srvbName }));
    } finally {
      await bestEffortDelete(client, 'SRVB', srvbName);
      await bestEffortDelete(client, 'SRVD', srvdName);
      await bestEffortDelete(client, 'BDEF', bdefName);
      await bestEffortDelete(client, 'CLAS', bpClassName);
      await bestEffortDelete(client, 'DDLS', viewName);
      await bestEffortDelete(client, 'TABL', tableName);
    }
  });

  // ── Test 5: batch_create for RAP stack ─────────────────────────────

  it('SAPWrite batch_create for table entity + CDS view', async (ctx) => {
    requireOrSkip(ctx, rapAvailable, 'RAP/CDS not available on test system');

    // DDLS table entity name = underlying DB table name, max 16 chars
    const tableName = uniqueName('ZARB').slice(0, 16);
    const viewName = uniqueName('ZARC1_RC_');

    const tableSource = [
      `@EndUserText.label: 'ARC1 batch test table'`,
      '@AbapCatalog.enhancement.category: #NOT_EXTENSIBLE',
      '@AbapCatalog.tableCategory: #TRANSPARENT',
      '@AbapCatalog.deliveryClass: #A',
      '@AbapCatalog.dataMaintenance: #RESTRICTED',
      `define table ${tableName.toLowerCase()} {`,
      '  key client : abap.clnt not null;',
      '  key id     : sysuuid_x16 not null;',
      '  value      : abap.char(40);',
      '}',
    ].join('\n');

    const viewSource = [
      `@EndUserText.label: 'ARC1 batch test view'`,
      '@AccessControl.authorizationCheck: #NOT_ALLOWED',
      `define root view entity ${viewName}`,
      `  as select from ${tableName.toLowerCase()}`,
      '{',
      '  key id   as Id,',
      '  value    as Value',
      '}',
    ].join('\n');

    // batch_create creates and activates each object in sequence
    const batchResult = await callTool(client, 'SAPWrite', {
      action: 'batch_create',
      package: '$TMP',
      objects: [
        {
          type: 'TABL',
          name: tableName,
          source: tableSource,
        },
        {
          type: 'DDLS',
          name: viewName,
          source: viewSource,
        },
      ],
    });
    expectToolSuccess(batchResult);

    try {
      // Verify both objects were created by reading them back
      const readTableResult = await callTool(client, 'SAPRead', {
        type: 'TABL',
        name: tableName,
      });
      const tableText = expectToolSuccess(readTableResult);
      expect(tableText.toLowerCase()).toContain('define table');
      expect(tableText.toLowerCase()).toContain(tableName.toLowerCase());

      const readViewResult = await callTool(client, 'SAPRead', {
        type: 'DDLS',
        name: viewName,
      });
      const viewText = expectToolSuccess(readViewResult);
      expect(viewText.toLowerCase()).toContain('define root view entity');
      expect(viewText.toLowerCase()).toContain(viewName.toLowerCase());
    } finally {
      // Cleanup in reverse dependency order: view -> table
      await bestEffortDelete(client, 'DDLS', viewName);
      await bestEffortDelete(client, 'TABL', tableName);
    }
  });

  // ─── Test 6: MSAG message class create → read → update → delete ──
  it('SAPWrite create MSAG, read, update with messages, delete', async () => {
    const msagName = uniqueName('ZARC1MC').slice(0, 20);

    try {
      // Step 1: Create empty message class
      const createResult = await callTool(client, 'SAPWrite', {
        action: 'create',
        type: 'MSAG',
        name: msagName,
        package: '$TMP',
        description: 'ARC-1 test message class',
      });
      const createText = expectToolSuccess(createResult);
      expect(createText).toContain(`Created MSAG ${msagName}`);

      // Step 2: Read the message class — should return structured JSON
      const readResult = await callTool(client, 'SAPRead', {
        type: 'MESSAGES',
        name: msagName,
      });
      const readText = expectToolSuccess(readResult);
      const readData = JSON.parse(readText);
      expect(readData.name).toBe(msagName);
      expect(readData.messages).toEqual([]);

      // Step 3: Update with messages
      const updateResult = await callTool(client, 'SAPWrite', {
        action: 'update',
        type: 'MSAG',
        name: msagName,
        messages: [
          { number: '001', shortText: 'Test message &1' },
          { number: '002', shortText: 'Another message' },
        ],
      });
      const updateText = expectToolSuccess(updateResult);
      expect(updateText).toContain(`updated MSAG ${msagName}`);

      // Step 4: Read again — should have messages
      const readResult2 = await callTool(client, 'SAPRead', {
        type: 'MESSAGES',
        name: msagName,
      });
      const readText2 = expectToolSuccess(readResult2);
      const readData2 = JSON.parse(readText2);
      expect(readData2.messages).toHaveLength(2);
      expect(readData2.messages[0].number).toBe('001');
      expect(readData2.messages[0].shortText).toContain('Test message');

      // Step 5: Delete
      const deleteResult = await callTool(client, 'SAPWrite', {
        action: 'delete',
        type: 'MSAG',
        name: msagName,
      });
      const deleteText = expectToolSuccess(deleteResult);
      expect(deleteText).toContain(`Deleted MSAG ${msagName}`);
    } finally {
      await bestEffortDelete(client, 'MSAG', msagName);
    }
  });
});
