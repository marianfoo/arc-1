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
        'Read any SAP ABAP object. Supports: PROG (program), CLAS (class), INTF (interface), FUNC (function module), FUGR (function group), INCL (include), DDLS (CDS view), BDEF (behavior definition), SRVD (service definition), TABL (table definition), VIEW (DDIC view), TABLE_CONTENTS (table data), DEVC (package contents), SYSTEM (system info), COMPONENTS (installed components), MESSAGES (message class), TEXT_ELEMENTS (program texts), VARIANTS (program variants).',
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
              'SYSTEM',
              'COMPONENTS',
              'MESSAGES',
              'TEXT_ELEMENTS',
              'VARIANTS',
            ],
            description: 'Object type to read',
          },
          name: { type: 'string', description: 'Object name (e.g., ZTEST_PROGRAM, ZCL_ORDER, MARA)' },
          include: { type: 'string', description: 'For CLAS: one or more of testclasses, definitions, implementations, macros (comma-separated)' },
          group: { type: 'string', description: 'For FUNC: function group name' },
          maxRows: { type: 'number', description: 'For TABLE_CONTENTS: max rows to return (default 100)' },
          sqlFilter: { type: 'string', description: 'For TABLE_CONTENTS: SQL WHERE clause filter' },
        },
        required: ['type'],
      },
    },
    {
      name: 'SAPSearch',
      description:
        'Search for ABAP objects by name pattern. Supports wildcards (* for any characters). Returns object type, name, package, and description.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search pattern (e.g., ZCL_ORDER*, Z*TEST*)' },
          maxResults: { type: 'number', description: 'Maximum results (default 100)' },
        },
        required: ['query'],
      },
    },
  ];

  // Write tools (blocked in read-only mode — but still registered so LLM knows they exist)
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
        'Navigate code: find definitions, references, and code completion. Use for "go to definition", "where is this used?", and auto-complete.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['definition', 'references', 'completion'],
            description: 'Navigation action',
          },
          uri: { type: 'string', description: 'Source URI of the object' },
          line: { type: 'number', description: 'Line number (1-based)' },
          column: { type: 'number', description: 'Column number (1-based)' },
          source: { type: 'string', description: 'Current source code (for definition/completion)' },
        },
        required: ['action', 'uri'],
      },
    },
    {
      name: 'SAPQuery',
      description: 'Execute ABAP SQL queries against SAP tables. Returns structured data with column names and rows.',
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
      name: 'SAPContext',
      description:
        'Get compressed context for an ABAP object — public API contracts of dependencies. Minimizes LLM context window usage.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Object name' },
          type: { type: 'string', description: 'Object type (CLAS, PROG, etc.)' },
          depth: { type: 'number', description: 'Dependency expansion depth (1-3, default 1)' },
        },
        required: ['name', 'type'],
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
        'System diagnostics: runtime errors (short dumps), ABAP profiler traces, SQL traces, call graphs, object structure.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['dumps', 'dump_detail', 'traces', 'trace_detail', 'sql_traces', 'call_graph', 'object_structure'],
            description: 'Diagnostic action',
          },
          name: { type: 'string', description: 'Object or dump ID' },
          user: { type: 'string', description: 'Filter by user (for dumps/traces)' },
          maxResults: { type: 'number', description: 'Maximum results' },
        },
        required: ['action'],
      },
    },
  );

  // Transport tools
  if (config.enableTransports || !config.readOnly) {
    tools.push({
      name: 'SAPTransport',
      description: 'Manage CTS transport requests: list, create, release. Requires --enable-transports flag.',
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

  // Manage tools (blocked in read-only)
  if (!config.readOnly) {
    tools.push({
      name: 'SAPManage',
      description: 'Manage ARC-1 features: probe system features, get feature status.',
      inputSchema: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['features', 'probe'], description: 'Management action' },
        },
        required: ['action'],
      },
    });
  }

  return tools;
}
