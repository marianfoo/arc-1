/**
 * Diagnose scenarios — SAPDiagnose (syntax, unittest, dumps).
 */

import type { EvalScenario } from '../types.js';

export const SCENARIOS: EvalScenario[] = [
  {
    id: 'diagnose-syntax-check',
    description: 'Run syntax check on an object',
    prompt: 'Check the syntax of program ZHELLO',
    category: 'diagnose',
    tags: ['single-step', 'basic'],
    optimal: [
      {
        tool: 'SAPDiagnose',
        requiredArgs: { action: 'syntax', name: 'ZHELLO' },
        requiredArgKeys: ['type'],
      },
    ],
    forbidden: ['SAPLint'],
    mockResponses: {
      SAPDiagnose: JSON.stringify({ status: 'ok', messages: [] }),
    },
  },

  {
    id: 'diagnose-unit-tests',
    description: 'Run ABAP unit tests',
    prompt: 'Run the unit tests for class ZCL_ORDER_SERVICE',
    category: 'diagnose',
    tags: ['single-step', 'basic'],
    optimal: [
      {
        tool: 'SAPDiagnose',
        requiredArgs: { action: 'unittest', name: 'ZCL_ORDER_SERVICE', type: 'CLAS' },
      },
    ],
    forbidden: ['SAPLint'],
    mockResponses: {
      SAPDiagnose: JSON.stringify({ passed: 5, failed: 0, errors: 0 }),
    },
  },

  {
    id: 'diagnose-dumps',
    description: 'List recent ABAP short dumps',
    prompt: 'Show me the recent ABAP dumps in the system',
    category: 'diagnose',
    tags: ['single-step', 'basic'],
    optimal: [{ tool: 'SAPDiagnose', requiredArgs: { action: 'dumps' } }],
    mockResponses: {
      SAPDiagnose: JSON.stringify([
        { id: '123', type: 'RABAX_STATE', user: 'DEVELOPER', timestamp: '2026-04-04T10:00:00Z' },
      ]),
    },
  },
];
