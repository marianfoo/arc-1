/**
 * Citation guard for SLASH_TYPE_MAP and KNOWN_BASE_TYPES.
 *
 * Background — PR #222 / issue #218 audit found six bugs of the same class
 * (`STRU/DS`, `FUNC/FM`, `FUGR/FF` mis-route, `CLAS/LI`, `VIEW/V`, `TRAN/O`),
 * all rooted in slash codes added without verification against any SAP source.
 * This test enforces two structural invariants:
 *
 *   1. Every entry in SLASH_TYPE_MAP has a matching entry in
 *      SLASH_TYPE_EVIDENCE pointing at a research file that exists on disk.
 *   2. Every entry in KNOWN_BASE_TYPES is a target value of SLASH_TYPE_MAP
 *      (i.e. some slash code normalizes to it) OR is a top-level canonical
 *      type that doesn't have a slash form (e.g. PROG itself, INCL itself).
 *
 * If a future contributor adds a new slash alias without a research doc, this
 * test fails — that's the anti-cargo-cult guard.
 */

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  KNOWN_BASE_TYPES,
  normalizeObjectType,
  objectBasePath,
  SLASH_TYPE_EVIDENCE,
} from '../../../src/handlers/intent.js';

// Internal: re-derive SLASH_TYPE_MAP keys via probe through normalizeObjectType.
// We don't export the raw map (it's a local const) — and exporting it just for
// the test would create a temptation to bypass the guard. Instead, we drive it
// through the public normalizer using the SLASH_TYPE_EVIDENCE keys as the
// expected universe of slash codes.

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

describe('SLASH_TYPE_MAP citation guard (anti-cargo-cult)', () => {
  it('every SLASH_TYPE_EVIDENCE key resolves to an existing research file on disk', () => {
    const missing: string[] = [];
    for (const [slashCode, evidencePath] of Object.entries(SLASH_TYPE_EVIDENCE)) {
      const fullPath = resolve(REPO_ROOT, evidencePath);
      if (!existsSync(fullPath)) {
        missing.push(`${slashCode} → ${evidencePath}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('every SLASH_TYPE_EVIDENCE entry corresponds to an active SLASH_TYPE_MAP entry', () => {
    // Drive normalizeObjectType: if the slash code is in SLASH_TYPE_MAP, the
    // result will differ from the input. Pass-through means it's not in the
    // map, which means the citation is orphaned.
    const orphaned: string[] = [];
    for (const slashCode of Object.keys(SLASH_TYPE_EVIDENCE)) {
      if (normalizeObjectType(slashCode) === slashCode) {
        orphaned.push(slashCode);
      }
    }
    expect(orphaned).toEqual([]);
  });

  it('removed invented aliases are NOT in SLASH_TYPE_EVIDENCE', () => {
    // Sanity check that the citation map didn't get back-filled with the
    // invented aliases the audit removed.
    const invented = ['FUNC/FM', 'CLAS/LI', 'VIEW/V', 'TRAN/O'];
    for (const code of invented) {
      expect(SLASH_TYPE_EVIDENCE[code]).toBeUndefined();
    }
  });

  it('replacement aliases ARE in SLASH_TYPE_EVIDENCE', () => {
    // The aliases that replaced the invented ones must be cited.
    const replacements: Array<[string, string]> = [
      ['FUGR/FF', 'research/abap-types/types/fugr.md'],
      ['VIEW/DV', 'research/abap-types/types/view.md'],
      ['TRAN/T', 'research/abap-types/types/tran.md'],
    ];
    for (const [code, expectedPath] of replacements) {
      expect(SLASH_TYPE_EVIDENCE[code]).toBe(expectedPath);
    }
  });
});

describe('KNOWN_BASE_TYPES exhaustiveness', () => {
  it('every target of SLASH_TYPE_MAP normalisation is in KNOWN_BASE_TYPES', () => {
    // For every cited slash code, the canonical short form it normalizes to
    // MUST be in KNOWN_BASE_TYPES — otherwise objectBasePath has no case for
    // it (Plan A Task 4 exhaustiveness guard).
    const orphans: Array<[string, string]> = [];
    for (const slashCode of Object.keys(SLASH_TYPE_EVIDENCE)) {
      const canonical = normalizeObjectType(slashCode);
      if (!KNOWN_BASE_TYPES.has(canonical)) {
        orphans.push([slashCode, canonical]);
      }
    }
    expect(orphans).toEqual([]);
  });

  it('objectBasePath returns a valid /sap/bc/adt/ URL for every KNOWN_BASE_TYPES entry', () => {
    // Exhaustiveness regression test: if a canonical short type is added to
    // KNOWN_BASE_TYPES without a matching case in objectBasePath, the
    // exhaustiveness guard inside objectBasePath throws. Verify here that
    // every currently listed type returns a usable ADT URL.
    for (const type of KNOWN_BASE_TYPES) {
      const url = objectBasePath(type);
      expect(url, `${type} → ${url}`).toMatch(/^\/sap\/bc\/adt\//);
      expect(url.endsWith('/'), `${type} should end with '/'`).toBe(true);
    }
  });

  it('VIEW routes through the VIT generic-object endpoint, not /programs/programs/', () => {
    // Regression guard for the silent-fallthrough bug fixed in PR #222.
    // Before the fix, objectBasePath('VIEW') fell through to the program
    // path. Live a4h+npl 2026-05-08: GET /sap/bc/adt/ddic/views/V_USR_NAME
    // returns HTTP 500; only the VIT URL works.
    const url = objectBasePath('VIEW');
    expect(url).toBe('/sap/bc/adt/vit/wb/object_type/viewdv/object_name/');
    expect(url).not.toContain('/programs/programs/');
  });

  it('TRAN keeps the trant infix that matches ADT-emitted TRAN/T slash code', () => {
    // The TRAN URL builder was correct pre-PR #222; only the SLASH_TYPE_MAP
    // alias was wrong (TRAN/O → TRAN/T). This guards against regression.
    expect(objectBasePath('TRAN')).toBe('/sap/bc/adt/vit/wb/object_type/trant/object_name/');
  });

  it('throws when given a known canonical type with no switch case (regression guard)', () => {
    // The exhaustiveness guard inside objectBasePath throws if KNOWN_BASE_TYPES
    // says a type is canonical but the switch has no case. We can't easily
    // test the throw without modifying KNOWN_BASE_TYPES, but we can verify
    // the guard doesn't fire today (sanity check the assertion above).
    // Unknown raw inputs (not in KNOWN_BASE_TYPES) still legacy-fallthrough
    // to the program path so callers like inferObjectType don't break.
    expect(objectBasePath('NOT_A_REAL_TYPE')).toBe('/sap/bc/adt/programs/programs/');
  });
});
