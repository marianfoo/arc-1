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
 */

import type { ServerConfig } from '../server/types.js';

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export function getToolDefinitions(config: ServerConfig): ToolDefinition[] {
  const tools: ToolDefinition[] = [
    {
      name: 'SAPRead',
      description:
        'Read SAP ABAP objects. Types: PROG, CLAS, INTF, FUNC, FUGR (use expand_includes=true to get all include sources), INCL, DDLS, BDEF, SRVD, TABL, VIEW, TABLE_CONTENTS, DEVC, SOBJ (BOR business objects — returns method catalog or full implementation), SYSTEM, COMPONENTS, MESSAGES, TEXT_ELEMENTS, VARIANTS. For CLAS: omit include to get the full class source (definition + implementation combined). Use the method param to read a SINGLE method from a class — much more efficient than fetching the entire source for large classes. The include param is optional — use it only to read class-local sections: definitions (local types), implementations (local helper classes), macros, testclasses (ABAP Unit). For SOBJ: returns BOR method catalog; use method param to read a specific method implementation.\n\n' +
        'After reading a large class, use SAPContext to understand its dependencies instead of manually reading each one. Use SAPNavigate(action="references") to find where a class is used (where-used list).',
      inputSchema: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: [
              'PROG',
              'CLAS',
              'INTF',
              'FUNC',
              'FUGR',
              'INCL',
              'DDLS',
              'BDEF',
              'SRVD',
              'TABL',
              'VIEW',
              'TABLE_CONTENTS',
              'DEVC',
              'SOBJ',
              'SYSTEM',
              'COMPONENTS',
              'MESSAGES',
              'TEXT_ELEMENTS',
              'VARIANTS',
            ],
            description: 'Object type to read',
          },
          name: { type: 'string', description: 'Object name (e.g., ZTEST_PROGRAM, ZCL_ORDER, MARA)' },
          include: {
            type: 'string',
            description:
              'For CLAS only. DO NOT use this to read the main class — omit include entirely to get the full class source (CLASS DEFINITION + CLASS IMPLEMENTATION). This parameter reads class-LOCAL auxiliary files only: definitions (local type definitions, NOT the main class definition), implementations (local helper class implementations), macros, testclasses (ABAP Unit). Comma-separated. Not all classes have these sections — missing ones return a note instead of an error.',
          },
          group: {
            type: 'string',
            description:
              'For FUNC type. The function group containing the function module. Optional — auto-resolved via SAPSearch if omitted.',
          },
          method: {
            type: 'string',
            description:
              'For CLAS: read a single method instead of the full class source. Returns only that method\'s implementation — much more token-efficient for large classes (e.g., a 7000-line class returns ~50 lines for one method). Supports interface methods (e.g., "IF_INTERFACE~METHOD"). If omitted, returns the full class. For SOBJ: BOR method name to read. If omitted, returns the full method catalog.',
          },
          expand_includes: {
            type: 'boolean',
            description:
              'For FUGR type only. When true, expands all INCLUDE statements and returns the full source of each include inline.',
          },
          maxRows: { type: 'number', description: 'For TABLE_CONTENTS: max rows to return (default 100)' },
          sqlFilter: { type: 'string', description: 'For TABLE_CONTENTS: SQL WHERE clause filter' },
        },
        required: ['type'],
      },
    },
    {
      name: 'SAPSearch',
      description:
        'Search for ABAP objects or search within source code. Two modes:\n' +
        '1. Object search (default): Search by name pattern with wildcards (* for any characters). Returns object type, name, package, description, and ADT URI. Supports objectType filter (e.g., CLAS, BDEF, PROG) and packageName filter.\n' +
        '2. Source code search (searchType="source_code"): Full-text search within ABAP source code across the system. Use this to find all objects containing a specific string (e.g., a method call, variable name, or class reference). Requires SAP_BASIS ≥ 7.51.\n\n' +
        'Tips for efficient searching:\n' +
        '- To list ALL objects in a package: use SAPRead(type="DEVC", name="PACKAGE_NAME") instead — one call replaces multiple searches.\n' +
        '- To find objects of a specific type: use the objectType filter (e.g., objectType="BDEF"). Object type is NOT part of the name — don\'t include it in query patterns.\n' +
        "- For type-filtered package queries: SAPQuery(sql=\"SELECT obj_name FROM tadir WHERE devclass = 'PKG' AND object = 'CLAS'\").\n" +
        '- BOR business objects appear as SOBJ type in results. The uri field from results can be used directly with SAPNavigate for references.',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description:
              'Search pattern. For object search: name pattern with wildcards (e.g., ZCL_ORDER*, Z*TEST*). For source_code search: text string to find in source (e.g., cl_lsapi_manager, CALL FUNCTION).',
          },
          searchType: {
            type: 'string',
            enum: ['object', 'source_code'],
            description:
              'Search mode: "object" (default) searches by object name, "source_code" searches within ABAP source code.',
          },
          objectType: {
            type: 'string',
            description:
              'Filter by object type (e.g., CLAS, BDEF, PROG, INTF, FUNC, TABL, DDLS, SRVD). Works for both object search and source_code search.',
          },
          packageName: {
            type: 'string',
            description: 'Filter by package name. Works for both object search and source_code search.',
          },
          maxResults: { type: 'number', description: 'Maximum results (default 100 for object, 50 for source_code)' },
        },
        required: ['query'],
      },
    },
  ];

  // Write tools — only registered when not in read-only mode
  if (!config.readOnly) {
    tools.push({
      name: 'SAPWrite',
      description:
        'Create or update ABAP source code. Handles lock/modify/unlock automatically. Supports PROG, CLAS, INTF, FUNC, INCL.',
      inputSchema: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['create', 'update', 'delete'], description: 'Write action' },
          type: { type: 'string', enum: ['PROG', 'CLAS', 'INTF', 'FUNC', 'INCL'], description: 'Object type' },
          name: { type: 'string', description: 'Object name' },
          source: { type: 'string', description: 'ABAP source code (for create/update)' },
          package: { type: 'string', description: 'Package for new objects (default $TMP)' },
          transport: { type: 'string', description: 'Transport request number (for transportable packages)' },
        },
        required: ['action', 'type', 'name'],
      },
    });

    tools.push({
      name: 'SAPActivate',
      description: 'Activate (publish) ABAP objects. Activates the object and reports any activation errors.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Object name to activate' },
          type: { type: 'string', description: 'Object type (PROG, CLAS, etc.)' },
        },
        required: ['name', 'type'],
      },
    });
  }

  tools.push(
    {
      name: 'SAPNavigate',
      description:
        'Navigate code: find definitions, references (where-used list), and code completion. Use for "go to definition", "where is this used?", "who calls this class?", and auto-complete. For references/where-used: you can use type+name instead of uri (e.g., type="CLAS", name="ZCL_ORDER") for a where-used list without needing the full ADT URI. This is the best way to find all callers of a class, interface, or function module.',
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
          line: { type: 'number', description: 'Line number (1-based)' },
          column: { type: 'number', description: 'Column number (1-based)' },
          source: { type: 'string', description: 'Current source code (for definition/completion)' },
        },
        required: ['action'],
      },
    },
    {
      name: 'SAPQuery',
      description:
        'Execute ABAP SQL queries against SAP tables. Returns structured data with column names and rows. ' +
        'Powerful for reverse-engineering: query metadata tables like DD02L (table catalog), DD03L (field catalog), ' +
        'SEOCOMPO (class/interface components), SWOTLV (BOR method implementations), TADIR (object directory), TFDIR (function modules). ' +
        'If a table is not found, similar table names will be suggested automatically.\n\n' +
        'IMPORTANT — SQL dialect: This executes ABAP Open SQL, NOT standard/ANSI SQL. Key differences:\n' +
        '- Row limiting: Do NOT use FETCH FIRST, LIMIT, or ROWNUM — they will cause syntax errors. Use the maxRows parameter instead (applied server-side). UP TO n ROWS is supported but maxRows overrides it.\n' +
        '- Only SELECT: INSERT, UPDATE, DELETE, and DDL (CREATE/DROP/ALTER) are not supported.\n' +
        '- JOINs: INNER JOIN and LEFT OUTER JOIN supported. RIGHT OUTER JOIN supported on newer systems. No FULL OUTER JOIN.\n' +
        '- Subqueries: Supported in WHERE and HAVING clauses, but NOT in JOIN ON conditions.\n' +
        '- UNION: Supported from SAP_BASIS ≥ 7.50. Cannot combine with UP TO or OFFSET.\n' +
        '- Aggregates: COUNT(*), SUM(), AVG(), MIN(), MAX() work. GROUP BY and HAVING supported.\n' +
        '- String functions: CONCAT(), LENGTH(), SUBSTRING(), REPLACE(), LPAD(), RPAD() (from 7.40+).\n' +
        '- CASE WHEN: Supported (from 7.40 SP08+).\n' +
        '- LIKE: Works with % and _ wildcards. Case-sensitive.\n' +
        '- Field access in JOINs: Use tilde notation table~field for disambiguation.\n' +
        '- Client handling: Automatic client filtering is active by default (MANDT column filtered automatically).\n' +
        '- String literals: Use single quotes only.',
      inputSchema: {
        type: 'object',
        properties: {
          sql: {
            type: 'string',
            description: 'ABAP Open SQL SELECT statement. Do NOT use FETCH FIRST, LIMIT, or ROWNUM.',
          },
          maxRows: {
            type: 'number',
            description:
              'Maximum rows to return (default 100). This is the ONLY reliable way to limit rows — do not use FETCH FIRST, LIMIT, or ROWNUM in your SQL (they cause syntax errors). The server applies this limit regardless of your SQL.',
          },
        },
        required: ['sql'],
      },
    },
    {
      name: 'SAPLint',
      description: 'Check ABAP code quality. Runs abaplint rules locally and/or ATC checks on the SAP system.',
      inputSchema: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['lint', 'atc', 'syntax'], description: 'Check type' },
          source: { type: 'string', description: 'ABAP source code (for lint)' },
          name: { type: 'string', description: 'Object name (for atc/syntax)' },
          type: { type: 'string', description: 'Object type (for atc/syntax)' },
        },
        required: ['action'],
      },
    },
    {
      name: 'SAPDiagnose',
      description:
        'Run diagnostics on ABAP objects: syntax check, ABAP unit tests, and ATC (ABAP Test Cockpit) code quality checks.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['syntax', 'unittest', 'atc'],
            description: 'Diagnostic action',
          },
          name: { type: 'string', description: 'Object name' },
          type: { type: 'string', description: 'Object type (PROG, CLAS, etc.)' },
          variant: { type: 'string', description: 'ATC check variant (for atc action)' },
        },
        required: ['action', 'name', 'type'],
      },
    },
  );

  // SAPContext — always available (read-only tool)
  tools.push({
    name: 'SAPContext',
    description:
      'IMPORTANT: After reading a class/program with SAPRead, use SAPContext as your NEXT call to understand its dependencies. ' +
      'Do NOT manually follow dependencies with multiple SAPRead calls — SAPContext does this in one call with 7-30x fewer tokens.\n\n' +
      'Returns only the public API contracts (method signatures, interface definitions, type declarations) of all objects that the target depends on — ' +
      'NOT the full source code. This is the most token-efficient way to understand dependencies. ' +
      'Instead of N separate SAPRead calls returning full source (~200 lines each), SAPContext returns ONE response ' +
      'with compressed contracts (~15-30 lines each).\n\n' +
      'What gets extracted per dependency:\n' +
      '- Classes: CLASS DEFINITION with PUBLIC SECTION only (methods, types, constants). PROTECTED, PRIVATE and IMPLEMENTATION stripped.\n' +
      '- Interfaces: Full interface definition (interfaces are already public contracts).\n' +
      '- Function modules: FUNCTION signature block only (IMPORTING/EXPORTING parameters).\n\n' +
      'Filtering: SAP standard objects (CL_ABAP_*, IF_ABAP_*, CX_SY_*) are excluded — the LLM already knows standard SAP APIs. ' +
      'Custom objects (Z*, Y*) are prioritized.\n\n' +
      "Use SAPContext whenever you need to understand an object's dependencies — whether for analysis, debugging, or before writing code. " +
      "If you've just read a class with SAPRead and need to understand what it calls/uses, SAPContext is always the next step.",
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['CLAS', 'INTF', 'PROG', 'FUNC'],
          description: 'Object type',
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
        group: {
          type: 'string',
          description: 'Required for FUNC type. The function group containing the function module.',
        },
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
      required: ['type', 'name'],
    },
  });

  // SAPManage — always registered (probe/features are read-only operations)
  tools.push({
    name: 'SAPManage',
    description:
      'Probe and report SAP system capabilities. Use this BEFORE attempting operations that depend on optional ' +
      'features (source code search, abapGit, RAP/CDS, AMDP, HANA, UI5/Fiori, CTS transports).\n\n' +
      'Actions:\n' +
      '- "features": Get cached feature status from last probe (fast, no SAP round-trip). ' +
      'Returns which features are available, their mode (auto/on/off), and when they were last probed.\n' +
      '- "probe": Re-probe the SAP system now (makes parallel HEAD requests, ~1-2s). ' +
      'Use this on first use or if you suspect feature availability has changed.\n\n' +
      'Returns JSON with features, each having: id, available (bool), mode, message, and probedAt timestamp. ' +
      '"available: false" means do NOT attempt operations that depend on it.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['features', 'probe'],
          description: 'Action: "features" for cached status, "probe" to re-check SAP system',
        },
      },
      required: ['action'],
    },
  });

  // Transport tools — registered when transports are enabled or not in read-only mode
  if (config.enableTransports || !config.readOnly) {
    tools.push({
      name: 'SAPTransport',
      description: 'Manage CTS transport requests: list, get details, create, and release.',
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
