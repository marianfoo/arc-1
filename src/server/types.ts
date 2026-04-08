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
  blockData: boolean;
  allowedOps: string;
  disallowedOps: string;
  allowedPackages: string[];
  enableTransports: boolean;

  // --- Feature Detection ---
  featureAbapGit: FeatureToggle;
  featureRap: FeatureToggle;
  featureAmdp: FeatureToggle;
  featureUi5: FeatureToggle;
  featureTransport: FeatureToggle;
  featureHana: FeatureToggle;

  // --- System Type Detection ---
  /** System type: 'auto' (detect from components), 'btp', or 'onprem' */
  systemType: 'auto' | 'btp' | 'onprem';

  // --- Authentication (MCP client → ARC-1) ---
  apiKey?: string;
  /** Multiple API keys with per-key profile assignment (key:profile pairs) */
  apiKeys?: Array<{ key: string; profile: string }>;
  oidcIssuer?: string;
  oidcAudience?: string;
  /** Clock tolerance in seconds for JWT exp/nbf validation (default: 0 — no tolerance) */
  oidcClockTolerance?: number;
  xsuaaAuth: boolean;

  // --- BTP ABAP Environment (direct connection via service key) ---
  btpServiceKey?: string; // Inline service key JSON
  btpServiceKeyFile?: string; // Path to service key file
  btpOAuthCallbackPort: number; // Port for OAuth browser callback (0 = auto)

  // --- Principal Propagation (per-user SAP auth) ---
  ppEnabled: boolean;
  ppStrict: boolean; // If true, PP failure = error (no fallback to shared client)

  // --- Logging ---
  logFile?: string;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  logFormat: 'text' | 'json';

  // --- Tool Mode ---
  /** Tool mode: 'standard' (11 intent tools) or 'hyperfocused' (1 universal SAP tool, ~200 tokens) */
  toolMode: 'standard' | 'hyperfocused';

  // --- Lint ---
  /** Path to custom abaplint.jsonc config file for lint rules */
  abaplintConfig?: string;
  /** Enable pre-write lint validation (default: true) */
  lintBeforeWrite: boolean;

  // --- Cache ---
  /** Cache mode: 'auto' (memory for stdio, sqlite for http-streamable), 'memory', 'sqlite', 'none' */
  cacheMode: 'auto' | 'memory' | 'sqlite' | 'none';
  /** Path to SQLite cache file (default: .arc1-cache.db in working directory) */
  cacheFile: string;
  /** Enable cache warmup on startup (queries TADIR + fetches all custom objects) */
  cacheWarmup: boolean;
  /** Package filter for warmup (supports wildcards, e.g. "Z*,Y*,/COMPANY/*") */
  cacheWarmupPackages: string;

  // --- Misc ---
  verbose: boolean;
}

/** Default configuration values */
export const DEFAULT_CONFIG: ServerConfig = {
  url: '',
  username: '',
  password: '',
  client: '100',
  language: 'EN',
  insecure: false,
  transport: 'stdio',
  httpAddr: '0.0.0.0:8080',
  readOnly: false,
  blockFreeSQL: false,
  blockData: false,
  allowedOps: '',
  disallowedOps: '',
  allowedPackages: ['$TMP'],
  enableTransports: false,
  featureAbapGit: 'auto',
  featureRap: 'auto',
  featureAmdp: 'auto',
  featureUi5: 'auto',
  featureTransport: 'auto',
  featureHana: 'auto',
  systemType: 'auto',
  xsuaaAuth: false,
  btpOAuthCallbackPort: 0,
  ppEnabled: false,
  ppStrict: false,
  toolMode: 'standard',
  lintBeforeWrite: true,
  cacheMode: 'auto',
  cacheFile: '.arc1-cache.db',
  cacheWarmup: false,
  cacheWarmupPackages: '',
  logLevel: 'info',
  logFormat: 'text',
  verbose: false,
};
