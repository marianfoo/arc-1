/**
 * CRUD lifecycle integration test for ARC-1.
 *
 * Exercises the full create -> read -> update -> activate -> delete -> verify-deleted
 * roundtrip against a live SAP system.
 *
 * Skipped automatically when TEST_SAP_URL is not configured.
 *
 * Run: npm run test:integration:crud
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AdtClient } from '../../src/adt/client.js';
import { createObject, deleteObject, lockObject, safeUpdateSource } from '../../src/adt/crud.js';
import { activate } from '../../src/adt/devtools.js';
import { buildCreateXml, CrudRegistry, cleanupAll, generateUniqueName } from './crud-harness.js';
import { getTestClient, hasSapCredentials } from './helpers.js';

const describeIf = hasSapCredentials() ? describe : describe.skip;

describeIf('CRUD lifecycle', () => {
  let client: AdtClient;
  const registry = new CrudRegistry();

  beforeAll(() => {
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

    // 7. VERIFY DELETION — read should fail
    await expect(client.getProgram(testName)).rejects.toThrow();
  }, 60_000);
});
