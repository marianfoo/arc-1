/**
 * Probe runner — classifies each ADT type against four independent signals:
 *
 *   1. Discovery map presence (free; from the already-fetched /discovery doc)
 *   2. Collection-URL GET (tolerates 400/403/405 as "endpoint exists" — the
 *      #94/#95 lesson: only 404 is a hard negative)
 *   3. Known-object GET on an SAP-shipped fixture (authoritative when available)
 *   4. SAP_BASIS release vs. a hand-curated floor (weak tie-breaker only)
 *
 * The runner is deliberately pure: it takes a simple `HttpProbeFn` that never
 * throws and returns a neutral shape. This makes it trivially testable by
 * replaying recorded SAP responses from fixtures.
 */

import { buildObjectUrl } from './catalog.js';
import type {
  CatalogEntry,
  DiscoverySignal,
  HttpClassification,
  HttpProbe,
  KnownObjectOutcome,
  TypeResult,
  TypeSignals,
  Verdict,
} from './types.js';

/** Neutral HTTP-result shape the runner consumes. Never throws. */
export interface ProbeFetchResult {
  statusCode?: number;
  body?: string;
  /** True when no HTTP response was obtained at all (connection refused, DNS, TLS). */
  networkError?: boolean;
  errorMessage?: string;
  durationMs: number;
}

/** Function the runner calls to probe one URL. Implementations must not throw. */
export type HttpProbeFn = (url: string, method: 'GET' | 'HEAD') => Promise<ProbeFetchResult>;

