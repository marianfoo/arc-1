/**
 * Unit tests for the context compression orchestrator.
 */

import { describe, expect, it, vi } from 'vitest';
import type { AdtClient } from '../../../ts-src/adt/client.js';
import { compressContext, inferObjectType } from '../../../ts-src/context/compressor.js';

/** Create a mock AdtClient */
function mockClient(sources: Record<string, string>): AdtClient {
  return {
    getClass: vi.fn(async (name: string) => {
      const src = sources[name.toUpperCase()];
      if (!src) throw new Error(`Class ${name} not found`);
      return src;
    }),
    getInterface: vi.fn(async (name: string) => {
      const src = sources[name.toUpperCase()];
      if (!src) throw new Error(`Interface ${name} not found`);
      return src;
    }),
    getProgram: vi.fn(async (name: string) => {
      const src = sources[name.toUpperCase()];
      if (!src) throw new Error(`Program ${name} not found`);
      return src;
    }),
    getFunction: vi.fn(async (_group: string, name: string) => {
      const src = sources[name.toUpperCase()];
      if (!src) throw new Error(`Function ${name} not found`);
      return src;
    }),
    searchObject: vi.fn(async () => []),
    http: {},
    safety: {},
  } as unknown as AdtClient;
}

describe('compressContext', () => {
  it('compresses class with dependencies', async () => {
    const mainSource = `CLASS zcl_order DEFINITION PUBLIC.
  PUBLIC SECTION.
    DATA mo_item TYPE REF TO zcl_item.
    INTERFACES zif_order.
ENDCLASS.
CLASS zcl_order IMPLEMENTATION.
ENDCLASS.`;

    const itemSource = `CLASS zcl_item DEFINITION PUBLIC.
  PUBLIC SECTION.
    METHODS get_price RETURNING VALUE(rv) TYPE p.
  PROTECTED SECTION.
    DATA mv_secret TYPE string.
ENDCLASS.
CLASS zcl_item IMPLEMENTATION.
  METHOD get_price. rv = 10. ENDMETHOD.
ENDCLASS.`;

    const intfSource = `INTERFACE zif_order PUBLIC.
  METHODS create.
  METHODS delete.
ENDINTERFACE.`;

    const client = mockClient({
      ZCL_ITEM: itemSource,
      ZIF_ORDER: intfSource,
    });

    const result = await compressContext(client, mainSource, 'zcl_order', 'CLAS');

    expect(result.depsResolved).toBeGreaterThanOrEqual(2);
    expect(result.output).toContain('zcl_item');
    expect(result.output).toContain('zif_order');
    // Contract should have public methods only
    expect(result.output).toContain('get_price');
    expect(result.output).not.toContain('mv_secret');
    // Interface should be fully included
    expect(result.output).toContain('create');
    expect(result.output).toContain('delete');
  });

  it('respects maxDeps limit', async () => {
    const mainSource = `CLASS zcl_test DEFINITION PUBLIC.
  PUBLIC SECTION.
    DATA m1 TYPE REF TO zcl_dep1.
    DATA m2 TYPE REF TO zcl_dep2.
    DATA m3 TYPE REF TO zcl_dep3.
ENDCLASS.
CLASS zcl_test IMPLEMENTATION.
ENDCLASS.`;

    const depSource = (name: string) => `CLASS ${name} DEFINITION PUBLIC.
  PUBLIC SECTION.
    METHODS run.
ENDCLASS.
CLASS ${name} IMPLEMENTATION.
  METHOD run. ENDMETHOD.
ENDCLASS.`;

    const client = mockClient({
      ZCL_DEP1: depSource('zcl_dep1'),
      ZCL_DEP2: depSource('zcl_dep2'),
      ZCL_DEP3: depSource('zcl_dep3'),
    });

    const result = await compressContext(client, mainSource, 'zcl_test', 'CLAS', 2);

    // Should resolve at most 2
    expect(result.depsResolved).toBeLessThanOrEqual(2);
  });

  it('handles fetch failures gracefully', async () => {
    const mainSource = `CLASS zcl_test DEFINITION PUBLIC.
  PUBLIC SECTION.
    DATA mo TYPE REF TO zcl_missing.
    DATA mi TYPE REF TO zcl_ok.
ENDCLASS.
CLASS zcl_test IMPLEMENTATION.
ENDCLASS.`;

    const client = mockClient({
      ZCL_OK: `CLASS zcl_ok DEFINITION PUBLIC.
  PUBLIC SECTION.
    METHODS run.
ENDCLASS.
CLASS zcl_ok IMPLEMENTATION.
  METHOD run. ENDMETHOD.
ENDCLASS.`,
    });

    const result = await compressContext(client, mainSource, 'zcl_test', 'CLAS');

    // One should succeed, one should fail
    expect(result.depsResolved).toBeGreaterThanOrEqual(1);
    expect(result.depsFailed).toBeGreaterThanOrEqual(1);
    expect(result.output).toContain('Failed dependencies');
    expect(result.output).toContain('zcl_missing');
  });

  it('formats output with stats line', async () => {
    const mainSource = `CLASS zcl_test DEFINITION PUBLIC.
  PUBLIC SECTION.
    DATA mo TYPE REF TO zcl_dep.
ENDCLASS.
CLASS zcl_test IMPLEMENTATION.
ENDCLASS.`;

    const client = mockClient({
      ZCL_DEP: `CLASS zcl_dep DEFINITION PUBLIC.
  PUBLIC SECTION.
    METHODS run.
ENDCLASS.
CLASS zcl_dep IMPLEMENTATION.
  METHOD run. ENDMETHOD.
ENDCLASS.`,
    });

    const result = await compressContext(client, mainSource, 'zcl_test', 'CLAS');

    expect(result.output).toContain('=== Dependency context for zcl_test');
    expect(result.output).toContain('Stats:');
    expect(result.output).toContain('resolved');
  });

  it('returns empty output for source with no dependencies', async () => {
    const mainSource = `CLASS zcl_standalone DEFINITION PUBLIC.
  PUBLIC SECTION.
    METHODS run.
ENDCLASS.
CLASS zcl_standalone IMPLEMENTATION.
  METHOD run. ENDMETHOD.
ENDCLASS.`;

    const client = mockClient({});

    const result = await compressContext(client, mainSource, 'zcl_standalone', 'CLAS');
    expect(result.depsFound).toBe(0);
    expect(result.depsResolved).toBe(0);
  });

  it('handles depth=2 resolving transitive dependencies', async () => {
    const mainSource = `CLASS zcl_a DEFINITION PUBLIC.
  PUBLIC SECTION.
    DATA mo TYPE REF TO zcl_b.
ENDCLASS.
CLASS zcl_a IMPLEMENTATION.
ENDCLASS.`;

    const bSource = `CLASS zcl_b DEFINITION PUBLIC.
  PUBLIC SECTION.
    DATA mo TYPE REF TO zcl_c.
    METHODS run.
ENDCLASS.
CLASS zcl_b IMPLEMENTATION.
  METHOD run. ENDMETHOD.
ENDCLASS.`;

    const cSource = `CLASS zcl_c DEFINITION PUBLIC.
  PUBLIC SECTION.
    METHODS deep_method.
ENDCLASS.
CLASS zcl_c IMPLEMENTATION.
  METHOD deep_method. ENDMETHOD.
ENDCLASS.`;

    const client = mockClient({
      ZCL_B: bSource,
      ZCL_C: cSource,
    });

    // depth=1: only zcl_b
    const shallow = await compressContext(client, mainSource, 'zcl_a', 'CLAS', 20, 1);
    expect(shallow.output).toContain('zcl_b');
    expect(shallow.output).not.toContain('deep_method');

    // depth=2: zcl_b + zcl_c
    const deep = await compressContext(client, mainSource, 'zcl_a', 'CLAS', 20, 2);
    expect(deep.output).toContain('zcl_b');
    expect(deep.output).toContain('zcl_c');
    expect(deep.output).toContain('deep_method');
  });

  it('detects cycles and does not loop infinitely', async () => {
    const aSource = `CLASS zcl_a DEFINITION PUBLIC.
  PUBLIC SECTION.
    DATA mo TYPE REF TO zcl_b.
ENDCLASS.
CLASS zcl_a IMPLEMENTATION.
ENDCLASS.`;

    const bSource = `CLASS zcl_b DEFINITION PUBLIC.
  PUBLIC SECTION.
    DATA mo TYPE REF TO zcl_a.
    METHODS run.
ENDCLASS.
CLASS zcl_b IMPLEMENTATION.
  METHOD run. ENDMETHOD.
ENDCLASS.`;

    const client = mockClient({
      ZCL_A: aSource,
      ZCL_B: bSource,
    });

    // Should not hang — cycle detection prevents infinite recursion
    const result = await compressContext(client, aSource, 'zcl_a', 'CLAS', 20, 3);
    expect(result.depsResolved).toBeGreaterThanOrEqual(1);
    // zcl_a is in the seen set from the start, so zcl_b's reference to zcl_a is skipped
    expect(result.output).toContain('zcl_b');
  });
});

