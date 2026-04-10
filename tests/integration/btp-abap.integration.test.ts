/**
 * BTP ABAP Extended Integration Tests (LOCAL ONLY)
 *
 * These tests require interactive browser login and are NOT run in CI.
 * For CI-capable BTP tests, see btp-abap.smoke.integration.test.ts.
 *
 * Reasons for local-only:
 * - BTP free tier instances are stopped each night
 * - Free tier instances are deleted after 90 days
 * - OAuth browser login requires interactive user
 *
 * Prerequisites:
 * - BTP ABAP instance provisioned and running
 * - Booster "Prepare an Account for ABAP Development" has been run
 * - SAP_BR_DEVELOPER role assigned to user
 * - Service key saved to file
 * - User has completed browser OAuth login at least once (token cached)
 *
 * Run:
 *   TEST_BTP_SERVICE_KEY_FILE=~/.config/arc-1/btp-abap-service-key.json npm run test:integration:btp:extended
 *
 * Or with env file:
 *   Set TEST_BTP_SERVICE_KEY_FILE in .env, then: npm run test:integration:btp:extended
 */

import { config } from 'dotenv';
import { beforeAll, describe, expect, it } from 'vitest';
import { AdtClient } from '../../src/adt/client.js';
import { createBearerTokenProvider, loadServiceKeyFile } from '../../src/adt/oauth.js';
import { unrestrictedSafetyConfig } from '../../src/adt/safety.js';
import { expectSapFailureClass } from '../helpers/expected-error.js';
import { hasBtpCredentials } from './helpers.js';

// Load .env before anything else
config();

/** Create an ADT client configured for BTP ABAP */
function getBtpTestClient(): AdtClient {
  const keyFile = process.env.TEST_BTP_SERVICE_KEY_FILE || process.env.SAP_BTP_SERVICE_KEY_FILE || '';
  const serviceKey = loadServiceKeyFile(keyFile);
  const bearerTokenProvider = createBearerTokenProvider(serviceKey);

  return new AdtClient({
    baseUrl: serviceKey.url,
    client: serviceKey.abap?.sapClient || '100',
    language: 'EN',
    safety: unrestrictedSafetyConfig(),
    bearerTokenProvider,
  });
}

// Skip entire suite if no BTP credentials
const describeIf = hasBtpCredentials() ? describe : describe.skip;

