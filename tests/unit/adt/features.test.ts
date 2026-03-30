import { Version } from '@abaplint/core';
import { describe, expect, it } from 'vitest';
import type { FeatureConfig } from '../../../ts-src/adt/config.js';
import { mapSapReleaseToAbaplintVersion, resolveWithoutProbing } from '../../../ts-src/adt/features.js';

describe('Feature Detection', () => {
  describe('resolveWithoutProbing', () => {
    it('forces all features on', () => {
      const config: FeatureConfig = {
        hana: 'on',
        abapGit: 'on',
        rap: 'on',
        amdp: 'on',
        ui5: 'on',
        transport: 'on',
      };
      const result = resolveWithoutProbing(config);

      expect(result.hana.available).toBe(true);
      expect(result.hana.mode).toBe('on');
      expect(result.abapGit.available).toBe(true);
      expect(result.rap.available).toBe(true);
    });

    it('forces all features off', () => {
      const config: FeatureConfig = {
        hana: 'off',
        abapGit: 'off',
        rap: 'off',
        amdp: 'off',
        ui5: 'off',
        transport: 'off',
      };
      const result = resolveWithoutProbing(config);

      expect(result.hana.available).toBe(false);
      expect(result.hana.mode).toBe('off');
      expect(result.abapGit.available).toBe(false);
    });

    it('auto defaults to unavailable without probing', () => {
      const config: FeatureConfig = {
        hana: 'auto',
        abapGit: 'auto',
        rap: 'auto',
        amdp: 'auto',
        ui5: 'auto',
        transport: 'auto',
      };
      const result = resolveWithoutProbing(config);

      expect(result.hana.available).toBe(false);
      expect(result.hana.mode).toBe('auto');
    });

    it('handles mixed modes', () => {
      const config: FeatureConfig = {
        hana: 'on',
        abapGit: 'off',
        rap: 'auto',
        amdp: 'on',
        ui5: 'off',
        transport: 'auto',
      };
      const result = resolveWithoutProbing(config);

      expect(result.hana.available).toBe(true);
      expect(result.abapGit.available).toBe(false);
      expect(result.rap.available).toBe(false);
      expect(result.amdp.available).toBe(true);
      expect(result.ui5.available).toBe(false);
      expect(result.transport.available).toBe(false);
    });

    it('includes descriptive messages', () => {
      const config: FeatureConfig = {
        hana: 'on',
        abapGit: 'off',
        rap: 'auto',
        amdp: 'auto',
        ui5: 'auto',
        transport: 'auto',
      };
      const result = resolveWithoutProbing(config);

      expect(result.hana.message).toContain('Forced on');
      expect(result.abapGit.message).toContain('Disabled');
      expect(result.rap.message).toContain('not available');
    });
  });

  describe('mapSapReleaseToAbaplintVersion', () => {
    it('maps SAP_BASIS releases to correct abaplint versions', () => {
      expect(mapSapReleaseToAbaplintVersion('700')).toBe(Version.v700);
      expect(mapSapReleaseToAbaplintVersion('702')).toBe(Version.v702);
      expect(mapSapReleaseToAbaplintVersion('740')).toBe(Version.v740sp02);
      expect(mapSapReleaseToAbaplintVersion('750')).toBe(Version.v750);
      expect(mapSapReleaseToAbaplintVersion('751')).toBe(Version.v751);
      expect(mapSapReleaseToAbaplintVersion('752')).toBe(Version.v752);
      expect(mapSapReleaseToAbaplintVersion('753')).toBe(Version.v753);
      expect(mapSapReleaseToAbaplintVersion('754')).toBe(Version.v754);
      expect(mapSapReleaseToAbaplintVersion('755')).toBe(Version.v755);
      expect(mapSapReleaseToAbaplintVersion('756')).toBe(Version.v756);
      expect(mapSapReleaseToAbaplintVersion('757')).toBe(Version.v757);
      expect(mapSapReleaseToAbaplintVersion('758')).toBe(Version.v758);
    });

    it('maps releases >= 758 to v758', () => {
      expect(mapSapReleaseToAbaplintVersion('759')).toBe(Version.v758);
      expect(mapSapReleaseToAbaplintVersion('800')).toBe(Version.v758);
    });

    it('returns Cloud for non-numeric or empty input', () => {
      expect(mapSapReleaseToAbaplintVersion('')).toBe(Version.Cloud);
      expect(mapSapReleaseToAbaplintVersion('sap_btp')).toBe(Version.Cloud);
      expect(mapSapReleaseToAbaplintVersion('unknown')).toBe(Version.Cloud);
    });

    it('handles versions between known mappings', () => {
      // 710 is between 702 and 740, should map to 702
      expect(mapSapReleaseToAbaplintVersion('710')).toBe(Version.v702);
      // 745 is between 740 and 750, should map to v740sp02
      expect(mapSapReleaseToAbaplintVersion('745')).toBe(Version.v740sp02);
    });
  });
});
