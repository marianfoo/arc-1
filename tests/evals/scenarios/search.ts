/**
 * Search scenarios — SAPSearch (object-name + source-code search).
 */

import type { EvalScenario } from '../types.js';

export const SCENARIOS: EvalScenario[] = [
  {
    id: 'search-objects',
    description: 'Search for objects by name pattern',
    prompt: 'Find all classes related to order processing in the system',
    category: 'search',
    tags: ['single-step', 'basic'],
    optimal: [{ tool: 'SAPSearch', requiredArgKeys: ['query'] }],
    forbidden: ['SAPRead', 'SAPWrite'],
    mockResponses: {
      SAPSearch: JSON.stringify([
        { objectType: 'CLAS/OC', objectName: 'ZCL_ORDER_SERVICE', packageName: 'ZORDER' },
        { objectType: 'CLAS/OC', objectName: 'ZCL_ORDER_REPOSITORY', packageName: 'ZORDER' },
      ]),
    },
  },

  {
    id: 'search-source-code',
    description: 'Search within ABAP source code',
    prompt: 'Find all places in the codebase where cl_lsapi_manager is used',
    category: 'search',
    tags: ['single-step', 'basic'],
    optimal: [
      {
        tool: 'SAPSearch',
        requiredArgs: { searchType: 'source_code' },
        requiredArgKeys: ['query'],
      },
    ],
    mockResponses: {
      SAPSearch: JSON.stringify([
        { objectType: 'CLAS/OC', objectName: 'ZCL_API_HANDLER', line: 42, snippet: 'cl_lsapi_manager=>...' },
      ]),
    },
  },
];
