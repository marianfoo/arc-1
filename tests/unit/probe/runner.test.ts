import { describe, expect, it } from 'vitest';
import {
  classifyHttp,
  classifyRelease,
  classifyVerdict,
  type HttpProbeFn,
  parseRelease,
  probeKnownObject,
  probeType,
  resolveDiscovery,
} from '../../../src/probe/runner.js';
import type { CatalogEntry } from '../../../src/probe/types.js';

describe('probe runner — pure classifiers', () => {
  describe('parseRelease', () => {
    it('parses numeric releases', () => {
      expect(parseRelease('750')).toBe(750);
      expect(parseRelease('757')).toBe(757);
    });
    it('strips non-digits (e.g. "7.57")', () => {
      expect(parseRelease('7.57')).toBe(757);
    });
    it('returns null for unparseable strings', () => {
      expect(parseRelease('sap_btp')).toBe(null);
      expect(parseRelease(undefined)).toBe(null);
      expect(parseRelease('')).toBe(null);
    });
  });

  describe('classifyHttp', () => {
    it('maps status ranges to buckets', () => {
      expect(classifyHttp({ statusCode: 200, durationMs: 1 })).toBe('ok-2xx');
      expect(classifyHttp({ statusCode: 204, durationMs: 1 })).toBe('ok-2xx');
      expect(classifyHttp({ statusCode: 400, durationMs: 1 })).toBe('ok-400-bad-params');
      expect(classifyHttp({ statusCode: 401, durationMs: 1 })).toBe('auth-blocked');
      expect(classifyHttp({ statusCode: 403, durationMs: 1 })).toBe('auth-blocked');
      expect(classifyHttp({ statusCode: 404, durationMs: 1 })).toBe('not-found');
      expect(classifyHttp({ statusCode: 405, durationMs: 1 })).toBe('ok-405-method');
      expect(classifyHttp({ statusCode: 500, durationMs: 1 })).toBe('server-error');
      expect(classifyHttp({ statusCode: 418, durationMs: 1 })).toBe('other-error');
    });

    it('maps missing status / networkError to network-error', () => {
      expect(classifyHttp({ networkError: true, durationMs: 1 })).toBe('network-error');
      expect(classifyHttp({ durationMs: 1 })).toBe('network-error');
    });
  });

  describe('classifyRelease', () => {
    it('ok when release meets floor', () => {
      expect(classifyRelease('757', 757).kind).toBe('ok');
      expect(classifyRelease('758', 757).kind).toBe('ok');
    });
    it('below-floor when release is lower', () => {
      const r = classifyRelease('750', 757);
      expect(r.kind).toBe('below-floor');
      if (r.kind === 'below-floor') {
        expect(r.detected).toBe('750');
        expect(r.floor).toBe(757);
      }
    });
    it('unknown when release is unparseable', () => {
      expect(classifyRelease(undefined, 757).kind).toBe('unknown');
      expect(classifyRelease('sap_btp', 757).kind).toBe('unknown');
    });
    it('ok with floor=0 when floor is missing', () => {
      const r = classifyRelease('757', undefined);
      expect(r.kind).toBe('ok');
    });
  });

  describe('resolveDiscovery', () => {
    it('discovered when the collection URL is a key', () => {
      const map = new Map([['/sap/bc/adt/ddic/tables', ['text/plain']]]);
      expect(resolveDiscovery(map, '/sap/bc/adt/ddic/tables')).toBe('discovered');
      expect(resolveDiscovery(map, '/sap/bc/adt/ddic/tables/')).toBe('discovered');
    });
    it('not-discovered when absent', () => {
      const map = new Map([['/sap/bc/adt/ddic/tables', []]]);
      expect(resolveDiscovery(map, '/sap/bc/adt/bo/behaviordefinitions')).toBe('not-discovered');
    });
    it('no-discovery-map when map is empty or missing', () => {
      expect(resolveDiscovery(new Map(), '/anything')).toBe('no-discovery-map');
      expect(resolveDiscovery(undefined, '/anything')).toBe('no-discovery-map');
    });
  });

  describe('classifyVerdict', () => {
    const baseSignals = (overrides: Partial<Parameters<typeof classifyVerdict>[0]> = {}) => ({
      discovery: 'discovered' as const,
      collection: { url: '/x', classification: 'ok-2xx' as const, statusCode: 200, durationMs: 1 },
      knownObject: { kind: 'not-tested' as const },
      release: { kind: 'ok' as const, detected: '757', floor: 757 },
      ...overrides,
    });

    it('available-high when known-object returns 200', () => {
      const { verdict } = classifyVerdict(
        baseSignals({ knownObject: { kind: 'ok', objectName: 'T000', statusCode: 200 } }),
      );
      expect(verdict).toBe('available-high');
    });

    it('still available-high even when discovery missed (but notes it in reason)', () => {
      const { verdict, reason } = classifyVerdict(
        baseSignals({
          discovery: 'not-discovered',
          knownObject: { kind: 'ok', objectName: 'T000', statusCode: 200 },
        }),
      );
      expect(verdict).toBe('available-high');
      expect(reason).toMatch(/discovery map did NOT list/i);
    });

    it('auth-blocked when both collection and known-object block auth', () => {
      const { verdict } = classifyVerdict(
        baseSignals({
          collection: { url: '/x', classification: 'auth-blocked', statusCode: 403, durationMs: 1 },
          knownObject: { kind: 'auth-blocked', attempted: ['ACTVT'] },
        }),
      );
      expect(verdict).toBe('auth-blocked');
    });

    it('ambiguous when discovery says YES but collection 404s', () => {
      const { verdict } = classifyVerdict(
        baseSignals({
          collection: { url: '/x', classification: 'not-found', statusCode: 404, durationMs: 1 },
        }),
      );
      expect(verdict).toBe('ambiguous');
    });

    it('unavailable-high when discovery miss + 404 + below-floor + no known object', () => {
      const { verdict, reason } = classifyVerdict(
        baseSignals({
          discovery: 'not-discovered',
          collection: { url: '/x', classification: 'not-found', statusCode: 404, durationMs: 1 },
          knownObject: { kind: 'not-tested' },
          release: { kind: 'below-floor', detected: '750', floor: 757 },
        }),
      );
      expect(verdict).toBe('unavailable-high');
      expect(reason).toMatch(/750<757/);
    });

    it('unavailable-likely when signals are only weakly negative', () => {
      const { verdict } = classifyVerdict(
        baseSignals({
          discovery: 'not-discovered',
          collection: { url: '/x', classification: 'not-found', statusCode: 404, durationMs: 1 },
          knownObject: { kind: 'not-tested' },
          release: { kind: 'ok', detected: '757', floor: 757 },
        }),
      );
      expect(verdict).toBe('unavailable-likely');
    });

    it('available-medium when collection responds OK but discovery missed it', () => {
      const { verdict } = classifyVerdict(
        baseSignals({
          discovery: 'not-discovered',
          collection: { url: '/x', classification: 'ok-400-bad-params', statusCode: 400, durationMs: 1 },
        }),
      );
      expect(verdict).toBe('available-medium');
    });

    // The #94/#95 regression: only 404 must count as "unavailable". 400/500 are NOT.
    it('does NOT mark unavailable on 400 (regression guard for PR #94/#95)', () => {
      const { verdict } = classifyVerdict(
        baseSignals({
          collection: { url: '/x', classification: 'ok-400-bad-params', statusCode: 400, durationMs: 1 },
        }),
      );
      expect(verdict.startsWith('unavailable-')).toBe(false);
    });

    it('ambiguous on 500 — never claims unavailable', () => {
      const { verdict } = classifyVerdict(
        baseSignals({
          collection: { url: '/x', classification: 'server-error', statusCode: 500, durationMs: 1 },
        }),
      );
      expect(verdict).toBe('ambiguous');
    });

    it('ambiguous on pure network error', () => {
      const { verdict } = classifyVerdict(
        baseSignals({
          collection: { url: '/x', classification: 'network-error', durationMs: 1 },
        }),
      );
      expect(verdict).toBe('ambiguous');
    });
  });
});

