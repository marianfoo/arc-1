/**
 * SAPLint scenarios — local abaplint + ADT PrettyPrinter (FEAT-10).
 *
 * These cover two related-but-distinct SAPLint action groups:
 *
 *   1. Local abaplint (`lint`, `lint_and_fix`, `list_rules`) — zero SAP
 *      round-trip, runs @abaplint/core in-process.
 *   2. ADT PrettyPrinter (`format`, `get_formatter_settings`,
 *      `set_formatter_settings`) — calls the SAP backend's server-side
 *      formatter at `/sap/bc/adt/abapsource/prettyprinter[/settings]`.
 *
 * Mock responses were captured live against the A4H test system on
 * 2026-04-17 via `npm run dev:http` + the LLM test harness. When the
 * formatter profile (keywordUpper / keywordLower, indent width) drifts on
 * the SAP side, refresh the strings below by pasting a fresh tool result.
 */

import type { EvalScenario } from '../types.js';

// ── ADT PrettyPrinter mocks — captured from A4H on 2026-04-17 ──────────

/** `format` output for a small snippet under keywordUpper/indentation=true. */
const FORMAT_SNIPPET_MOCK = `REPORT zdemo.
DATA lv_x TYPE i.
IF lv_x > 0.
  WRITE: / 'positive'.
ENDIF.`;

/**
 * `format` output for ZARC1_TEST_REPORT. ADT returned the same source
 * byte-for-byte because the program already matches the global formatter
 * profile — exactly the case that caught our LLMs assuming format must
 * change something.
 */
const FORMAT_ZARC1_TEST_REPORT_MOCK = `REPORT zarc1_test_report.
* Test report for ARC-1 E2E testing.
* DO NOT DELETE — used by automated E2E tests.
DATA: lv_text TYPE string.
lv_text = 'ARC-1 E2E test report'.
WRITE: / lv_text.`;

/** `get_formatter_settings` — A4H's default global profile. */
const GET_FORMATTER_SETTINGS_MOCK = JSON.stringify({ indentation: true, style: 'keywordUpper' });

/** `set_formatter_settings` echoes the applied settings back. */
const SET_FORMATTER_SETTINGS_MOCK = JSON.stringify({ indentation: true, style: 'keywordLower' });

