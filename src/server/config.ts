/**
 * Configuration parser for ARC-1.
 *
 * Resolves configuration from CLI flags, environment variables, and defaults.
 * Priority: CLI > env > .env > defaults
 *
 * Environment variable names match the Go version exactly (SAP_URL, SAP_USER, etc.)
 * for drop-in compatibility with existing deployments and documentation.
 */

import type { FeatureToggle, ServerConfig, TransportType } from './types.js';
import { DEFAULT_CONFIG } from './types.js';

/**
 * Parse API keys string into structured array.
 * Format: "key1:profile1,key2:profile2"
 * Each entry maps an API key to a named profile.
 */
export function parseApiKeys(raw: string): Array<{ key: string; profile: string }> {
  const entries: Array<{ key: string; profile: string }> = [];
  for (const pair of raw.split(',')) {
    const trimmed = pair.trim();
    if (!trimmed) continue;
    // Use LAST colon as separator — keys may contain colons (e.g. base64)
    // but profile names never do
    const colonIdx = trimmed.lastIndexOf(':');
    if (colonIdx === -1) {
      throw new Error(
        `Invalid API key entry '${trimmed}': expected 'key:profile' format. ` +
          `Valid profiles: ${Object.keys(PROFILES).join(', ')}`,
      );
    }
    const key = trimmed.slice(0, colonIdx);
    const profile = trimmed.slice(colonIdx + 1);
    if (!key) {
      throw new Error('Invalid API key entry: key cannot be empty');
    }
    if (!PROFILES[profile]) {
      throw new Error(
        `Invalid profile '${profile}' in API key entry. Valid profiles: ${Object.keys(PROFILES).join(', ')}`,
      );
    }
    entries.push({ key, profile });
  }
  if (entries.length === 0) {
    throw new Error('ARC1_API_KEYS is set but contains no valid entries. Format: "key1:profile1,key2:profile2"');
  }
  return entries;
}

/**
 * Maps profile names to the scopes they grant.
 * Used when API keys are assigned to profiles — the key inherits these scopes.
 * Kept in sync with PROFILES: each profile's safety flags determine its scopes.
 */
export const PROFILE_SCOPES: Record<string, string[]> = {
  viewer: ['read'],
  'viewer-data': ['read', 'data'],
  'viewer-sql': ['read', 'data', 'sql'],
  developer: ['read', 'write'],
  'developer-data': ['read', 'write', 'data'],
  'developer-sql': ['read', 'write', 'data', 'sql'],
};

/**
 * Named profiles — convenience presets for common safety configurations.
 * Each profile sets a combination of safety flags. Individual CLI flags
 * applied after the profile can override any profile default.
 */
export const PROFILES: Record<string, Partial<ServerConfig>> = {
  viewer: {
    readOnly: true,
    blockData: true,
    blockFreeSQL: true,
    enableTransports: false,
    allowTransportableEdits: false,
  },
  'viewer-data': {
    readOnly: true,
    blockData: false,
    blockFreeSQL: true,
    enableTransports: false,
    allowTransportableEdits: false,
  },
  'viewer-sql': {
    readOnly: true,
    blockData: false,
    blockFreeSQL: false,
    enableTransports: false,
    allowTransportableEdits: false,
  },
  developer: {
    readOnly: false,
    blockData: true,
    blockFreeSQL: true,
    enableTransports: true,
    allowTransportableEdits: true,
  },
  'developer-data': {
    readOnly: false,
    blockData: false,
    blockFreeSQL: true,
    enableTransports: true,
    allowTransportableEdits: true,
  },
  'developer-sql': {
    readOnly: false,
    blockData: false,
    blockFreeSQL: false,
    enableTransports: true,
    allowTransportableEdits: true,
  },
};

/**
 * Parse CLI arguments and environment variables into a ServerConfig.
 *
 * We use a simple hand-rolled parser here (not commander) because
 * the MCP server entry point needs to be fast and lightweight.
 * Commander is used for the full CLI (cli.ts), not the server startup.
 */
