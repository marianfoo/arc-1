import { describe, expect, it } from 'vitest';
import { computeQuality } from '../../../src/probe/quality.js';
import type { TypeResult } from '../../../src/probe/types.js';

const makeResult = (partial: Partial<TypeResult> & { type: string; verdict: TypeResult['verdict'] }): TypeResult => ({
  signals: {
    discovery: 'discovered',
    collection: { url: '/x', classification: 'ok-2xx', statusCode: 200, durationMs: 1 },
    knownObject: { kind: 'ok', objectName: 'T000', statusCode: 200 },
    release: { kind: 'ok', detected: '757', floor: 757 },
  },
  reason: '',
  ...partial,
});

describe('computeQuality', () => {
  it('reports 100% coverage when every signal is definitive', () => {
    const results = [
      makeResult({ type: 'TABL', verdict: 'available-high' }),
      makeResult({ type: 'DOMA', verdict: 'available-high' }),
    ];
    const q = computeQuality(results);
    expect(q.coverage.discovery).toBe(1);
    expect(q.coverage.collection).toBe(1);
    expect(q.coverage.knownObject).toBe(1);
    expect(q.coverage.release).toBe(1);
  });

  it('drops known-object coverage when some types lack fixtures', () => {
    const results = [
      makeResult({ type: 'TABL', verdict: 'available-high' }),
      makeResult({
        type: 'BDEF',
        verdict: 'unavailable-high',
        signals: {
          discovery: 'not-discovered',
          collection: { url: '/x', classification: 'not-found', statusCode: 404, durationMs: 1 },
          knownObject: { kind: 'not-tested' },
          release: { kind: 'below-floor', detected: '750', floor: 754 },
        },
      }),
    ];
    const q = computeQuality(results);
    expect(q.coverage.knownObject).toBe(0.5);
  });

  it('drops release coverage when detection failed', () => {
    const results = [
      makeResult({
        type: 'TABL',
        verdict: 'available-high',
        signals: {
          discovery: 'discovered',
          collection: { url: '/x', classification: 'ok-2xx', statusCode: 200, durationMs: 1 },
          knownObject: { kind: 'ok', objectName: 'T000', statusCode: 200 },
          release: { kind: 'unknown', floor: 700 },
        },
      }),
    ];
    const q = computeQuality(results);
    expect(q.coverage.release).toBe(0);
  });

  it('computes discoveryAccuracyVsKnownObject', () => {
    const results = [
      // TABL: known-OK + discovered => contributes 1 to numerator and denominator
      makeResult({ type: 'TABL', verdict: 'available-high' }),
      // DOMA: known-OK but discovery MISSED — discovery incomplete, contributes 0/1
      makeResult({
        type: 'DOMA',
        verdict: 'available-high',
        signals: {
          discovery: 'not-discovered',
          collection: { url: '/x', classification: 'ok-2xx', statusCode: 200, durationMs: 1 },
          knownObject: { kind: 'ok', objectName: 'ABAP_BOOL', statusCode: 200 },
          release: { kind: 'ok', detected: '757', floor: 700 },
        },
      }),
      // BDEF: not-tested (no known object) — does NOT affect this metric
      makeResult({
        type: 'BDEF',
        verdict: 'unavailable-high',
        signals: {
          discovery: 'not-discovered',
          collection: { url: '/x', classification: 'not-found', statusCode: 404, durationMs: 1 },
          knownObject: { kind: 'not-tested' },
          release: { kind: 'below-floor', detected: '750', floor: 754 },
        },
      }),
    ];
    const q = computeQuality(results);
    expect(q.discoveryAccuracyVsKnownObject).toBe(0.5);
  });

  it('returns null discovery-accuracy when no known-object positives', () => {
    const results = [
      makeResult({
        type: 'BDEF',
        verdict: 'unavailable-high',
        signals: {
          discovery: 'not-discovered',
          collection: { url: '/x', classification: 'not-found', statusCode: 404, durationMs: 1 },
          knownObject: { kind: 'not-tested' },
          release: { kind: 'below-floor', detected: '750', floor: 754 },
        },
      }),
    ];
    const q = computeQuality(results);
    expect(q.discoveryAccuracyVsKnownObject).toBeNull();
  });

  it('collects ambiguous types into a review list', () => {
    const results = [
      makeResult({ type: 'TABL', verdict: 'available-high' }),
      makeResult({ type: 'DDLS', verdict: 'ambiguous' }),
      makeResult({ type: 'SRVD', verdict: 'ambiguous' }),
    ];
    const q = computeQuality(results);
    expect(q.ambiguousTypes).toEqual(['DDLS', 'SRVD']);
    expect(q.verdictHistogram.ambiguous).toBe(2);
    expect(q.verdictHistogram['available-high']).toBe(1);
  });
});
