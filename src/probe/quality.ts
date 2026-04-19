/**
 * Quality-of-probe metrics.
 *
 * The probe's outputs are only as trustworthy as the signals it gathered.
 * These aggregate metrics tell a reader at a glance:
 *   - how many types each signal could answer
 *   - which types were flagged ambiguous (the danger zone)
 *   - whether the discovery map lines up with the authoritative known-object
 *     signal on this system (if not, discovery is unreliable here)
 */

import { CATALOG } from './catalog.js';
import type { QualityMetrics, TypeResult, Verdict } from './types.js';

const ALL_VERDICTS: Verdict[] = [
  'available-high',
  'available-medium',
  'unavailable-high',
  'unavailable-likely',
  'auth-blocked',
  'ambiguous',
];

export function computeQuality(results: TypeResult[]): QualityMetrics {
  const total = results.length || 1; // avoid div-by-zero on empty catalog

  const discoveryDefinitive = results.filter((r) => r.signals.discovery !== 'no-discovery-map').length;
  const collectionDefinitive = results.filter((r) => r.signals.collection.classification !== 'network-error').length;
  const knownObjectTested = results.filter((r) => r.signals.knownObject.kind !== 'not-tested').length;
  const releaseKnown = results.filter((r) => r.signals.release.kind !== 'unknown').length;

  // discoveryAccuracyVsKnownObject: of types where known-object confirmed
  // availability, how many did discovery also list?
  const knownOk = results.filter((r) => r.signals.knownObject.kind === 'ok');
  const discoveryAccuracyVsKnownObject =
    knownOk.length === 0 ? null : knownOk.filter((r) => r.signals.discovery === 'discovered').length / knownOk.length;

  const verdictHistogram = {} as Record<Verdict, number>;
  for (const v of ALL_VERDICTS) verdictHistogram[v] = 0;
  for (const r of results) verdictHistogram[r.verdict] += 1;

  const ambiguousTypes = results.filter((r) => r.verdict === 'ambiguous').map((r) => r.type);

  const uncoveredByKnownObject = CATALOG.filter((e) => (e.knownObjects?.length ?? 0) === 0).map((e) => e.type);

  return {
    coverage: {
      discovery: discoveryDefinitive / total,
      collection: collectionDefinitive / total,
      knownObject: knownObjectTested / total,
      release: releaseKnown / total,
    },
    discoveryAccuracyVsKnownObject,
    verdictHistogram,
    ambiguousTypes,
    uncoveredByKnownObject,
  };
}
