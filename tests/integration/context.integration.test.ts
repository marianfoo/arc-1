/**
 * Integration tests for SAPContext dependency compression.
 *
 * These tests run against a live SAP system (A4H at a4h.marianzeis.de:50000)
 * and are automatically SKIPPED when TEST_SAP_URL is not configured.
 *
 * Test objects:
 * - /DMO/CL_FLIGHT_LEGACY: Rich class with interface + exception deps
 * - /DMO/IF_FLIGHT_LEGACY: Interface with many type references
 * - ZCL_DEMO_D_CALC_AMOUNT: Class inheriting from BOBF superclass
 *
 * Run: npm run test:integration
 */

import { beforeAll, describe, expect, it } from 'vitest';
import type { AdtClient } from '../../ts-src/adt/client.js';
import { compressContext } from '../../ts-src/context/compressor.js';
import { extractContract } from '../../ts-src/context/contract.js';
import { extractDependencies } from '../../ts-src/context/deps.js';
import { getTestClient, hasSapCredentials } from './helpers.js';

const describeIf = hasSapCredentials() ? describe : describe.skip;

describeIf('SAPContext Integration Tests', () => {
  let client: AdtClient;

  beforeAll(() => {
    client = getTestClient();
  });

  // ─── Dependency Extraction on Real Sources ─────────────────────────

  describe('dependency extraction', () => {
    it('extracts dependencies from /DMO/CL_FLIGHT_LEGACY', async () => {
      const source = await client.getClass('/DMO/CL_FLIGHT_LEGACY');
      const deps = extractDependencies(source, '/DMO/CL_FLIGHT_LEGACY', false);

      // This class implements /DMO/IF_FLIGHT_LEGACY and raises /DMO/CX_FLIGHT_LEGACY
      const names = deps.map((d) => d.name.toUpperCase());

      // Should find the interface implementation
      expect(names).toContain('/DMO/IF_FLIGHT_LEGACY');

      // Should find exception class references
      expect(names).toContain('/DMO/CX_FLIGHT_LEGACY');

      // Should have multiple dependencies
      expect(deps.length).toBeGreaterThan(2);

      // Each dep should have a valid line number
      for (const dep of deps) {
        expect(dep.line).toBeGreaterThan(0);
        expect(dep.name).toBeTruthy();
        expect(dep.kind).toBeTruthy();
      }
    });

    it('extracts dependencies from /DMO/IF_FLIGHT_LEGACY', async () => {
      const source = await client.getInterface('/DMO/IF_FLIGHT_LEGACY');
      const deps = extractDependencies(source, '/DMO/IF_FLIGHT_LEGACY', false);

      // Interface has many type references to /DMO/* data types
      expect(deps.length).toBeGreaterThan(0);
    });

    it('extracts INHERITING FROM from ZCL_DEMO_D_CALC_AMOUNT', async () => {
      const source = await client.getClass('ZCL_DEMO_D_CALC_AMOUNT');
      const deps = extractDependencies(source, 'ZCL_DEMO_D_CALC_AMOUNT', false);

      // This class inherits from /BOBF/CL_LIB_D_SUPERCL_SIMPLE
      const inheritDep = deps.find((d) => d.kind === 'inheritance');
      expect(inheritDep).toBeDefined();
      expect(inheritDep?.name.toUpperCase()).toContain('BOBF');
    });
  });

  // ─── Contract Extraction on Real Sources ───────────────────────────

  describe('contract extraction', () => {
    it('extracts class contract with public section only', async () => {
      const source = await client.getClass('/DMO/CL_FLIGHT_LEGACY');
      const contract = extractContract(source, '/DMO/CL_FLIGHT_LEGACY', 'CLAS');

      expect(contract.success).toBe(true);
      expect(contract.type).toBe('CLAS');
      expect(contract.methodCount).toBeGreaterThan(0);

      // Contract should be significantly smaller than full source
      expect(contract.source.length).toBeLessThan(source.length);

      // Should contain PUBLIC SECTION
      expect(contract.source.toUpperCase()).toContain('PUBLIC SECTION');

      // Should NOT contain IMPLEMENTATION
      expect(contract.source.toUpperCase()).not.toContain('CLASS IMPLEMENTATION');
    });

    it('extracts interface contract (full source)', async () => {
      const source = await client.getInterface('/DMO/IF_FLIGHT_LEGACY');
      const contract = extractContract(source, '/DMO/IF_FLIGHT_LEGACY', 'INTF');

      expect(contract.success).toBe(true);
      expect(contract.type).toBe('INTF');
      // Interface contract should be approximately the same size as source
      expect(contract.source.length).toBeGreaterThan(0);
    });
  });

  // ─── Full Compression Pipeline ────────────────────────────────────

  describe('full compression', () => {
    it('compresses context for /DMO/CL_FLIGHT_LEGACY', async () => {
      const source = await client.getClass('/DMO/CL_FLIGHT_LEGACY');
      const result = await compressContext(client, source, '/DMO/CL_FLIGHT_LEGACY', 'CLAS', 5, 1);

      // Should have resolved at least some dependencies
      expect(result.depsResolved).toBeGreaterThan(0);
      expect(result.output).toContain('Dependency context for /DMO/CL_FLIGHT_LEGACY');
      expect(result.output).toContain('Stats:');

      // Output should be reasonable size
      expect(result.totalLines).toBeGreaterThan(5);
    }, 30000); // 30s timeout for SAP calls

    it('compresses context with depth=2', async () => {
      const source = await client.getClass('/DMO/CL_FLIGHT_LEGACY');
      const shallow = await compressContext(client, source, '/DMO/CL_FLIGHT_LEGACY', 'CLAS', 3, 1);
      const deep = await compressContext(client, source, '/DMO/CL_FLIGHT_LEGACY', 'CLAS', 3, 2);

      // Depth=2 should resolve at least as many as depth=1
      expect(deep.depsResolved).toBeGreaterThanOrEqual(shallow.depsResolved);
    }, 60000); // 60s timeout

    it('handles maxDeps limit correctly', async () => {
      const source = await client.getClass('/DMO/CL_FLIGHT_LEGACY');
      const result = await compressContext(client, source, '/DMO/CL_FLIGHT_LEGACY', 'CLAS', 2, 1);

      // Should resolve at most 2
      expect(result.depsResolved).toBeLessThanOrEqual(2);
    }, 30000);

    it('compresses interface context', async () => {
      const source = await client.getInterface('/DMO/IF_FLIGHT_LEGACY');
      const result = await compressContext(client, source, '/DMO/IF_FLIGHT_LEGACY', 'INTF', 5, 1);

      expect(result.output).toContain('Dependency context for /DMO/IF_FLIGHT_LEGACY');
    }, 30000);
  });

  // ─── SAPManage Feature Probing ────────────────────────────────────

  describe('SAPManage feature probing', () => {
    it('probes features successfully', async () => {
      const { probeFeatures } = await import('../../ts-src/adt/features.js');
      const { defaultFeatureConfig } = await import('../../ts-src/adt/config.js');

      const features = await probeFeatures(client.http, defaultFeatureConfig());

      // Should return all 6 features
      expect(features.hana).toBeDefined();
      expect(features.abapGit).toBeDefined();
      expect(features.rap).toBeDefined();
      expect(features.amdp).toBeDefined();
      expect(features.ui5).toBeDefined();
      expect(features.transport).toBeDefined();

      // Each feature should have required fields
      const featureKeys = ['hana', 'abapGit', 'rap', 'amdp', 'ui5', 'transport'] as const;
      for (const key of featureKeys) {
        const feature = features[key];
        expect(typeof feature.available).toBe('boolean');
        expect(feature.mode).toBe('auto');
        expect(feature.message).toBeTruthy();
      }

      // Transport should be available on A4H
      expect(features.transport.available).toBe(true);

      // Should detect ABAP release from SAP_BASIS
      expect(features.abapRelease).toBeDefined();
      expect(features.abapRelease).toMatch(/^\d{3}/); // e.g. "750", "757"
    }, 15000);
  });
});