/** Parse SAP_BASIS release string like "750", "7.57", "sap_btp" to a number, or null. */
export function parseRelease(release: string | undefined): number | null {
  if (!release) return null;
  const digits = release.replace(/\D/g, '');
  if (!digits) return null;
  const n = Number.parseInt(digits, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Classify an HTTP response code into a discrete bucket. */
export function classifyHttp(result: ProbeFetchResult): HttpClassification {
  if (result.networkError) return 'network-error';
  const s = result.statusCode;
  if (s === undefined) return 'network-error';
  if (s >= 200 && s < 300) return 'ok-2xx';
  if (s === 400) return 'ok-400-bad-params';
  if (s === 401 || s === 403) return 'auth-blocked';
  if (s === 404) return 'not-found';
  if (s === 405) return 'ok-405-method';
  if (s >= 500 && s < 600) return 'server-error';
  return 'other-error';
}

/** Truncate an HTTP body for inclusion in reports; strips whitespace. */
function snippet(body: string | undefined): string | undefined {
  if (!body) return undefined;
  const trimmed = body.replace(/\s+/g, ' ').trim();
  return trimmed.length > 200 ? `${trimmed.slice(0, 200)}…` : trimmed;
}

/** Run the collection-URL probe. Normalized, never throws. */
export async function probeCollection(fetchFn: HttpProbeFn, collectionUrl: string): Promise<HttpProbe> {
  const res = await fetchFn(collectionUrl, 'GET');
  return {
    url: collectionUrl,
    classification: classifyHttp(res),
    statusCode: res.statusCode,
    errorMessage: res.errorMessage,
    bodySnippet: snippet(res.body),
    durationMs: res.durationMs,
  };
}

/**
 * Try each known object in order and classify the outcome.
 * We stop at the first 2xx; if all fail, we aggregate the attempted list.
 */
export async function probeKnownObject(fetchFn: HttpProbeFn, entry: CatalogEntry): Promise<KnownObjectOutcome> {
  const list = entry.knownObjects ?? [];
  if (list.length === 0 || !entry.objectUrlTemplate) return { kind: 'not-tested' };

  const attempted: string[] = [];
  let sawAuthBlock = false;
  let lastError: string | undefined;

  for (const name of list) {
    attempted.push(name);
    const url = buildObjectUrl(entry.objectUrlTemplate, name);
    const res = await fetchFn(url, 'GET');
    const klass = classifyHttp(res);
    if (klass === 'ok-2xx') {
      return { kind: 'ok', objectName: name, statusCode: res.statusCode ?? 200 };
    }
    if (klass === 'auth-blocked') sawAuthBlock = true;
    if (klass === 'network-error') {
      lastError = res.errorMessage ?? 'network error';
    }
    if (klass === 'server-error' || klass === 'other-error') {
      lastError = `HTTP ${res.statusCode}`;
    }
    // 404 is expected for objects that don't exist on this system — keep trying.
  }

  if (lastError) return { kind: 'error', attempted, message: lastError };
  if (sawAuthBlock) return { kind: 'auth-blocked', attempted };
  return { kind: 'all-missing', attempted };
}

/** Classify the release signal. */
export function classifyRelease(
  detectedRelease: string | undefined,
  floor: number | undefined,
): TypeSignals['release'] {
  const detected = parseRelease(detectedRelease);
  if (detected === null) return { kind: 'unknown', floor };
  if (floor === undefined) return { kind: 'ok', detected: detectedRelease ?? '', floor: 0 };
  if (detected < floor) return { kind: 'below-floor', detected: detectedRelease ?? '', floor };
  return { kind: 'ok', detected: detectedRelease ?? '', floor };
}

/** Collapse the four signals into a final verdict + one-line reason. */
export function classifyVerdict(signals: TypeSignals): { verdict: Verdict; reason: string } {
  const { discovery, collection, knownObject, release } = signals;

  // Rule 1 — known-object is authoritative.
  if (knownObject.kind === 'ok') {
    const discoHint =
      discovery === 'discovered'
        ? 'discovery confirms'
        : discovery === 'not-discovered'
          ? 'but discovery map did NOT list the collection (discovery incomplete?)'
          : 'no discovery map available';
    return {
      verdict: 'available-high',
      reason: `known-object read of "${knownObject.objectName}" returned 200; ${discoHint}`,
    };
  }

  // Rule 2 — unanimous auth blocking.
  if (collection.classification === 'auth-blocked' && knownObject.kind === 'auth-blocked') {
    return {
      verdict: 'auth-blocked',
      reason: `collection and known-object both returned 401/403 — endpoint exists, probe user lacks rights`,
    };
  }

  // Rule 3 — collection 404 paths (the real "not available" signal).
  if (collection.classification === 'not-found') {
    if (discovery === 'discovered') {
      return {
        verdict: 'ambiguous',
        reason: `discovery lists this collection but GET returned 404 — endpoint registered but inactive?`,
      };
    }
    const discoNegative = discovery === 'not-discovered';
    const knownNegative = knownObject.kind === 'all-missing' || knownObject.kind === 'not-tested';
    const releaseNegative = release.kind === 'below-floor';
    if (discoNegative && knownNegative && releaseNegative) {
      return {
        verdict: 'unavailable-high',
        reason: `discovery miss + collection 404 + release ${release.detected}<${release.floor} — high confidence`,
      };
    }
    return {
      verdict: 'unavailable-likely',
      reason: `collection returned 404${discoNegative ? ' and not in discovery map' : ''}`,
    };
  }

  // Rule 4 — collection responded in a way that suggests the endpoint exists.
  const okBuckets: HttpClassification[] = ['ok-2xx', 'ok-400-bad-params', 'ok-405-method'];
  if (okBuckets.includes(collection.classification)) {
    if (knownObject.kind === 'all-missing') {
      return {
        verdict: discovery === 'discovered' ? 'available-high' : 'available-medium',
        reason: `collection HTTP ${collection.statusCode}; known-object candidates not present on this system`,
      };
    }
    if (discovery === 'discovered') {
      return {
        verdict: 'available-high',
        reason: `discovered + collection HTTP ${collection.statusCode}`,
      };
    }
    return {
      verdict: 'available-medium',
      reason: `collection HTTP ${collection.statusCode} but not in discovery map`,
    };
  }

  // Rule 5 — auth-blocked with weaker corroboration.
  if (collection.classification === 'auth-blocked') {
    return {
      verdict: 'auth-blocked',
      reason: `collection returned 401/403 — endpoint likely exists but probe user lacks rights`,
    };
  }

  // Rule 6 — anything else (5xx, network errors, unexpected codes).
  return {
    verdict: 'ambiguous',
    reason: `collection returned ${collection.classification}${collection.statusCode ? ` (${collection.statusCode})` : ''}; cannot decide`,
  };
}

/** Compute a discovery-map lookup for a collection URL. */
export function resolveDiscovery(
  discoveryMap: Map<string, string[]> | undefined,
  collectionUrl: string,
): DiscoverySignal {
  if (!discoveryMap || discoveryMap.size === 0) return 'no-discovery-map';
  // Discovery keys are normalized with no trailing slash; catalog URLs follow the same convention.
  const normalized = collectionUrl.endsWith('/') ? collectionUrl.slice(0, -1) : collectionUrl;
  return discoveryMap.has(normalized) ? 'discovered' : 'not-discovered';
}

/** Probe one catalog entry end-to-end. */
export async function probeType(
  fetchFn: HttpProbeFn,
  entry: CatalogEntry,
  discoveryMap: Map<string, string[]> | undefined,
  detectedRelease: string | undefined,
): Promise<TypeResult> {
  const [collection, knownObject] = await Promise.all([
    probeCollection(fetchFn, entry.collectionUrl),
    probeKnownObject(fetchFn, entry),
  ]);
  const signals: TypeSignals = {
    discovery: resolveDiscovery(discoveryMap, entry.collectionUrl),
    collection,
    knownObject,
    release: classifyRelease(detectedRelease, entry.minRelease),
  };
  const { verdict, reason } = classifyVerdict(signals);
  return { type: entry.type, signals, verdict, reason };
}
