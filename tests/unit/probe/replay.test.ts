/**
 * Replay-based probe tests.
 *
 * Reads a fixture directory produced by `scripts/probe-adt-types.ts
 * --save-fixtures <dir>` and re-runs the classifier against it. This is the
 * regression guard for changes to runner.ts/classifyVerdict — any shift in
 * decision logic for the recorded responses shows up here.
 *
 * The synthetic-752 fixture is hand-crafted to cover the decision branches
 * that matter (available-high, available-medium, unavailable-high, ambiguous,
 * auth-blocked). Real-system fixtures contributed by users drop in next to it.
 */

import { describe, expect, it } from 'vitest';
import { CATALOG, getCatalogEntry } from '../../../src/probe/catalog.js';
import { createReplayFetcher, discoveryMapFromMeta } from '../../../src/probe/fixtures.js';
import { computeQuality } from '../../../src/probe/quality.js';
import { probeType } from '../../../src/probe/runner.js';

const SYNTHETIC_752 = 'tests/fixtures/probe/synthetic-752';
const S4HANA_2023 = 'tests/fixtures/probe/s4hana-2023-onprem';

describe('probe replay — synthetic 7.52 fixture', () => {
  it('classifies each recorded type correctly', async () => {
    const { fetcher, meta } = createReplayFetcher(SYNTHETIC_752);
    const discoveryMap = discoveryMapFromMeta(meta);

    const verdicts: Record<string, string> = {};
    for (const type of ['TABL', 'BDEF', 'DDLS', 'AUTH', 'DOMA']) {
      const entry = getCatalogEntry(type);
      if (!entry) throw new Error(`Missing catalog entry for ${type}`);
      const result = await probeType(fetcher, entry, discoveryMap, meta.abapRelease);
      verdicts[type] = result.verdict;
    }

    // TABL: discovery YES + collection 200 + T000 200 → highest confidence
    expect(verdicts.TABL).toBe('available-high');

    // BDEF: discovery NO + collection 404 + no known object + release 752<754 → highest negative
    expect(verdicts.BDEF).toBe('unavailable-high');

    // DDLS: discovery YES + collection 400 (valid! bad params) + no known object.
    // #94/#95 guard: 400 must NOT be classified as unavailable.
    expect(verdicts.DDLS).toBe('available-high');

    // AUTH: collection 403 + ACTVT/MANDT 403 → uniform auth block
    expect(verdicts.AUTH).toBe('auth-blocked');

    // DOMA: discovery YES + collection 200 + ABAP_BOOL 200 → authoritative
    expect(verdicts.DOMA).toBe('available-high');
  });

  it('returns synthetic network-error when a URL has no recorded response', async () => {
    const { fetcher } = createReplayFetcher(SYNTHETIC_752);
    const result = await fetcher('/sap/bc/adt/nonexistent', 'GET');
    expect(result.networkError).toBe(true);
    expect(result.errorMessage).toMatch(/no recorded response/i);
  });

  it('aggregates quality metrics consistent with the recorded responses', async () => {
    const { fetcher, meta } = createReplayFetcher(SYNTHETIC_752);
    const discoveryMap = discoveryMapFromMeta(meta);

    const results = [];
    for (const entry of CATALOG) {
      results.push(await probeType(fetcher, entry, discoveryMap, meta.abapRelease));
    }
    const q = computeQuality(results);
    // Discovery is always definitive (the fixture ships a discovery map).
    expect(q.coverage.discovery).toBe(1);
    // Release was detected, so release coverage is 1.
    expect(q.coverage.release).toBe(1);
    // Synthetic fixture deliberately leaves most types with no recorded responses
    // so that their collection GET reports networkError — this is the "we don't
    // know yet" signal and is expected to drive a lot of verdicts to ambiguous.
    // Just sanity-check that the aggregation ran without throwing.
    expect(q.verdictHistogram).toBeDefined();
  });
});

describe('probe replay — s4hana-2023-onprem fixture (recorded from real A4H)', () => {
  it('captures S/4HANA 2023 product markers (not just SAP_BASIS)', async () => {
    const { meta } = createReplayFetcher(S4HANA_2023);
    expect(meta.abapRelease).toBe('758');
    // S4FND 108 is the canonical marker for S/4HANA 2023 — proves this fixture
    // is not a plain NetWeaver system. Guards against label drift.
    const s4fnd = meta.products?.find((p) => p.name.toUpperCase() === 'S4FND');
    expect(s4fnd?.release).toBe('108');
  });

  it('reports all RAP types as available on a modern on-prem 7.58 S/4 system', async () => {
    const { fetcher, meta } = createReplayFetcher(S4HANA_2023);
    const discoveryMap = discoveryMapFromMeta(meta);

    expect(meta.abapRelease).toBe('758');

    // RAP types (DDLS, BDEF, SRVD, SRVB) must come back available on 7.58 —
    // this is the regression guard for the #162 scenario: a system that clearly
    // supports RAP must NOT be classified as unavailable.
    for (const type of ['DDLS', 'BDEF', 'SRVD', 'SRVB', 'DCLS', 'DDLX']) {
      const entry = getCatalogEntry(type);
      if (!entry) throw new Error(`Missing catalog entry for ${type}`);
      const result = await probeType(fetcher, entry, discoveryMap, meta.abapRelease);
      expect(result.verdict, `${type} on 7.58 should be available`).toMatch(/^available-/);
    }
  });

  it('reports zero unavailable or ambiguous types on the recorded 7.58 run', async () => {
    const { fetcher, meta } = createReplayFetcher(S4HANA_2023);
    const discoveryMap = discoveryMapFromMeta(meta);

    const results = [];
    for (const entry of CATALOG) {
      results.push(await probeType(fetcher, entry, discoveryMap, meta.abapRelease));
    }
    const q = computeQuality(results);

    expect(q.verdictHistogram['unavailable-high']).toBe(0);
    expect(q.verdictHistogram['unavailable-likely']).toBe(0);
    expect(q.verdictHistogram.ambiguous).toBe(0);
    // Every type in the catalog is either available or auth-blocked on this system.
    const verdictSum =
      q.verdictHistogram['available-high'] +
      q.verdictHistogram['available-medium'] +
      q.verdictHistogram['auth-blocked'];
    expect(verdictSum).toBe(CATALOG.length);
  });
});
