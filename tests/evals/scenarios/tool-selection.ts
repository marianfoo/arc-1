/**
 * Tool Selection Eval Scenarios
 *
 * These scenarios test whether the LLM picks the right ARC-1 tool
 * for common SAP development tasks. Derived from existing unit tests
 * in tests/unit/handlers/intent.test.ts and e2e tests.
 *
 * Categories:
 * - read: SAPRead type selection
 * - search: SAPSearch usage
 * - context: SAPContext vs SAPRead efficiency
 * - write: SAPWrite action selection
 * - diagnose: SAPDiagnose action selection
 * - workflow: Multi-step scenarios
 */

import type { EvalScenario } from '../types.js';

export const TOOL_SELECTION_SCENARIOS: EvalScenario[] = [
  // ─── SAPRead: Basic Type Selection ──────────────────────────────

  {
    id: 'read-program',
    description: 'Read an ABAP program by name',
    prompt: 'Read the source code of ABAP program ZHELLO_WORLD',
    category: 'read',
    tags: ['single-step', 'basic'],
    optimal: [{ tool: 'SAPRead', requiredArgs: { type: 'PROG', name: 'ZHELLO_WORLD' } }],
    acceptable: [
      // Searching first is acceptable but inefficient
      { tool: 'SAPSearch', requiredArgs: { query: 'ZHELLO_WORLD' } },
    ],
    mockResponses: {
      SAPRead: "REPORT zhello_world.\nWRITE: / 'Hello World'.",
      SAPSearch: JSON.stringify([
        { objectType: 'PROG/P', objectName: 'ZHELLO_WORLD', packageName: '$TMP', description: 'Hello World' },
      ]),
    },
  },

  {
    id: 'read-class',
    description: 'Read a class source code',
    prompt: 'Show me the source code of class ZCL_ORDER_SERVICE',
    category: 'read',
    tags: ['single-step', 'basic'],
    optimal: [{ tool: 'SAPRead', requiredArgs: { type: 'CLAS', name: 'ZCL_ORDER_SERVICE' } }],
    forbidden: ['SAPWrite', 'SAPActivate'],
    mockResponses: {
      SAPRead:
        'CLASS zcl_order_service DEFINITION PUBLIC.\n  PUBLIC SECTION.\n    METHODS get_order IMPORTING iv_id TYPE string.\nENDCLASS.',
    },
  },

  {
    id: 'read-interface',
    description: 'Read an interface definition',
    prompt: 'Read the interface ZIF_ORDER_REPOSITORY',
    category: 'read',
    tags: ['single-step', 'basic'],
    optimal: [{ tool: 'SAPRead', requiredArgs: { type: 'INTF', name: 'ZIF_ORDER_REPOSITORY' } }],
    mockResponses: {
      SAPRead:
        'INTERFACE zif_order_repository PUBLIC.\n  METHODS find_by_id IMPORTING iv_id TYPE string RETURNING VALUE(rs_order) TYPE zorder.\nENDINTERFACE.',
    },
  },

  {
    id: 'read-function-module',
    description: 'Read a function module',
    prompt: 'Read the function module Z_GET_CUSTOMER_DATA',
    category: 'read',
    tags: ['single-step', 'basic'],
    optimal: [{ tool: 'SAPRead', requiredArgs: { type: 'FUNC', name: 'Z_GET_CUSTOMER_DATA' } }],
    mockResponses: {
      SAPRead:
        'FUNCTION z_get_customer_data.\n*" IMPORTING iv_customer_id TYPE kunnr\n*" EXPORTING es_customer TYPE kna1\n  SELECT SINGLE * FROM kna1 INTO es_customer WHERE kunnr = iv_customer_id.\nENDFUNCTION.',
    },
  },

  {
    id: 'read-cds-view',
    description: 'Read a CDS view definition',
    prompt: 'Show me the CDS view ZI_SALESORDER',
    category: 'read',
    tags: ['single-step', 'basic'],
    optimal: [{ tool: 'SAPRead', requiredArgs: { type: 'DDLS', name: 'ZI_SALESORDER' } }],
    mockResponses: {
      SAPRead:
        "@AbapCatalog.sqlViewName: 'ZISALESORDER'\ndefine view ZI_SALESORDER as select from vbak {\n  key vbeln,\n  erdat,\n  erzet,\n  ernam\n}",
    },
  },

  {
    id: 'read-table-structure',
    description: 'Read a DDIC structure definition',
    prompt: 'What are the fields of structure BAPIRET2?',
    category: 'read',
    tags: ['single-step', 'basic'],
    optimal: [{ tool: 'SAPRead', requiredArgs: { type: 'STRU', name: 'BAPIRET2' } }],
    acceptable: [
      // Reading as TABL is a reasonable mistake
      { tool: 'SAPRead', requiredArgs: { type: 'TABL', name: 'BAPIRET2' } },
    ],
    mockResponses: {
      SAPRead:
        'define structure bapiret2 {\n  type : symsgty;\n  id : symsgid;\n  number : symsgno;\n  message : bapi_msg;\n}',
    },
  },

  {
    id: 'read-domain',
    description: 'Read a DDIC domain definition',
    prompt: 'Show me the domain BUKRS and its properties',
    category: 'read',
    tags: ['single-step', 'basic'],
    optimal: [{ tool: 'SAPRead', requiredArgs: { type: 'DOMA', name: 'BUKRS' } }],
    mockResponses: {
      SAPRead: JSON.stringify({
        name: 'BUKRS',
        dataType: 'CHAR',
        length: 4,
        description: 'Company Code',
        valueTable: 'T001',
      }),
    },
  },

  {
    id: 'read-table-contents',
    description: 'Read data from an SAP table',
    prompt: 'Show me the contents of table T001 with a maximum of 10 rows',
    category: 'read',
    tags: ['single-step', 'basic'],
    optimal: [
      { tool: 'SAPRead', requiredArgs: { type: 'TABLE_CONTENTS', name: 'T001' }, requiredArgKeys: ['maxRows'] },
    ],
    acceptable: [
      // Using SAPQuery is also valid
      { tool: 'SAPQuery', requiredArgKeys: ['sql'] },
    ],
    mockResponses: {
      SAPRead: JSON.stringify({
        columns: ['MANDT', 'BUKRS', 'BUTXT'],
        rows: [{ MANDT: '100', BUKRS: '1000', BUTXT: 'Company 1000' }],
      }),
      SAPQuery: JSON.stringify({
        columns: ['MANDT', 'BUKRS', 'BUTXT'],
        rows: [{ MANDT: '100', BUKRS: '1000', BUTXT: 'Company 1000' }],
      }),
    },
  },

  {
    id: 'read-class-method',
    description: 'Read a single method from a class (efficient)',
    prompt: 'Read just the method get_name from class ZCL_CUSTOMER',
    category: 'read',
    tags: ['single-step', 'efficiency'],
    optimal: [
      {
        tool: 'SAPRead',
        requiredArgs: { type: 'CLAS', name: 'ZCL_CUSTOMER', method: 'get_name' },
      },
    ],
    acceptable: [
      // Reading the full class works but is less efficient
      { tool: 'SAPRead', requiredArgs: { type: 'CLAS', name: 'ZCL_CUSTOMER' } },
    ],
    mockResponses: {
      SAPRead: 'METHOD get_name.\n  rv_name = me->name.\nENDMETHOD.',
    },
  },

  {
    id: 'read-class-unit-tests',
    description: 'Read the unit test classes of an ABAP class',
    prompt: 'Show me the ABAP unit test code for class ZCL_ORDER',
    category: 'read',
    tags: ['single-step', 'basic'],
    optimal: [
      {
        tool: 'SAPRead',
        requiredArgs: { type: 'CLAS', name: 'ZCL_ORDER', include: 'testclasses' },
      },
    ],
    acceptable: [
      // Reading without include is acceptable but won't get test classes
      { tool: 'SAPRead', requiredArgs: { type: 'CLAS', name: 'ZCL_ORDER' } },
    ],
    mockResponses: {
      SAPRead:
        'CLASS ltcl_order DEFINITION FOR TESTING DURATION SHORT RISK LEVEL HARMLESS.\n  PRIVATE SECTION.\n    METHODS test_create FOR TESTING.\nENDCLASS.',
    },
  },

  // ─── SAPSearch ────────────────────────────────────────────────────

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

  // ─── SAPContext vs SAPRead Efficiency ─────────────────────────────

  {
    id: 'context-dependencies',
    description: 'Get dependency context (SAPContext is optimal, multiple SAPRead is acceptable)',
    prompt:
      'I need to understand the dependencies of class ZCL_BILLING before modifying it. What interfaces and classes does it depend on?',
    category: 'context',
    tags: ['single-step', 'efficiency'],
    optimal: [{ tool: 'SAPContext', requiredArgs: { type: 'CLAS', name: 'ZCL_BILLING' } }],
    acceptable: [
      // Reading the class first is valid but less efficient
      { tool: 'SAPRead', requiredArgs: { type: 'CLAS', name: 'ZCL_BILLING' } },
    ],
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
    description: 'Get CDS view dependency graph',
    prompt: 'Show me the data sources and dependencies of CDS view ZI_SALESORDER for writing unit tests',
    category: 'context',
    tags: ['single-step', 'efficiency'],
    optimal: [{ tool: 'SAPContext', requiredArgs: { type: 'DDLS', name: 'ZI_SALESORDER' } }],
    acceptable: [{ tool: 'SAPRead', requiredArgs: { type: 'DDLS', name: 'ZI_SALESORDER' } }],
    mockResponses: {
      SAPContext:
        'CDS dependency context for ZI_SALESORDER:\nData sources: VBAK, VBAP\nAssociations: _Customer → ZI_CUSTOMER',
      SAPRead: 'define view ZI_SALESORDER as select from vbak\n  association to ZI_CUSTOMER as _Customer on ...',
    },
  },

  // ─── SAPWrite ─────────────────────────────────────────────────────

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
      // Full class update works but is less efficient
      {
        tool: 'SAPWrite',
        requiredArgs: { action: 'update', type: 'CLAS', name: 'ZCL_CUSTOMER' },
        requiredArgKeys: ['source'],
      },
      // Reading first to understand current code is acceptable
      {
        tool: 'SAPRead',
        requiredArgs: { type: 'CLAS', name: 'ZCL_CUSTOMER' },
      },
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

  // ─── SAPDiagnose ──────────────────────────────────────────────────

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
    // SAPLint is local-only and wrong for server-side syntax check
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

  // ─── SAPQuery ─────────────────────────────────────────────────────

  {
    id: 'query-sql',
    description: 'Execute an SQL query against SAP tables',
    prompt: 'Query the TADIR table to find all custom development objects in package ZORDER',
    category: 'query',
    tags: ['single-step', 'basic'],
    optimal: [{ tool: 'SAPQuery', requiredArgKeys: ['sql'] }],
    acceptable: [
      // Reading package contents is also valid
      { tool: 'SAPRead', requiredArgs: { type: 'DEVC', name: 'ZORDER' } },
    ],
    mockResponses: {
      SAPQuery: JSON.stringify({
        columns: ['PGMID', 'OBJECT', 'OBJ_NAME'],
        rows: [{ PGMID: 'R3TR', OBJECT: 'CLAS', OBJ_NAME: 'ZCL_ORDER_SERVICE' }],
      }),
      SAPRead: JSON.stringify([{ type: 'CLAS', name: 'ZCL_ORDER_SERVICE' }]),
    },
  },

  // ─── SAPActivate ──────────────────────────────────────────────────

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
    tags: ['single-step', 'advanced'],
    optimal: [
      {
        tool: 'SAPActivate',
        requiredArgKeys: ['objects'],
      },
    ],
    acceptable: [
      // Activating individually works but is suboptimal
      { tool: 'SAPActivate', requiredArgs: { type: 'DDLS' } },
    ],
    mockResponses: {
      SAPActivate: 'Successfully activated 4 objects',
    },
  },

  // ─── SAPManage ────────────────────────────────────────────────────

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

  // ─── SAPNavigate ──────────────────────────────────────────────────

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
      // Source code search also works
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

  // ─── SAPLint ──────────────────────────────────────────────────────

  {
    id: 'lint-local-check',
    description: 'Run local lint on ABAP source code',
    prompt: "Can you lint this ABAP code locally?\n\nREPORT ztest.\nDATA: lv_test TYPE string.\nlv_test = 'hello'.",
    category: 'lint',
    tags: ['single-step', 'basic'],
    optimal: [{ tool: 'SAPLint', requiredArgs: { action: 'lint' }, requiredArgKeys: ['source'] }],
    // SAPDiagnose is for server-side checks, not local lint
    forbidden: ['SAPDiagnose'],
    mockResponses: {
      SAPLint: JSON.stringify([]),
    },
  },

  // ─── SAPTransport ─────────────────────────────────────────────────

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
