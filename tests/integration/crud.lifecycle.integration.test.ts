/**
 * CRUD lifecycle integration test for ARC-1.
 *
 * Exercises the full create -> read -> update -> activate -> delete -> verify-deleted
 * roundtrip against a live SAP system.
 *
 * Missing credentials are treated as setup errors and fail the suite.
 *
 * Run: npm run test:integration:crud
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AdtClient } from '../../src/adt/client.js';
import {
  createObject,
  deleteObject,
  lockObject,
  safeUpdateObject,
  safeUpdateSource,
  unlockObject,
} from '../../src/adt/crud.js';
import { activate } from '../../src/adt/devtools.js';
import { expectSapFailureClass } from '../helpers/expected-error.js';
import { buildCreateXml, CrudRegistry, cleanupAll, generateUniqueName } from './crud-harness.js';
import { getTestClient, requireSapCredentials } from './helpers.js';

const DOMAIN_V2_CONTENT_TYPE = 'application/vnd.sap.adt.domains.v2+xml; charset=utf-8';
const DATAELEMENT_V2_CONTENT_TYPE = 'application/vnd.sap.adt.dataelements.v2+xml; charset=utf-8';

describe('CRUD lifecycle', () => {
  let client: AdtClient;
  const registry = new CrudRegistry();

  async function deleteWithLock(objectUrl: string): Promise<void> {
    await client.http.withStatefulSession(async (session) => {
      const lock = await lockObject(session, client.safety, objectUrl);
      try {
        await deleteObject(session, client.safety, objectUrl, lock.lockHandle);
      } finally {
        try {
          await unlockObject(session, objectUrl, lock.lockHandle);
        } catch {
          // best-effort-cleanup
        }
      }
    });
  }

  beforeAll(() => {
    requireSapCredentials();
    client = getTestClient();
  });

  afterAll(async () => {
    if (!client) return;
    const report = await cleanupAll(client.http, client.safety, registry);
    if (report.failed.length > 0) {
      // best-effort-cleanup
      console.error('CRUD cleanup failures:', report.failed);
    }
  });

  it('full lifecycle: create -> read -> update -> activate -> delete -> verify-deleted', async () => {
    const testName = generateUniqueName('ZARC1_IT');
    const objectUrl = `/sap/bc/adt/programs/programs/${testName.toLowerCase()}`;
    const sourceUrl = `${objectUrl}/source/main`;
    const xml = buildCreateXml('PROG', testName, '$TMP', 'ARC-1 lifecycle test');

    // 1. CREATE
    await createObject(client.http, client.safety, '/sap/bc/adt/programs/programs', xml);
    registry.register(objectUrl, 'PROG', testName);

    // 2. READ — verify creation
    const source1 = await client.getProgram(testName);
    expect(typeof source1).toBe('string');
    expect(source1.length).toBeGreaterThan(0);

    // 3. UPDATE — modify source
    const newSource = `REPORT ${testName.toLowerCase()}.\nWRITE: / 'updated by CRUD lifecycle test'.`;
    await safeUpdateSource(client.http, client.safety, objectUrl, sourceUrl, newSource);

    // 4. READ — verify update
    const source2 = await client.getProgram(testName);
    expect(source2).toContain('updated by CRUD lifecycle test');

    // 5. ACTIVATE
    const activation = await activate(client.http, client.safety, objectUrl);
    expect(activation.success).toBe(true);

    // 6. DELETE
    await client.http.withStatefulSession(async (session) => {
      const lock = await lockObject(session, client.safety, objectUrl);
      await deleteObject(session, client.safety, objectUrl, lock.lockHandle);
    });
    registry.remove(testName);

    // 7. VERIFY DELETION — read should fail with 404
    await expect(client.getProgram(testName)).rejects.toThrow(/404|not found/i);
  }, 60_000);

  it('DOMA CRUD lifecycle', async () => {
    const domainName = generateUniqueName('ZARC1_TDOM');
    const domainUrl = `/sap/bc/adt/ddic/domains/${domainName}`;

    try {
      const createXml = buildCreateXml('DOMA', domainName, '$TMP', 'ARC-1 test domain', {
        dataType: 'CHAR',
        length: 1,
        fixedValues: [
          { low: 'A', description: 'Active' },
          { low: 'I', description: 'Inactive' },
        ],
      });

      await createObject(client.http, client.safety, '/sap/bc/adt/ddic/domains', createXml, DOMAIN_V2_CONTENT_TYPE);
      registry.register(domainUrl, 'DOMA', domainName);
      expect((await activate(client.http, client.safety, domainUrl)).success).toBe(true);

      const created = await client.getDomain(domainName);
      expect(created.dataType).toBe('CHAR');
      expect(created.length).toBe('000001');
      expect(created.fixedValues.map((v) => v.low)).toEqual(expect.arrayContaining(['A', 'I']));

      const updateXml = buildCreateXml('DOMA', domainName, '$TMP', 'ARC-1 test domain updated', {
        dataType: 'CHAR',
        length: 2,
        fixedValues: [
          { low: 'A', description: 'Active' },
          { low: 'I', description: 'Inactive' },
          { low: 'P', description: 'Pending' },
        ],
      });
      await safeUpdateObject(client.http, client.safety, domainUrl, updateXml, DOMAIN_V2_CONTENT_TYPE);
      expect((await activate(client.http, client.safety, domainUrl)).success).toBe(true);

      const updated = await client.getDomain(domainName);
      expect(updated.length).toBe('000002');
      expect(updated.fixedValues.map((v) => v.low)).toContain('P');

      await deleteWithLock(domainUrl);
      registry.remove(domainName);

      try {
        await client.getDomain(domainName);
        throw new Error('Expected domain read to fail after delete');
      } catch (err) {
        expectSapFailureClass(err, [404], [/not found/i]);
      }
    } finally {
      if (registry.getAll().some((entry) => entry.name === domainName)) {
        try {
          await deleteWithLock(domainUrl);
          registry.remove(domainName);
        } catch {
          // best-effort-cleanup
        }
      }
    }
  }, 90_000);

  it('DTEL CRUD lifecycle', async () => {
    const dataElementName = generateUniqueName('ZARC1_TDEL');
    const dataElementUrl = `/sap/bc/adt/ddic/dataelements/${dataElementName}`;

    try {
      const createXml = buildCreateXml('DTEL', dataElementName, '$TMP', 'ARC-1 test data element', {
        typeKind: 'predefinedAbapType',
        dataType: 'CHAR',
        length: 10,
        shortLabel: 'Status',
        mediumLabel: 'Order Status',
        longLabel: 'Order Processing Status',
        headingLabel: 'Status',
      });

      await createObject(
        client.http,
        client.safety,
        '/sap/bc/adt/ddic/dataelements',
        createXml,
        DATAELEMENT_V2_CONTENT_TYPE,
      );
      registry.register(dataElementUrl, 'DTEL', dataElementName);
      expect((await activate(client.http, client.safety, dataElementUrl)).success).toBe(true);

      const created = await client.getDataElement(dataElementName);
      expect(created.typeKind).toBe('predefinedAbapType');
      expect(created.dataType).toBe('CHAR');
      expect(created.length).toBe('000010');
      expect(created.shortLabel).toBe('Status');

      const updateXml = buildCreateXml('DTEL', dataElementName, '$TMP', 'ARC-1 updated data element', {
        typeKind: 'predefinedAbapType',
        dataType: 'CHAR',
        length: 10,
        shortLabel: 'Stat',
        mediumLabel: 'Status Updated',
        longLabel: 'Order Status Updated',
        headingLabel: 'Status Upd',
      });
      await safeUpdateObject(client.http, client.safety, dataElementUrl, updateXml, DATAELEMENT_V2_CONTENT_TYPE);
      expect((await activate(client.http, client.safety, dataElementUrl)).success).toBe(true);

      const updated = await client.getDataElement(dataElementName);
      expect(updated.shortLabel).toBe('Stat');
      expect(updated.mediumLabel).toBe('Status Updated');

      await deleteWithLock(dataElementUrl);
      registry.remove(dataElementName);

      try {
        await client.getDataElement(dataElementName);
        throw new Error('Expected data element read to fail after delete');
      } catch (err) {
        expectSapFailureClass(err, [404], [/not found/i]);
      }
    } finally {
      if (registry.getAll().some((entry) => entry.name === dataElementName)) {
        try {
          await deleteWithLock(dataElementUrl);
          registry.remove(dataElementName);
        } catch {
          // best-effort-cleanup
        }
      }
    }
  }, 90_000);

  it('DOMA + DTEL dependency lifecycle', async () => {
    const domainName = generateUniqueName('ZARC1_DDM');
    const dataElementName = generateUniqueName('ZARC1_DDE');
    const domainUrl = `/sap/bc/adt/ddic/domains/${domainName}`;
    const dataElementUrl = `/sap/bc/adt/ddic/dataelements/${dataElementName}`;

    try {
      const domainCreateXml = buildCreateXml('DOMA', domainName, '$TMP', 'Dependency domain', {
        dataType: 'CHAR',
        length: 1,
        fixedValues: [{ low: 'X', description: 'Test' }],
      });
      await createObject(
        client.http,
        client.safety,
        '/sap/bc/adt/ddic/domains',
        domainCreateXml,
        DOMAIN_V2_CONTENT_TYPE,
      );
      registry.register(domainUrl, 'DOMA', domainName);
      expect((await activate(client.http, client.safety, domainUrl)).success).toBe(true);

      const dataElementCreateXml = buildCreateXml('DTEL', dataElementName, '$TMP', 'Dependency data element', {
        typeKind: 'domain',
        typeName: domainName,
        dataType: 'CHAR',
        length: 1,
        shortLabel: 'Dep',
      });
      await createObject(
        client.http,
        client.safety,
        '/sap/bc/adt/ddic/dataelements',
        dataElementCreateXml,
        DATAELEMENT_V2_CONTENT_TYPE,
      );
      registry.register(dataElementUrl, 'DTEL', dataElementName);
      expect((await activate(client.http, client.safety, dataElementUrl)).success).toBe(true);

      const dataElement = await client.getDataElement(dataElementName);
      expect(dataElement.typeKind).toBe('domain');
      expect(dataElement.typeName).toBe(domainName);

      await deleteWithLock(dataElementUrl);
      registry.remove(dataElementName);
      await deleteWithLock(domainUrl);
      registry.remove(domainName);

      try {
        await client.getDataElement(dataElementName);
        throw new Error('Expected data element read to fail after delete');
      } catch (err) {
        expectSapFailureClass(err, [404], [/not found/i]);
      }
      try {
        await client.getDomain(domainName);
        throw new Error('Expected domain read to fail after delete');
      } catch (err) {
        expectSapFailureClass(err, [404], [/not found/i]);
      }
    } finally {
      if (registry.getAll().some((entry) => entry.name === dataElementName)) {
        try {
          await deleteWithLock(dataElementUrl);
          registry.remove(dataElementName);
        } catch {
          // best-effort-cleanup
        }
      }
      if (registry.getAll().some((entry) => entry.name === domainName)) {
        try {
          await deleteWithLock(domainUrl);
          registry.remove(domainName);
        } catch {
          // best-effort-cleanup
        }
      }
    }
  }, 90_000);
});
