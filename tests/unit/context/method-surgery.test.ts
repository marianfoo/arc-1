/**
 * Unit tests for method-level surgery.
 */

import { describe, expect, it } from 'vitest';
import { extractMethod, formatMethodListing, listMethods, spliceMethod } from '../../../src/context/method-surgery.js';

// ─── Test Fixtures ──────────────────────────────────────────────────

const SIMPLE_CLASS = `CLASS zcl_order DEFINITION PUBLIC.
  PUBLIC SECTION.
    METHODS get_id RETURNING VALUE(rv_id) TYPE string.
    METHODS process RETURNING VALUE(rv_ok) TYPE abap_bool.
  PROTECTED SECTION.
    METHODS helper.
  PRIVATE SECTION.
    METHODS _init.
ENDCLASS.
CLASS zcl_order IMPLEMENTATION.
  METHOD get_id.
    rv_id = mv_id.
  ENDMETHOD.
  METHOD process.
    DATA lv_result TYPE abap_bool.
    lv_result = abap_true.
    rv_ok = lv_result.
  ENDMETHOD.
  METHOD helper.
    " internal helper
  ENDMETHOD.
  METHOD _init.
    mv_id = 'default'.
  ENDMETHOD.
ENDCLASS.`;

const INTERFACE_CLASS = `CLASS zcl_impl DEFINITION PUBLIC.
  PUBLIC SECTION.
    INTERFACES zif_order.
    METHODS run.
ENDCLASS.
CLASS zcl_impl IMPLEMENTATION.
  METHOD zif_order~create.
    rv_id = 'new'.
  ENDMETHOD.
  METHOD zif_order~delete.
    " delete logic
  ENDMETHOD.
  METHOD run.
    " main logic
  ENDMETHOD.
ENDCLASS.`;

const REDEFINITION_CLASS = `CLASS zcl_child DEFINITION PUBLIC INHERITING FROM zcl_parent.
  PUBLIC SECTION.
    METHODS run REDEFINITION.
    METHODS get_name RETURNING VALUE(rv) TYPE string.
ENDCLASS.
CLASS zcl_child IMPLEMENTATION.
  METHOD run.
    super->run( ).
    " child logic
  ENDMETHOD.
  METHOD get_name.
    rv = 'child'.
  ENDMETHOD.
ENDCLASS.`;

const EMPTY_BODY_CLASS = `CLASS zcl_stub DEFINITION PUBLIC.
  PUBLIC SECTION.
    METHODS noop.
ENDCLASS.
CLASS zcl_stub IMPLEMENTATION.
  METHOD noop.
  ENDMETHOD.
ENDCLASS.`;

// ─── listMethods Tests ──────────────────────────────────────────────

describe('listMethods', () => {
  it('lists methods with correct visibility', () => {
    const result = listMethods(SIMPLE_CLASS, 'zcl_order');
    expect(result.success).toBe(true);
    expect(result.methods.length).toBe(4);

    const names = result.methods.map((m) => m.name.toUpperCase());
    expect(names).toContain('GET_ID');
    expect(names).toContain('PROCESS');
    expect(names).toContain('HELPER');
    expect(names).toContain('_INIT');

    // Visibility
    const getId = result.methods.find((m) => m.name.toUpperCase() === 'GET_ID');
    expect(getId?.visibility).toBe('public');

    const helper = result.methods.find((m) => m.name.toUpperCase() === 'HELPER');
    expect(helper?.visibility).toBe('protected');

    const init = result.methods.find((m) => m.name.toUpperCase() === '_INIT');
    expect(init?.visibility).toBe('private');
  });

  it('extracts method signatures', () => {
    const result = listMethods(SIMPLE_CLASS, 'zcl_order');
    const getId = result.methods.find((m) => m.name.toUpperCase() === 'GET_ID');
    expect(getId?.signature).toContain('RETURNING');
    expect(getId?.signature).toContain('rv_id');
    expect(getId?.signature).toContain('string');
  });

  it('returns valid line ranges', () => {
    const result = listMethods(SIMPLE_CLASS, 'zcl_order');
    for (const method of result.methods) {
      expect(method.startLine).toBeGreaterThan(0);
      expect(method.endLine).toBeGreaterThanOrEqual(method.startLine);
    }
  });

  it('detects interface methods', () => {
    const result = listMethods(INTERFACE_CLASS, 'zcl_impl');
    expect(result.success).toBe(true);

    const ifMethods = result.methods.filter((m) => m.isInterfaceMethod);
    expect(ifMethods.length).toBeGreaterThanOrEqual(2);

    const create = result.methods.find((m) => m.name.toUpperCase().includes('CREATE'));
    expect(create?.isInterfaceMethod).toBe(true);
  });

  it('detects REDEFINITION keyword', () => {
    const result = listMethods(REDEFINITION_CLASS, 'zcl_child');
    expect(result.success).toBe(true);

    const run = result.methods.find((m) => m.name.toUpperCase() === 'RUN');
    expect(run?.isRedefinition).toBe(true);

    const getName = result.methods.find((m) => m.name.toUpperCase() === 'GET_NAME');
    expect(getName?.isRedefinition).toBe(false);
  });

  it('handles empty class', () => {
    const source = `CLASS zcl_empty DEFINITION PUBLIC.
  PUBLIC SECTION.
ENDCLASS.
CLASS zcl_empty IMPLEMENTATION.
ENDCLASS.`;
    const result = listMethods(source, 'zcl_empty');
    expect(result.success).toBe(true);
    expect(result.methods.length).toBe(0);
  });

  it('sorts methods: public > protected > private', () => {
    const result = listMethods(SIMPLE_CLASS, 'zcl_order');
    const visibilities = result.methods.map((m) => m.visibility);
    const publicIdx = visibilities.indexOf('public');
    const protectedIdx = visibilities.indexOf('protected');
    const privateIdx = visibilities.indexOf('private');

    if (publicIdx >= 0 && protectedIdx >= 0) expect(publicIdx).toBeLessThan(protectedIdx);
    if (protectedIdx >= 0 && privateIdx >= 0) expect(protectedIdx).toBeLessThan(privateIdx);
  });

  it('handles namespaced class names', () => {
    const source = `CLASS /dmo/cl_flight DEFINITION PUBLIC.
  PUBLIC SECTION.
    METHODS get_flight RETURNING VALUE(rv) TYPE string.
ENDCLASS.
CLASS /dmo/cl_flight IMPLEMENTATION.
  METHOD get_flight.
    rv = 'LH123'.
  ENDMETHOD.
ENDCLASS.`;
    const result = listMethods(source, '/DMO/CL_FLIGHT');
    expect(result.success).toBe(true);
    expect(result.methods.length).toBe(1);
  });
});

