/**
 * Tool definitions for ARC-1's 11 intent-based MCP tools.
 *
 * Each tool has:
 * - name: The MCP tool name (SAPRead, SAPWrite, etc.)
 * - description: Rich LLM-friendly description
 * - inputSchema: JSON Schema for tool arguments
 *
 * The 11 intent-based design is ARC-1's key differentiator:
 * instead of 200+ individual tools (one per object type per operation),
 * we group by *intent* with a `type` parameter for routing.
 * This keeps the LLM's tool selection simple and the context window small.
 *
 * Tool definitions adapt based on system type (BTP vs on-premise):
 * - BTP ABAP Environment: removes unavailable types (PROG, INCL, VIEW,
 *   TEXT_ELEMENTS, VARIANTS), adjusts descriptions for restricted features
 * - On-premise: full tool set with all types and descriptions
 */

import type { ServerConfig } from '../server/types.js';
import { getHyperfocusedToolDefinition } from './hyperfocused.js';

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/** Check if tools should use BTP-adapted definitions */
function isBtpMode(config: ServerConfig): boolean {
  return config.systemType === 'btp';
}

// ─── SAPRead Types ──────────────────────────────────────────────────

/** All SAPRead types available on on-premise */
const SAPREAD_TYPES_ONPREM = [
  'PROG',
  'CLAS',
  'INTF',
  'FUNC',
  'FUGR',
  'INCL',
  'DDLS',
  'DDLX',
  'BDEF',
  'SRVD',
  'SRVB',
  'TABL',
  'VIEW',
  'STRU',
  'DOMA',
  'DTEL',
  'TRAN',
  'TABLE_CONTENTS',
  'DEVC',
  'SOBJ',
  'SYSTEM',
  'COMPONENTS',
  'MESSAGES',
  'TEXT_ELEMENTS',
  'VARIANTS',
  'BSP',
  'BSP_DEPLOY',
];

/** SAPRead types available on BTP ABAP Environment (no PROG, INCL, VIEW, TEXT_ELEMENTS, VARIANTS) */
const SAPREAD_TYPES_BTP = [
  'CLAS',
  'INTF',
  'FUNC',
  'FUGR',
  'DDLS',
  'DDLX',
  'BDEF',
  'SRVD',
  'SRVB',
  'TABL',
  'STRU',
  'DOMA',
  'DTEL',
  'TABLE_CONTENTS',
  'DEVC',
  'SYSTEM',
  'COMPONENTS',
  'MESSAGES',
  'BSP',
  'BSP_DEPLOY',
];

const SAPREAD_DESC_ONPREM =
  'Read SAP ABAP objects. Types: PROG, CLAS, INTF, FUNC, FUGR (use expand_includes=true to get all include sources), INCL, DDLS, DDLX (CDS metadata extensions — UI annotations), BDEF, SRVD, SRVB (service bindings — returns structured binding info: OData version, publish status, service definition ref), TABL, VIEW, STRU (DDIC structures like BAPIRET2 — returns CDS-like source), DOMA (DDIC domains — returns type info, value table, fixed values), DTEL (data elements — returns domain, labels, search help), TRAN (transaction codes — returns description, program, package), TABLE_CONTENTS, DEVC, SOBJ (BOR business objects — returns method catalog or full implementation), SYSTEM, COMPONENTS, MESSAGES, TEXT_ELEMENTS, VARIANTS. For CLAS: omit include to get the full class source (definition + implementation combined). The include param is optional — use it only to read class-local sections: definitions (local types), implementations (local helper classes), macros, testclasses (ABAP Unit). For CLAS with method param: use method="*" to list all methods with signatures and visibility, or method="method_name" to read a single method implementation (95% fewer tokens than full source). For SOBJ: returns BOR method catalog; use method param to read a specific method implementation. BSP (deployed UI5/Fiori apps — list apps, browse files, read content; use name to browse app structure, include for subfolder or file), BSP_DEPLOY (query deployed UI5 apps via ABAP Repository OData Service — returns name, package, description).';

