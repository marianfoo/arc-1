/**
 * Types for the ADT type-availability probe.
 *
 * The probe is pure diagnostic tooling — it does not change product behavior.
 * It collects multiple independent signals per ADT object type and reports
 * both the per-type verdict AND the quality-of-probe metrics, so anyone
 * running it against their own system can see not just "is TABL supported"
 * but "how confident should we be in that answer".
 */

/** SAPREAD/SAPWrite type code (TABL, BDEF, DDLS, …). */
export type TypeCode = string;

/** A catalog entry for one ADT object type. */
export interface CatalogEntry {
  /** 4-letter type code used in SAPRead/SAPWrite. */
  type: TypeCode;
  /** Canonical collection URL (e.g. "/sap/bc/adt/ddic/tables"). */
  collectionUrl: string;
  /**
   * Object-level URL template, where `{name}` is the encoded object name.
   * Used for the known-object probe. If absent, that signal is NOT_TESTED.
   */
  objectUrlTemplate?: string;
  /**
   * SAP-shipped objects that should exist on (almost) every system for this type.
   * The probe tries each until one returns 200 (or it exhausts the list).
   * Leave empty for types where no widely-shipped object exists (BDEF, SRVD, …).
   */
  knownObjects?: string[];
  /**
   * Minimum SAP_BASIS release where this type's endpoint is expected to exist.
   * Used only as a weak signal; release strings vary (BTP reports differently).
   * Encoded as the 3-digit release number (750, 752, 757, …).
   */
  minRelease?: number;
  /** Freeform note shown in the report (e.g. "RAP BDEF — needs SAP_BASIS >= 7.57"). */
  note?: string;
}

/** Result of the discovery-map lookup for a single type. */
export type DiscoverySignal = 'discovered' | 'not-discovered' | 'no-discovery-map';

/** Status classification for a single HTTP probe. */
export type HttpClassification =
  | 'ok-2xx' //  endpoint responded successfully
  | 'ok-400-bad-params' //  endpoint exists, just needs query params (feature probe #94 lesson)
  | 'ok-405-method' //  endpoint exists, doesn't accept GET
  | 'auth-blocked' //  401/403 — endpoint exists, user lacks authorization
  | 'not-found' //  404 — ICF service not active or endpoint not registered
  | 'server-error' //  5xx — ambiguous; could be endpoint bug or feature missing
  | 'other-error' //  any other HTTP status
  | 'network-error'; //  no HTTP response at all

/** Single HTTP probe result. */
export interface HttpProbe {
  url: string;
  classification: HttpClassification;
  statusCode?: number;
  /** Raw error message if the call threw without an HTTP response. */
  errorMessage?: string;
  /** First ~200 chars of the response body, for human review. */
  bodySnippet?: string;
  durationMs: number;
}

/** Outcome of the known-object probe. */
export type KnownObjectOutcome =
  | { kind: 'ok'; objectName: string; statusCode: number }
  | { kind: 'all-missing'; attempted: string[] } //  all candidates returned 404
  | { kind: 'auth-blocked'; attempted: string[] } //  user can't read any
  | { kind: 'error'; attempted: string[]; message: string }
  | { kind: 'not-tested' }; //  catalog has no known objects listed

/** Four independent signals combined per type. */
export interface TypeSignals {
  discovery: DiscoverySignal;
  collection: HttpProbe;
  knownObject: KnownObjectOutcome;
  release:
    | { kind: 'ok'; detected: string; floor: number }
    | { kind: 'below-floor'; detected: string; floor: number }
    | { kind: 'unknown'; floor?: number };
}

/** Final verdict the probe reports for a type. */
export type Verdict =
  | 'available-high' //  known-object 2xx, or discovered + collection ok
  | 'available-medium' //  collection ok but not discovered (endpoint unusual)
  | 'unavailable-high' //  discovery absent + collection 404 + release below floor
  | 'unavailable-likely' //  discovery absent + collection 404
  | 'auth-blocked' //  signals point to auth, not absence
  | 'ambiguous'; //  signals disagree — flag for review

/** Per-type probe result. */
export interface TypeResult {
  type: TypeCode;
  signals: TypeSignals;
  verdict: Verdict;
  /** Human-readable one-liner explaining which signals drove the verdict. */
  reason: string;
}

/**
 * One installed software component as reported by /sap/bc/adt/system/components.
 * Captured so future readers of a fixture can tell a plain NW 7.58 apart from
 * an S/4HANA 2023 — SAP_BASIS alone is not enough signal.
 */
export interface InstalledProduct {
  /** Component id (e.g. "SAP_BASIS", "S4FND"). */
  name: string;
  /** Numeric release (e.g. "758", "108"). */
  release: string;
  /** Support package level (e.g. "0002"), if reported. */
  spLevel?: string;
  /** Human-readable description (e.g. "SAP Basis Component"). */
  description?: string;
}

/** System-level info the probe captures for context. */
export interface ProbedSystem {
  baseUrl: string;
  client?: string;
  abapRelease?: string;
  systemType?: 'onprem' | 'btp' | 'unknown';
  /** Full component list from /sap/bc/adt/system/components when available. */
  products?: InstalledProduct[];
  discoveryMapSize: number;
  probedAt: string;
}

/** Aggregated quality metrics across all types — "how good is the probe itself". */
export interface QualityMetrics {
  /** Fraction of types for which each signal returned a definitive answer. */
  coverage: {
    discovery: number;
    collection: number;
    knownObject: number;
    release: number;
  };
  /**
   * Of the types that tested positive via the authoritative known-object signal,
   * what fraction were also present in the discovery map?
   * Low number = the discovery map is unreliable for this release; deweight it.
   */
  discoveryAccuracyVsKnownObject: number | null;
  /** Count of verdicts per bucket. */
  verdictHistogram: Record<Verdict, number>;
  /** Types flagged ambiguous — the danger zone where signals disagree. */
  ambiguousTypes: TypeCode[];
  /** Types for which no known-object fixture was listed in the catalog (probe blind spot). */
  uncoveredByKnownObject: TypeCode[];
}

/** Full probe report, serializable to JSON for sharing. */
export interface ProbeReport {
  /** Metadata so anyone reading the JSON can compare their run against others. */
  system: ProbedSystem;
  results: TypeResult[];
  quality: QualityMetrics;
  /**
   * Schema version for the report file. Bump when the shape changes so
   * replay tests can refuse to load incompatible fixtures.
   */
  schemaVersion: 1;
}
