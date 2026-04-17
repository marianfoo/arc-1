/**
 * SAPActivate scenarios — single object and RAP batch activation.
 */

import type { EvalScenario } from '../types.js';

export const SCENARIOS: EvalScenario[] = [
  {
    id: 'activate-single',
    description: 'Activate a single ABAP object',
    prompt: 'Activate program ZHELLO after I made changes',
    category: 'activate',
    tags: ['single-step', 'basic'],
    optimal: [{ tool: 'SAPActivate', requiredArgs: { type: 'PROG', name: 'ZHELLO' } }],
    mockResponses: {
      SAPActivate: 'Successfully activated PROG ZHELLO',
    },
  },

  {
    id: 'activate-rap-batch',
    description: 'Batch-activate a RAP stack (must use objects array)',
    prompt:
      'Activate the entire RAP stack for my travel app: CDS view ZI_TRAVEL, behavior definition ZI_TRAVEL, service definition ZSD_TRAVEL, and service binding ZSB_TRAVEL',
    category: 'activate',
    tags: ['single-step', 'advanced', 'rap'],
    optimal: [
      {
        tool: 'SAPActivate',
        requiredArgKeys: ['objects'],
      },
    ],
    acceptable: [{ tool: 'SAPActivate', requiredArgs: { type: 'DDLS' } }],
    mockResponses: {
      SAPActivate: 'Successfully activated 4 objects',
    },
  },
];