const SAPREAD_DESC_BTP =
  'Read SAP ABAP objects (BTP ABAP Environment). Types: CLAS, INTF, FUNC (released/custom only), FUGR (released/custom only), DDLS (CDS views — primary data model on BTP), DDLX (CDS metadata extensions — UI annotations for Fiori Elements), BDEF (RAP behavior definitions), SRVD (service definitions), SRVB (service bindings — returns structured binding info: OData version, publish status, service definition ref), TABL (custom tables only), STRU (DDIC structures — returns CDS-like source), DOMA (DDIC domains — type info, value table, fixed values), DTEL (data elements — domain, labels, search help), TABLE_CONTENTS (custom tables and released CDS only — SAP standard tables are blocked), DEVC, SYSTEM, COMPONENTS, MESSAGES (custom message classes only). For CLAS: omit include to get the full class source. The include param reads class-local sections: definitions, implementations, macros, testclasses. For CLAS with method param: use method="*" to list all methods with signatures and visibility, or method="method_name" to read a single method (95% fewer tokens). Note: PROG, INCL, VIEW, TRAN, TEXT_ELEMENTS, VARIANTS are not available on BTP — use CLAS with IF_OO_ADT_CLASSRUN for console applications, and DDLS for data models instead of classic views. BSP (deployed UI5/Fiori apps — list apps, browse files, read content; use name to browse app structure, include for subfolder or file), BSP_DEPLOY (query deployed UI5 apps via ABAP Repository OData Service — returns name, package, description).';

// ─── SAPWrite Types ─────────────────────────────────────────────────

const SAPWRITE_TYPES_ONPREM = ['PROG', 'CLAS', 'INTF', 'FUNC', 'INCL', 'DDLS', 'DDLX', 'BDEF', 'SRVD'];
const SAPWRITE_TYPES_BTP = ['CLAS', 'INTF', 'DDLS', 'DDLX', 'BDEF', 'SRVD'];

const SAPWRITE_DESC_ONPREM =
  'Create or update ABAP source code. Handles lock/modify/unlock automatically. Supports PROG, CLAS, INTF, FUNC, INCL, DDLS, DDLX, BDEF, SRVD. ' +
  'For edit_method: surgically replace a single method body in a CLAS without sending the full class source. ' +
  'Provide just the new method implementation code in "source" — 95% fewer tokens than full-class updates. ' +
  'For batch_create: create and activate multiple objects in a single call — ideal for RAP stacks. Pass "objects" array with dependency order.';

const SAPWRITE_DESC_BTP =
  'Create or update ABAP source code (BTP ABAP Environment). Handles lock/modify/unlock automatically. Supports CLAS, INTF, DDLS, DDLX, BDEF, SRVD. ' +
  'Must use ABAP Cloud language version (no classic statements). Only Z*/Y* namespace allowed on BTP. ' +
  'For edit_method: surgically replace a single method body in a CLAS without sending the full class source. ' +
  'For batch_create: create and activate multiple objects in a single call — ideal for RAP stacks.';

// ─── SAPContext Types ───────────────────────────────────────────────

const SAPCONTEXT_TYPES_ONPREM = ['CLAS', 'INTF', 'PROG', 'FUNC', 'DDLS'];
const SAPCONTEXT_TYPES_BTP = ['CLAS', 'INTF', 'DDLS'];

const SAPCONTEXT_DESC_ONPREM =
  'Get compressed dependency context for an ABAP object or CDS entity. Returns only the public API contracts ' +
  '(method signatures, interface definitions, type declarations) of all objects that the target depends on — ' +
  'NOT the full source code. This is the most token-efficient way to understand dependencies. ' +
  'Instead of N separate SAPRead calls returning full source (~200 lines each), SAPContext returns ONE response ' +
  'with compressed contracts (~15-30 lines each). Typical compression: 7-30x fewer tokens.\n\n' +
  'What gets extracted per dependency:\n' +
  '- Classes: CLASS DEFINITION with PUBLIC SECTION only (methods, types, constants). PROTECTED, PRIVATE and IMPLEMENTATION stripped.\n' +
  '- Interfaces: Full interface definition (interfaces are already public contracts).\n' +
  '- Function modules: FUNCTION signature block only (IMPORTING/EXPORTING parameters).\n' +
  '- CDS views (DDLS): All data sources (tables, other CDS views), association targets, and compositions. ' +
  "Each dependency's full source is included (table definitions, CDS DDL). Essential for CDS unit test generation — " +
  'provides the dependency graph and field catalogs needed for cl_cds_test_environment doubles.\n\n' +
  'Filtering: SAP standard objects (CL_ABAP_*, IF_ABAP_*, CX_SY_*) are excluded — the LLM already knows standard SAP APIs. ' +
  'Custom objects (Z*, Y*) are prioritized.\n\n' +
  'Use SAPContext BEFORE writing code that modifies or extends existing objects. ' +
  'Use SAPRead to get the full source of the target object, then SAPContext to understand its dependencies.\n\n' +
  'For CDS analysis: Use SAPContext instead of reading each view in the dependency chain individually. ' +
  'A single SAPContext call on a consumption view (e.g., ZC_*) returns all dependent interface views, tables, and associations — ' +
  'replacing 5-10 separate SAPRead calls. Only use targeted SAPRead for metadata extensions (DDLX) or service bindings (SRVB) that SAPContext does not cover.';