// ─── extractMethod Tests ────────────────────────────────────────────

describe('extractMethod', () => {
  it('extracts a method by exact name', () => {
    const result = extractMethod(SIMPLE_CLASS, 'zcl_order', 'get_id');
    expect(result.success).toBe(true);
    expect(result.methodSource).toContain('METHOD get_id');
    expect(result.methodSource).toContain('ENDMETHOD');
    expect(result.bodySource).toContain('rv_id = mv_id');
  });

  it('extracts interface method by full name', () => {
    const result = extractMethod(INTERFACE_CLASS, 'zcl_impl', 'zif_order~create');
    expect(result.success).toBe(true);
    expect(result.methodSource).toContain('METHOD zif_order~create');
    expect(result.bodySource).toContain("rv_id = 'new'");
  });

  it('extracts interface method by short name (fuzzy match)', () => {
    const result = extractMethod(INTERFACE_CLASS, 'zcl_impl', 'create');
    expect(result.success).toBe(true);
    expect(result.methodName.toUpperCase()).toContain('CREATE');
    expect(result.bodySource).toContain("rv_id = 'new'");
  });

  it('reports ambiguity for multiple interface matches', () => {
    // Both interfaces have same method name "process"
    const source = `CLASS zcl_test DEFINITION PUBLIC.
  PUBLIC SECTION.
    INTERFACES zif_a.
    INTERFACES zif_b.
ENDCLASS.
CLASS zcl_test IMPLEMENTATION.
  METHOD zif_a~process.
    " a logic
  ENDMETHOD.
  METHOD zif_b~process.
    " b logic
  ENDMETHOD.
ENDCLASS.`;
    const result = extractMethod(source, 'zcl_test', 'process');
    expect(result.success).toBe(false);
    expect(result.error).toContain('Ambiguous');
  });

  it('returns error when method not found', () => {
    const result = extractMethod(SIMPLE_CLASS, 'zcl_order', 'nonexistent');
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
    expect(result.error).toContain('get_id'); // Should list available methods
  });

  it('matches case-insensitively', () => {
    const result = extractMethod(SIMPLE_CLASS, 'zcl_order', 'GET_ID');
    expect(result.success).toBe(true);
    expect(result.bodySource).toContain('rv_id');
  });

  it('handles multi-line method body', () => {
    const result = extractMethod(SIMPLE_CLASS, 'zcl_order', 'process');
    expect(result.success).toBe(true);
    expect(result.bodySource).toContain('lv_result');
    expect(result.bodySource).toContain('abap_true');
    expect(result.bodySource).toContain('rv_ok');
    // Body should have 3 content lines
    const bodyLines = result.bodySource.split('\n').filter((l) => l.trim().length > 0);
    expect(bodyLines.length).toBe(3);
  });

  it('handles empty method body', () => {
    const result = extractMethod(EMPTY_BODY_CLASS, 'zcl_stub', 'noop');
    expect(result.success).toBe(true);
    expect(result.bodySource.trim()).toBe('');
    expect(result.methodSource).toContain('METHOD noop');
    expect(result.methodSource).toContain('ENDMETHOD');
  });

  it('returns correct line numbers', () => {
    const result = extractMethod(SIMPLE_CLASS, 'zcl_order', 'get_id');
    expect(result.success).toBe(true);
    expect(result.startLine).toBeGreaterThan(0);
    expect(result.endLine).toBeGreaterThan(result.startLine);

    // Verify the lines match the source
    const lines = SIMPLE_CLASS.split('\n');
    expect(lines[result.startLine - 1]).toContain('METHOD get_id');
    expect(lines[result.endLine - 1]).toContain('ENDMETHOD');
  });
});

