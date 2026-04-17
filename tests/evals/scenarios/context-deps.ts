/**
 * SAPContext forward-dependency scenarios — action="deps".
 *
 * Covers the classic "what does X depend on" use case. CDS impact analysis
 * (action="impact") lives in context-impact.ts instead.
 */

import type { EvalScenario } from '../types.js';

export const SCENARIOS: EvalScenario[] = [
  {
    id: 'context-dependencies',
    description: 'Get dependency context (SAPContext is optimal, multiple SAPRead is acceptable)',
    prompt:
      'I need to understand the dependencies of class ZCL_BILLING before modifying it. What interfaces and classes does it depend on?',
    category: 'context',
    tags: ['single-step', 'efficiency', 'deps'],
    optimal: [{ tool: 'SAPContext', requiredArgs: { type: 'CLAS', name: 'ZCL_BILLING' } }],
    acceptable: [{ tool: 'SAPRead', requiredArgs: { type: 'CLAS', name: 'ZCL_BILLING' } }],
    mockResponses: {
      SAPContext:
        'Dependency context for ZCL_BILLING (3 deps, 45 lines compressed from 380):\n\n' +
        'INTERFACE zif_billing_calculator PUBLIC.\n  METHODS calculate IMPORTING iv_amount TYPE p.\nENDINTERFACE.\n\n' +
        'CLASS zcl_tax_engine DEFINITION PUBLIC.\n  PUBLIC SECTION.\n    METHODS compute_tax.\nENDCLASS.',
      SAPRead:
        'CLASS zcl_billing DEFINITION PUBLIC.\n  PUBLIC SECTION.\n    INTERFACES zif_billing_calculator.\n    METHODS process.\nENDCLASS.\nCLASS zcl_billing IMPLEMENTATION.\n  METHOD process.\n    " ...\n  ENDMETHOD.\nENDCLASS.',
    },
  },

  {
    id: 'context-cds-deps',
    description: 'Get CDS view dependency graph (forward deps, not impact)',
    prompt: 'Show me the data sources and dependencies of CDS view ZI_SALESORDER for writing unit tests',
    category: 'context',
    tags: ['single-step', 'efficiency', 'deps', 'cds'],
    optimal: [{ tool: 'SAPContext', requiredArgs: { type: 'DDLS', name: 'ZI_SALESORDER' } }],
    acceptable: [
      { tool: 'SAPContext', requiredArgs: { action: 'deps', type: 'DDLS', name: 'ZI_SALESORDER' } },
      { tool: 'SAPRead', requiredArgs: { type: 'DDLS', name: 'ZI_SALESORDER' } },
    ],
    mockResponses: {
      SAPContext:
        'CDS dependency context for ZI_SALESORDER:\nData sources: VBAK, VBAP\nAssociations: _Customer → ZI_CUSTOMER',
      SAPRead: 'define view ZI_SALESORDER as select from vbak\n  association to ZI_CUSTOMER as _Customer on ...',
    },
  },
];