const SAPCONTEXT_DESC_BTP =
  'Get compressed dependency context for an ABAP object or CDS entity (BTP ABAP Environment). Returns only the public API contracts ' +
  '(method signatures, interface definitions, type declarations) of all objects that the target depends on — ' +
  'NOT the full source code. This is the most token-efficient way to understand dependencies.\n\n' +
  'What gets extracted per dependency:\n' +
  '- Classes: CLASS DEFINITION with PUBLIC SECTION only (methods, types, constants).\n' +
  '- Interfaces: Full interface definition (interfaces are already public contracts).\n' +
  '- CDS views (DDLS): All data sources (tables, other CDS views), association targets, and compositions. ' +
  "Each dependency's full source is included. Essential for CDS unit test generation.\n\n" +
  'On BTP: released SAP objects (CL_ABAP_*, IF_ABAP_*) are included since they form the primary development API surface. ' +
  'Custom objects (Z*, Y*) are also included.\n\n' +
  'Use SAPContext BEFORE writing code that modifies or extends existing objects.\n\n' +
  'For CDS analysis: Use SAPContext instead of reading each view in the dependency chain individually. ' +
  'A single SAPContext call on a consumption view returns all dependent interface views, tables, and associations — ' +
  'replacing 5-10 separate SAPRead calls.';

// ─── SAPQuery ───────────────────────────────────────────────────────

const SAPQUERY_DESC_ONPREM =
  'Execute ABAP SQL queries against SAP tables. Returns structured data with column names and rows. ' +
  'Powerful for reverse-engineering: query metadata tables like DD02L (table catalog), DD03L (field catalog), ' +
  'SWOTLV (BOR method implementations), TADIR (object directory), TFDIR (function modules). ' +
  'If a table is not found, similar table names will be suggested automatically. ' +
  'Note: Uses the ADT freestyle SQL endpoint (same as ADT SQL Console in Eclipse). Supports ABAP SQL syntax including JOINs, but the endpoint parser has known edge cases with complex queries on some system versions (SAP Note 3605050). If a complex query fails, try simplifying — split JOINs into separate single-table SELECTs.';

const SAPQUERY_DESC_BTP =
  'Execute ABAP SQL queries (BTP ABAP Environment). Returns structured data with column names and rows. ' +
  'IMPORTANT: On BTP, only custom Z/Y tables and released CDS entities can be queried. ' +
  'SAP standard tables (MARA, VBAK, DD02L, DD03L, TADIR, etc.) are blocked. ' +
  'Use released CDS views instead: I_LANGUAGE, I_COUNTRY, I_CURRENCY, I_UnitOfMeasure, etc. ' +
  'If a table is not found, similar table names will be suggested automatically.';

// ─── SAPSearch ──────────────────────────────────────────────────────