describe('probe runner — probeKnownObject', () => {
  const entry: CatalogEntry = {
    type: 'TABL',
    collectionUrl: '/sap/bc/adt/ddic/tables',
    objectUrlTemplate: '/sap/bc/adt/ddic/tables/{name}/source/main',
    knownObjects: ['T000', 'USR01'],
  };

  const fakeFetcher = (responses: Record<string, number>): HttpProbeFn => {
    return async (url) => ({
      statusCode: responses[url],
      durationMs: 1,
    });
  };

  it('returns ok on first success and stops probing', async () => {
    let calls = 0;
    const fetcher: HttpProbeFn = async (url) => {
      calls += 1;
      return { statusCode: url.includes('T000') ? 200 : 500, durationMs: 1 };
    };
    const outcome = await probeKnownObject(fetcher, entry);
    expect(outcome.kind).toBe('ok');
    expect(calls).toBe(1);
  });

  it('returns all-missing when every candidate 404s', async () => {
    const outcome = await probeKnownObject(
      fakeFetcher({
        '/sap/bc/adt/ddic/tables/T000/source/main': 404,
        '/sap/bc/adt/ddic/tables/USR01/source/main': 404,
      }),
      entry,
    );
    expect(outcome).toEqual({ kind: 'all-missing', attempted: ['T000', 'USR01'] });
  });

  it('returns auth-blocked when all candidates return 401/403', async () => {
    const outcome = await probeKnownObject(
      fakeFetcher({
        '/sap/bc/adt/ddic/tables/T000/source/main': 403,
        '/sap/bc/adt/ddic/tables/USR01/source/main': 401,
      }),
      entry,
    );
    expect(outcome.kind).toBe('auth-blocked');
  });

  it('returns not-tested when the catalog entry has no known objects', async () => {
    const outcome = await probeKnownObject(fakeFetcher({}), { ...entry, knownObjects: [] });
    expect(outcome).toEqual({ kind: 'not-tested' });
  });
});

