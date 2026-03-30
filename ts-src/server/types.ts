/**
 * Server configuration types for ARC-1.
 *
 * Configuration priority (highest to lowest):
 * 1. CLI flags (--url, --user, etc.)
 * 2. Environment variables (SAP_URL, SAP_USER, etc.)
 * 3. .env file
 * 4. Defaults
 *
 * This matches the Go version's configuration precedence.
 */

/** MCP transport type */
export type TransportType = 'stdio' | 'http-streamable';

/** Feature toggle: auto detects from SAP system, on/off forces */
export type FeatureToggle = 'auto' | 'on' | 'off';

/** Server configuration — all fields needed to start ARC-1 */
export interface ServerConfig {
  // --- SAP Connection ---
  url: string;
  username: string;
  password: string;
  client: string;
  language: string;
  insecure: boolean;

  // --- Cookie Authentication ---
  cookieFile?: string;
  cookieString?: string;

  // --- MCP Transport ---
  transport: TransportType;
  httpAddr: string;

  // --- Safety (gates all write operations) ---
  readOnly: boolean;
  blockFreeSQL: boolean;
  allowedOps: string;
  disallowedOps: string;
  allowedPackages: string[];
  allowTransportableEdits: boolean;
  enableTransports: boolean;

  // --- Feature Detection ---
  featureAbapGit: FeatureToggle;
  featureRap: FeatureToggle;
  featureAmdp: FeatureToggle;
  featureUi5: FeatureToggle;
  featureTransport: FeatureToggle;
  featureHana: FeatureToggle;

  // --- Authentication (MCP client → ARC-1) ---
  apiKey?: string;
  oidcIssuer?: string;
  oidcAudience?: string;
  xsuaaAuth: boolean;

  // --- Principal Propagation (per-user SAP auth) ---
  ppEnabled: boolean;
  ppStrict: boolean; // If true, PP failure = error (no fallback to shared client)

  // --- Logging ---
  logFile?: string;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  logFormat: 'text' | 'json';

  // --- Misc ---
  verbose: boolean;
}

/** Default configuration values */
export const DEFAULT_CONFIG: ServerConfig = {
  url: '',
  username: '',
  password: '',
  client: '001',
  language: 'EN',
  insecure: false,
  transport: 'stdio',
  httpAddr: '0.0.0.0:8080',
  readOnly: false,
  blockFreeSQL: false,
  allowedOps: '',
  disallowedOps: '',
  allowedPackages: [],
  allowTransportableEdits: false,
  enableTransports: false,
  featureAbapGit: 'auto',
  featureRap: 'auto',
  featureAmdp: 'auto',
  featureUi5: 'auto',
  featureTransport: 'auto',
  featureHana: 'auto',
  xsuaaAuth: false,
  ppEnabled: false,
  ppStrict: false,
  logLevel: 'info',
  logFormat: 'text',
  verbose: false,
};
