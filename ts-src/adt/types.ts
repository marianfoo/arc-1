/**
 * ADT XML response types.
 *
 * SAP ADT returns XML for most responses. These types represent
 * the parsed structures we care about. Not exhaustive — we add
 * types as we port each operation.
 */

/** Search result from /sap/bc/adt/repository/informationsystem/search */
export interface AdtSearchResult {
  objectType: string;
  objectName: string;
  description: string;
  packageName: string;
  uri: string;
}

/** Object structure node */
export interface AdtObjectNode {
  type: string;
  name: string;
  uri: string;
  children?: AdtObjectNode[];
}

/** Feature probe result */
export interface FeatureStatus {
  id: string;
  available: boolean;
  mode: string;
  message?: string;
  probedAt?: string;
}

/** SAP system type: BTP ABAP Environment or on-premise */
export type SystemType = 'btp' | 'onprem';

/** Resolved features after probing */
export interface ResolvedFeatures {
  hana: FeatureStatus;
  abapGit: FeatureStatus;
  rap: FeatureStatus;
  amdp: FeatureStatus;
  ui5: FeatureStatus;
  transport: FeatureStatus;
  /** Detected SAP_BASIS release (e.g. "750", "757"). Populated during probe. */
  abapRelease?: string;
  /** Detected system type: 'btp' (SAP_CLOUD component present) or 'onprem'. */
  systemType?: SystemType;
}

/** System info from /sap/bc/adt/core/discovery */
export interface SystemInfo {
  systemId: string;
  release: string;
  type: string;
}

/** Unit test result */
export interface UnitTestResult {
  program: string;
  testClass: string;
  testMethod: string;
  status: 'passed' | 'failed' | 'skipped';
  message?: string;
  duration?: number;
}

/** Syntax check result */
export interface SyntaxCheckResult {
  hasErrors: boolean;
  messages: SyntaxMessage[];
}

export interface SyntaxMessage {
  severity: 'error' | 'warning' | 'info';
  text: string;
  line: number;
  column: number;
}

/** Transport request */
export interface TransportRequest {
  id: string;
  description: string;
  owner: string;
  status: string;
  type: string;
  tasks: TransportTask[];
}

export interface TransportTask {
  id: string;
  description: string;
  owner: string;
  status: string;
}

/** Source code search result */
export interface SourceSearchResult {
  objectType: string;
  objectName: string;
  uri: string;
  matches: Array<{
    line: number;
    snippet: string;
  }>;
}

/** Table structure */
export interface TableField {
  name: string;
  type: string;
  length: number;
  description: string;
  isKey: boolean;
}

// ─── Runtime Diagnostics Types ──────────────────────────────────────

/** Short dump entry from /sap/bc/adt/runtime/dumps listing */
export interface DumpEntry {
  /** Encoded dump ID (URL path segment) */
  id: string;
  /** ISO 8601 timestamp when the dump occurred */
  timestamp: string;
  /** SAP user who triggered the dump */
  user: string;
  /** Runtime error type (e.g., STRING_OFFSET_TOO_LARGE) */
  error: string;
  /** Terminated ABAP program name */
  program: string;
}

/** Chapter within a dump detail */
export interface DumpChapter {
  name: string;
  title: string;
  category: string;
}

/** Full dump detail from /sap/bc/adt/runtime/dump/{id} */
export interface DumpDetail {
  /** Encoded dump ID */
  id: string;
  /** Runtime error type */
  error: string;
  /** Exception class (e.g., CX_SY_RANGE_OUT_OF_BOUNDS) */
  exception: string;
  /** Terminated ABAP program */
  program: string;
  /** SAP user */
  user: string;
  /** ISO 8601 timestamp */
  timestamp: string;
  /** Dump chapters (table of contents) */
  chapters: DumpChapter[];
  /** Full formatted plain text dump content */
  formattedText: string;
  /** ADT URI to the termination source location */
  terminationUri?: string;
}

/** ABAP profiler trace entry from /sap/bc/adt/runtime/traces/abaptraces */
export interface TraceEntry {
  /** Trace ID (URL path segment) */
  id: string;
  /** Trace title / description */
  title: string;
  /** ISO 8601 timestamp */
  timestamp: string;
  /** Trace state (e.g., completed) */
  state?: string;
  /** Object name being traced */
  objectName?: string;
  /** Total runtime in microseconds */
  runtime?: number;
}

/** Hot spot entry from trace hitlist analysis */
export interface TraceHitlistEntry {
  /** Calling program / procedure */
  callingProgram: string;
  /** Called program / procedure */
  calledProgram: string;
  /** Number of times called */
  hitCount: number;
  /** Gross execution time (microseconds) */
  grossTime: number;
  /** Net execution time (microseconds) */
  netTime: number;
}

/** Call tree entry from trace statements analysis */
export interface TraceStatement {
  /** Nesting level in the call tree */
  callLevel: number;
  /** Number of executions */
  hitCount: number;
  /** Whether this is a procedural unit (method/form/function) */
  isProceduralUnit: boolean;
  /** Gross execution time (microseconds) */
  grossTime: number;
  /** Description / program name */
  description: string;
}

/** Database access entry from trace analysis */
export interface TraceDbAccess {
  /** Table name accessed */
  tableName: string;
  /** SQL statement type (e.g., SELECT, INSERT) */
  statement: string;
  /** Access type (OpenSQL, NativeSQL) */
  type: string;
  /** Total number of accesses */
  totalCount: number;
  /** Number of buffered accesses */
  bufferedCount: number;
  /** Total access time (microseconds) */
  accessTime: number;
}
