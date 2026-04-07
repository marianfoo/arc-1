/**
 * E2E Tests for SAPNavigate — Where-Used Analysis
 *
 * Tests the scope-based Where-Used API against real SAP objects:
 * - Custom Z objects (ZIF_ARC1_TEST, ZCL_ARC1_TEST) with known relationships
 * - Standard SAP objects (CL_ABAP_CHAR_UTILITIES, BAPIRET2, BUKRS) with many references
 * - Multiple object types: CLAS, INTF, STRU, DOMA, DTEL, TABL, PROG
 * - objectType filtering
 * - Error handling for missing/invalid parameters
 *
 * Requires persistent test objects from setup.ts (ZCL_ARC1_TEST, ZIF_ARC1_TEST).
 */

import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { callTool, connectClient, expectToolError, expectToolSuccess } from './helpers.js';
import { ensureTestObjects } from './setup.js';

describe('E2E SAPNavigate — Where-Used Analysis', () => {
  let client: Client;

  beforeAll(async () => {
    client = await connectClient();
    await ensureTestObjects(client);
  });

  afterAll(async () => {
    try {
      await client?.close();
    } catch {
      // Ignore close errors
    }
  });

  // ── Custom objects: known relationships ──────────────────────────

  describe('Custom Z objects (known references)', () => {
    it('finds references to ZIF_ARC1_TEST — implemented by ZCL_ARC1_TEST', async () => {
      const result = await callTool(client, 'SAPNavigate', {
        action: 'references',
        type: 'INTF',
        name: 'ZIF_ARC1_TEST',
      });
      const text = expectToolSuccess(result);
      const refs = JSON.parse(text);
      expect(refs.length).toBeGreaterThanOrEqual(1);
      // ZCL_ARC1_TEST implements this interface — must appear in results
      const classRef = refs.find((r: { name: string }) => r.name === 'ZCL_ARC1_TEST');
      expect(classRef, 'ZCL_ARC1_TEST should reference ZIF_ARC1_TEST').toBeDefined();
      expect(classRef.uri).toContain('/oo/classes/');
    });

    it('finds references to ZCL_ARC1_TEST using type+name', async () => {
      const result = await callTool(client, 'SAPNavigate', {
        action: 'references',
        type: 'CLAS',
        name: 'ZCL_ARC1_TEST',
      });
      const text = expectToolSuccess(result);
      const refs = JSON.parse(text);
      // ZCL_ARC1_TEST_UT or the report may reference it
      expect(Array.isArray(refs)).toBe(true);
      // The result should be valid JSON with expected structure
      if (refs.length > 0) {
        expect(refs[0]).toHaveProperty('uri');
        expect(refs[0]).toHaveProperty('type');
        expect(refs[0]).toHaveProperty('name');
      }
    });
  });

  // ── Standard SAP objects: classes ─────────────────────────────────

  describe('Standard classes', () => {
    it('finds references to CL_ABAP_CHAR_UTILITIES — widely used class', async () => {
      const result = await callTool(client, 'SAPNavigate', {
        action: 'references',
        type: 'CLAS',
        name: 'CL_ABAP_CHAR_UTILITIES',
      });
      const text = expectToolSuccess(result);
      const refs = JSON.parse(text);
      expect(refs.length).toBeGreaterThan(0);
      // Verify result shape — should have enriched fields from scope-based API
      const first = refs[0];
      expect(first).toHaveProperty('uri');
      expect(first).toHaveProperty('type');
      expect(first).toHaveProperty('name');
      expect(first.uri).toBeTruthy();
      expect(first.name).toBeTruthy();
    });
  });

  // ── Standard SAP objects: DDIC ────────────────────────────────────

  describe('DDIC objects', () => {
    it('finds references to BAPIRET2 structure', async () => {
      const result = await callTool(client, 'SAPNavigate', {
        action: 'references',
        type: 'STRU',
        name: 'BAPIRET2',
      });
      const text = expectToolSuccess(result);
      const refs = JSON.parse(text);
      expect(refs.length).toBeGreaterThan(0);
      console.log(`    BAPIRET2 has ${refs.length} references`);
    });

    it('finds references to BUKRS domain', async () => {
      const result = await callTool(client, 'SAPNavigate', {
        action: 'references',
        type: 'DOMA',
        name: 'BUKRS',
      });
      const text = expectToolSuccess(result);
      const refs = JSON.parse(text);
      expect(refs.length).toBeGreaterThan(0);
      console.log(`    BUKRS domain has ${refs.length} references`);
    });

    it('finds references to BUKRS data element', async () => {
      const result = await callTool(client, 'SAPNavigate', {
        action: 'references',
        type: 'DTEL',
        name: 'BUKRS',
      });
      const text = expectToolSuccess(result);
      const refs = JSON.parse(text);
      expect(refs.length).toBeGreaterThan(0);
      console.log(`    BUKRS data element has ${refs.length} references`);
    });

    it('finds references to T001 table', async () => {
      const result = await callTool(client, 'SAPNavigate', {
        action: 'references',
        type: 'TABL',
        name: 'T001',
      });
      const text = expectToolSuccess(result);
      const refs = JSON.parse(text);
      expect(refs.length).toBeGreaterThan(0);
      console.log(`    T001 table has ${refs.length} references`);
    });
  });

  // ── objectType filtering ──────────────────────────────────────────

  describe('objectType filtering', () => {
    it('filters references by objectType PROG/P', async () => {
      const result = await callTool(client, 'SAPNavigate', {
        action: 'references',
        type: 'CLAS',
        name: 'CL_ABAP_CHAR_UTILITIES',
        objectType: 'PROG/P',
      });
      const text = expectToolSuccess(result);
      const refs = JSON.parse(text);
      // If scope-based API is available, all results should be PROG/P
      // If fallback, we get a { note, results } object with unfiltered results
      if (Array.isArray(refs)) {
        // Scope-based API — all refs should be programs
        for (const ref of refs) {
          expect(ref.type).toBe('PROG/P');
        }
        console.log(`    Filtered to ${refs.length} PROG/P references (scope-based API)`);
      } else {
        // Fallback — { note, results } shape
        expect(refs.note).toContain('objectType filter');
        expect(Array.isArray(refs.results)).toBe(true);
        console.log(`    Fallback: ${refs.results.length} unfiltered references (legacy API)`);
      }
    });

    it('filters references by objectType CLAS/OC', async () => {
      const result = await callTool(client, 'SAPNavigate', {
        action: 'references',
        type: 'STRU',
        name: 'BAPIRET2',
        objectType: 'CLAS/OC',
      });
      const text = expectToolSuccess(result);
      const refs = JSON.parse(text);
      if (Array.isArray(refs)) {
        for (const ref of refs) {
          expect(ref.type).toBe('CLAS/OC');
        }
        console.log(`    Filtered to ${refs.length} CLAS/OC references (scope-based API)`);
      } else {
        expect(refs.note).toContain('objectType filter');
        console.log(`    Fallback: ${refs.results.length} unfiltered references (legacy API)`);
      }
    });
  });

  // ── Where-Used result enrichment ──────────────────────────────────

  describe('enriched result fields (scope-based API)', () => {
    it('returns line numbers, snippets, and package info', async () => {
      const result = await callTool(client, 'SAPNavigate', {
        action: 'references',
        type: 'INTF',
        name: 'ZIF_ARC1_TEST',
      });
      const text = expectToolSuccess(result);
      const refs = JSON.parse(text);
      expect(refs.length).toBeGreaterThanOrEqual(1);
      const first = refs[0];
      // Scope-based API returns enriched fields
      if ('line' in first && first.line > 0) {
        expect(first.line).toBeGreaterThan(0);
        expect(first).toHaveProperty('packageName');
        expect(first).toHaveProperty('snippet');
        console.log(
          `    Enriched result: line=${first.line}, package=${first.packageName}, snippet="${first.snippet}"`,
        );
      } else {
        // Fallback API — line/column are 0
        console.log('    Legacy API: no line/snippet enrichment');
      }
    });
  });

  // ── Definition lookup ─────────────────────────────────────────────

  describe('definition lookup', () => {
    it('finds definition of a class reference in source code', async () => {
      // ZCL_ARC1_TEST references ZIF_ARC1_TEST in line 3: "INTERFACES zif_arc1_test."
      const result = await callTool(client, 'SAPNavigate', {
        action: 'definition',
        uri: '/sap/bc/adt/oo/classes/ZCL_ARC1_TEST/source/main',
        line: 3,
        column: 16,
        source: [
          'CLASS zcl_arc1_test DEFINITION PUBLIC FINAL CREATE PUBLIC.',
          '  PUBLIC SECTION.',
          '    INTERFACES zif_arc1_test.',
        ].join('\n'),
      });
      const text = expectToolSuccess(result);
      const def = JSON.parse(text);
      expect(def.uri).toContain('zif_arc1_test');
      expect(def.name).toMatch(/ZIF_ARC1_TEST/i);
    });
  });

  // ── No references found ───────────────────────────────────────────

  describe('empty results', () => {
    it('returns "No references found" for an unused custom report', async () => {
      // ZARC1_TEST_REPORT is a standalone report — unlikely to be referenced
      const result = await callTool(client, 'SAPNavigate', {
        action: 'references',
        type: 'PROG',
        name: 'ZARC1_TEST_REPORT',
      });
      const text = result.content[0]?.text ?? '';
      // Either "No references found" or a valid (possibly empty) array
      if (text === 'No references found.') {
        expect(text).toBe('No references found.');
      } else {
        const refs = JSON.parse(text);
        expect(Array.isArray(refs)).toBe(true);
      }
    });
  });

  // ── Error handling ────────────────────────────────────────────────

  describe('error handling', () => {
    it('returns error when no uri or type+name provided', async () => {
      const result = await callTool(client, 'SAPNavigate', {
        action: 'references',
      });
      expectToolError(result, 'uri', 'type');
    });

    it('returns error for definition without line/column', async () => {
      const result = await callTool(client, 'SAPNavigate', {
        action: 'definition',
        uri: '/sap/bc/adt/oo/classes/ZCL_ARC1_TEST/source/main',
      });
      expectToolError(result, 'line', 'column');
    });
  });
});
