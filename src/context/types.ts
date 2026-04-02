/**
 * Types for the SAPContext dependency compression pipeline.
 *
 * The pipeline works in three stages:
 * 1. deps.ts   — Extract dependency names from ABAP source (AST-based)
 * 2. contract.ts — Extract public API contracts from dependency source
 * 3. compressor.ts — Orchestrate: fetch sources, compress, format output
 */

/** A dependency found in ABAP source code */
export interface Dependency {
  /** Object name (e.g., ZCL_ITEM, ZIF_ORDER) */
  name: string;
  /** How the dependency is used */
  kind: DependencyKind;
  /** Source line where the reference was found (1-based) */
  line: number;
}

/** How a dependency is referenced in ABAP source */
export type DependencyKind =
  | 'inheritance' // INHERITING FROM
  | 'interface' // INTERFACES statement
  | 'type_ref' // TYPE REF TO, NEW, CAST
  | 'static_call' // ClassName=>method()
  | 'function_call' // CALL FUNCTION 'name'
  | 'exception'; // RAISING, CATCH

/** Compressed contract for a single dependency */
export interface Contract {
  /** Object name */
  name: string;
  /** Inferred object type */
  type: 'CLAS' | 'INTF' | 'FUNC' | 'UNKNOWN';
  /** Number of public methods (for stats line) */
  methodCount: number;
  /** Compressed source — public API only */
  source: string;
  /** Full uncompressed source — used for recursive dependency extraction */
  fullSource?: string;
  /** Whether fetching/extraction succeeded */
  success: boolean;
  /** Error message if fetch/extraction failed */
  error?: string;
}

/** Full context compression result */
export interface ContextResult {
  /** Target object name */
  objectName: string;
  /** Target object type */
  objectType: string;
  /** Dependencies found in source */
  depsFound: number;
  /** Dependencies resolved (contracts fetched) */
  depsResolved: number;
  /** Dependencies filtered (SAP standard, self-refs, built-ins) */
  depsFiltered: number;
  /** Dependencies that failed to resolve */
  depsFailed: number;
  /** Total lines in output */
  totalLines: number;
  /** Formatted output prologue */
  output: string;
}