// ─── spliceMethod Tests ─────────────────────────────────────────────

describe('spliceMethod', () => {
  it('replaces a method body', () => {
    const result = spliceMethod(SIMPLE_CLASS, 'zcl_order', 'get_id', "    rv_id = 'new_value'.");
    expect(result.success).toBe(true);
    expect(result.newSource).toContain("'new_value'");
    expect(result.newSource).not.toContain('rv_id = mv_id');
    // Other methods should remain
    expect(result.newSource).toContain('METHOD process');
    expect(result.newSource).toContain('METHOD helper');
    expect(result.newSource).toContain('METHOD _init');
  });

  it('preserves all other methods unchanged', () => {
    const result = spliceMethod(SIMPLE_CLASS, 'zcl_order', 'get_id', "    rv_id = 'changed'.");
    expect(result.success).toBe(true);

    // Verify other method bodies are untouched
    expect(result.newSource).toContain('lv_result = abap_true');
    expect(result.newSource).toContain("mv_id = 'default'");
    expect(result.newSource).toContain('internal helper');
  });

  it('accepts body-only input (wraps with METHOD/ENDMETHOD)', () => {
    const result = spliceMethod(SIMPLE_CLASS, 'zcl_order', 'get_id', "    rv_id = 'wrapped'.");
    expect(result.success).toBe(true);
    expect(result.newMethodSource).toContain('METHOD get_id');
    expect(result.newMethodSource).toContain('ENDMETHOD');
    expect(result.newMethodSource).toContain("'wrapped'");
  });

  it('accepts full METHOD...ENDMETHOD block', () => {
    const fullBlock = `METHOD get_id.\n    rv_id = 'full_block'.\n  ENDMETHOD.`;
    const result = spliceMethod(SIMPLE_CLASS, 'zcl_order', 'get_id', fullBlock);
    expect(result.success).toBe(true);
    expect(result.newSource).toContain("'full_block'");
  });

  it('handles interface method in splice', () => {
    const result = spliceMethod(INTERFACE_CLASS, 'zcl_impl', 'zif_order~create', "    rv_id = 'spliced'.");
    expect(result.success).toBe(true);
    expect(result.newSource).toContain("'spliced'");
    // Original create body should be gone
    expect(result.newSource).not.toContain("rv_id = 'new'");
    // Other methods should remain
    expect(result.newSource).toContain('METHOD run');
  });

  it('returns error when method not found', () => {
    const result = spliceMethod(SIMPLE_CLASS, 'zcl_order', 'nonexistent', 'body');
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('returns old method source for verification', () => {
    const result = spliceMethod(SIMPLE_CLASS, 'zcl_order', 'get_id', "    rv_id = 'new'.");
    expect(result.success).toBe(true);
    expect(result.oldMethodSource).toContain('METHOD get_id');
    expect(result.oldMethodSource).toContain('rv_id = mv_id');
    expect(result.oldMethodSource).toContain('ENDMETHOD');
  });
});

// ─── formatMethodListing Tests ──────────────────────────────────────

describe('formatMethodListing', () => {
  it('formats listing with visibility sections', () => {
    const listing = listMethods(SIMPLE_CLASS, 'zcl_order');
    const output = formatMethodListing(listing);

    expect(output).toContain('zcl_order');
    expect(output).toContain('4 methods');
    expect(output).toContain('PUBLIC:');
    expect(output).toContain('PROTECTED:');
    expect(output).toContain('PRIVATE:');
    expect(output).toContain('get_id');
  });

  it('shows interface and redefinition flags', () => {
    const listing = listMethods(INTERFACE_CLASS, 'zcl_impl');
    const output = formatMethodListing(listing);
    expect(output).toContain('[interface]');
  });

  it('handles empty class', () => {
    const source = `CLASS zcl_empty DEFINITION PUBLIC.
  PUBLIC SECTION.
ENDCLASS.
CLASS zcl_empty IMPLEMENTATION.
ENDCLASS.`;
    const listing = listMethods(source, 'zcl_empty');
    const output = formatMethodListing(listing);
    expect(output).toContain('0 methods');
  });
});