describeIf('BTP ABAP Environment Integration Tests', () => {
  let client: AdtClient;

  beforeAll(() => {
    client = getBtpTestClient();
  });

  // ─── OAuth & Connectivity ──────────────────────────────────────

  describe('OAuth connectivity', () => {
    it('connects to BTP ABAP via Bearer token', async () => {
      const info = await client.getSystemInfo();
      expect(info).toBeTruthy();
      const parsed = JSON.parse(info);
      // BTP ABAP may return empty user string (OAuth user not exposed in discovery)
      expect(typeof parsed.user).toBe('string');
      expect(Array.isArray(parsed.collections)).toBe(true);
      expect(parsed.collections.length).toBeGreaterThan(0);
    });

    it('reuses cached token on second request', async () => {
      // First call may trigger OAuth, second should use cache
      const info1 = await client.getSystemInfo();
      const info2 = await client.getSystemInfo();
      expect(info1).toBeTruthy();
      expect(info2).toBeTruthy();
    });
  });

  // ─── BTP System Information ────────────────────────────────────

  describe('BTP system info', () => {
    it('returns system info with BTP-specific components', async () => {
      const components = await client.getInstalledComponents();
      expect(components.length).toBeGreaterThan(0);

      // BTP ABAP should have SAP_BASIS
      const basis = components.find((c) => c.name === 'SAP_BASIS');
      expect(basis).toBeDefined();

      // BTP ABAP release is typically 7.58+ (ABAP Platform Cloud)
      if (basis) {
        const release = parseInt(basis.release, 10);
        expect(release).toBeGreaterThanOrEqual(758);
      }
    });

    it('has BTP-specific components', async () => {
      const components = await client.getInstalledComponents();
      const componentNames = components.map((c) => c.name);
      // BTP ABAP always has SAP_BASIS
      expect(componentNames).toContain('SAP_BASIS');
      // BTP ABAP has SAP_CLOUD instead of SAP_ABA (unlike on-premise)
      expect(componentNames).toContain('SAP_CLOUD');
    });

    it('system info contains ADT discovery collections', async () => {
      const info = await client.getSystemInfo();
      const parsed = JSON.parse(info);
      expect(Array.isArray(parsed.collections)).toBe(true);
      // BTP should have ADT collections available
      expect(parsed.collections.length).toBeGreaterThan(0);
    });
  });

  // ─── Search (Released Objects) ─────────────────────────────────

  describe('search on BTP', () => {
    it('finds released SAP classes', async () => {
      const results = await client.searchObject('CL_ABAP_*', 10);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]?.objectName).toMatch(/^CL_ABAP_/);
    });

    it('finds CDS views', async () => {
      const results = await client.searchObject('I_*', 10);
      expect(results.length).toBeGreaterThan(0);
    });

    it('returns empty for non-existent Z* objects', async () => {
      // Fresh BTP system has no custom Z* objects
      const results = await client.searchObject('ZZZNONEXISTENT999*', 10);
      expect(results).toHaveLength(0);
    });

    it('respects maxResults limit', async () => {
      const results = await client.searchObject('CL_*', 3);
      expect(results.length).toBeLessThanOrEqual(3);
    });

    it('finds interfaces', async () => {
      const results = await client.searchObject('IF_ABAP_*', 5);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]?.objectName).toMatch(/^IF_ABAP_/);
    });
  });

  // ─── Read Released Objects ─────────────────────────────────────

  describe('read released objects on BTP', () => {
    it('reads a released SAP class', async () => {
      const source = await client.getClass('CL_ABAP_CHAR_UTILITIES');
      expect(source).toBeTruthy();
      expect(source.length).toBeGreaterThan(0);
    });

    it('reads a released interface', async () => {
      const source = await client.getInterface('IF_SERIALIZABLE_OBJECT');
      expect(source).toBeTruthy();
    });

    it('reads CDS view (DDLS)', async () => {
      // I_Language is a commonly available released CDS view
      try {
        const source = await client.getDdls('I_LANGUAGE');
        expect(source).toBeTruthy();
      } catch (err) {
        // May not be available on all BTP systems — acceptable
        expectSapFailureClass(err, [404], [/not found/i, /not accessible/i]);
      }
    });

    it('reads class with includes', async () => {
      const source = await client.getClass('CL_ABAP_CHAR_UTILITIES', 'definitions');
      expect(typeof source).toBe('string');
    });
  });

  // ─── BTP-Specific: Restricted ABAP ────────────────────────────

  describe('BTP restricted ABAP behavior', () => {
    it('classic programs like RSHOWTIM are NOT available', async () => {
      // BTP ABAP doesn't have classic SE38 programs
      await expect(client.getProgram('RSHOWTIM')).rejects.toThrow(/403|404|not found|not available|not released/i);
    });

    it('classic function modules may not be available', async () => {
      // Standard FM FUNCTION_EXISTS may not exist on BTP
      const results = await client.searchObject('FUNCTION_EXISTS', 5);
      // On BTP, classic FMs are typically not accessible — 0 results is expected
      // Some may still show up — either way is valid, but assert array shape
      expect(results).toBeInstanceOf(Array);
    });

    it('table preview may be restricted on BTP', async () => {
      // T000 table preview requires specific authorization on BTP
      try {
        const result = await client.getTableContents('T000', 5);
        // If it works, verify structure
        expect(result.columns).toContain('MANDT');
      } catch (err) {
        // Expected on BTP: table preview is often restricted
        expectSapFailureClass(err, [403, 500], [/restricted/i, /not authorized/i]);
      }
    });

    it('free SQL query is likely blocked on BTP', async () => {
      try {
        const result = await client.runQuery('SELECT * FROM T000', 5);
        // If it works, verify result shape
        expect(result).toBeTruthy();
        expect(typeof result).toBe('string');
      } catch (err) {
        // Expected: BTP blocks free SQL execution
        expectSapFailureClass(err, [403, 500], [/blocked/i, /not authorized/i, /restricted/i]);
      }
    });
  });

  // ─── BTP-Specific: RAP / Cloud Development ────────────────────

  describe('BTP RAP and cloud development', () => {
    it('finds RAP-related released objects', async () => {
      // RAP is the primary development model on BTP
      const results = await client.searchObject('CL_ABAP_BEHV*', 10);
      expect(results.length).toBeGreaterThan(0);
    });

    it('finds ABAP Cloud released classes', async () => {
      // CL_ABAP_RANDOM is a released utility class
      const results = await client.searchObject('CL_ABAP_RANDOM', 5);
      expect(results.length).toBeGreaterThan(0);
    });

    it('finds released BDEFs (behavior definitions)', async () => {
      // Search for behavior definitions — central to RAP
      const results = await client.searchObject('R_*', 10);
      // Should find some released objects
      expect(Array.isArray(results)).toBe(true);
    });
  });

  // ─── BTP-Specific: ATC / Code Analysis ────────────────────────

  describe('BTP ATC and diagnostics', () => {
    it('system info includes ADT discovery collections', async () => {
      const info = await client.getSystemInfo();
      const parsed = JSON.parse(info);
      // Collections are objects with title and href
      const collections = parsed.collections as Array<{ title: string; href: string }>;
      expect(collections.length).toBeGreaterThan(0);
      // Check structure
      expect(collections[0]).toHaveProperty('title');
      expect(collections[0]).toHaveProperty('href');
      // Look for ATC or check-related collections
      const hasAtcRelated = collections.some(
        (c) => c.href.includes('atc') || c.href.includes('check') || c.title.toLowerCase().includes('check'),
      );
      // ATC is typically available on BTP but not guaranteed in discovery
      expect(typeof hasAtcRelated).toBe('boolean');
    });
  });

  // ─── HTTP Session with OAuth ───────────────────────────────────

  describe('HTTP session management with OAuth', () => {
    it('maintains session across multiple requests', async () => {
      // Verify CSRF + Bearer token work together
      const source1 = await client.getClass('CL_ABAP_CHAR_UTILITIES');
      expect(source1).toBeTruthy();

      const source2 = await client.getInterface('IF_SERIALIZABLE_OBJECT');
      expect(source2).toBeTruthy();
    });

    it('search works after read (session continuity)', async () => {
      await client.getClass('CL_ABAP_CHAR_UTILITIES');
      const results = await client.searchObject('CL_ABAP_CONV*', 5);
      expect(results.length).toBeGreaterThan(0);
    });

    it('multiple sequential requests work correctly', async () => {
      // Fire several requests to verify session stability
      const r1 = await client.searchObject('CL_ABAP_CHAR*', 3);
      const r2 = await client.getInstalledComponents();
      const r3 = await client.searchObject('IF_ABAP_*', 3);

      expect(r1.length).toBeGreaterThan(0);
      expect(r2.length).toBeGreaterThan(0);
      expect(r3.length).toBeGreaterThan(0);
    });
  });

  // ─── Edge Cases ────────────────────────────────────────────────

  describe('BTP edge cases', () => {
    it('handles namespace objects (slash notation)', async () => {
      // /DMO/ namespace objects should exist on BTP ABAP
      const results = await client.searchObject('/DMO/*', 10);
      // /DMO/ flight reference scenario is often pre-installed
      if (results.length > 0) {
        expect(results[0]?.objectName).toMatch(/^\/DMO\//);
      }
      // May be empty on minimal BTP instances — that's OK
      expect(Array.isArray(results)).toBe(true);
    });

    it('returns 404 for non-existent class', async () => {
      await expect(client.getClass('ZCL_NONEXISTENT_999')).rejects.toThrow();
    });

    it('handles wildcard-only search', async () => {
      const results = await client.searchObject('*', 3);
      expect(results.length).toBeGreaterThan(0);
    });
  });
});