describe('inferObjectType', () => {
  it('infers INTF from interface dependency kind', () => {
    expect(inferObjectType({ name: 'ZIF_ORDER', kind: 'interface', line: 1 })).toBe('INTF');
  });

  it('infers FUNC from function_call kind', () => {
    expect(inferObjectType({ name: 'Z_DELIVERY_FM', kind: 'function_call', line: 1 })).toBe('FUNC');
  });

  it('infers INTF from ZIF_ naming convention', () => {
    expect(inferObjectType({ name: 'ZIF_TEST', kind: 'type_ref', line: 1 })).toBe('INTF');
  });

  it('infers INTF from IF_ naming convention', () => {
    expect(inferObjectType({ name: 'IF_SERIALIZABLE', kind: 'type_ref', line: 1 })).toBe('INTF');
  });

  it('infers CLAS from ZCL_ naming convention', () => {
    expect(inferObjectType({ name: 'ZCL_ORDER', kind: 'type_ref', line: 1 })).toBe('CLAS');
  });

  it('infers CLAS from CX_ exception naming', () => {
    expect(inferObjectType({ name: 'ZCX_NOT_FOUND', kind: 'exception', line: 1 })).toBe('CLAS');
  });

  it('infers INTF from namespaced interface', () => {
    expect(inferObjectType({ name: '/DMO/IF_FLIGHT', kind: 'type_ref', line: 1 })).toBe('INTF');
  });

  it('infers CLAS from namespaced class', () => {
    expect(inferObjectType({ name: '/DMO/CL_FLIGHT', kind: 'type_ref', line: 1 })).toBe('CLAS');
  });

  it('defaults to CLAS for unknown names', () => {
    expect(inferObjectType({ name: 'SOME_OBJECT', kind: 'type_ref', line: 1 })).toBe('CLAS');
  });
});