const SAPSEARCH_DESC_ONPREM =
  'Search for ABAP objects or search within source code. Two modes:\n' +
  '1. Object search (default): Search by name pattern with wildcards (* for any characters). Returns object type, name, package, description, and ADT URI. Use this to find classes, programs, function modules, tables, etc.\n' +
  '2. Source code search (searchType="source_code"): Full-text search within ABAP source code across the system. Use this to find all objects containing a specific string (e.g., a method call, variable name, or class reference). Requires SAP_BASIS >= 7.51.\n\n' +
  "Tips: BOR business objects appear as SOBJ type in results. The uri field from results can be used directly with SAPNavigate for references. The objectType field in results maps to SAPRead's type parameter — drop the slash suffix (DDLS/DF → DDLS, CLAS/OC → CLAS, PROG/P → PROG).\n\nNote: Searches object names only (classes, tables, CDS views, etc.) — field/column names are not searchable here. To find fields by name, use SAPRead(type='DDLS', include='elements') for CDS views or SAPQuery against DD03L.";

const SAPSEARCH_DESC_BTP =
  'Search for ABAP objects or search within source code (BTP ABAP Environment). Two modes:\n' +
  '1. Object search (default): Search by name pattern with wildcards. Returns released SAP objects and custom Z/Y objects. Classic programs, includes, and DDIC views are not searchable on BTP.\n' +
  '2. Source code search (searchType="source_code"): Full-text search within ABAP source code.\n\n' +
  "Tips: On BTP, focus on classes (CL_*), interfaces (IF_*), CDS views (I_*), and custom Z/Y objects.\n\nNote: Searches object names only (classes, CDS views, etc.) — field/column names are not searchable here. To find fields by name, use SAPRead(type='DDLS', include='elements') for CDS views.";

// ─── SAPTransport ───────────────────────────────────────────────────

const SAPTRANSPORT_DESC_ONPREM = 'Manage CTS transport requests: list, get details, create, and release.';

const SAPTRANSPORT_DESC_BTP =
  'Manage transport requests (BTP ABAP Environment): list, get details, create, and release. ' +
  'On BTP, transport release triggers a gCTS push to the software component Git repository. ' +
  'Import into target systems is done via the Manage Software Components app or Cloud Transport Management Service (cTMS), not via this tool.';

// ─── SAPManage ──────────────────────────────────────────────────────

const SAPMANAGE_DESC_ONPREM =
  'Probe and report SAP system capabilities. Use this BEFORE attempting operations that depend on optional ' +
  'features (abapGit, RAP/CDS, AMDP, HANA, UI5/Fiori, CTS transports).\n\n' +
  'Actions:\n' +
  '- "features": Get cached feature status from last probe (fast, no SAP round-trip). ' +
  'Returns which features are available, their mode (auto/on/off), and when they were last probed.\n' +
  '- "probe": Re-probe the SAP system now (makes 7 parallel requests, ~1-2s). ' +
  'Use this on first use or if you suspect feature availability has changed.\n\n' +
  'Returns JSON with features, each having: id, available (bool), mode, message, and probedAt timestamp. ' +
  'Also returns systemType ("btp" or "onprem") for understanding available capabilities. ' +
  '"available: false" means do NOT attempt operations that depend on it.';

const SAPMANAGE_DESC_BTP =
  'Probe and report SAP system capabilities (BTP ABAP Environment). ' +
  'Returns feature status and system type.\n\n' +
  'Actions:\n' +
  '- "features": Get cached feature status from last probe.\n' +
  '- "probe": Re-probe the SAP system now.\n\n' +
  'Returns JSON with features and systemType="btp". On BTP, RAP/CDS and transports are always available. ' +
  'abapGit, AMDP, UI5/BSP may not be available depending on the BTP ABAP configuration.';

// ─── SAPSearch Builder ─────────────────────────────────────────────

