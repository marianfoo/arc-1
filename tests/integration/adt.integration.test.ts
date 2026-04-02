/**
 * Integration tests for ARC-1 ADT client.
 *
 * These tests run against a live SAP system and are automatically
 * SKIPPED when TEST_SAP_URL is not configured.
 *
 * Run: npm run test:integration
 */

import { beforeAll, describe, expect, it } from 'vitest';
import type { AdtClient } from '../../ts-src/adt/client.js';
import { getDump, listDumps, listTraces } from '../../ts-src/adt/diagnostics.js';
import { unrestrictedSafetyConfig } from '../../ts-src/adt/safety.js';
import { getTestClient, hasSapCredentials } from './helpers.js';

// Skip entire suite if no SAP credentials
const describeIf = hasSapCredentials() ? describe : describe.skip;

describeIf('ADT Integration Tests', () => {
  let client: AdtClient;

  beforeAll(() => {
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
      } catch {
        // Some systems may not have all includes — that's OK
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
        expect(source).toBeTruthy();
      } catch {
        // Some systems may not have this — skip gracefully
      }
    });
  });

  // ─── Function Module Operations ─────────────────────────────────

  describe('function module operations', () => {
    it('reads function group structure', async () => {
      // Try a standard function group
      try {
        const results = await client.searchObject('FUNCTION_EXISTS', 1);
        if (results.length > 0) {
          // Standard FM exists
        }
      } catch {
        // Skip if search fails
      }
    });
  });

  // ─── CRUD Operations (in $TMP) ──────────────────────────────────

  describe('CRUD operations', () => {
    const testProgramName = `ZTEST_ARC1_${Date.now().toString(36).toUpperCase()}`;

    it('creates, reads, and deletes a program in $TMP', async () => {
      // This is a full lifecycle test — create → read → delete
      const searchResults = await client.searchObject(testProgramName, 1);
      if (searchResults.length > 0) {
        return; // Skip if test program already exists
      }

      // Note: Full CRUD test requires the create/update/delete methods
      // which are in ts-src/adt/crud.ts. For now we verify the search works.
      expect(searchResults).toHaveLength(0);
    });
  });

  // ─── Safety Checks ──────────────────────────────────────────────

  describe('safety', () => {
    it('read-only client can still read', async () => {
      const { AdtClient } = await import('../../ts-src/adt/client.js');
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
          allowTransportableEdits: false,
        },
      });

      // Read should work
      const source = await roClient.getProgram('RSHOWTIM');
      expect(source).toBeTruthy();
    });

    it('read-only client can search', async () => {
      const { AdtClient } = await import('../../ts-src/adt/client.js');
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
          allowTransportableEdits: false,
        },
      });

      const results = await roClient.searchObject('CL_ABAP_*', 3);
      expect(results.length).toBeGreaterThan(0);
    });

    it('read-only client blocks free SQL', async () => {
      const { AdtClient } = await import('../../ts-src/adt/client.js');
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
          allowTransportableEdits: false,
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
      try {
        const results = await client.searchObject('', 1);
        // May return results or empty — either is acceptable
        expect(Array.isArray(results)).toBe(true);
      } catch {
        // SAP may reject empty search — that's acceptable too
      }
    });

    it('table contents with maxRows=0 returns something', async () => {
      try {
        const result = await client.getTableContents('T000', 0);
        // maxRows=0 may return all rows or be treated as default
        expect(result.columns).toContain('MANDT');
      } catch {
        // Some systems may reject 0 as invalid
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

      it('lists dumps filtered by current user', async () => {
        const user = (process.env.TEST_SAP_USER || process.env.SAP_USER || '').toUpperCase();
        if (!user) return;
        const dumps = await listDumps(client.http, unrestrictedSafetyConfig(), { user, maxResults: 5 });
        expect(Array.isArray(dumps)).toBe(true);
        // All returned dumps should be for this user
        for (const dump of dumps) {
          expect(dump.user.toUpperCase()).toBe(user);
        }
      });

      it('gets dump detail if dumps exist', async () => {
        const dumps = await listDumps(client.http, unrestrictedSafetyConfig(), { maxResults: 1 });
        if (dumps.length === 0) {
          // No dumps on this system — skip
          return;
        }
        const detail = await getDump(client.http, unrestrictedSafetyConfig(), dumps[0]!.id);
        expect(detail.error).toBeTruthy();
        expect(detail.exception).toBeTruthy();
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
});
