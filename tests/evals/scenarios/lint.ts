/**
 * SAPLint scenarios — local abaplint (must not be confused with SAPDiagnose).
 */

import type { EvalScenario } from '../types.js';

export const SCENARIOS: EvalScenario[] = [
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
];
