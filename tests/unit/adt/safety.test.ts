import { describe, expect, it } from 'vitest';
import { AdtSafetyError } from '../../../src/adt/errors.js';
import {
  checkGit,
  checkOperation,
  checkPackage,
  checkTransport,
  defaultSafetyConfig,
  deriveUserSafety,
  deriveUserSafetyFromProfile,
  describeSafety,
  isOperationAllowed,
  isPackageAllowed,
  OperationType,
  type SafetyConfig,
  unrestrictedSafetyConfig,
} from '../../../src/adt/safety.js';

/** Helper to create a config with overrides on top of UNRESTRICTED. */
function config(overrides: Partial<SafetyConfig> = {}): SafetyConfig {
  return { ...unrestrictedSafetyConfig(), ...overrides };
}

describe('Safety System', () => {
  describe('defaults', () => {
    it('defaultSafetyConfig is restrictive (all allow* false, $TMP only)', () => {
      const cfg = defaultSafetyConfig();
      expect(cfg.allowWrites).toBe(false);
      expect(cfg.allowDataPreview).toBe(false);
      expect(cfg.allowFreeSQL).toBe(false);
      expect(cfg.allowTransportWrites).toBe(false);
      expect(cfg.allowGitWrites).toBe(false);
      expect(cfg.allowedPackages).toEqual(['$TMP']);
      expect(cfg.allowedTransports).toEqual([]);
      expect(cfg.denyActions).toEqual([]);
    });

    it('unrestrictedSafetyConfig enables everything', () => {
      const cfg = unrestrictedSafetyConfig();
      expect(cfg.allowWrites).toBe(true);
      expect(cfg.allowDataPreview).toBe(true);
      expect(cfg.allowFreeSQL).toBe(true);
      expect(cfg.allowTransportWrites).toBe(true);
      expect(cfg.allowGitWrites).toBe(true);
      expect(cfg.allowedPackages).toEqual([]);
    });
  });

  describe('isOperationAllowed', () => {
    it('allows all operations when unrestricted', () => {
      const cfg = config();
      expect(isOperationAllowed(cfg, OperationType.Read)).toBe(true);
      expect(isOperationAllowed(cfg, OperationType.Create)).toBe(true);
      expect(isOperationAllowed(cfg, OperationType.Delete)).toBe(true);
      expect(isOperationAllowed(cfg, OperationType.FreeSQL)).toBe(true);
      expect(isOperationAllowed(cfg, OperationType.Transport)).toBe(true);
    });

    it('blocks mutations when allowWrites=false', () => {
      const cfg = config({ allowWrites: false });
      expect(isOperationAllowed(cfg, OperationType.Read)).toBe(true);
      expect(isOperationAllowed(cfg, OperationType.Search)).toBe(true);
      expect(isOperationAllowed(cfg, OperationType.Create)).toBe(false);
      expect(isOperationAllowed(cfg, OperationType.Update)).toBe(false);
      expect(isOperationAllowed(cfg, OperationType.Delete)).toBe(false);
      expect(isOperationAllowed(cfg, OperationType.Activate)).toBe(false);
      expect(isOperationAllowed(cfg, OperationType.Workflow)).toBe(false);
      expect(isOperationAllowed(cfg, OperationType.Transport)).toBe(false);
    });

    it('Query requires allowDataPreview', () => {
      const cfg = config({ allowDataPreview: false });
      expect(isOperationAllowed(cfg, OperationType.Query)).toBe(false);
      expect(isOperationAllowed(cfg, OperationType.Read)).toBe(true);
    });

    it('FreeSQL requires allowFreeSQL', () => {
      const cfg = config({ allowFreeSQL: false });
      expect(isOperationAllowed(cfg, OperationType.FreeSQL)).toBe(false);
      expect(isOperationAllowed(cfg, OperationType.Query)).toBe(true);
    });

    it('Transport requires BOTH allowWrites AND allowTransportWrites', () => {
      expect(
        isOperationAllowed(config({ allowWrites: true, allowTransportWrites: true }), OperationType.Transport),
      ).toBe(true);
      expect(
        isOperationAllowed(config({ allowWrites: false, allowTransportWrites: true }), OperationType.Transport),
      ).toBe(false);
      expect(
        isOperationAllowed(config({ allowWrites: true, allowTransportWrites: false }), OperationType.Transport),
      ).toBe(false);
    });

    it('Read/Search/Intelligence/Test/Lock are always allowed at safety layer', () => {
      const cfg = config({ allowWrites: false, allowDataPreview: false, allowFreeSQL: false });
      for (const op of [
        OperationType.Read,
        OperationType.Search,
        OperationType.Intelligence,
        OperationType.Test,
        OperationType.Lock,
      ]) {
        expect(isOperationAllowed(cfg, op)).toBe(true);
      }
    });
  });

  describe('checkOperation', () => {
    it('throws AdtSafetyError with reason when blocked', () => {
      const cfg = config({ allowWrites: false });
      expect(() => checkOperation(cfg, OperationType.Create, 'CreateObject')).toThrow(AdtSafetyError);
      expect(() => checkOperation(cfg, OperationType.Create, 'CreateObject')).toThrow(/allowWrites=false/);
    });

    it('allowDataPreview reason is specific', () => {
      const cfg = config({ allowDataPreview: false });
      expect(() => checkOperation(cfg, OperationType.Query, 'GetTableContents')).toThrow(/allowDataPreview=false/);
    });

    it('allowFreeSQL reason is specific', () => {
      const cfg = config({ allowFreeSQL: false });
      expect(() => checkOperation(cfg, OperationType.FreeSQL, 'RunQuery')).toThrow(/allowFreeSQL=false/);
    });

    it('does not throw when operation allowed', () => {
      const cfg = config();
      expect(() => checkOperation(cfg, OperationType.Read, 'GetProgram')).not.toThrow();
      expect(() => checkOperation(cfg, OperationType.Create, 'CreateProgram')).not.toThrow();
    });
  });

  describe('isPackageAllowed', () => {
    it('allows any package when list is empty', () => {
      expect(isPackageAllowed(config({ allowedPackages: [] }), 'ANY_PKG')).toBe(true);
    });

    it('allows exact match', () => {
      expect(isPackageAllowed(config({ allowedPackages: ['ZTEST'] }), 'ZTEST')).toBe(true);
      expect(isPackageAllowed(config({ allowedPackages: ['ZTEST'] }), 'ztest')).toBe(true);
    });

    it('allows wildcard match', () => {
      expect(isPackageAllowed(config({ allowedPackages: ['Z*'] }), 'ZRAY')).toBe(true);
      expect(isPackageAllowed(config({ allowedPackages: ['Z*'] }), 'YRAY')).toBe(false);
    });

    it('blocks unlisted packages', () => {
      expect(isPackageAllowed(config({ allowedPackages: ['$TMP'] }), 'ZTEST')).toBe(false);
    });

    it('accepts multiple entries (any match wins)', () => {
      const cfg = config({ allowedPackages: ['$TMP', 'Z*'] });
      expect(isPackageAllowed(cfg, '$TMP')).toBe(true);
      expect(isPackageAllowed(cfg, 'ZMORE')).toBe(true);
      expect(isPackageAllowed(cfg, 'YXX')).toBe(false);
    });
  });

  describe('checkPackage', () => {
    it('throws when not allowed', () => {
      expect(() => checkPackage(config({ allowedPackages: ['$TMP'] }), 'OTHER')).toThrow(AdtSafetyError);
    });

    it('does not throw when allowed', () => {
      expect(() => checkPackage(config({ allowedPackages: ['$TMP'] }), '$TMP')).not.toThrow();
    });
  });

  describe('checkTransport', () => {
    it('read operations are always allowed at safety layer', () => {
      // Reads gated only by scope check upstream, not by safety flags
      expect(() =>
        checkTransport(config({ allowTransportWrites: false }), 'DEV900001', 'ListTransports', false),
      ).not.toThrow();
    });

    it('writes require allowWrites=true', () => {
      expect(() =>
        checkTransport(
          config({ allowWrites: false, allowTransportWrites: true }),
          'DEV900001',
          'CreateTransport',
          true,
        ),
      ).toThrow(/allowWrites=false/);
    });

    it('writes require allowTransportWrites=true', () => {
      expect(() =>
        checkTransport(
          config({ allowWrites: true, allowTransportWrites: false }),
          'DEV900001',
          'CreateTransport',
          true,
        ),
      ).toThrow(/allowTransportWrites=false/);
    });

    it('writes allowed when both flags true', () => {
      expect(() =>
        checkTransport(config({ allowWrites: true, allowTransportWrites: true }), 'DEV900001', 'CreateTransport', true),
      ).not.toThrow();
    });

    it('transport whitelist blocks non-listed IDs', () => {
      const cfg = config({ allowedTransports: ['DEVK9*'] });
      expect(() => checkTransport(cfg, 'OTHER', 'Op', false)).toThrow(/blocked by safety configuration/);
      expect(() => checkTransport(cfg, 'DEVK900001', 'Op', false)).not.toThrow();
    });

    it('transport whitelist is a passthrough when empty', () => {
      const cfg = config({ allowedTransports: [] });
      expect(() => checkTransport(cfg, 'ANY_TRKORR', 'Op', false)).not.toThrow();
    });
  });

  describe('checkGit', () => {
    it('read operations are always allowed (isWrite=false)', () => {
      expect(() => checkGit(config({ allowGitWrites: false }), 'ListRepos', false)).not.toThrow();
    });

    it('writes require allowWrites=true', () => {
      expect(() => checkGit(config({ allowWrites: false, allowGitWrites: true }), 'Push', true)).toThrow(
        /allowWrites=false/,
      );
    });

    it('writes require allowGitWrites=true', () => {
      expect(() => checkGit(config({ allowWrites: true, allowGitWrites: false }), 'Push', true)).toThrow(
        /allowGitWrites=false/,
      );
    });

    it('writes allowed when both flags true', () => {
      expect(() => checkGit(config({ allowWrites: true, allowGitWrites: true }), 'Push', true)).not.toThrow();
    });

    it('default isWrite=true (backward-compatible call shape)', () => {
      // No third argument → treated as write
      expect(() => checkGit(config({ allowWrites: false, allowGitWrites: true }), 'Push')).toThrow(/allowWrites=false/);
    });
  });

  describe('deriveUserSafety', () => {
    it('admin scope implies all scopes (all allow* stay true on unrestricted server)', () => {
      const server = unrestrictedSafetyConfig();
      const result = deriveUserSafety(server, ['admin']);
      expect(result.allowWrites).toBe(true);
      expect(result.allowDataPreview).toBe(true);
      expect(result.allowFreeSQL).toBe(true);
      expect(result.allowTransportWrites).toBe(true);
      expect(result.allowGitWrites).toBe(true);
    });

    it('admin scope cannot exceed server ceiling', () => {
      const server = config({ allowWrites: false });
      const result = deriveUserSafety(server, ['admin']);
      expect(result.allowWrites).toBe(false); // server ceiling wins
    });

    it('write scope implies read (does not force allowWrites off)', () => {
      const server = unrestrictedSafetyConfig();
      const result = deriveUserSafety(server, ['write']);
      expect(result.allowWrites).toBe(true);
      // No data/sql/transports/git in scope → those are tightened off
      expect(result.allowDataPreview).toBe(false);
      expect(result.allowFreeSQL).toBe(false);
      expect(result.allowTransportWrites).toBe(false);
      expect(result.allowGitWrites).toBe(false);
    });

    it('sql scope implies data', () => {
      const server = unrestrictedSafetyConfig();
      const result = deriveUserSafety(server, ['read', 'sql']);
      expect(result.allowDataPreview).toBe(true); // implied by sql
      expect(result.allowFreeSQL).toBe(true);
    });

    it('no write scope → allowWrites forced false', () => {
      const server = unrestrictedSafetyConfig();
      const result = deriveUserSafety(server, ['read']);
      expect(result.allowWrites).toBe(false);
    });

    it('transports scope enables transport writes (if server allows)', () => {
      const server = unrestrictedSafetyConfig();
      const result = deriveUserSafety(server, ['read', 'write', 'transports']);
      expect(result.allowTransportWrites).toBe(true);
    });

    it('git scope enables git writes (if server allows)', () => {
      const server = unrestrictedSafetyConfig();
      const result = deriveUserSafety(server, ['read', 'write', 'git']);
      expect(result.allowGitWrites).toBe(true);
    });

    it('does not mutate the original server config', () => {
      const server = config({ allowWrites: true, allowDataPreview: true });
      deriveUserSafety(server, []);
      expect(server.allowWrites).toBe(true);
      expect(server.allowDataPreview).toBe(true);
    });

    it('preserves allowedPackages/allowedTransports/denyActions as deep copies', () => {
      const server = config({ allowedPackages: ['Z*'], allowedTransports: ['DEV*'], denyActions: ['SAPWrite.delete'] });
      const result = deriveUserSafety(server, ['admin']);
      expect(result.allowedPackages).toEqual(['Z*']);
      expect(result.allowedTransports).toEqual(['DEV*']);
      expect(result.denyActions).toEqual(['SAPWrite.delete']);
      // Mutate result; server untouched
      result.allowedPackages.push('OTHER');
      expect(server.allowedPackages).toEqual(['Z*']);
    });
  });

  describe('deriveUserSafetyFromProfile', () => {
    it('tight side wins for booleans — server=true + profile=false → false', () => {
      const server = unrestrictedSafetyConfig();
      const profile = { allowWrites: false };
      const result = deriveUserSafetyFromProfile(server, profile);
      expect(result.allowWrites).toBe(false);
    });

    it('tight side wins — server=false + profile=true → false', () => {
      const server = config({ allowWrites: false });
      const profile = { allowWrites: true };
      const result = deriveUserSafetyFromProfile(server, profile);
      expect(result.allowWrites).toBe(false);
    });

    it('both true → true', () => {
      const server = unrestrictedSafetyConfig();
      const profile = { allowWrites: true };
      const result = deriveUserSafetyFromProfile(server, profile);
      expect(result.allowWrites).toBe(true);
    });

    it('profile missing a field → inherits server value', () => {
      const server = config({ allowDataPreview: true });
      const profile = { allowWrites: true }; // no allowDataPreview key
      const result = deriveUserSafetyFromProfile(server, profile);
      expect(result.allowDataPreview).toBe(true);
    });

    it('allowedPackages: profile narrows server (profile=$TMP, server=*)', () => {
      const server = config({ allowedPackages: [] }); // [] = no restriction
      const profile = { allowedPackages: ['$TMP'] };
      const result = deriveUserSafetyFromProfile(server, profile);
      expect(result.allowedPackages).toEqual(['$TMP']);
    });

    it('allowedPackages: server narrows profile (server=$TMP, profile=*)', () => {
      const server = config({ allowedPackages: ['$TMP'] });
      const profile = { allowedPackages: [] }; // profile = no restriction
      const result = deriveUserSafetyFromProfile(server, profile);
      expect(result.allowedPackages).toEqual(['$TMP']);
    });

    it('allowedPackages: profile outside server ceiling → server wins', () => {
      const server = config({ allowedPackages: ['$TMP'] });
      const profile = { allowedPackages: ['Z*'] }; // profile wanted Z*, server only allows $TMP
      const result = deriveUserSafetyFromProfile(server, profile);
      expect(result.allowedPackages).toEqual(['$TMP']); // server ceiling wins
    });

    it('allowedPackages: profile subset of server wildcards → profile wins', () => {
      const server = config({ allowedPackages: ['Z*'] });
      const profile = { allowedPackages: ['ZTEST'] }; // ZTEST is covered by Z*
      const result = deriveUserSafetyFromProfile(server, profile);
      expect(result.allowedPackages).toEqual(['ZTEST']);
    });

    it('denyActions: union of server and profile', () => {
      const server = config({ denyActions: ['SAPWrite.delete'] });
      const profile = { denyActions: ['SAPManage.flp_*'] };
      const result = deriveUserSafetyFromProfile(server, profile);
      expect(result.denyActions.sort()).toEqual(['SAPManage.flp_*', 'SAPWrite.delete']);
    });
  });

  describe('describeSafety', () => {
    it('returns READ-ONLY for default restrictive config', () => {
      expect(describeSafety(defaultSafetyConfig())).toContain('Packages=[$TMP]');
    });

    it('lists active flags on unrestricted', () => {
      const desc = describeSafety(unrestrictedSafetyConfig());
      expect(desc).toContain('WRITES');
      expect(desc).toContain('DATA-PREVIEW');
      expect(desc).toContain('FREE-SQL');
      expect(desc).toContain('TRANSPORT-WRITES');
      expect(desc).toContain('GIT-WRITES');
    });

    it('includes denyActions count when non-empty', () => {
      const desc = describeSafety(config({ denyActions: ['SAPWrite.delete', 'SAPManage.flp_*'] }));
      expect(desc).toContain('DenyActions=2');
    });
  });
});