describe('probe runner — probeType end-to-end', () => {
  it('stitches signals into a verdict (available-high when everything agrees)', async () => {
    const fetcher: HttpProbeFn = async (url) => ({
      statusCode: url.includes('T000') ? 200 : 200,
      durationMs: 1,
    });
    const discoveryMap = new Map([['/sap/bc/adt/ddic/tables', []]]);
    const entry: CatalogEntry = {
      type: 'TABL',
      collectionUrl: '/sap/bc/adt/ddic/tables',
      objectUrlTemplate: '/sap/bc/adt/ddic/tables/{name}/source/main',
      knownObjects: ['T000'],
      minRelease: 700,
    };
    const result = await probeType(fetcher, entry, discoveryMap, '752');
    expect(result.verdict).toBe('available-high');
    expect(result.signals.knownObject.kind).toBe('ok');
    expect(result.signals.discovery).toBe('discovered');
    expect(result.signals.release.kind).toBe('ok');
  });

  it('unavailable-high for BDEF on 7.50 (the issue #162 canonical case)', async () => {
    const fetcher: HttpProbeFn = async () => ({ statusCode: 404, durationMs: 1 });
    // 7.50 ships discovery, but it does NOT list /bo/behaviordefinitions.
    // Seed with an unrelated collection so resolveDiscovery returns 'not-discovered' (not 'no-discovery-map').
    const discoveryMap = new Map<string, string[]>([['/sap/bc/adt/ddic/tables', ['application/xml']]]);
    const entry: CatalogEntry = {
      type: 'BDEF',
      collectionUrl: '/sap/bc/adt/bo/behaviordefinitions',
      objectUrlTemplate: '/sap/bc/adt/bo/behaviordefinitions/{name}/source/main',
      knownObjects: [], //  no universally-shipped BDEF — catalog blind spot
      minRelease: 754,
    };
    const result = await probeType(fetcher, entry, discoveryMap, '750');
    expect(result.verdict).toBe('unavailable-high');
    expect(result.signals.release.kind).toBe('below-floor');
  });
});
