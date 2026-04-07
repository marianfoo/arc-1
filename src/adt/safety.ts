/**
 * Safety system for ARC-1.
 *
 * Gates all operations before they reach SAP. This is the first line of defense
 * against unintended modifications — it runs before any HTTP call.
 *
 * Key design principle: safety checks are declarative and composable.
 * Each check is independent: readOnly, blockFreeSQL, allowedOps, disallowedOps,
 * allowedPackages, enableTransports, etc. They combine additively — if ANY
 * check blocks the operation, it's blocked.
 *
 * This matches the Go implementation exactly (pkg/adt/safety.go) to ensure
 * behavioral parity during migration.
 */

import { AdtSafetyError } from './errors.js';

/**
 * Operation type codes.
 * Single-character codes used in allowedOps/disallowedOps strings.
 * Example: "RSQ" = allow Read, Search, Query only.
 */
export const OperationType = {
  Read: 'R',
  Search: 'S',
  Query: 'Q',
  FreeSQL: 'F',
  Create: 'C',
  Update: 'U',
  Delete: 'D',
  Activate: 'A',
  Test: 'T',
  Lock: 'L',
  Intelligence: 'I',
  Workflow: 'W',
  Transport: 'X',
} as const;

export type OperationTypeCode = (typeof OperationType)[keyof typeof OperationType];

/** Write operations that are blocked in read-only mode */
const WRITE_OPS = 'CDUAW';

export interface SafetyConfig {
  readOnly: boolean;
  blockFreeSQL: boolean;
  blockData: boolean;
  allowedOps: string;
  disallowedOps: string;
  allowedPackages: string[];
  dryRun: boolean;
  enableTransports: boolean;
  transportReadOnly: boolean;
  allowedTransports: string[];
  allowTransportableEdits: boolean;
}

/** Safe defaults: read-only, no free SQL, standard ops only */
export function defaultSafetyConfig(): SafetyConfig {
  return {
    readOnly: true,
    blockFreeSQL: true,
    blockData: true,
    allowedOps: 'RSQTI',
    disallowedOps: '',
    allowedPackages: [],
    dryRun: false,
    enableTransports: false,
    transportReadOnly: false,
    allowedTransports: [],
    allowTransportableEdits: false,
  };
}

/** No restrictions — use with caution */
export function unrestrictedSafetyConfig(): SafetyConfig {
  return {
    readOnly: false,
    blockFreeSQL: false,
    blockData: false,
    allowedOps: '',
    disallowedOps: '',
    allowedPackages: [],
    dryRun: false,
    enableTransports: false,
    transportReadOnly: false,
    allowedTransports: [],
    allowTransportableEdits: false,
  };
}

/** Check if an operation type is allowed by the safety config */
export function isOperationAllowed(config: SafetyConfig, op: OperationTypeCode): boolean {
  // DryRun mode allows everything (but doesn't execute)
  if (config.dryRun) return true;

  // ReadOnly blocks all write operations
  if (config.readOnly && WRITE_OPS.includes(op)) return false;

  // BlockFreeSQL specifically blocks free SQL queries
  if (config.blockFreeSQL && op === OperationType.FreeSQL) return false;

  // BlockData blocks named table preview queries
  if (config.blockData && op === OperationType.Query) return false;

  // Transport operations require explicit opt-in
  if (op === OperationType.Transport && !config.enableTransports) return false;

  // Disallowed ops blacklist (takes precedence over allowed)
  if (config.disallowedOps?.includes(op)) return false;

  // Allowed ops whitelist (if set, only listed ops are allowed)
  if (config.allowedOps && !config.allowedOps.includes(op)) return false;

  return true;
}

/** Check operation and throw AdtSafetyError if blocked */
export function checkOperation(config: SafetyConfig, op: OperationTypeCode, opName: string): void {
  if (!isOperationAllowed(config, op)) {
    throw new AdtSafetyError(`Operation '${opName}' (type ${op}) is blocked by safety configuration`);
  }
}

/** Check if operations on a given package are allowed */
export function isPackageAllowed(config: SafetyConfig, pkg: string): boolean {
  if (config.allowedPackages.length === 0) return true;

  const upperPkg = pkg.toUpperCase();

  for (const allowed of config.allowedPackages) {
    const upperAllowed = allowed.toUpperCase();

    // Exact match
    if (upperAllowed === upperPkg) return true;

    // Wildcard match: "Z*" matches "ZTEST", "ZRAY", etc.
    if (upperAllowed.endsWith('*')) {
      const prefix = upperAllowed.slice(0, -1);
      if (upperPkg.startsWith(prefix)) return true;
    }
  }

  return false;
}

/** Check package and throw AdtSafetyError if blocked */
export function checkPackage(config: SafetyConfig, pkg: string): void {
  if (!isPackageAllowed(config, pkg)) {
    throw new AdtSafetyError(
      `Operations on package '${pkg}' are blocked by safety configuration (allowed: ${JSON.stringify(config.allowedPackages)})`,
    );
  }
}

/** Check if a transport is in the whitelist (helper, doesn't check enableTransports) */
function isTransportInWhitelist(config: SafetyConfig, transport: string): boolean {
  if (config.allowedTransports.length === 0) return true;

  const upperTransport = transport.toUpperCase();

  for (const allowed of config.allowedTransports) {
    const upperAllowed = allowed.toUpperCase();
    if (upperAllowed === upperTransport) return true;
    if (upperAllowed.endsWith('*')) {
      const prefix = upperAllowed.slice(0, -1);
      if (upperTransport.startsWith(prefix)) return true;
    }
  }

  return false;
}