/** Strip source_code-specific lines from a SAPSearch description when textSearch is unavailable */
function stripSourceCodeLines(desc: string): string {
  return desc
    .split('\n')
    .filter(
      (line) =>
        !line.includes('source_code') &&
        !line.includes('Source code search') &&
        !line.startsWith('2. Source code search'),
    )
    .join('\n')
    .replace(/ or search within source code[^.]*\. Two modes:\n1\. Object search \(default\): /i, '. ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function buildSAPSearchTool(btp: boolean, textSearchAvailable?: boolean): ToolDefinition {
  // When textSearch is explicitly unavailable (probed and failed), hide source_code
  const hideSourceCode = textSearchAvailable === false;

  const baseDesc = btp ? SAPSEARCH_DESC_BTP : SAPSEARCH_DESC_ONPREM;
  // Strip source_code lines from base description when hiding
  const description = hideSourceCode ? stripSourceCodeLines(baseDesc) : baseDesc;

  const properties: Record<string, unknown> = {
    query: {
      type: 'string',
      description: hideSourceCode
        ? 'Search pattern: name pattern with wildcards (e.g., ZCL_ORDER*, Z*TEST*).'
        : 'Search pattern. For object search: name pattern with wildcards (e.g., ZCL_ORDER*, Z*TEST*). For source_code search: text string to find in source (e.g., cl_lsapi_manager, CALL FUNCTION).',
    },
    maxResults: {
      type: 'number',
      description: hideSourceCode
        ? 'Maximum results (default 100)'
        : 'Maximum results (default 100 for object, 50 for source_code)',
    },
  };

  if (!hideSourceCode) {
    properties.searchType = {
      type: 'string',
      enum: ['object', 'source_code'],
      description:
        'Search mode: "object" (default) searches by object name, "source_code" searches within ABAP source code.',
    };
    properties.objectType = {
      type: 'string',
      description: 'For source_code search: filter by object type (e.g., PROG, CLAS, FUNC)',
    };
    properties.packageName = { type: 'string', description: 'For source_code search: filter by package name' };
  }

  return {
    name: 'SAPSearch',
    description,
    inputSchema: {
      type: 'object',
      properties,
      required: ['query'],
    },
  };
}

// ─── Main Tool Definitions ──────────────────────────────────────────

export function getToolDefinitions(config: ServerConfig, textSearchAvailable?: boolean): ToolDefinition[] {
  // Hyperfocused mode: single universal SAP tool (~200 tokens)
  if (config.toolMode === 'hyperfocused') {
    return [getHyperfocusedToolDefinition(config)];
  }

  const btp = isBtpMode(config);
  const tools: ToolDefinition[] = [
    {
      name: 'SAPRead',
      description: btp ? SAPREAD_DESC_BTP : SAPREAD_DESC_ONPREM,
      inputSchema: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: btp ? SAPREAD_TYPES_BTP : SAPREAD_TYPES_ONPREM,
            description: 'Object type to read',
          },
          name: { type: 'string', description: 'Object name (e.g., ZTEST_PROGRAM, ZCL_ORDER, MARA)' },
          include: {
            type: 'string',
            description:
              'For CLAS: DO NOT use this to read the main class — omit include entirely to get the full class source (CLASS DEFINITION + CLASS IMPLEMENTATION). This parameter reads class-LOCAL auxiliary files only: definitions (local type definitions, NOT the main class definition), implementations (local helper class implementations), macros, testclasses (ABAP Unit). Comma-separated. Not all classes have these sections — missing ones return a note instead of an error. ' +
              'For DDLS: use include="elements" to get a structured field list extracted from the CDS DDL source — shows key fields, aliases, associations, and expression types (calculated, case, cast). Useful for understanding CDS entity structure without parsing raw DDL.',
          },
          group: {
            type: 'string',
            description:
              'For FUNC type. The function group containing the function module. Optional — auto-resolved via SAPSearch if omitted.',
          },
          method: {
            type: 'string',
            description:
              'For CLAS: method name to read a single method implementation (e.g., "get_name", "zif_order~process"). ' +
              'Use "*" to list all methods with signatures and visibility. ' +
              (btp ? '' : 'For SOBJ: BOR method name to read. If omitted, returns the full BOR method catalog. ') +
              'Not used with other types.',
          },
          ...(btp
            ? {}
            : {
                expand_includes: {
                  type: 'boolean',
                  description:
                    'For FUGR type only. When true, expands all INCLUDE statements and returns the full source of each include inline.',
                },
              }),
          format: {
            type: 'string',
            enum: ['text', 'structured'],
            description:
              'Output format. "text" (default): raw source code. "structured" (CLAS only): JSON with metadata (description, language, category) + decomposed source (main, testclasses, definitions, implementations, macros). Useful when you need to understand class structure or separate test code from production code.',
          },
          maxRows: { type: 'number', description: 'For TABLE_CONTENTS: max rows to return (default 100)' },
          sqlFilter: { type: 'string', description: 'For TABLE_CONTENTS: SQL WHERE clause filter' },
        },
        required: ['type'],
      },
    },
    buildSAPSearchTool(btp, textSearchAvailable),
  ];

  // Write tools — only registered when not in read-only mode
  if (!config.readOnly) {
    let sapWriteDesc = btp ? SAPWRITE_DESC_BTP : SAPWRITE_DESC_ONPREM;
    // Append package restriction info so the LLM knows its boundaries
    if (config.allowedPackages.length > 0) {
      const pkgList = config.allowedPackages.join(', ');
      sapWriteDesc += ` Write access is restricted to packages: ${pkgList}.`;
    }
    tools.push({
      name: 'SAPWrite',
      description: sapWriteDesc,
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['create', 'update', 'delete', 'edit_method', 'batch_create'],
            description:
              'Write action. edit_method: surgically replace a single method body (requires type=CLAS, method, and source params). batch_create: create and activate multiple objects in sequence (requires objects array)',
          },
          type: {
            type: 'string',
            enum: btp ? SAPWRITE_TYPES_BTP : SAPWRITE_TYPES_ONPREM,
            description: 'Object type (for create/update/delete/edit_method)',
          },
          name: { type: 'string', description: 'Object name (for create/update/delete/edit_method)' },
          source: { type: 'string', description: 'ABAP source code (for create/update/edit_method)' },
          method: {
            type: 'string',
            description: 'For edit_method action: method name to replace (e.g., "get_name", "zif_order~process")',
          },
          description: {
            type: 'string',
            description:
              'Object description for create action (defaults to name if omitted). Max 60 chars for most types.',
          },
          package: { type: 'string', description: 'Package for new objects (default $TMP)' },
          transport: { type: 'string', description: 'Transport request number (for transportable packages)' },
          objects: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                type: {
                  type: 'string',
                  enum: btp ? SAPWRITE_TYPES_BTP : SAPWRITE_TYPES_ONPREM,
                  description: 'Object type',
                },
                name: { type: 'string', description: 'Object name' },
                source: { type: 'string', description: 'ABAP source code (optional — some objects have no source)' },
                description: { type: 'string', description: 'Object description (defaults to name if omitted)' },
              },
              required: ['type', 'name'],
            },
            description:
              'For batch_create: ordered list of objects to create and activate. Each object needs type, name, and source (if applicable). ' +
              'Objects are created and activated in array order — put dependencies first (e.g., CDS view before projection, BDEF after CDS views). ' +
              'Example: [{type:"DDLS",name:"ZI_TRAVEL",source:"..."},{type:"BDEF",name:"ZI_TRAVEL",source:"..."},{type:"SRVD",name:"ZSD_TRAVEL",source:"..."}]',
          },
        },
        required: ['action'],
      },
    });

    tools.push({
      name: 'SAPActivate',
      description:
        'Activate (publish) ABAP objects. Supports single object or batch activation.\n' +
        'For batch: pass "objects" array with {type, name} entries to activate multiple objects in one call. ' +
        'Essential for RAP stacks where DDLS, BDEF, SRVD, DDLX, and SRVB depend on each other and must be activated together.\n' +
        'For publish_srvb/unpublish_srvb: publish or unpublish an OData service binding (SRVB) — makes the OData service available for consumption.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['activate', 'publish_srvb', 'unpublish_srvb'],
            description:
              'Action to perform. "activate" (default): activate ABAP objects. ' +
              '"publish_srvb": publish a service binding to make OData service available. ' +
              '"unpublish_srvb": unpublish a service binding.',
          },
          name: { type: 'string', description: 'Object name (for single activation or publish/unpublish)' },
          type: { type: 'string', description: 'Object type (PROG, CLAS, DDLS, DDLX, BDEF, SRVD, SRVB, etc.)' },
          version: { type: 'string', description: 'Service version for publish/unpublish (default: "0001")' },
          objects: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                type: { type: 'string', description: 'Object type' },
                name: { type: 'string', description: 'Object name' },
              },
              required: ['type', 'name'],
            },
            description:
              'For batch activation: array of objects to activate together. ' +
              'Use for RAP stacks: [{type:"DDLS",name:"ZI_TRAVEL"},{type:"CLAS",name:"ZBP_I_TRAVEL"},{type:"BDEF",name:"ZI_TRAVEL"},{type:"DDLS",name:"ZC_TRAVEL"},{type:"BDEF",name:"ZC_TRAVEL"},{type:"DDLX",name:"ZC_TRAVEL"},{type:"SRVD",name:"ZSD_TRAVEL"}]',
          },
        },
      },
    });
  }

  tools.push(
    {
      name: 'SAPNavigate',
      description: btp
        ? 'Navigate code (BTP ABAP Environment): find definitions, references (where-used), and code completion. Use for "go to definition", "where is this used?", and auto-complete. For references: uses the full scope-based Where-Used API returning detailed results with line numbers, snippets, and package info. Optional objectType filter narrows results to a specific ADT type in slash format (e.g., CLAS/OC, PROG/P). On BTP, navigation scope is limited to released SAP objects and custom Z/Y objects.'
        : 'Navigate code: find definitions, references (where-used), and code completion. Use for "go to definition", "where is this used?", and auto-complete. For references: uses the full scope-based Where-Used API returning detailed results with line numbers, snippets, and package info. Optional objectType filter narrows results to a specific ADT type in slash format (e.g., CLAS/OC, PROG/P). You can use type+name instead of uri (e.g., type="CLAS", name="ZCL_ORDER") for a where-used list without needing the full ADT URI.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['definition', 'references', 'completion'],
            description: 'Navigation action',
          },
          uri: {
            type: 'string',
            description: 'Source URI of the object. Optional for references if type+name are provided.',
          },
          type: {
            type: 'string',
            description: 'Object type (PROG, CLAS, INTF, FUNC, etc.) — alternative to uri for references.',
          },
          name: { type: 'string', description: 'Object name — alternative to uri for references.' },
          objectType: {
            type: 'string',
            description:
              'For references action: filter where-used results by ADT object type in slash format (e.g., PROG/P, CLAS/OC, FUNC/FM, INTF/OI). On systems supporting the scope endpoint, only returns references from objects of the specified type. On older systems, the filter is ignored and all references are returned with a note.',
          },
          line: { type: 'number', description: 'Line number (1-based)' },
          column: { type: 'number', description: 'Column number (1-based)' },
          source: { type: 'string', description: 'Current source code (for definition/completion)' },
        },
        required: ['action'],
      },
    },
    {
      name: 'SAPQuery',
      description: btp ? SAPQUERY_DESC_BTP : SAPQUERY_DESC_ONPREM,
      inputSchema: {
        type: 'object',
        properties: {
          sql: { type: 'string', description: 'ABAP SQL SELECT statement' },
          maxRows: { type: 'number', description: 'Maximum rows (default 100)' },
        },
        required: ['sql'],
      },
    },
    {
      name: 'SAPLint',
      description:
        'Run local abaplint rules on ABAP source code. System-aware: auto-selects cloud or on-prem rules based on detected system type.\n\n' +
        'Actions:\n' +
        '- "lint": Check ABAP source for issues. Returns errors and warnings.\n' +
        '- "lint_and_fix": Lint + auto-fix all fixable issues (keyword case, obsolete statements, etc.). Returns fixed source.\n' +
        '- "list_rules": List all available rules with current config. No source needed.\n\n' +
        'For server-side checks (ATC, syntax check, unit tests), use SAPDiagnose instead.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['lint', 'lint_and_fix', 'list_rules'],
            description: 'Check type',
          },
          source: { type: 'string', description: 'ABAP source code to lint (not needed for list_rules)' },
          name: { type: 'string', description: 'Object name (used for filename detection)' },
          rules: {
            type: 'object',
            description:
              'Rule overrides: { "rule_name": false } to disable, { "rule_name": { "severity": "Warning" } } to configure. Overrides system defaults.',
          },
        },
        required: ['action'],
      },
    },
    {
      name: 'SAPDiagnose',
      description:
        'Run diagnostics on ABAP objects and analyze runtime errors.\n\n' +
        'Actions:\n' +
        '- "syntax": Syntax check an ABAP object. Requires name + type.\n' +
        '- "unittest": Run ABAP unit tests. Requires name + type.\n' +
        '- "atc": Run ATC code quality checks. Requires name + type. Optional: variant.\n' +
        '- "dumps": List or read ABAP short dumps (ST22). Without id: lists recent dumps (filter by user, maxResults). With id: returns full dump detail including formatted text, error analysis, source code extract, and call stack.\n' +
        '- "traces": List or analyze ABAP profiler traces. Without id: lists trace files. With id + analysis: returns trace analysis (hitlist = hot spots, statements = call tree, dbAccesses = database access statistics).',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['syntax', 'unittest', 'atc', 'dumps', 'traces'],
            description: 'Diagnostic action',
          },
          name: { type: 'string', description: 'Object name (for syntax/unittest/atc)' },
          type: { type: 'string', description: 'Object type (PROG, CLAS, etc.) (for syntax/unittest/atc)' },
          variant: { type: 'string', description: 'ATC check variant (for atc action)' },
          id: {
            type: 'string',
            description: 'Dump or trace ID (for dumps/traces actions). Omit to list, provide to get details.',
          },
          user: { type: 'string', description: 'Filter dumps by SAP user (for dumps action)' },
          maxResults: { type: 'number', description: 'Maximum results to return (for dumps action, default 50)' },
          analysis: {
            type: 'string',
            enum: ['hitlist', 'statements', 'dbAccesses'],
            description:
              'Trace analysis type (for traces action with id). hitlist = execution hot spots, statements = call tree, dbAccesses = database access stats.',
          },
        },
        required: ['action'],
      },
    },
  );

  // SAPContext — always available (read-only tool)
  tools.push({
    name: 'SAPContext',
    description: btp ? SAPCONTEXT_DESC_BTP : SAPCONTEXT_DESC_ONPREM,
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['deps', 'usages'],
          description:
            'Action: "deps" (default, can be omitted) = get dependency context. ' +
            '"usages" = reverse dependency lookup — find all objects that depend on the given name. ' +
            'Requires cache warmup (--cache-warmup). Only "name" is needed for usages.',
        },
        type: {
          type: 'string',
          enum: btp ? SAPCONTEXT_TYPES_BTP : SAPCONTEXT_TYPES_ONPREM,
          description: 'Object type (required for deps action)',
        },
        name: {
          type: 'string',
          description: 'Object name (e.g., ZCL_ORDER)',
        },
        source: {
          type: 'string',
          description:
            'Optional: provide source directly instead of fetching from SAP. ' +
            'Saves one round-trip if you already have the source from SAPRead.',
        },
        ...(btp
          ? {}
          : {
              group: {
                type: 'string',
                description: 'Required for FUNC type. The function group containing the function module.',
              },
            }),
        maxDeps: {
          type: 'number',
          description: 'Maximum dependencies to resolve (default 20). Lower = faster + fewer tokens.',
        },
        depth: {
          type: 'number',
          description:
            'Dependency depth: 1 = direct deps only (default), 2 = deps of deps, 3 = maximum. ' +
            'Higher depth = more context but more SAP calls.',
        },
      },
      required: ['name'],
    },
  });

  // SAPManage — registered when not in read-only mode
  if (!config.readOnly) {
    tools.push({
      name: 'SAPManage',
      description: btp ? SAPMANAGE_DESC_BTP : SAPMANAGE_DESC_ONPREM,
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['features', 'probe', 'cache_stats'],
            description:
              'Action: "features" for cached status, "probe" to re-check SAP system, "cache_stats" for object cache statistics',
          },
        },
        required: ['action'],
      },
    });
  }

  // Transport tools — registered when transports are explicitly enabled
  if (config.enableTransports) {
    tools.push({
      name: 'SAPTransport',
      description: btp ? SAPTRANSPORT_DESC_BTP : SAPTRANSPORT_DESC_ONPREM,
      inputSchema: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['list', 'get', 'create', 'release'], description: 'Transport action' },
          id: { type: 'string', description: 'Transport request ID (for get/release)' },
          description: { type: 'string', description: 'Description (for create)' },
          user: { type: 'string', description: 'Filter by user (for list)' },
        },
        required: ['action'],
      },
    });
  }

  return tools;
}
