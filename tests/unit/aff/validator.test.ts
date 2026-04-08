import { beforeEach, describe, expect, it } from 'vitest';
import { resetValidatorCache, validateAffHeader } from '../../../src/aff/validator.js';

describe('AFF Validator', () => {
  beforeEach(() => {
    resetValidatorCache();
  });

  describe('validateAffHeader', () => {
    it('valid header passes validation', () => {
      const result = validateAffHeader('CLAS', { description: 'Test class', originalLanguage: 'en' });
      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it('description exceeding max length (60 chars) fails', () => {
      const result = validateAffHeader('CLAS', { description: 'A'.repeat(61), originalLanguage: 'en' });
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.some((e) => e.includes('/header'))).toBe(true);
    });

    it('error paths are prefixed with /header', () => {
      const result = validateAffHeader('CLAS', { description: 'A'.repeat(61), originalLanguage: 'en' });
      expect(result.valid).toBe(false);
      for (const err of result.errors!) {
        expect(err).toMatch(/^\/header/);
      }
    });

    it('unknown type returns valid (skips validation)', () => {
      const result = validateAffHeader('FUGR', { description: 'anything' });
      expect(result.valid).toBe(true);
    });

    it('invalid abapLanguageVersion enum fails', () => {
      const result = validateAffHeader('CLAS', {
        description: 'Test',
        originalLanguage: 'en',
        abapLanguageVersion: 'invalidVersion',
      });
      expect(result.valid).toBe(false);
      expect(result.errors!.some((e) => e.includes('Allowed values'))).toBe(true);
    });

    it('works for INTF type', () => {
      const result = validateAffHeader('INTF', { description: 'Test interface', originalLanguage: 'en' });
      expect(result.valid).toBe(true);
    });

    it('works for PROG type', () => {
      const result = validateAffHeader('PROG', { description: 'Test program', originalLanguage: 'en' });
      expect(result.valid).toBe(true);
    });
  });
});
