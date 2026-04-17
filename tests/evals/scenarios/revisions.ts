/**
 * SAPRead VERSIONS / VERSION_SOURCE scenarios — source revision history (FEAT-20).
 *
 * These cover two related `SAPRead` types that together expose ADT's
 * per-object version history:
 *
 *   1. `VERSIONS` — lists revisions for an object. Routes to the per-type
 *      ADT endpoint (programs/classes/interfaces/function modules/…).
 *      CLAS requires an `include` to pick one of {main, definitions,
 *      implementations, macros, testclasses}; defaults to `main`.
 *   2. `VERSION_SOURCE` — fetches the source payload for a single revision
 *      entry returned by `VERSIONS` (follow the `uri` field).
 *
 * Mock responses were captured from the A4H test system on 2026-04-17 via
 * `npm run dev:http` against real objects in `$TMP`. Most A4H objects only
 * have a single revision slot — A4H has not enabled ABAP local version
 * history — but the Atom feed shape matches production systems.
 */

import type { EvalScenario } from '../types.js';

// ── VERSIONS feed mocks — captured from A4H on 2026-04-17 ──────────────

/**
 * Atom feed for program ZARC1_TEST_REPORT on A4H. Single revision slot —
 * the version the object currently sits at. This matches what the client
 * parser (`parseRevisionFeed`) returns verbatim.
 */
const VERSIONS_PROG_ZARC1_MOCK = JSON.stringify({
  object: { name: 'ZARC1_TEST_REPORT', type: 'REPS' },
  revisions: [
    {
      id: '00000',
      author: 'DEVELOPER',
      timestamp: '2026-04-10T18:58:51Z',
      versionTitle: 'Version 00000',
      transport: 'A4HK900123',
      uri: '/sap/bc/adt/programs/programs/ZARC1_TEST_REPORT/source/main/versions/20260410185851/00000/content',
    },
  ],
});

/**
 * Atom feed for class ZCL_ARC1_TEST include="main" — the default view a
 * user gets when they say "show me the revisions of a class".
 */
const VERSIONS_CLAS_MAIN_MOCK = JSON.stringify({
  object: { name: 'ZCL_ARC1_TEST', type: 'CLAS' },
  revisions: [
    {
      id: '00000',
      author: 'DEVELOPER',
      timestamp: '2026-04-10T19:02:11Z',
      versionTitle: 'Version 00000',
      uri: '/sap/bc/adt/oo/classes/ZCL_ARC1_TEST/includes/main/versions/20260410190211/00000/content',
    },
  ],
});

/**
 * Atom feed for class ZCL_ARC1_TEST include="definitions" — the CCDEF
 * (local class definitions) section. Different URL segment, different
 * history.
 */
const VERSIONS_CLAS_DEFINITIONS_MOCK = JSON.stringify({
  object: { name: 'ZCL_ARC1_TEST', type: 'CLAS' },
  revisions: [
    {
      id: '00000',
      author: 'DEVELOPER',
      timestamp: '2026-04-10T19:02:11Z',
      versionTitle: 'Version 00000',
      uri: '/sap/bc/adt/oo/classes/ZCL_ARC1_TEST/includes/definitions/versions/20260410190211/00000/content',
    },
  ],
});

/** Atom feed for interface ZIF_ARC1_TEST — INTF auto-inferred from name. */
const VERSIONS_INTF_MOCK = JSON.stringify({
  object: { name: 'ZIF_ARC1_TEST', type: 'INTF' },
  revisions: [
    {
      id: '00000',
      author: 'DEVELOPER',
      timestamp: '2026-04-10T19:01:55Z',
      versionTitle: 'Version 00000',
      uri: '/sap/bc/adt/oo/interfaces/ZIF_ARC1_TEST/source/main/versions/20260410190155/00000/content',
    },
  ],
});

/** Source payload for a VERSION_SOURCE lookup — what the revision URI returns. */
const VERSION_SOURCE_ZARC1_MOCK = `REPORT zarc1_test_report.
* Test report for ARC-1 E2E testing.
* DO NOT DELETE — used by automated E2E tests.
DATA: lv_text TYPE string.
lv_text = 'ARC-1 E2E test report'.
WRITE: / lv_text.`;

