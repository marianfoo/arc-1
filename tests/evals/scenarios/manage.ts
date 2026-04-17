/**
 * SAPManage scenarios — system capability checks, package CRUD, FLP.
 */

import type { EvalScenario } from '../types.js';

export const SCENARIOS: EvalScenario[] = [
  {
    id: 'manage-check-features',
    description: 'Check system capabilities before attempting operations',
    prompt: 'Does this SAP system support abapGit and RAP/CDS?',
    category: 'manage',
    tags: ['single-step', 'basic'],
    optimal: [{ tool: 'SAPManage', requiredArgs: { action: 'features' } }],
    acceptable: [{ tool: 'SAPManage', requiredArgs: { action: 'probe' } }],
    mockResponses: {
      SAPManage: JSON.stringify({
        features: [
          { id: 'abapGit', available: true },
          { id: 'rap', available: true },
        ],
        systemType: 'onprem',
      }),
    },
  },
];
