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

/** Table structure */
export interface TableField {
  name: string;
  type: string;
  length: number;
  description: string;
  isKey: boolean;
}
