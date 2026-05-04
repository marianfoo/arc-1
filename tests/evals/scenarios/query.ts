/**
 * SAPQuery — SQL-against-SAP scenarios. Only registered when allowFreeSQL=true.
 */

import type { EvalScenario } from '../types.js';

export const SCENARIOS: EvalScenario[] = [
  {
    id: 'query-sql',
    description: 'Execute an SQL query against SAP tables',
    prompt: 'Query the TADIR table to find all custom development objects in package ZORDER',
    category: 'query',
    tags: ['single-step', 'basic'],
    optimal: [{ tool: 'SAPQuery', requiredArgKeys: ['sql'] }],
    acceptable: [{ tool: 'SAPRead', requiredArgs: { type: 'DEVC', name: 'ZORDER' } }],
    mockResponses: {
      SAPQuery: JSON.stringify({
        columns: ['PGMID', 'OBJECT', 'OBJ_NAME'],
        rows: [{ PGMID: 'R3TR', OBJECT: 'CLAS', OBJ_NAME: 'ZCL_ORDER_SERVICE' }],
      }),
      SAPRead: JSON.stringify([{ type: 'CLAS', name: 'ZCL_ORDER_SERVICE' }]),
    },
  },
];
