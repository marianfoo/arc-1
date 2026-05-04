/**
 * Write scenarios — SAPWrite action selection (edit_method, create, update).
 */

import type { EvalScenario } from '../types.js';

export const SCENARIOS: EvalScenario[] = [
  {
    id: 'write-edit-method',
    description: 'Surgically edit a single class method (most efficient)',
    prompt:
      'Update the method get_name in class ZCL_CUSTOMER to return the concatenation of first_name and last_name instead of just name',
    category: 'write',
    tags: ['single-step', 'efficiency'],
    optimal: [
      {
        tool: 'SAPWrite',
        requiredArgs: { action: 'edit_method', type: 'CLAS', name: 'ZCL_CUSTOMER', method: 'get_name' },
        requiredArgKeys: ['source'],
      },
    ],
    acceptable: [
      {
        tool: 'SAPWrite',
        requiredArgs: { action: 'update', type: 'CLAS', name: 'ZCL_CUSTOMER' },
        requiredArgKeys: ['source'],
      },
      { tool: 'SAPRead', requiredArgs: { type: 'CLAS', name: 'ZCL_CUSTOMER' } },
    ],
    mockResponses: {
      SAPWrite: 'Successfully updated method get_name in class ZCL_CUSTOMER',
      SAPRead:
        'CLASS zcl_customer DEFINITION PUBLIC.\n  PUBLIC SECTION.\n    METHODS get_name RETURNING VALUE(rv_name) TYPE string.\nENDCLASS.\nCLASS zcl_customer IMPLEMENTATION.\n  METHOD get_name.\n    rv_name = me->name.\n  ENDMETHOD.\nENDCLASS.',
    },
  },

  {
    id: 'write-create-program',
    description: 'Create a new ABAP program',
    prompt: 'Create a new ABAP report program called ZTEST_EVAL with a simple hello world output',
    category: 'write',
    tags: ['single-step', 'basic'],
    optimal: [
      {
        tool: 'SAPWrite',
        requiredArgs: { action: 'create', type: 'PROG' },
        requiredArgKeys: ['name', 'source'],
      },
    ],
    mockResponses: {
      SAPWrite: 'Successfully created PROG ZTEST_EVAL',
    },
  },
];
