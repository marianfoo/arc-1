/**
 * SAPNavigate scenarios — definition / references / completion / hierarchy.
 */

import type { EvalScenario } from '../types.js';

export const SCENARIOS: EvalScenario[] = [
  {
    id: 'navigate-where-used',
    description: 'Find where a class is used (references)',
    prompt: 'Where is class ZCL_ORDER_SERVICE used in the system?',
    category: 'navigate',
    tags: ['single-step', 'basic'],
    optimal: [
      {
        tool: 'SAPNavigate',
        requiredArgs: { action: 'references', type: 'CLAS', name: 'ZCL_ORDER_SERVICE' },
      },
    ],
    acceptable: [
      {
        tool: 'SAPSearch',
        requiredArgs: { searchType: 'source_code', query: 'ZCL_ORDER_SERVICE' },
      },
    ],
    mockResponses: {
      SAPNavigate: JSON.stringify([{ uri: '/sap/bc/adt/programs/programs/ZTEST/source/main', line: 15, column: 5 }]),
      SAPSearch: JSON.stringify([{ objectName: 'ZTEST', objectType: 'PROG/P', line: 15 }]),
    },
  },
];
