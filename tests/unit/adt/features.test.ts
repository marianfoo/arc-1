import { describe, expect, it } from 'vitest';
import type { FeatureConfig } from '../../../ts-src/adt/config.js';
import { resolveWithoutProbing } from '../../../ts-src/adt/features.js';

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
});
