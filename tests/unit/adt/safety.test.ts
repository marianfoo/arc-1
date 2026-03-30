import { describe, expect, it } from 'vitest';
import { AdtSafetyError } from '../../../ts-src/adt/errors.js';
import {
  checkOperation,
  checkPackage,
  checkTransport,
  checkTransportableEdit,
  defaultSafetyConfig,
  describeSafety,
  isOperationAllowed,
  isPackageAllowed,
  isTransportAllowed,
  isTransportWriteAllowed,
  OperationType,
  type SafetyConfig,
  unrestrictedSafetyConfig,
} from '../../../ts-src/adt/safety.js';

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

    it('default config blocks writes and free SQL', () => {
      const cfg = defaultSafetyConfig();
      expect(isOperationAllowed(cfg, OperationType.Read)).toBe(true);
      expect(isOperationAllowed(cfg, OperationType.Search)).toBe(true);
      expect(isOperationAllowed(cfg, OperationType.Create)).toBe(false);
      expect(isOperationAllowed(cfg, OperationType.FreeSQL)).toBe(false);
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

  describe('isTransportAllowed', () => {
    it('returns false when transports are not enabled', () => {
      const cfg = config({ enableTransports: false });
      expect(isTransportAllowed(cfg, 'A4HK900110')).toBe(false);
    });

    it('allows all transports when enabled with empty whitelist', () => {
      const cfg = config({ enableTransports: true });
      expect(isTransportAllowed(cfg, 'A4HK900110')).toBe(true);
    });

    it('enforces transport whitelist', () => {
      const cfg = config({ enableTransports: true, allowedTransports: ['A4HK*', 'DEV*'] });
      expect(isTransportAllowed(cfg, 'A4HK900110')).toBe(true);
      expect(isTransportAllowed(cfg, 'DEVK900001')).toBe(true);
      expect(isTransportAllowed(cfg, 'PROD900001')).toBe(false);
    });
  });

  describe('isTransportWriteAllowed', () => {
    it('returns false when transports are not enabled', () => {
      const cfg = config({ enableTransports: false });
      expect(isTransportWriteAllowed(cfg)).toBe(false);
    });

    it('returns false when transport read-only', () => {
      const cfg = config({ enableTransports: true, transportReadOnly: true });
      expect(isTransportWriteAllowed(cfg)).toBe(false);
    });

    it('returns true when enabled and not read-only', () => {
      const cfg = config({ enableTransports: true, transportReadOnly: false });
      expect(isTransportWriteAllowed(cfg)).toBe(true);
    });
  });

  describe('checkTransport', () => {
    it('allows read operations when allowTransportableEdits is true', () => {
      const cfg = config({ enableTransports: false, allowTransportableEdits: true });
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

  describe('checkTransportableEdit', () => {
    it('allows operations without transport (local object)', () => {
      const cfg = config({ allowTransportableEdits: false });
      expect(() => checkTransportableEdit(cfg, '', 'UpdateSource')).not.toThrow();
    });

    it('blocks transportable edits when not allowed', () => {
      const cfg = config({ allowTransportableEdits: false });
      expect(() => checkTransportableEdit(cfg, 'A4HK900110', 'UpdateSource')).toThrow(AdtSafetyError);
    });

    it('allows transportable edits when flag is set', () => {
      const cfg = config({ allowTransportableEdits: true });
      expect(() => checkTransportableEdit(cfg, 'A4HK900110', 'UpdateSource')).not.toThrow();
    });

    it('checks transport whitelist even when edits are allowed', () => {
      const cfg = config({ allowTransportableEdits: true, allowedTransports: ['DEV*'] });
      expect(() => checkTransportableEdit(cfg, 'A4HK900110', 'UpdateSource')).toThrow(AdtSafetyError);
      expect(() => checkTransportableEdit(cfg, 'DEVK900001', 'UpdateSource')).not.toThrow();
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
  });
});