export const SCENARIOS: EvalScenario[] = [
  // ── Local abaplint ──────────────────────────────────────────────────
  {
    id: 'lint-local-check',
    description: 'Run local lint on ABAP source code',
    prompt: "Can you lint this ABAP code locally?\n\nREPORT ztest.\nDATA: lv_test TYPE string.\nlv_test = 'hello'.",
    category: 'lint',
    tags: ['single-step', 'basic'],
    optimal: [{ tool: 'SAPLint', requiredArgs: { action: 'lint' }, requiredArgKeys: ['source'] }],
    forbidden: ['SAPDiagnose'],
    mockResponses: {
      SAPLint: JSON.stringify([]),
    },
  },

  // ── ADT PrettyPrinter: format ───────────────────────────────────────
  {
    id: 'lint-prettyprint-snippet',
    description: 'Format a raw ABAP snippet via ADT pretty printer',
    prompt: `Pretty-print this ABAP snippet using the SAP ADT formatter:

report zdemo.
data lv_x type i.
if lv_x > 0.
write: / 'positive'.
endif.`,
    category: 'lint',
    tags: ['feat-10', 'prettyprint', 'single-step'],
    optimal: [{ tool: 'SAPLint', requiredArgs: { action: 'format' }, requiredArgKeys: ['source'] }],
    // lint_and_fix is abaplint's style-fixer — a defensible alternative
    // when the user just says "format", but it won't match ADT output.
    acceptable: [{ tool: 'SAPLint', requiredArgs: { action: 'lint_and_fix' }, requiredArgKeys: ['source'] }],
    forbidden: ['SAPDiagnose', 'SAPWrite'],
    mockResponses: {
      SAPLint: FORMAT_SNIPPET_MOCK,
    },
  },

  {
    id: 'lint-prettyprint-real-program',
    description: 'Read a real program then format it via ADT — two-step flow',
    prompt:
      'Read program ZARC1_TEST_REPORT from my SAP system and then pretty-print its source using the ADT formatter.',
    category: 'lint',
    tags: ['feat-10', 'prettyprint', 'multi-step'],
    // The first ARC-1 tool call must be SAPRead; the format step comes second.
    optimal: [{ tool: 'SAPRead', requiredArgs: { type: 'PROG', name: 'ZARC1_TEST_REPORT' } }],
    // Some LLMs inline the source into a direct format call — acceptable
    // but skips verifying the object exists first.
    acceptable: [{ tool: 'SAPLint', requiredArgs: { action: 'format' }, requiredArgKeys: ['source'] }],
    forbidden: ['SAPQuery', 'SAPDiagnose'],
    mockResponses: {
      SAPRead: FORMAT_ZARC1_TEST_REPORT_MOCK,
      SAPLint: FORMAT_ZARC1_TEST_REPORT_MOCK,
    },
  },

  // ── ADT PrettyPrinter: settings ─────────────────────────────────────
  {
    id: 'lint-get-formatter-settings',
    description: 'Read the ADT pretty printer settings from the SAP system',
    prompt:
      'What are the current ADT pretty-printer settings on my SAP system? I want to see indentation and keyword style.',
    category: 'lint',
    tags: ['feat-10', 'prettyprint', 'settings', 'single-step'],
    optimal: [{ tool: 'SAPLint', requiredArgs: { action: 'get_formatter_settings' } }],
    // SAPManage(probe) is sometimes reached for unrelated capability
    // questions; it doesn't expose formatter state but isn't harmful.
    forbidden: ['SAPQuery', 'SAPWrite'],
    mockResponses: {
      SAPLint: GET_FORMATTER_SETTINGS_MOCK,
    },
  },

  {
    id: 'lint-set-formatter-settings',
    description: 'Switch the ADT pretty printer to keywordLower',
    prompt:
      'Change the ADT pretty-printer style on my SAP system to keywordLower with indentation enabled, then confirm the change.',
    category: 'lint',
    tags: ['feat-10', 'prettyprint', 'settings', 'multi-step'],
    optimal: [
      {
        tool: 'SAPLint',
        requiredArgs: { action: 'set_formatter_settings', style: 'keywordLower', indentation: true },
      },
    ],
    // LLMs sometimes GET first to capture current state — reasonable.
    acceptable: [{ tool: 'SAPLint', requiredArgs: { action: 'get_formatter_settings' } }],
    forbidden: ['SAPQuery', 'SAPWrite'],
    mockResponses: {
      SAPLint: SET_FORMATTER_SETTINGS_MOCK,
    },
  },

  // ── Disambiguation: pretty print vs. auto-fix ───────────────────────
  {
    id: 'lint-prettyprint-vs-autofix',
    description: 'User asks for ABAP-style pretty print — must not route to abaplint lint_and_fix',
    prompt:
      "Here's some messy ABAP. Pretty-print it the way SAP's ADT formatter would, not abaplint style fixes:\n\nreport zmessy.\ndata lv_n type i value 5.\ndo lv_n times.\nwrite: / sy-index.\nenddo.",
    category: 'lint',
    tags: ['feat-10', 'prettyprint', 'discoverability'],
    optimal: [{ tool: 'SAPLint', requiredArgs: { action: 'format' }, requiredArgKeys: ['source'] }],
    // lint_and_fix is explicitly the wrong choice here — the prompt
    // distinguishes ADT formatter from abaplint style fixes.
    forbidden: ['SAPDiagnose'],
    mockResponses: {
      SAPLint: `REPORT zmessy.
DATA lv_n TYPE i VALUE 5.
DO lv_n TIMES.
  WRITE: / sy-index.
ENDDO.`,
    },
  },
];