export function parseArgs(args: string[]): ServerConfig {
  const config = { ...DEFAULT_CONFIG };

  // Helper: get a CLI flag value (--flag value or --flag=value)
  const getFlag = (name: string): string | undefined => {
    const prefix = `--${name}=`;
    for (let i = 0; i < args.length; i++) {
      if (args[i] === `--${name}` && i + 1 < args.length) {
        return args[i + 1];
      }
      if (args[i]?.startsWith(prefix)) {
        return args[i].slice(prefix.length);
      }
    }
    return undefined;
  };

  // Helper: resolve value from CLI > env > default
  const resolve = (flag: string, envVar: string, defaultVal: string): string => {
    return getFlag(flag) ?? process.env[envVar] ?? defaultVal;
  };

  const resolveBool = (flag: string, envVar: string, defaultVal: boolean): boolean => {
    const val = getFlag(flag) ?? process.env[envVar];
    if (val === undefined) return defaultVal;
    return val === 'true' || val === '1';
  };

  const resolveFeature = (flag: string, envVar: string): FeatureToggle => {
    const val = getFlag(flag) ?? process.env[envVar] ?? 'auto';
    if (val === 'on' || val === 'off') return val;
    return 'auto';
  };

  // --- SAP Connection ---
  config.url = resolve('url', 'SAP_URL', '');
  config.username = resolve('user', 'SAP_USER', '');
  config.password = resolve('password', 'SAP_PASSWORD', '');
  config.client = resolve('client', 'SAP_CLIENT', '100');
  config.language = resolve('language', 'SAP_LANGUAGE', 'EN');
  config.insecure = resolveBool('insecure', 'SAP_INSECURE', false);

  // --- Cookie Auth ---
  config.cookieFile = getFlag('cookie-file') ?? process.env.SAP_COOKIE_FILE;
  config.cookieString = getFlag('cookie-string') ?? process.env.SAP_COOKIE_STRING;

  // --- Transport ---
  const transport = resolve('transport', 'SAP_TRANSPORT', 'stdio');
  config.transport = (transport === 'http-streamable' ? 'http-streamable' : 'stdio') as TransportType;
  config.httpAddr = resolve('http-addr', 'SAP_HTTP_ADDR', '0.0.0.0:8080');

  // --- Profile (apply before individual safety flags so flags can override) ---
  const profileName = getFlag('profile') ?? process.env.ARC1_PROFILE;
  if (profileName) {
    const profile = PROFILES[profileName];
    if (!profile) {
      throw new Error(`Unknown profile '${profileName}'. Valid profiles: ${Object.keys(PROFILES).join(', ')}`);
    }
    Object.assign(config, profile);
  }

  // --- Safety (individual flags override profile defaults) ---
  // Only override profile defaults when the flag/env is explicitly set
  const readOnlyExplicit = getFlag('read-only') ?? process.env.SAP_READ_ONLY;
  if (readOnlyExplicit !== undefined) config.readOnly = readOnlyExplicit === 'true' || readOnlyExplicit === '1';
  else if (!profileName) config.readOnly = false;

  const blockFreeSQLExplicit = getFlag('block-free-sql') ?? process.env.SAP_BLOCK_FREE_SQL;
  if (blockFreeSQLExplicit !== undefined)
    config.blockFreeSQL = blockFreeSQLExplicit === 'true' || blockFreeSQLExplicit === '1';
  else if (!profileName) config.blockFreeSQL = false;

  const blockDataExplicit = getFlag('block-data') ?? process.env.SAP_BLOCK_DATA;
  if (blockDataExplicit !== undefined) config.blockData = blockDataExplicit === 'true' || blockDataExplicit === '1';
  else if (!profileName) config.blockData = false;
  config.allowedOps = resolve('allowed-ops', 'SAP_ALLOWED_OPS', '');
  config.disallowedOps = resolve('disallowed-ops', 'SAP_DISALLOWED_OPS', '');
  const pkgs = resolve('allowed-packages', 'SAP_ALLOWED_PACKAGES', '');
  config.allowedPackages = pkgs ? pkgs.split(',').map((p) => p.trim()) : [];
  const allowTransportableEditsExplicit =
    getFlag('allow-transportable-edits') ?? process.env.SAP_ALLOW_TRANSPORTABLE_EDITS;
  if (allowTransportableEditsExplicit !== undefined)
    config.allowTransportableEdits =
      allowTransportableEditsExplicit === 'true' || allowTransportableEditsExplicit === '1';
  else if (!profileName) config.allowTransportableEdits = false;

  const enableTransportsExplicit = getFlag('enable-transports') ?? process.env.SAP_ENABLE_TRANSPORTS;
  if (enableTransportsExplicit !== undefined)
    config.enableTransports = enableTransportsExplicit === 'true' || enableTransportsExplicit === '1';
  else if (!profileName) config.enableTransports = false;

  // --- Features ---
  config.featureAbapGit = resolveFeature('feature-abapgit', 'SAP_FEATURE_ABAPGIT');
  config.featureRap = resolveFeature('feature-rap', 'SAP_FEATURE_RAP');
  config.featureAmdp = resolveFeature('feature-amdp', 'SAP_FEATURE_AMDP');
  config.featureUi5 = resolveFeature('feature-ui5', 'SAP_FEATURE_UI5');
  config.featureTransport = resolveFeature('feature-transport', 'SAP_FEATURE_TRANSPORT');
  config.featureHana = resolveFeature('feature-hana', 'SAP_FEATURE_HANA');

  // --- System Type Detection ---
  const systemType = resolve('system-type', 'SAP_SYSTEM_TYPE', 'auto');
  config.systemType = (['btp', 'onprem'].includes(systemType) ? systemType : 'auto') as ServerConfig['systemType'];

  // --- Authentication (MCP client → ARC-1) ---
  config.apiKey = getFlag('api-key') ?? process.env.ARC1_API_KEY;

  // Multiple API keys with per-key profiles: "key1:viewer,key2:developer"
  const apiKeysRaw = getFlag('api-keys') ?? process.env.ARC1_API_KEYS;
  if (apiKeysRaw) {
    config.apiKeys = parseApiKeys(apiKeysRaw);
  }

  config.oidcIssuer = getFlag('oidc-issuer') ?? process.env.SAP_OIDC_ISSUER;
  config.oidcAudience = getFlag('oidc-audience') ?? process.env.SAP_OIDC_AUDIENCE;
  config.xsuaaAuth = resolveBool('xsuaa-auth', 'SAP_XSUAA_AUTH', false);

  // --- BTP ABAP Environment (direct connection via service key) ---
  config.btpServiceKey = getFlag('btp-service-key') ?? process.env.SAP_BTP_SERVICE_KEY;
  config.btpServiceKeyFile = getFlag('btp-service-key-file') ?? process.env.SAP_BTP_SERVICE_KEY_FILE;
  const cbPort = resolve('btp-oauth-callback-port', 'SAP_BTP_OAUTH_CALLBACK_PORT', '0');
  config.btpOAuthCallbackPort = Number.parseInt(cbPort, 10) || 0;

  // --- Principal Propagation ---
  config.ppEnabled = resolveBool('pp-enabled', 'SAP_PP_ENABLED', false);
  config.ppStrict = resolveBool('pp-strict', 'SAP_PP_STRICT', false);

  // --- Tool Mode ---
  const toolMode = resolve('tool-mode', 'ARC1_TOOL_MODE', 'standard');
  config.toolMode = (toolMode === 'hyperfocused' ? 'hyperfocused' : 'standard') as ServerConfig['toolMode'];

  // --- Lint ---
  config.abaplintConfig = getFlag('abaplint-config') ?? process.env.SAP_ABAPLINT_CONFIG;
  config.lintBeforeWrite = resolveBool('lint-before-write', 'SAP_LINT_BEFORE_WRITE', true);

  // --- Cache ---
  const cacheMode = resolve('cache', 'ARC1_CACHE', 'auto');
  config.cacheMode = (
    ['memory', 'sqlite', 'none'].includes(cacheMode) ? cacheMode : 'auto'
  ) as ServerConfig['cacheMode'];
  config.cacheFile = resolve('cache-file', 'ARC1_CACHE_FILE', '.arc1-cache.db');
  config.cacheWarmup = resolveBool('cache-warmup', 'ARC1_CACHE_WARMUP', false);
  config.cacheWarmupPackages = resolve('cache-warmup-packages', 'ARC1_CACHE_WARMUP_PACKAGES', '');

  // --- Logging ---
  config.logFile = getFlag('log-file') ?? process.env.ARC1_LOG_FILE;
  const logLevel = resolve('log-level', 'ARC1_LOG_LEVEL', 'info');
  config.logLevel = (
    ['debug', 'info', 'warn', 'error'].includes(logLevel) ? logLevel : 'info'
  ) as ServerConfig['logLevel'];
  const logFormat = resolve('log-format', 'ARC1_LOG_FORMAT', 'text');
  config.logFormat = (logFormat === 'json' ? 'json' : 'text') as ServerConfig['logFormat'];

  // --- Misc ---
  config.verbose = resolveBool('verbose', 'SAP_VERBOSE', false);
  // --verbose is sugar for --log-level debug
  if (config.verbose) {
    config.logLevel = 'debug';
  }

  return config;
}
