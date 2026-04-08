import { describe, expect, it } from 'vitest';
import { AdtSafetyError } from '../../../src/adt/errors.js';
import {
  checkOperation,
  checkPackage,
  checkTransport,
  defaultSafetyConfig,
  deriveUserSafety,
  describeSafety,
  isOperationAllowed,
  isPackageAllowed,
  OperationType,
  type SafetyConfig,
  unrestrictedSafetyConfig,
} from '../../../src/adt/safety.js';

/** Helper to create a config with overrides */
function config(overrides: Partial<SafetyConfig> = {}): SafetyConfig {
  return { ...unrestrictedSafetyConfig(), ...overrides };
}

describe('Safety System', () => {
  describe('isOperationAllowed', () => {
    it('allows all operations when unrestricted', () => {
      const cfg = config();
      expect(isOperationAllowed(cfg, OperationType.Read)).toBe(true);
      expect(isOperationAllowed(cfg, OperationType.Create)).toBe(true);
      expect(isOperationAllowed(cfg, OperationType.Delete)).toBe(true);
      expect(isOperationAllowed(cfg, OperationType.FreeSQL)).toBe(true);
    });

    it('blocks write ops in read-only mode', () => {
      const cfg = config({ readOnly: true });
      expect(isOperationAllowed(cfg, OperationType.Read)).toBe(true);
      expect(isOperationAllowed(cfg, OperationType.Search)).toBe(true);
      expect(isOperationAllowed(cfg, OperationType.Query)).toBe(true);
      expect(isOperationAllowed(cfg, OperationType.Create)).toBe(false);
      expect(isOperationAllowed(cfg, OperationType.Update)).toBe(false);
      expect(isOperationAllowed(cfg, OperationType.Delete)).toBe(false);
      expect(isOperationAllowed(cfg, OperationType.Activate)).toBe(false);
      expect(isOperationAllowed(cfg, OperationType.Workflow)).toBe(false);
    });

    it('blocks free SQL when blockFreeSQL is true', () => {
      const cfg = config({ blockFreeSQL: true });
      expect(isOperationAllowed(cfg, OperationType.FreeSQL)).toBe(false);
      expect(isOperationAllowed(cfg, OperationType.Query)).toBe(true);
    });

    it('blocks Query when blockData is true', () => {
      const cfg = config({ blockData: true });
      expect(isOperationAllowed(cfg, OperationType.Query)).toBe(false);
      expect(isOperationAllowed(cfg, OperationType.FreeSQL)).toBe(true);
      expect(isOperationAllowed(cfg, OperationType.Read)).toBe(true);
    });

    it('blocks both Query and FreeSQL when blockData and blockFreeSQL are true', () => {
      const cfg = config({ blockData: true, blockFreeSQL: true });
      expect(isOperationAllowed(cfg, OperationType.Query)).toBe(false);
      expect(isOperationAllowed(cfg, OperationType.FreeSQL)).toBe(false);
      expect(isOperationAllowed(cfg, OperationType.Read)).toBe(true);
    });

    it('dryRun bypasses blockData', () => {
      const cfg = config({ blockData: true, dryRun: true });
      expect(isOperationAllowed(cfg, OperationType.Query)).toBe(true);
    });

    it('enforces allowedOps whitelist', () => {
      const cfg = config({ allowedOps: 'RSQ' });
      expect(isOperationAllowed(cfg, OperationType.Read)).toBe(true);
      expect(isOperationAllowed(cfg, OperationType.Search)).toBe(true);
      expect(isOperationAllowed(cfg, OperationType.Query)).toBe(true);
      expect(isOperationAllowed(cfg, OperationType.Create)).toBe(false);
      expect(isOperationAllowed(cfg, OperationType.Delete)).toBe(false);
    });

    it('enforces disallowedOps blacklist', () => {
      const cfg = config({ disallowedOps: 'CD' });
      expect(isOperationAllowed(cfg, OperationType.Read)).toBe(true);
      expect(isOperationAllowed(cfg, OperationType.Create)).toBe(false);
      expect(isOperationAllowed(cfg, OperationType.Delete)).toBe(false);
      expect(isOperationAllowed(cfg, OperationType.Update)).toBe(true);
    });

    it('disallowedOps takes precedence over allowedOps', () => {
      const cfg = config({ allowedOps: 'RSQC', disallowedOps: 'C' });
      expect(isOperationAllowed(cfg, OperationType.Read)).toBe(true);
      expect(isOperationAllowed(cfg, OperationType.Create)).toBe(false);
    });

    it('transport operations require explicit opt-in', () => {
      const cfg = config({ enableTransports: false });
      expect(isOperationAllowed(cfg, OperationType.Transport)).toBe(false);

      const cfg2 = config({ enableTransports: true });
      expect(isOperationAllowed(cfg2, OperationType.Transport)).toBe(true);
    });

    it('dryRun allows everything', () => {
      const cfg = config({ readOnly: true, blockFreeSQL: true, dryRun: true });
      expect(isOperationAllowed(cfg, OperationType.Create)).toBe(true);
      expect(isOperationAllowed(cfg, OperationType.FreeSQL)).toBe(true);
    });

    it('default config blocks writes, free SQL, and data queries', () => {
      const cfg = defaultSafetyConfig();
      expect(isOperationAllowed(cfg, OperationType.Read)).toBe(true);
      expect(isOperationAllowed(cfg, OperationType.Search)).toBe(true);
      expect(isOperationAllowed(cfg, OperationType.Create)).toBe(false);
      expect(isOperationAllowed(cfg, OperationType.FreeSQL)).toBe(false);
      expect(isOperationAllowed(cfg, OperationType.Query)).toBe(false);
    });

    it('unrestricted config allows Query', () => {
      const cfg = unrestrictedSafetyConfig();
      expect(isOperationAllowed(cfg, OperationType.Query)).toBe(true);
    });
  });

  describe('checkOperation', () => {
    it('throws AdtSafetyError when operation is blocked', () => {
      const cfg = config({ readOnly: true });
      expect(() => checkOperation(cfg, OperationType.Create, 'CreateObject')).toThrow(AdtSafetyError);
    });

    it('does not throw when operation is allowed', () => {
      const cfg = config();
      expect(() => checkOperation(cfg, OperationType.Create, 'CreateObject')).not.toThrow();
    });

    it('throws AdtSafetyError when Query is blocked by blockData', () => {
      const cfg = config({ blockData: true });
      expect(() => checkOperation(cfg, OperationType.Query, 'GetTableContents')).toThrow(AdtSafetyError);
    });

    it('error message includes operation name and type', () => {
      const cfg = config({ readOnly: true });
      try {
        checkOperation(cfg, OperationType.Create, 'CreateObject');
      } catch (e) {
        expect((e as Error).message).toContain('CreateObject');
        expect((e as Error).message).toContain('C');
      }
    });
  });

  describe('isPackageAllowed', () => {
    it('allows all packages when allowedPackages is empty', () => {
      const cfg = config();
      expect(isPackageAllowed(cfg, '$TMP')).toBe(true);
      expect(isPackageAllowed(cfg, 'ZTEST')).toBe(true);
      expect(isPackageAllowed(cfg, 'SAP_BASIS')).toBe(true);
    });

    it('allows exact match', () => {
      const cfg = config({ allowedPackages: ['$TMP', 'ZTEST'] });
      expect(isPackageAllowed(cfg, '$TMP')).toBe(true);
      expect(isPackageAllowed(cfg, 'ZTEST')).toBe(true);
      expect(isPackageAllowed(cfg, 'ZOTHER')).toBe(false);
    });

    it('supports wildcard matching', () => {
      const cfg = config({ allowedPackages: ['Z*', '$TMP'] });
      expect(isPackageAllowed(cfg, 'ZTEST')).toBe(true);
      expect(isPackageAllowed(cfg, 'ZRAY')).toBe(true);
      expect(isPackageAllowed(cfg, '$TMP')).toBe(true);
      expect(isPackageAllowed(cfg, 'SAP_BASIS')).toBe(false);
    });

    it('is case-insensitive', () => {
      const cfg = config({ allowedPackages: ['z*'] });
      expect(isPackageAllowed(cfg, 'ZTEST')).toBe(true);
      expect(isPackageAllowed(cfg, 'ztest')).toBe(true);
    });
  });

  describe('checkPackage', () => {
    it('throws AdtSafetyError when package is blocked', () => {
      const cfg = config({ allowedPackages: ['$TMP'] });
      expect(() => checkPackage(cfg, 'ZTEST')).toThrow(AdtSafetyError);
    });

    it('does not throw when package is allowed', () => {
      const cfg = config({ allowedPackages: ['$TMP'] });
      expect(() => checkPackage(cfg, '$TMP')).not.toThrow();
    });
  });

  describe('checkTransport', () => {
    it('blocks read operations when enableTransports is false', () => {
      const cfg = config({ enableTransports: false });
      expect(() => checkTransport(cfg, '', 'ListTransports', false)).toThrow(AdtSafetyError);
    });

    it('allows read operations when enableTransports is true', () => {
      const cfg = config({ enableTransports: true });
      expect(() => checkTransport(cfg, '', 'ListTransports', false)).not.toThrow();
    });

    it('blocks write operations without enableTransports', () => {
      const cfg = config({ enableTransports: false });
      expect(() => checkTransport(cfg, '', 'CreateTransport', true)).toThrow(AdtSafetyError);
    });

    it('blocks write operations in transport read-only mode', () => {
      const cfg = config({ enableTransports: true, transportReadOnly: true });
      expect(() => checkTransport(cfg, '', 'ReleaseTransport', true)).toThrow(AdtSafetyError);
    });

    it('allows write operations when fully enabled', () => {
      const cfg = config({ enableTransports: true });
      expect(() => checkTransport(cfg, '', 'CreateTransport', true)).not.toThrow();
    });
  });

  describe('checkPackage with $TMP default', () => {
    it('default config (allowedPackages: [$TMP]) allows $TMP', () => {
      const cfg = config({ allowedPackages: ['$TMP'] });
      expect(() => checkPackage(cfg, '$TMP')).not.toThrow();
    });

    it('default config (allowedPackages: [$TMP]) blocks ZTEST', () => {
      const cfg = config({ allowedPackages: ['$TMP'] });
      expect(() => checkPackage(cfg, 'ZTEST')).toThrow(AdtSafetyError);
    });

    it('allowedPackages: [Z*, $TMP] allows both', () => {
      const cfg = config({ allowedPackages: ['Z*', '$TMP'] });
      expect(() => checkPackage(cfg, '$TMP')).not.toThrow();
      expect(() => checkPackage(cfg, 'ZTEST')).not.toThrow();
      expect(() => checkPackage(cfg, 'SAP_BASIS')).toThrow(AdtSafetyError);
    });

    it('allowedPackages: [] allows anything (unrestricted)', () => {
      const cfg = config({ allowedPackages: [] });
      expect(() => checkPackage(cfg, '$TMP')).not.toThrow();
      expect(() => checkPackage(cfg, 'ZTEST')).not.toThrow();
      expect(() => checkPackage(cfg, 'SAP_BASIS')).not.toThrow();
    });
  });

  describe('isPackageAllowed edge cases', () => {
    it('blocks empty string package name (Issue #71)', () => {
      const cfg = config({ allowedPackages: ['Z*', '$TMP'] });
      expect(isPackageAllowed(cfg, '')).toBe(false);
    });

    it('handles $-prefixed packages with wildcard', () => {
      const cfg = config({ allowedPackages: ['$*'] });
      expect(isPackageAllowed(cfg, '$TMP')).toBe(true);
      expect(isPackageAllowed(cfg, 'ZTEST')).toBe(false);
    });

    it('supports multiple wildcard patterns (Issue #54)', () => {
      // Users need Z* AND $* to support both custom and local packages
      const cfg = config({ allowedPackages: ['Z*', '$*'] });
      expect(isPackageAllowed(cfg, 'ZTEST')).toBe(true);
      expect(isPackageAllowed(cfg, '$TMP')).toBe(true);
      expect(isPackageAllowed(cfg, 'SAP_BASIS')).toBe(false);
    });

    it('handles single character wildcard', () => {
      const cfg = config({ allowedPackages: ['Z*'] });
      expect(isPackageAllowed(cfg, 'Z')).toBe(true); // just 'Z' matches Z*
    });

    it('exact match when no wildcard', () => {
      const cfg = config({ allowedPackages: ['ZPACKAGE'] });
      expect(isPackageAllowed(cfg, 'ZPACKAGE')).toBe(true);
      expect(isPackageAllowed(cfg, 'ZPACKAGE1')).toBe(false);
    });
  });

  describe('deriveUserSafety', () => {
    it('no write scope → readOnly=true, enableTransports=false', () => {
      const server = config({ readOnly: false, enableTransports: true });
      const result = deriveUserSafety(server, ['read', 'data']);
      expect(result.readOnly).toBe(true);
      expect(result.enableTransports).toBe(false);
    });

    it('no data and no sql scope → blockData=true', () => {
      const server = config({ blockData: false });
      const result = deriveUserSafety(server, ['read', 'write']);
      expect(result.blockData).toBe(true);
    });

    it('no sql scope → blockFreeSQL=true', () => {
      const server = config({ blockFreeSQL: false });
      const result = deriveUserSafety(server, ['read', 'data']);
      expect(result.blockFreeSQL).toBe(true);
    });

    it('write scope present → readOnly unchanged from server', () => {
      const server = config({ readOnly: false });
      const result = deriveUserSafety(server, ['read', 'write']);
      expect(result.readOnly).toBe(false);
    });

    it('sql scope present → blockFreeSQL unchanged from server', () => {
      const server = config({ blockFreeSQL: false });
      const result = deriveUserSafety(server, ['read', 'sql']);
      expect(result.blockFreeSQL).toBe(false);
    });

    it('data scope present → blockData unchanged from server', () => {
      const server = config({ blockData: false });
      const result = deriveUserSafety(server, ['read', 'data']);
      expect(result.blockData).toBe(false);
    });

    it('server readOnly=true + write scope → still readOnly (server wins)', () => {
      const server = config({ readOnly: true });
      const result = deriveUserSafety(server, ['read', 'write']);
      expect(result.readOnly).toBe(true);
    });

    it('server blockFreeSQL=true + sql scope → still blocked (server wins)', () => {
      const server = config({ blockFreeSQL: true });
      const result = deriveUserSafety(server, ['read', 'sql']);
      expect(result.blockFreeSQL).toBe(true);
    });

    it('server blockData=true + data scope → still blocked (server wins)', () => {
      const server = config({ blockData: true });
      const result = deriveUserSafety(server, ['read', 'data']);
      expect(result.blockData).toBe(true);
    });

    it('implied scopes: sql without data → blockData unchanged', () => {
      const server = config({ blockData: false, blockFreeSQL: false });
      const result = deriveUserSafety(server, ['read', 'sql']);
      expect(result.blockData).toBe(false);
      expect(result.blockFreeSQL).toBe(false);
    });

    it('implied scopes: write without read → readOnly unchanged', () => {
      const server = config({ readOnly: false });
      const result = deriveUserSafety(server, ['write']);
      expect(result.readOnly).toBe(false);
    });

    it('empty scopes → most restrictive', () => {
      const server = config({ readOnly: false, blockFreeSQL: false, blockData: false, enableTransports: true });
      const result = deriveUserSafety(server, []);
      expect(result.readOnly).toBe(true);
      expect(result.blockFreeSQL).toBe(true);
      expect(result.blockData).toBe(true);
      expect(result.enableTransports).toBe(false);
    });

    it('all scopes → nothing restricted beyond server config', () => {
      const server = config({ readOnly: false, blockFreeSQL: false, blockData: false, enableTransports: true });
      const result = deriveUserSafety(server, ['read', 'write', 'data', 'sql', 'admin']);
      expect(result.readOnly).toBe(false);
      expect(result.blockFreeSQL).toBe(false);
      expect(result.blockData).toBe(false);
      expect(result.enableTransports).toBe(true);
    });

    it('preserves other server config fields unchanged', () => {
      const server = config({ allowedOps: 'RSQ', disallowedOps: 'D', allowedPackages: ['Z*'], dryRun: true });
      const result = deriveUserSafety(server, ['read', 'write', 'data', 'sql']);
      expect(result.allowedOps).toBe('RSQ');
      expect(result.disallowedOps).toBe('D');
      expect(result.allowedPackages).toEqual(['Z*']);
      expect(result.dryRun).toBe(true);
    });

    it('does not mutate the original server config', () => {
      const server = config({ readOnly: false, blockData: false, blockFreeSQL: false });
      deriveUserSafety(server, []);
      expect(server.readOnly).toBe(false);
      expect(server.blockData).toBe(false);
      expect(server.blockFreeSQL).toBe(false);
    });

    it('write scope enables transports if server allows', () => {
      const server = config({ enableTransports: true });
      const result = deriveUserSafety(server, ['read', 'write']);
      expect(result.enableTransports).toBe(true);
    });

    it('server enableTransports=false + write scope → still disabled (server wins)', () => {
      const server = config({ enableTransports: false });
      const result = deriveUserSafety(server, ['read', 'write']);
      expect(result.enableTransports).toBe(false);
    });

    it('data scope without sql → blockFreeSQL=true', () => {
      const server = config({ blockFreeSQL: false, blockData: false });
      const result = deriveUserSafety(server, ['read', 'data']);
      expect(result.blockData).toBe(false);
      expect(result.blockFreeSQL).toBe(true);
    });

    it('only admin scope → most restrictive (admin does not imply read/write/data)', () => {
      const server = config({ readOnly: false, blockData: false, blockFreeSQL: false });
      const result = deriveUserSafety(server, ['admin']);
      expect(result.readOnly).toBe(true);
      expect(result.blockData).toBe(true);
      expect(result.blockFreeSQL).toBe(true);
    });
  });

  describe('describeSafety', () => {
    it('returns UNRESTRICTED for default unrestricted config', () => {
      expect(describeSafety(unrestrictedSafetyConfig())).toBe('UNRESTRICTED');
    });

    it('lists active flags', () => {
      const cfg = config({ readOnly: true, blockFreeSQL: true, allowedPackages: ['$TMP'] });
      const desc = describeSafety(cfg);
      expect(desc).toContain('READ-ONLY');
      expect(desc).toContain('NO-FREE-SQL');
      expect(desc).toContain('AllowedPackages=');
    });

    it('includes NO-DATA when blockData is true', () => {
      const cfg = config({ blockData: true });
      const desc = describeSafety(cfg);
      expect(desc).toContain('NO-DATA');
    });
  });
});
