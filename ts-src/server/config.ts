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
  config.client = resolve('client', 'SAP_CLIENT', '001');
  config.language = resolve('language', 'SAP_LANGUAGE', 'EN');
  config.insecure = resolveBool('insecure', 'SAP_INSECURE', false);

  // --- Cookie Auth ---
  config.cookieFile = getFlag('cookie-file') ?? process.env.SAP_COOKIE_FILE;
  config.cookieString = getFlag('cookie-string') ?? process.env.SAP_COOKIE_STRING;

  // --- Transport ---
  const transport = resolve('transport', 'SAP_TRANSPORT', 'stdio');
  config.transport = (transport === 'http-streamable' ? 'http-streamable' : 'stdio') as TransportType;
  config.httpAddr = resolve('http-addr', 'SAP_HTTP_ADDR', '0.0.0.0:8080');

  // --- Safety ---
  config.readOnly = resolveBool('read-only', 'SAP_READ_ONLY', false);
  config.blockFreeSQL = resolveBool('block-free-sql', 'SAP_BLOCK_FREE_SQL', false);
  config.allowedOps = resolve('allowed-ops', 'SAP_ALLOWED_OPS', '');
  config.disallowedOps = resolve('disallowed-ops', 'SAP_DISALLOWED_OPS', '');
  const pkgs = resolve('allowed-packages', 'SAP_ALLOWED_PACKAGES', '');
  config.allowedPackages = pkgs ? pkgs.split(',').map((p) => p.trim()) : [];
  config.allowTransportableEdits = resolveBool('allow-transportable-edits', 'SAP_ALLOW_TRANSPORTABLE_EDITS', false);
  config.enableTransports = resolveBool('enable-transports', 'SAP_ENABLE_TRANSPORTS', false);

  // --- Features ---
  config.featureAbapGit = resolveFeature('feature-abapgit', 'SAP_FEATURE_ABAPGIT');
  config.featureRap = resolveFeature('feature-rap', 'SAP_FEATURE_RAP');
  config.featureAmdp = resolveFeature('feature-amdp', 'SAP_FEATURE_AMDP');
  config.featureUi5 = resolveFeature('feature-ui5', 'SAP_FEATURE_UI5');
  config.featureTransport = resolveFeature('feature-transport', 'SAP_FEATURE_TRANSPORT');
  config.featureHana = resolveFeature('feature-hana', 'SAP_FEATURE_HANA');

  // --- Authentication (MCP client → ARC-1) ---
  config.apiKey = getFlag('api-key') ?? process.env.ARC1_API_KEY;
  config.oidcIssuer = getFlag('oidc-issuer') ?? process.env.SAP_OIDC_ISSUER;
  config.oidcAudience = getFlag('oidc-audience') ?? process.env.SAP_OIDC_AUDIENCE;
  config.xsuaaAuth = resolveBool('xsuaa-auth', 'SAP_XSUAA_AUTH', false);

  // --- Principal Propagation ---
  config.ppEnabled = resolveBool('pp-enabled', 'SAP_PP_ENABLED', false);
  config.ppStrict = resolveBool('pp-strict', 'SAP_PP_STRICT', false);

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
