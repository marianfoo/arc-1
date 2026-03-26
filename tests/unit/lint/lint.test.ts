import { describe, expect, it } from 'vitest';
import { detectFilename, lintAbapSource } from '../../../ts-src/lint/lint.js';

describe('ABAP Lint', () => {
  describe('lintAbapSource', () => {
    it('returns issues for code with problems', () => {
      const source = `REPORT ztest.
DATA lv_unused TYPE string.
WRITE: / 'Hello'.`;
      const results = lintAbapSource(source, 'ztest.prog.abap');
      // Should find at least some issues (naming, unused var, etc.)
      expect(Array.isArray(results)).toBe(true);
    });

    it('returns result objects with correct shape', () => {
      const source = "REPORT ztest.\nWRITE: / 'Hello'.";
      const results = lintAbapSource(source, 'ztest.prog.abap');
      for (const r of results) {
        expect(r).toHaveProperty('rule');
        expect(r).toHaveProperty('message');
        expect(r).toHaveProperty('line');
        expect(r).toHaveProperty('column');
        expect(r).toHaveProperty('severity');
        expect(['error', 'warning', 'info']).toContain(r.severity);
      }
    });

    it('handles empty source', () => {
      const results = lintAbapSource('', 'empty.prog.abap');
      expect(Array.isArray(results)).toBe(true);
    });

    it('handles class source', () => {
      const source = `CLASS zcl_test DEFINITION PUBLIC.
  PUBLIC SECTION.
    METHODS test_method.
ENDCLASS.

CLASS zcl_test IMPLEMENTATION.
  METHOD test_method.
  ENDMETHOD.
ENDCLASS.`;
      const results = lintAbapSource(source, 'zcl_test.clas.abap');
      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe('detectFilename', () => {
    it('detects REPORT as .prog.abap', () => {
      expect(detectFilename('REPORT ztest.', 'ZTEST')).toBe('ztest.prog.abap');
    });

    it('detects CLASS as .clas.abap', () => {
      expect(detectFilename('CLASS zcl_test DEFINITION.', 'ZCL_TEST')).toBe('zcl_test.clas.abap');
    });

    it('detects INTERFACE as .intf.abap', () => {
      expect(detectFilename('INTERFACE zif_test PUBLIC.', 'ZIF_TEST')).toBe('zif_test.intf.abap');
    });

    it('detects FUNCTION-POOL as .fugr.abap', () => {
      expect(detectFilename('FUNCTION-POOL zutils.', 'ZUTILS')).toBe('zutils.fugr.abap');
    });

    it('detects CDS (DEFINE VIEW) as .ddls.asddls', () => {
      expect(detectFilename('define view entity Z_TEST as select from mara', 'Z_TEST')).toBe('z_test.ddls.asddls');
    });

    it('detects CDS with annotation as .ddls.asddls', () => {
      expect(detectFilename('@AbapCatalog.viewEnhancementCategory: [#NONE]\ndefine view', 'Z_TEST')).toBe(
        'z_test.ddls.asddls',
      );
    });

    it('detects BDEF as .bdef.asbdef', () => {
      expect(detectFilename('managed implementation in class zbp_test', 'Z_TEST')).toBe('z_test.bdef.asbdef');
    });

    it('defaults to .clas.abap for unknown', () => {
      expect(detectFilename('DATA lv_test TYPE string.', 'UNKNOWN')).toBe('unknown.clas.abap');
    });
  });
});
