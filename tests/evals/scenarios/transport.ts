/**
 * SAPTransport scenarios — CTS list/get/create/release.
 */

import type { EvalScenario } from '../types.js';

export const SCENARIOS: EvalScenario[] = [
  {
    id: 'transport-list',
    description: 'List transport requests',
    prompt: 'Show me my open transport requests',
    category: 'transport',
    tags: ['single-step', 'basic'],
    optimal: [{ tool: 'SAPTransport', requiredArgs: { action: 'list' } }],
    mockResponses: {
      SAPTransport: JSON.stringify([
        { id: 'DEVK900001', description: 'Order processing changes', status: 'modifiable' },
      ]),
    },
  },
];
