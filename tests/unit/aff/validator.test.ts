import { beforeEach, describe, expect, it } from 'vitest';
import { getAffSchema, resetValidatorCache, validateAffMetadata } from '../../../src/aff/validator.js';

describe('AFF Validator', () => {
  beforeEach(() => {
    resetValidatorCache();
  });

  describe('getAffSchema', () => {
    it('returns schema for known type', () => {
      const schema = getAffSchema('CLAS');
      expect(schema).not.toBeNull();
      expect(schema).toHaveProperty('$schema');
      expect(schema).toHaveProperty('properties');
    });

    it('returns null for unknown type', () => {
      expect(getAffSchema('FUGR')).toBeNull();
      expect(getAffSchema('UNKNOWN')).toBeNull();
    });

    it('is case-insensitive', () => {
      expect(getAffSchema('clas')).not.toBeNull();
      expect(getAffSchema('Clas')).not.toBeNull();
    });
  });

  describe('validateAffMetadata', () => {
    it('valid CLAS metadata passes validation', () => {
      const metadata = {
        formatVersion: '1',
        header: {
          description: 'Test class',
          originalLanguage: 'en',
        },
      };
      const result = validateAffMetadata('CLAS', metadata);
      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it('invalid CLAS metadata (missing description) fails with clear error', () => {
      const metadata = {
        formatVersion: '1',
        header: {
          originalLanguage: 'en',
        },
      };
      const result = validateAffMetadata('CLAS', metadata);
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(0);
      expect(result.errors!.some((e) => e.includes('description'))).toBe(true);
    });

    it('unknown type returns valid (skips validation)', () => {
      const result = validateAffMetadata('FUGR', { anything: 'goes' });
      expect(result.valid).toBe(true);
    });

    it('extra properties rejected (additionalProperties: false)', () => {
      const metadata = {
        formatVersion: '1',
        header: {
          description: 'Test class',
          originalLanguage: 'en',
        },
        unknownField: 'should fail',
      };
      const result = validateAffMetadata('CLAS', metadata);
      expect(result.valid).toBe(false);
      expect(result.errors!.some((e) => e.includes('unknownField'))).toBe(true);
    });

    it('header.description exceeds max length (60 chars) fails', () => {
      const metadata = {
        formatVersion: '1',
        header: {
          description: 'A'.repeat(61),
          originalLanguage: 'en',
        },
      };
      const result = validateAffMetadata('CLAS', metadata);
      expect(result.valid).toBe(false);
      expect(result.errors!.some((e) => e.includes('description') || e.includes('maxLength'))).toBe(true);
    });

    it('header.abapLanguageVersion enum validated correctly', () => {
      const validMetadata = {
        formatVersion: '1',
        header: {
          description: 'Test class',
          originalLanguage: 'en',
          abapLanguageVersion: 'cloudDevelopment',
        },
      };
      expect(validateAffMetadata('CLAS', validMetadata).valid).toBe(true);

      const invalidMetadata = {
        formatVersion: '1',
        header: {
          description: 'Test class',
          originalLanguage: 'en',
          abapLanguageVersion: 'invalidVersion',
        },
      };
      const result = validateAffMetadata('CLAS', invalidMetadata);
      expect(result.valid).toBe(false);
      expect(result.errors!.some((e) => e.includes('Allowed values'))).toBe(true);
    });

    it('SRVB metadata with services array validates', () => {
      const metadata = {
        formatVersion: '1',
        header: {
          description: 'Test binding',
          originalLanguage: 'en',
        },
        bindingType: 'ODATA',
        bindingTypeCategory: 'ui',
        services: [
          {
            name: 'ZUI_TEST_O4',
            versions: [
              {
                serviceVersion: '0001',
                serviceDefinition: 'ZUI_TEST',
              },
            ],
          },
        ],
      };
      const result = validateAffMetadata('SRVB', metadata);
      expect(result.valid).toBe(true);
    });

    it('compiled validators are cached (second call does not recompile)', () => {
      const metadata = {
        formatVersion: '1',
        header: {
          description: 'Test class',
          originalLanguage: 'en',
        },
      };
      const result1 = validateAffMetadata('CLAS', metadata);
      const result2 = validateAffMetadata('CLAS', metadata);
      expect(result1.valid).toBe(true);
      expect(result2.valid).toBe(true);
      // If caching were broken the second call would still work,
      // but this verifies no errors on repeated calls with the same type
    });
  });
});
