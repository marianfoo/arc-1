/**
 * Integration tests for ARC-1 ADT client.
 *
 * These tests run against a live SAP system.
 * Missing credentials are treated as setup errors and fail the suite.
 *
 * Run: npm run test:integration
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AdtClient } from '../../src/adt/client.js';
import { getDump, listDumps, listTraces } from '../../src/adt/diagnostics.js';
import { AdtApiError } from '../../src/adt/errors.js';
import {
  createCatalog,
  deleteCatalog,
  FLP_SERVICE_PATH,
  listCatalogs,
  listGroups,
  listTiles,
} from '../../src/adt/flp.js';
import { unrestrictedSafetyConfig } from '../../src/adt/safety.js';
import { expectSapFailureClass } from '../helpers/expected-error.js';
import { requireOrSkip, SkipReason } from '../helpers/skip-policy.js';
import { getTestClient, requireSapCredentials } from './helpers.js';

describe('ADT Integration Tests', () => {
  let client: AdtClient;

  beforeAll(() => {
    requireSapCredentials();
    client = getTestClient();
  });

  // ─── System Information ─────────────────────────────────────────

  describe('system info', () => {
    it('gets structured system info with user', async () => {
      const info = await client.getSystemInfo();
      expect(info).toBeTruthy();
      // Response is structured JSON
      const parsed = JSON.parse(info);
      expect(parsed.user).toBeTruthy();
      expect(Array.isArray(parsed.collections)).toBe(true);
      // Collections may be empty on minimal SAP systems — that's OK
    });

    it('gets installed components', async () => {
      const components = await client.getInstalledComponents();
      expect(components.length).toBeGreaterThan(0);
      const basis = components.find((c) => c.name === 'SAP_BASIS');
      expect(basis).toBeDefined();
      expect(basis?.release).toBeTruthy();
    });

    it('installed components have valid structure', async () => {
      const components = await client.getInstalledComponents();
      for (const comp of components) {
        expect(comp.name).toBeTruthy();
        expect(comp.release).toBeTruthy();
        // description may be empty for some components
        expect(typeof comp.description).toBe('string');
      }
    });
  });

  // ─── FLP (PAGE_BUILDER_CUST) ────────────────────────────────────

  describe('FLP (PAGE_BUILDER_CUST)', () => {
    let serviceAvailable: true | undefined;

    beforeAll(async () => {
      try {
        await client.http.get(`${FLP_SERVICE_PATH}/`, { Accept: 'application/json' });
        serviceAvailable = true;
      } catch (err) {
        if (err instanceof AdtApiError && err.statusCode === 404) {
          serviceAvailable = undefined;
          return;
        }
        throw err;
      }
    });

    it('probes FLP service availability', async (ctx) => {
      requireOrSkip(ctx, serviceAvailable, SkipReason.BACKEND_UNSUPPORTED);
      expect(serviceAvailable).toBe(true);
    });

    it('lists catalogs', async (ctx) => {
      requireOrSkip(ctx, serviceAvailable, SkipReason.BACKEND_UNSUPPORTED);
      const catalogs = await listCatalogs(client.http, unrestrictedSafetyConfig());
      expect(Array.isArray(catalogs)).toBe(true);
      expect(catalogs.length).toBeGreaterThan(0);
      expect(catalogs.some((c) => c.id.length > 0 && c.domainId.length > 0)).toBe(true);
    }, 60000);

    it('lists groups', async (ctx) => {
      requireOrSkip(ctx, serviceAvailable, SkipReason.BACKEND_UNSUPPORTED);
      const groups = await listGroups(client.http, unrestrictedSafetyConfig());
      expect(Array.isArray(groups)).toBe(true);
      for (const group of groups) {
        expect(group.catalogId).toBe('/UI2/FLPD_CATALOG');
      }
    }, 60000);

    it('lists tiles for a catalog (returns array, may be empty)', async (ctx) => {
      requireOrSkip(ctx, serviceAvailable, SkipReason.BACKEND_UNSUPPORTED);
      const catalogs = await listCatalogs(client.http, unrestrictedSafetyConfig());
      const catalogWithPrefix = catalogs.find((c) => c.id.startsWith('X-SAP-UI2-CATALOGPAGE:'));
      requireOrSkip(ctx, catalogWithPrefix, SkipReason.NO_FIXTURE);
      // Use full ID to verify normalization handles it correctly
      const result = await listTiles(client.http, unrestrictedSafetyConfig(), catalogWithPrefix.id);
      expect(Array.isArray(result.tiles)).toBe(true);
    }, 60000);

    it('CRUD lifecycle — create and delete catalog', async (ctx) => {
      requireOrSkip(ctx, serviceAvailable, SkipReason.BACKEND_UNSUPPORTED);
      const domainId = `ZARC1_INTTEST_${Date.now().toString(36).toUpperCase()}`.slice(0, 30);
      let createdCatalogId: string | undefined;

      try {
        const created = await createCatalog(
          client.http,
          unrestrictedSafetyConfig(),
          domainId,
          'ARC1 Integration Catalog',
        );
        createdCatalogId = created.id;
        expect(created.id.startsWith('X-SAP-UI2-CATALOGPAGE:')).toBe(true);
      } finally {
        if (createdCatalogId) {
          await deleteCatalog(client.http, unrestrictedSafetyConfig(), createdCatalogId);
        }
      }
    }, 120000);
  });

  // ─── Search ─────────────────────────────────────────────────────

  describe('search', () => {
    it('searches for objects by pattern', async () => {
      const results = await client.searchObject('CL_ABAP_*', 10);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]?.objectName).toMatch(/^CL_ABAP_/);
    });

    it('returns empty results for non-existent pattern', async () => {
      const results = await client.searchObject('ZZZNONEXISTENT999*', 10);
      expect(results).toHaveLength(0);
    });

    it('respects maxResults limit', async () => {
      const results = await client.searchObject('CL_*', 3);
      expect(results.length).toBeLessThanOrEqual(3);
    });

    it('returns correct object structure', async () => {
      const results = await client.searchObject('CL_ABAP_CHAR*', 5);
      expect(results.length).toBeGreaterThan(0);
      const first = results[0]!;
      expect(first.objectName).toBeTruthy();
      expect(first.objectType).toBeTruthy();
      expect(first.uri).toBeTruthy();
    });

    it('finds programs by pattern', async () => {
      const results = await client.searchObject('RSHOWTIM*', 5);
      expect(results.length).toBeGreaterThan(0);
      // Should find RSHOWTIM as a program
      const match = results.find((r) => r.objectName === 'RSHOWTIM');
      expect(match).toBeDefined();
    });
  });

  // ─── Read Operations ────────────────────────────────────────────

  describe('read operations', () => {
    it('reads a standard SAP program', async () => {
      // RSHOWTIM is a standard SAP report available on most systems
      const source = await client.getProgram('RSHOWTIM');
      expect(source).toBeTruthy();
      // Standard SAP programs start with a comment header
      expect(source.length).toBeGreaterThan(10);
    });

    it('reads a standard SAP class', async () => {
      const source = await client.getClass('CL_ABAP_CHAR_UTILITIES');
      expect(source).toBeTruthy();
      expect(source.length).toBeGreaterThan(0);
    });

    it('reads table contents', async () => {
      const result = await client.getTableContents('T000', 5);
      expect(result.columns).toContain('MANDT');
      expect(result.rows.length).toBeGreaterThan(0);
      // Each row should have all columns
      for (const row of result.rows) {
        for (const col of result.columns) {
          expect(col in row).toBe(true);
        }
      }
    });

    it('reads table contents with row limit', async () => {
      const result = await client.getTableContents('T000', 1);
      expect(result.rows.length).toBeGreaterThanOrEqual(1);
    });

    it('returns 404 for non-existent program', async () => {
      await expect(client.getProgram('ZZZNOTEXIST999')).rejects.toThrow();
    });
  });

  // ─── DDIC Operations (Structures, Domains, Data Elements) ─────

  describe('DDIC operations', () => {
    it('reads structure definition (BAPIRET2)', async () => {
      const source = await client.getStructure('BAPIRET2');
      expect(source).toBeTruthy();
      expect(source).toContain('bapiret2');
      expect(source).toContain('message');
    });

    it('reads structure definition (SYST)', async () => {
      const source = await client.getStructure('SYST');
      expect(source).toBeTruthy();
      expect(source).toContain('syst');
      expect(source).toContain('subrc');
    });

    it('reads domain metadata (MANDT)', async () => {
      const domain = await client.getDomain('MANDT');
      expect(domain.name).toBe('MANDT');
      expect(domain.dataType).toBe('CLNT');
      expect(domain.length).toBe('000003');
      expect(domain.package).toBeTruthy();
    });

    it('reads domain metadata with value table (BUKRS)', async () => {
      const domain = await client.getDomain('BUKRS');
      expect(domain.name).toBe('BUKRS');
      expect(domain.dataType).toBe('CHAR');
      expect(domain.length).toBe('000004');
      expect(domain.valueTable).toBe('T001');
    });

    it('reads data element metadata (MANDT)', async () => {
      const dtel = await client.getDataElement('MANDT');
      expect(dtel.name).toBe('MANDT');
      expect(dtel.typeKind).toBe('domain');
      expect(dtel.typeName).toBe('MANDT');
      expect(dtel.dataType).toBe('CLNT');
      expect(dtel.package).toBeTruthy();
    });

    it('reads data element metadata with labels (BUKRS)', async () => {
      const dtel = await client.getDataElement('BUKRS');
      expect(dtel.name).toBe('BUKRS');
      expect(dtel.typeKind).toBe('domain');
      expect(dtel.typeName).toBe('BUKRS');
      expect(dtel.dataType).toBe('CHAR');
      expect(dtel.mediumLabel).toBeTruthy();
      expect(dtel.searchHelp).toBe('C_T001');
    });

    it('reads transaction metadata (SE38)', async () => {
      const tran = await client.getTransaction('SE38');
      expect(tran.code).toBe('SE38');
      expect(tran.description).toBeTruthy();
      expect(tran.package).toBeTruthy();
    });

    it('returns 404 for non-existent domain', async () => {
      await expect(client.getDomain('ZZZNOTEXIST999')).rejects.toThrow();
    });

    it('returns 404 for non-existent data element', async () => {
      await expect(client.getDataElement('ZZZNOTEXIST999')).rejects.toThrow();
    });

    it('returns empty metadata for non-existent transaction', async () => {
      // SAP's vit endpoint returns 200 with empty data for non-existent transactions
      // (unlike other ADT endpoints that return 404)
      const tran = await client.getTransaction('ZZZNOTEXIST999');
      expect(tran.code).toBe('ZZZNOTEXIST999');
      expect(tran.description).toBe('');
    });
  });

  // ─── Class Operations ───────────────────────────────────────────

  describe('class operations', () => {
    it('reads class main source', async () => {
      const source = await client.getClass('CL_ABAP_CHAR_UTILITIES');
      expect(source).toBeTruthy();
    });

    it('reads class with specific include', async () => {
      // Try reading definitions include
      try {
        const source = await client.getClass('CL_ABAP_CHAR_UTILITIES', 'definitions');
        expect(typeof source).toBe('string');
        expect(source.length).toBeGreaterThan(0);
      } catch (err) {
        // Include may not be available on all systems — expect 404 or similar
        expectSapFailureClass(err, [404, 500], [/not found/i, /does not exist/i]);
      }
    });

    it('returns error for non-existent class', async () => {
      await expect(client.getClass('ZCL_NONEXISTENT_999')).rejects.toThrow();
    });

    it('reads class local definitions include', async () => {
      const source = await client.getClass('/DMO/CL_FLIGHT_AMDP', 'definitions');
      expect(typeof source).toBe('string');
      expect(source).toContain('=== definitions ===');
    });

    it('reads class local implementations include', async () => {
      const source = await client.getClass('/DMO/CL_FLIGHT_AMDP', 'implementations');
      expect(typeof source).toBe('string');
      expect(source).toContain('=== implementations ===');
    });

    it('reads class with multiple includes', async () => {
      const source = await client.getClass('/DMO/CL_FLIGHT_AMDP', 'definitions,implementations');
      expect(source).toContain('=== definitions ===');
      expect(source).toContain('=== implementations ===');
    });

    it('gracefully handles non-existent testclasses include', async () => {
      // If the class has no test classes, should return a helpful note rather than throwing
      const source = await client.getClass('/DMO/CL_FLIGHT_AMDP', 'testclasses');
      expect(typeof source).toBe('string');
      expect(source).toContain('testclasses');
    });

    it('reads full class source without include (default)', async () => {
      const source = await client.getClass('/DMO/CL_FLIGHT_AMDP');
      expect(source).toBeTruthy();
      expect(source.length).toBeGreaterThan(0);
    });
  });

  // ─── Interface Operations ───────────────────────────────────────

  describe('interface operations', () => {
    it('reads a standard SAP interface', async () => {
      // IF_SERIALIZABLE_OBJECT exists on all systems
      try {
        const source = await client.getInterface('IF_SERIALIZABLE_OBJECT');
        expect(typeof source).toBe('string');
        expect(source.length).toBeGreaterThan(0);
      } catch (err) {
        // Interface may not exist on minimal systems — expect 404 or not-found
        expectSapFailureClass(err, [404], [/not found/i, /does not exist/i]);
      }
    });
  });

  // ─── Function Module Operations ─────────────────────────────────

  describe('function module operations', () => {
    it('reads function group structure', async () => {
      // Try a standard function group
      try {
        const results = await client.searchObject('FUNCTION_EXISTS', 1);
        expect(Array.isArray(results)).toBe(true);
      } catch (err) {
        // Search may fail on restricted systems — expect known error shape
        expectSapFailureClass(err, [404, 403, 500], [/not found/i, /search/i]);
      }
    });
  });

  // CRUD lifecycle test moved to tests/integration/crud.lifecycle.integration.test.ts
  // This section previously only verified search — full create/read/update/activate/delete
  // lifecycle is now covered by the dedicated suite.

  // ─── Safety Checks ──────────────────────────────────────────────

  describe('safety', () => {
    it('read-only client can still read', async () => {
      const { AdtClient } = await import('../../src/adt/client.js');
      const roClient = new AdtClient({
        baseUrl: process.env.TEST_SAP_URL || process.env.SAP_URL || '',
        username: process.env.TEST_SAP_USER || process.env.SAP_USER || '',
        password: process.env.TEST_SAP_PASSWORD || process.env.SAP_PASSWORD || '',
        client: process.env.TEST_SAP_CLIENT || process.env.SAP_CLIENT || '100',
        insecure: (process.env.TEST_SAP_INSECURE || process.env.SAP_INSECURE) === 'true',
        safety: {
          readOnly: true,
          blockFreeSQL: true,
          allowedOps: 'RS',
          disallowedOps: '',
          allowedPackages: [],
          dryRun: false,
          enableTransports: false,
          transportReadOnly: false,
          allowedTransports: [],
        },
      });

      // Read should work
      const source = await roClient.getProgram('RSHOWTIM');
      expect(source).toBeTruthy();
    });

    it('read-only client can search', async () => {
      const { AdtClient } = await import('../../src/adt/client.js');
      const roClient = new AdtClient({
        baseUrl: process.env.TEST_SAP_URL || process.env.SAP_URL || '',
        username: process.env.TEST_SAP_USER || process.env.SAP_USER || '',
        password: process.env.TEST_SAP_PASSWORD || process.env.SAP_PASSWORD || '',
        client: process.env.TEST_SAP_CLIENT || process.env.SAP_CLIENT || '100',
        insecure: (process.env.TEST_SAP_INSECURE || process.env.SAP_INSECURE) === 'true',
        safety: {
          readOnly: true,
          blockFreeSQL: true,
          allowedOps: 'RS',
          disallowedOps: '',
          allowedPackages: [],
          dryRun: false,
          enableTransports: false,
          transportReadOnly: false,
          allowedTransports: [],
        },
      });

      const results = await roClient.searchObject('CL_ABAP_*', 3);
      expect(results.length).toBeGreaterThan(0);
    });

    it('read-only client blocks free SQL', async () => {
      const { AdtClient } = await import('../../src/adt/client.js');
      const roClient = new AdtClient({
        baseUrl: process.env.TEST_SAP_URL || process.env.SAP_URL || '',
        username: process.env.TEST_SAP_USER || process.env.SAP_USER || '',
        password: process.env.TEST_SAP_PASSWORD || process.env.SAP_PASSWORD || '',
        client: process.env.TEST_SAP_CLIENT || process.env.SAP_CLIENT || '100',
        insecure: (process.env.TEST_SAP_INSECURE || process.env.SAP_INSECURE) === 'true',
        safety: {
          readOnly: true,
          blockFreeSQL: true,
          allowedOps: 'RSQ',
          disallowedOps: '',
          allowedPackages: [],
          dryRun: false,
          enableTransports: false,
          transportReadOnly: false,
          allowedTransports: [],
        },
      });

      await expect(roClient.runQuery('SELECT * FROM T000')).rejects.toThrow();
    });
  });

  // ─── HTTP Cookie Jar (CSRF + Session) ───────────────────────────

  describe('HTTP session management', () => {
    it('maintains session cookies across requests', async () => {
      // This test verifies the cookie jar fix — CSRF token + session cookie correlation
      // First request (GET) should establish a session, POST should reuse it
      const source = await client.getProgram('RSHOWTIM');
      expect(source).toBeTruthy();

      // Second request should work with the same session
      const source2 = await client.getClass('CL_ABAP_CHAR_UTILITIES');
      expect(source2).toBeTruthy();
    });

    it('POST requests work (CSRF + cookie correlation)', async () => {
      // getTableContents uses POST — tests CSRF token + session cookie
      const result = await client.getTableContents('T000', 2);
      expect(result.columns).toContain('MANDT');
    });

    it('multiple POST requests work in sequence', async () => {
      // Ensure cookies persist across multiple POST calls
      const r1 = await client.getTableContents('T000', 1);
      expect(r1.rows.length).toBeGreaterThan(0);

      const r2 = await client.getTableContents('T000', 2);
      expect(r2.rows.length).toBeGreaterThan(0);
    });
  });

  // ─── Edge Cases ─────────────────────────────────────────────────

  describe('edge cases', () => {
    it('handles special characters in search query', async () => {
      // Search with asterisk wildcard
      const results = await client.searchObject('*', 3);
      expect(results.length).toBeGreaterThan(0);
    });

    it('handles empty search query', async () => {
      // Edge case: both outcomes are acceptable, but we assert the shape of whichever occurs
      try {
        const results = await client.searchObject('', 1);
        expect(Array.isArray(results)).toBe(true);
      } catch (err) {
        // SAP may reject empty search — assert it's a known error shape
        expectSapFailureClass(err, [400, 404, 500], [/search/i, /invalid/i, /empty/i]);
      }
    });

    it('table contents with maxRows=0 returns something', async () => {
      // Edge case: both outcomes are acceptable, but we assert the shape of whichever occurs
      try {
        const result = await client.getTableContents('T000', 0);
        expect(result.columns).toContain('MANDT');
      } catch (err) {
        // Some systems may reject 0 as invalid — assert known error shape
        expectSapFailureClass(err, [400, 404, 500], [/invalid/i, /rows/i]);
      }
    });
  });

  // ─── Runtime Diagnostics ──────────────────────────────────────────

  describe('runtime diagnostics', () => {
    describe('short dumps', () => {
      it('lists dumps (may be empty)', async () => {
        const dumps = await listDumps(client.http, unrestrictedSafetyConfig());
        expect(Array.isArray(dumps)).toBe(true);
        if (dumps.length > 0) {
          // Verify structure
          expect(dumps[0]).toHaveProperty('id');
          expect(dumps[0]).toHaveProperty('timestamp');
          expect(dumps[0]).toHaveProperty('user');
          expect(dumps[0]).toHaveProperty('error');
          expect(dumps[0]).toHaveProperty('program');
        }
      });

      it('lists dumps with maxResults limit', async () => {
        const dumps = await listDumps(client.http, unrestrictedSafetyConfig(), { maxResults: 2 });
        expect(Array.isArray(dumps)).toBe(true);
        expect(dumps.length).toBeLessThanOrEqual(2);
      });

      it('lists dumps filtered by current user', async (ctx) => {
        const user = (process.env.TEST_SAP_USER || process.env.SAP_USER || '').toUpperCase();
        requireOrSkip(ctx, user || undefined, SkipReason.NO_CREDENTIALS);
        const dumps = await listDumps(client.http, unrestrictedSafetyConfig(), { user, maxResults: 5 });
        expect(Array.isArray(dumps)).toBe(true);
        // All returned dumps should be for this user
        for (const dump of dumps) {
          expect(dump.user.toUpperCase()).toBe(user);
        }
      });

      it('gets dump detail if dumps exist', async (ctx) => {
        const dumps = await listDumps(client.http, unrestrictedSafetyConfig(), { maxResults: 1 });
        if (dumps.length === 0) {
          ctx.skip(SkipReason.NO_DUMPS);
          return;
        }
        const detail = await getDump(client.http, unrestrictedSafetyConfig(), dumps[0]!.id);
        expect(detail.error).toBeTruthy();
        // exception may be empty for system-level dumps (not all dumps are ABAP exceptions)
        expect(typeof detail.exception).toBe('string');
        expect(detail.program).toBeTruthy();
        expect(detail.formattedText).toBeTruthy();
        expect(detail.formattedText).toContain(detail.error);
        expect(detail.chapters.length).toBeGreaterThan(0);
      });
    });

    describe('ABAP traces', () => {
      it('lists traces (may be empty)', async () => {
        const traces = await listTraces(client.http, unrestrictedSafetyConfig());
        expect(Array.isArray(traces)).toBe(true);
        if (traces.length > 0) {
          expect(traces[0]).toHaveProperty('id');
          expect(traces[0]).toHaveProperty('title');
          expect(traces[0]).toHaveProperty('timestamp');
        }
      });
    });
  });

  // ─── Structured Class Read (AFF) ─────────────────────────────────

  describe('structured class read', () => {
    it('reads class metadata', async () => {
      const metadata = await client.getClassMetadata('CL_ABAP_CHAR_UTILITIES');
      expect(metadata.description).toBeTruthy();
      expect(metadata.language).toBeTruthy();
      expect(metadata.package).toBeTruthy();
      expect(metadata.name).toBe('CL_ABAP_CHAR_UTILITIES');
      expect(typeof metadata.fixPointArithmetic).toBe('boolean');
    });

    it('reads class with structured format', async () => {
      const result = await client.getClassStructured('CL_ABAP_CHAR_UTILITIES');
      // Metadata should be populated
      expect(result.metadata.description).toBeTruthy();
      expect(result.metadata.package).toBeTruthy();
      // Main source should be non-empty
      expect(result.main).toBeTruthy();
      expect(result.main.length).toBeGreaterThan(0);
      // Includes should be string or null
      for (const include of ['testclasses', 'definitions', 'implementations', 'macros'] as const) {
        expect(result[include] === null || typeof result[include] === 'string').toBe(true);
      }
    });

    it('returns error for non-existent class metadata', async () => {
      await expect(client.getClassMetadata('ZCL_NONEXISTENT_999')).rejects.toThrow();
    });
  });

  // ─── Batch Create (AFF) ─────────────────────────────────────────

  describe('batch create in $TMP', () => {
    const suffix = Date.now().toString(36).toUpperCase();
    const prog1 = `ZARC1_BAT1_${suffix}`;
    const prog2 = `ZARC1_BAT2_${suffix}`;
    const createdPrograms: string[] = [];

    afterAll(async () => {
      // Clean up: delete any programs created during the test
      const { deleteObject, lockObject } = await import('../../src/adt/crud.js');
      const { unrestrictedSafetyConfig } = await import('../../src/adt/safety.js');
      const safety = unrestrictedSafetyConfig();
      for (const name of createdPrograms) {
        try {
          const objectUrl = `/sap/bc/adt/programs/programs/${encodeURIComponent(name)}`;
          await client.http.withStatefulSession(async (session) => {
            const lock = await lockObject(session, safety, objectUrl);
            await deleteObject(session, safety, objectUrl, lock.lockHandle);
          });
        } catch {
          // best-effort-cleanup
        }
      }
    });

    it('creates multiple programs in sequence', async () => {
      const { createObject } = await import('../../src/adt/crud.js');
      const { buildCreateXml } = await import('../../src/handlers/intent.js');
      const { unrestrictedSafetyConfig } = await import('../../src/adt/safety.js');
      const safety = unrestrictedSafetyConfig();

      // Create first program
      const xml1 = buildCreateXml('PROG', prog1, '$TMP', 'ARC1 batch test 1');
      await createObject(client.http, safety, '/sap/bc/adt/programs/programs', xml1);
      createdPrograms.push(prog1);

      // Create second program
      const xml2 = buildCreateXml('PROG', prog2, '$TMP', 'ARC1 batch test 2');
      await createObject(client.http, safety, '/sap/bc/adt/programs/programs', xml2);
      createdPrograms.push(prog2);

      // Verify both exist by reading them
      const source1 = await client.getProgram(prog1);
      expect(typeof source1).toBe('string');

      const source2 = await client.getProgram(prog2);
      expect(typeof source2).toBe('string');
    });
  });

  // ─── DDLX (Metadata Extension) Operations ─────────────────────────

  describe('DDLX read operations', () => {
    it('reads a DDLX metadata extension source', async () => {
      // /DMO/C_AGENCYTP is a standard demo DDLX from the Flight Reference Scenario
      const source = await client.getDdlx('/DMO/C_AGENCYTP');
      expect(source).toBeTruthy();
      expect(source).toContain('@Metadata.layer');
      expect(source).toContain('annotate');
    });

    it('reads DDLX with UI annotations', async () => {
      const source = await client.getDdlx('/DMO/C_TRAVEL_A_D');
      expect(source).toBeTruthy();
      expect(source).toContain('@UI');
    });

    it('returns 404 for non-existent DDLX', async () => {
      await expect(client.getDdlx('ZZZNOTEXIST_DDLX_999')).rejects.toThrow();
    });
  });

  // ─── SRVB (Service Binding) Operations ─────────────────────────────

  describe('SRVB read operations', () => {
    it('reads a service binding and returns parsed JSON', async () => {
      // /DMO/UI_AGENCY_O4 is a standard demo SRVB from the Flight Reference Scenario
      const result = await client.getSrvb('/DMO/UI_AGENCY_O4');
      const parsed = JSON.parse(result);
      expect(parsed.name).toBe('/DMO/UI_AGENCY_O4');
      expect(parsed.type).toBe('SRVB/SVB');
      expect(parsed.odataVersion).toBe('V4');
      expect(parsed.bindingType).toBe('ODATA');
      expect(parsed.bindingCategory).toBe('UI');
      expect(parsed.serviceDefinition).toBeTruthy();
    });

    it('reads a V2 service binding', async () => {
      const result = await client.getSrvb('/DMO/UI_TRAVEL_U_V2');
      const parsed = JSON.parse(result);
      expect(parsed.name).toBe('/DMO/UI_TRAVEL_U_V2');
      expect(parsed.odataVersion).toBe('V2');
    });

    it('returns 404 for non-existent SRVB', async () => {
      await expect(client.getSrvb('ZZZNOTEXIST_SRVB_999')).rejects.toThrow();
    });
  });
});