/** Check if operations on a given transport are allowed */
export function isTransportAllowed(config: SafetyConfig, transport: string): boolean {
  if (!config.enableTransports) return false;
  if (config.allowedTransports.length === 0) return true;
  return isTransportInWhitelist(config, transport);
}

/** Check if transport write operations are allowed */
export function isTransportWriteAllowed(config: SafetyConfig): boolean {
  if (!config.enableTransports) return false;
  return !config.transportReadOnly;
}

/** Check transport operation and throw AdtSafetyError if blocked */
export function checkTransport(config: SafetyConfig, transport: string, opName: string, isWrite: boolean): void {
  // For read operations, allow if enableTransports OR allowTransportableEdits
  if (!isWrite && (config.enableTransports || config.allowTransportableEdits)) {
    if (transport && transport !== '*' && config.allowedTransports.length > 0) {
      if (!isTransportInWhitelist(config, transport)) {
        throw new AdtSafetyError(
          `Operation '${opName}' on transport '${transport}' is blocked by safety configuration (allowed: ${JSON.stringify(config.allowedTransports)})`,
        );
      }
    }
    return;
  }

  // For write operations, require enableTransports
  if (!config.enableTransports) {
    if (config.allowTransportableEdits && isWrite) {
      throw new AdtSafetyError(
        `Transport write operation '${opName}' requires --enable-transports flag (--allow-transportable-edits only enables read operations)`,
      );
    }
    throw new AdtSafetyError(
      `Transport operation '${opName}' is blocked: transports not enabled (use --enable-transports or SAP_ENABLE_TRANSPORTS=true)`,
    );
  }

  // Check write permissions
  if (isWrite && config.transportReadOnly) {
    throw new AdtSafetyError(`Transport write operation '${opName}' is blocked: transport read-only mode enabled`);
  }

  // Check transport whitelist
  if (transport && transport !== '*' && config.allowedTransports.length > 0) {
    if (!isTransportAllowed(config, transport)) {
      throw new AdtSafetyError(
        `Operation '${opName}' on transport '${transport}' is blocked by safety configuration (allowed: ${JSON.stringify(config.allowedTransports)})`,
      );
    }
  }
}

/** Check if editing a transportable object is allowed */
export function checkTransportableEdit(config: SafetyConfig, transport: string, opName: string): void {
  if (!transport) return; // No transport = local object, always allowed

  if (!config.allowTransportableEdits) {
    throw new AdtSafetyError(
      `Operation '${opName}' with transport '${transport}' is blocked: editing transportable objects is disabled.\n` +
        'Objects in transportable packages require explicit opt-in.\n' +
        'Use --allow-transportable-edits or SAP_ALLOW_TRANSPORTABLE_EDITS=true to enable.\n' +
        'WARNING: This allows modifications to non-local objects that may affect production systems.',
    );
  }

  // If transportable edits are allowed, also check transport whitelist
  if (config.allowedTransports.length > 0 && !isTransportInWhitelist(config, transport)) {
    throw new AdtSafetyError(
      `Operation '${opName}' with transport '${transport}' is blocked by safety configuration (allowed transports: ${JSON.stringify(config.allowedTransports)})`,
    );
  }
}

/**
 * Expand implied scopes: `write` implies `read`, `sql` implies `data`.
 * Returns a new array with implied scopes added.
 */
export function expandImpliedScopes(scopes: string[]): string[] {
  const expanded = new Set(scopes);
  if (expanded.has('write')) expanded.add('read');
  if (expanded.has('sql')) expanded.add('data');
  return [...expanded];
}

/**
 * Derive a per-user safety config by merging server-level config (ceiling)
 * with JWT scopes. Scopes can only RESTRICT further, never expand beyond
 * what the server config allows.
 *
 * Key principle: start with server config, only tighten booleans (false→true).
 * Never loosen (true→false).
 */
export function deriveUserSafety(serverConfig: SafetyConfig, scopes: string[]): SafetyConfig {
  const effective = {
    ...serverConfig,
    allowedPackages: [...serverConfig.allowedPackages],
    allowedTransports: [...serverConfig.allowedTransports],
  };
  const expanded = expandImpliedScopes(scopes);

  // No write scope → force read-only and disable transports
  if (!expanded.includes('write')) {
    effective.readOnly = true;
    effective.enableTransports = false;
    effective.allowTransportableEdits = false;
  }

  // No data scope (and no sql, which implies data) → block table preview
  if (!expanded.includes('data')) {
    effective.blockData = true;
  }

  // No sql scope → block free SQL
  if (!expanded.includes('sql')) {
    effective.blockFreeSQL = true;
  }

  return effective;
}

/** Human-readable description of the safety configuration */
export function describeSafety(config: SafetyConfig): string {
  const parts: string[] = [];

  if (config.readOnly) parts.push('READ-ONLY');
  if (config.blockFreeSQL) parts.push('NO-FREE-SQL');
  if (config.blockData) parts.push('NO-DATA');
  if (config.dryRun) parts.push('DRY-RUN');
  if (config.allowedOps) parts.push(`AllowedOps=${config.allowedOps}`);
  if (config.disallowedOps) parts.push(`DisallowedOps=${config.disallowedOps}`);
  if (config.allowedPackages.length > 0) parts.push(`AllowedPackages=[${config.allowedPackages.join(',')}]`);
  if (config.enableTransports) {
    parts.push('TRANSPORTS-ENABLED');
    if (config.transportReadOnly) parts.push('TRANSPORT-READ-ONLY');
    if (config.allowedTransports.length > 0) parts.push(`AllowedTransports=[${config.allowedTransports.join(',')}]`);
  }
  if (config.allowTransportableEdits) parts.push('TRANSPORTABLE-EDITS-ALLOWED');

  return parts.length === 0 ? 'UNRESTRICTED' : parts.join(', ');
}