export const SCENARIOS: EvalScenario[] = [
  // ── Basic VERSIONS listing ──────────────────────────────────────────
  {
    id: 'revisions-list-program',
    description: 'List revisions of an ABAP program',
    prompt: 'Show me the revision history of program ZARC1_TEST_REPORT.',
    category: 'read',
    tags: ['feat-20', 'revisions', 'single-step'],
    optimal: [{ tool: 'SAPRead', requiredArgs: { type: 'VERSIONS', name: 'ZARC1_TEST_REPORT' } }],
    // Some LLMs read the program first to confirm it exists — wasteful but
    // not incorrect.
    acceptable: [{ tool: 'SAPRead', requiredArgs: { type: 'PROG', name: 'ZARC1_TEST_REPORT' } }],
    forbidden: ['SAPSearch', 'SAPQuery', 'SAPNavigate'],
    mockResponses: {
      SAPRead: VERSIONS_PROG_ZARC1_MOCK,
    },
  },

  {
    id: 'revisions-list-class-main',
    description: 'List revisions of a class (defaults to include=main)',
    prompt: 'What revisions exist for class ZCL_ARC1_TEST?',
    category: 'read',
    tags: ['feat-20', 'revisions', 'single-step'],
    optimal: [
      {
        tool: 'SAPRead',
        requiredArgs: { type: 'VERSIONS', name: 'ZCL_ARC1_TEST', objectType: 'CLAS' },
      },
    ],
    // Passing objectType is not strictly required — the handler infers
    // CLAS from the ZCL_ prefix — so a call without it is also valid.
    acceptable: [{ tool: 'SAPRead', requiredArgs: { type: 'VERSIONS', name: 'ZCL_ARC1_TEST' } }],
    forbidden: ['SAPSearch', 'SAPQuery'],
    mockResponses: {
      SAPRead: VERSIONS_CLAS_MAIN_MOCK,
    },
  },

  {
    id: 'revisions-list-class-definitions',
    description: 'Route to CLAS include=definitions (local class definitions history)',
    prompt:
      'Show me the version history for the local class definitions (CCDEF) of class ZCL_ARC1_TEST — not the main implementation.',
    category: 'read',
    tags: ['feat-20', 'revisions', 'include-routing'],
    optimal: [
      {
        tool: 'SAPRead',
        requiredArgs: {
          type: 'VERSIONS',
          name: 'ZCL_ARC1_TEST',
          objectType: 'CLAS',
          include: 'definitions',
        },
      },
    ],
    forbidden: ['SAPSearch', 'SAPQuery'],
    mockResponses: {
      SAPRead: VERSIONS_CLAS_DEFINITIONS_MOCK,
    },
  },

  {
    id: 'revisions-list-interface',
    description: 'List revisions of an interface (objectType inferred from ZIF_ prefix)',
    prompt: 'List the revisions of interface ZIF_ARC1_TEST.',
    category: 'read',
    tags: ['feat-20', 'revisions', 'single-step'],
    optimal: [{ tool: 'SAPRead', requiredArgs: { type: 'VERSIONS', name: 'ZIF_ARC1_TEST' } }],
    // Explicit objectType is also correct.
    acceptable: [
      {
        tool: 'SAPRead',
        requiredArgs: { type: 'VERSIONS', name: 'ZIF_ARC1_TEST', objectType: 'INTF' },
      },
    ],
    forbidden: ['SAPSearch', 'SAPQuery'],
    mockResponses: {
      SAPRead: VERSIONS_INTF_MOCK,
    },
  },

  // ── Multi-step: list + fetch source ─────────────────────────────────
  {
    id: 'revisions-fetch-source',
    description: 'List revisions and then fetch the source of a specific version',
    prompt:
      'I need to see what program ZARC1_TEST_REPORT looked like in an earlier revision. First list its revisions, then fetch the source of the oldest one.',
    category: 'read',
    tags: ['feat-20', 'revisions', 'multi-step'],
    // The first ARC-1 tool call must be VERSIONS — VERSION_SOURCE needs
    // the `versionUri` from that feed.
    optimal: [{ tool: 'SAPRead', requiredArgs: { type: 'VERSIONS', name: 'ZARC1_TEST_REPORT' } }],
    forbidden: ['SAPSearch', 'SAPQuery', 'SAPNavigate'],
    mockResponses: {
      // Both calls hit SAPRead — we mock the list response here; if the
      // LLM makes the follow-up VERSION_SOURCE call it gets the same mock
      // (harmless for scoring, which only grades the first tool call).
      SAPRead: VERSIONS_PROG_ZARC1_MOCK,
    },
  },

  // ── Disambiguation: revision history vs current source ─────────────
  {
    id: 'revisions-vs-plain-read',
    description: 'User asks for history — must not route to plain source read',
    prompt:
      'I want the change history for program ZARC1_TEST_REPORT, not the current source — who changed it and when.',
    category: 'read',
    tags: ['feat-20', 'revisions', 'discoverability'],
    optimal: [{ tool: 'SAPRead', requiredArgs: { type: 'VERSIONS', name: 'ZARC1_TEST_REPORT' } }],
    // Using SAPSearch to guess at the object by name is wrong — the user
    // named the object explicitly and asked for history.
    forbidden: ['SAPSearch', 'SAPQuery', 'SAPNavigate', 'SAPTransport'],
    mockResponses: {
      SAPRead: VERSIONS_PROG_ZARC1_MOCK,
    },
  },

  // ── Fetch just the source of a known revision URI ──────────────────
  {
    id: 'revisions-version-source-only',
    description: 'Fetch source of a specific revision when the user provides the URI',
    prompt:
      'Fetch the source for this revision URI: /sap/bc/adt/programs/programs/ZARC1_TEST_REPORT/source/main/versions/20260410185851/00000/content',
    category: 'read',
    tags: ['feat-20', 'revisions', 'single-step'],
    optimal: [
      {
        tool: 'SAPRead',
        requiredArgs: { type: 'VERSION_SOURCE' },
        requiredArgKeys: ['versionUri'],
      },
    ],
    forbidden: ['SAPSearch', 'SAPQuery'],
    mockResponses: {
      SAPRead: VERSION_SOURCE_ZARC1_MOCK,
    },
  },
];
