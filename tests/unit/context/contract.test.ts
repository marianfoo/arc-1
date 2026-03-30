/**
 * Unit tests for public API contract extraction.
 */

import { describe, expect, it } from 'vitest';
import { extractContract } from '../../../ts-src/context/contract.js';

describe('extractContract', () => {
  // ─── Class Contracts ──────────────────────────────────────────────

  describe('class contracts', () => {
    it('extracts PUBLIC SECTION only', () => {
      const source = `CLASS zcl_order DEFINITION PUBLIC.
  PUBLIC SECTION.
    METHODS get_id RETURNING VALUE(rv_id) TYPE string.
    METHODS process RETURNING VALUE(rv_ok) TYPE abap_bool.
  PROTECTED SECTION.
    DATA mv_internal TYPE string.
    METHODS helper.
  PRIVATE SECTION.
    DATA mt_cache TYPE TABLE OF string.
    METHODS _init.
ENDCLASS.
CLASS zcl_order IMPLEMENTATION.
  METHOD get_id. ENDMETHOD.
  METHOD process. ENDMETHOD.
  METHOD helper. ENDMETHOD.
  METHOD _init. ENDMETHOD.
ENDCLASS.`;
      const contract = extractContract(source, 'zcl_order', 'CLAS');

      expect(contract.success).toBe(true);
      expect(contract.type).toBe('CLAS');
      expect(contract.name).toBe('zcl_order');

      // Should contain public methods
      expect(contract.source).toContain('get_id');
      expect(contract.source).toContain('process');
      expect(contract.source).toContain('PUBLIC SECTION');

      // Should NOT contain protected/private/implementation
      expect(contract.source).not.toContain('PROTECTED SECTION');
      expect(contract.source).not.toContain('PRIVATE SECTION');
      expect(contract.source).not.toContain('mv_internal');
      expect(contract.source).not.toContain('mt_cache');
      expect(contract.source).not.toContain('helper');
      expect(contract.source).not.toContain('_init');
      expect(contract.source).not.toContain('IMPLEMENTATION');
    });

    it('counts methods correctly', () => {
      const source = `CLASS zcl_test DEFINITION PUBLIC.
  PUBLIC SECTION.
    METHODS method_a.
    METHODS method_b IMPORTING iv TYPE string.
    METHODS method_c RETURNING VALUE(rv) TYPE i.
  PROTECTED SECTION.
    METHODS method_d.
ENDCLASS.
CLASS zcl_test IMPLEMENTATION.
  METHOD method_a. ENDMETHOD.
  METHOD method_b. ENDMETHOD.
  METHOD method_c. rv = 1. ENDMETHOD.
  METHOD method_d. ENDMETHOD.
ENDCLASS.`;
      const contract = extractContract(source, 'zcl_test', 'CLAS');
      expect(contract.methodCount).toBe(3); // Only public methods
    });

    it('handles class with no public section', () => {
      const source = `CLASS zcl_test DEFINITION.
  PRIVATE SECTION.
    DATA mv TYPE string.
ENDCLASS.
CLASS zcl_test IMPLEMENTATION.
ENDCLASS.`;
      const contract = extractContract(source, 'zcl_test', 'CLAS');
      expect(contract.success).toBe(true);
      expect(contract.methodCount).toBe(0);
    });

    it('preserves INTERFACES in public section', () => {
      const source = `CLASS zcl_test DEFINITION PUBLIC.
  PUBLIC SECTION.
    INTERFACES zif_order.
    METHODS run.
  PROTECTED SECTION.
ENDCLASS.
CLASS zcl_test IMPLEMENTATION.
  METHOD run. ENDMETHOD.
ENDCLASS.`;
      const contract = extractContract(source, 'zcl_test', 'CLAS');
      expect(contract.source).toContain('INTERFACES zif_order');
      expect(contract.source).toContain('METHODS run');
    });

    it('preserves TYPES in public section', () => {
      const source = `CLASS zcl_test DEFINITION PUBLIC.
  PUBLIC SECTION.
    TYPES: BEGIN OF ty_data,
             id TYPE string,
             amount TYPE p LENGTH 8 DECIMALS 2,
           END OF ty_data.
    METHODS run.
ENDCLASS.
CLASS zcl_test IMPLEMENTATION.
  METHOD run. ENDMETHOD.
ENDCLASS.`;
      const contract = extractContract(source, 'zcl_test', 'CLAS');
      expect(contract.source).toContain('ty_data');
    });

    it('preserves CONSTANTS in public section', () => {
      const source = `CLASS zcl_test DEFINITION PUBLIC.
  PUBLIC SECTION.
    CONSTANTS gc_max TYPE i VALUE 100.
ENDCLASS.
CLASS zcl_test IMPLEMENTATION.
ENDCLASS.`;
      const contract = extractContract(source, 'zcl_test', 'CLAS');
      expect(contract.source).toContain('gc_max');
      expect(contract.source).toContain('100');
    });

    it('preserves CLASS DEFINITION line with INHERITING FROM', () => {
      const source = `CLASS zcl_child DEFINITION PUBLIC INHERITING FROM zcl_parent.
  PUBLIC SECTION.
    METHODS run.
ENDCLASS.
CLASS zcl_child IMPLEMENTATION.
  METHOD run. ENDMETHOD.
ENDCLASS.`;
      const contract = extractContract(source, 'zcl_child', 'CLAS');
      expect(contract.source).toContain('INHERITING FROM');
      expect(contract.source).toContain('zcl_parent');
    });

    it('strips CLASS IMPLEMENTATION entirely', () => {
      const source = `CLASS zcl_test DEFINITION PUBLIC.
  PUBLIC SECTION.
    METHODS run.
ENDCLASS.
CLASS zcl_test IMPLEMENTATION.
  METHOD run.
    DATA lv TYPE string.
    lv = 'complex implementation'.
    WRITE lv.
  ENDMETHOD.
ENDCLASS.`;
      const contract = extractContract(source, 'zcl_test', 'CLAS');
      expect(contract.source).not.toContain('complex implementation');
      expect(contract.source).not.toContain('WRITE');
    });
  });

  // ─── Interface Contracts ──────────────────────────────────────────

  describe('interface contracts', () => {
    it('returns full interface source', () => {
      const source = `INTERFACE zif_order PUBLIC.
  METHODS create IMPORTING is_data TYPE string RETURNING VALUE(rv_id) TYPE string.
  METHODS read IMPORTING iv_id TYPE string.
  METHODS delete IMPORTING iv_id TYPE string.
ENDINTERFACE.`;
      const contract = extractContract(source, 'zif_order', 'INTF');
      expect(contract.success).toBe(true);
      expect(contract.type).toBe('INTF');
      expect(contract.source).toContain('INTERFACE zif_order');
      expect(contract.source).toContain('create');
      expect(contract.source).toContain('read');
      expect(contract.source).toContain('delete');
    });

    it('counts interface methods', () => {
      const source = `INTERFACE zif_test PUBLIC.
  METHODS method_a.
  METHODS method_b IMPORTING iv TYPE string.
  METHODS method_c RETURNING VALUE(rv) TYPE i.
ENDINTERFACE.`;
      const contract = extractContract(source, 'zif_test', 'INTF');
      expect(contract.methodCount).toBe(3);
    });
  });

  // ─── Function Module Contracts ────────────────────────────────────

  describe('function module contracts', () => {
    it('extracts signature block only', () => {
      const source = `FUNCTION z_delivery_fm.
*"----------------------------------------------------------------------
*"*"Local Interface:
*"  IMPORTING
*"     REFERENCE(IV_ID) TYPE  STRING
*"  EXPORTING
*"     REFERENCE(EV_STATUS) TYPE  STRING
*"----------------------------------------------------------------------
  DATA lv_result TYPE string.
  lv_result = 'processed'.
  ev_status = lv_result.
ENDFUNCTION.`;
      const contract = extractContract(source, 'z_delivery_fm', 'FUNC');
      expect(contract.success).toBe(true);
      expect(contract.type).toBe('FUNC');

      // Should have signature
      expect(contract.source).toContain('FUNCTION z_delivery_fm');
      expect(contract.source).toContain('IV_ID');
      expect(contract.source).toContain('EV_STATUS');
      expect(contract.source).toContain('ENDFUNCTION');

      // Should NOT have implementation
      expect(contract.source).not.toContain('lv_result');
      expect(contract.source).not.toContain("'processed'");
    });

    it('handles function with no signature comments', () => {
      const source = `FUNCTION z_simple.
  WRITE 'hello'.
ENDFUNCTION.`;
      const contract = extractContract(source, 'z_simple', 'FUNC');
      expect(contract.success).toBe(true);
      expect(contract.source).toContain('FUNCTION z_simple');
      expect(contract.source).toContain('ENDFUNCTION');
    });
  });

  // ─── Edge Cases ───────────────────────────────────────────────────

  it('handles empty source gracefully', () => {
    const contract = extractContract('', 'zcl_test', 'CLAS');
    expect(contract.success).toBe(true);
  });

  it('handles UNKNOWN type by returning source as-is', () => {
    const source = 'SOME ABAP CODE.';
    const contract = extractContract(source, 'test', 'UNKNOWN');
    expect(contract.success).toBe(true);
    expect(contract.source).toBe(source);
  });
});
