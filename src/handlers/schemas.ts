/**
 * Zod v4 input schemas for all 11 MCP tools.
 *
 * These schemas provide runtime validation via safeParse() in handleToolCall().
 * JSON Schema generation via z.toJSONSchema() is planned for a future PR
 * (currently, JSON Schema is still hand-written in tools.ts).
 *
 * BTP variants exclude types not available on BTP ABAP Environment.
 * Numeric fields use z.coerce.number() for MCP client compatibility
 * (clients may send "100" as a string).
 */

import { z } from 'zod';

// ─── SAPRead ────────────────────────────────────────────────────────

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
] as const;

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
] as const;

export const SAPReadSchema = z.object({
  type: z.enum(SAPREAD_TYPES_ONPREM),
  name: z.string().optional(),
  include: z.string().optional(),
  group: z.string().optional(),
  method: z.string().optional(),
  expand_includes: z.coerce.boolean().optional(),
  format: z.enum(['text', 'structured']).optional(),
  maxRows: z.coerce.number().optional(),
  sqlFilter: z.string().optional(),
});

export const SAPReadSchemaBtp = z.object({
  type: z.enum(SAPREAD_TYPES_BTP),
  name: z.string().optional(),
  include: z.string().optional(),
  group: z.string().optional(),
  method: z.string().optional(),
  format: z.enum(['text', 'structured']).optional(),
  maxRows: z.coerce.number().optional(),
  sqlFilter: z.string().optional(),
});

// ─── SAPSearch ──────────────────────────────────────────────────────

export const SAPSearchSchema = z.object({
  query: z.string(),
  maxResults: z.coerce.number().optional(),
  searchType: z.enum(['object', 'source_code']).optional(),
  objectType: z.string().optional(),
  packageName: z.string().optional(),
});

export const SAPSearchSchemaNoSource = z.object({
  query: z.string(),
  maxResults: z.coerce.number().optional(),
});

// ─── SAPQuery ───────────────────────────────────────────────────────

export const SAPQuerySchema = z.object({
  sql: z.string(),
  maxRows: z.coerce.number().optional(),
});

// ─── SAPWrite ───────────────────────────────────────────────────────

const SAPWRITE_TYPES_ONPREM = ['PROG', 'CLAS', 'INTF', 'FUNC', 'INCL', 'DDLS', 'DDLX', 'BDEF', 'SRVD'] as const;
const SAPWRITE_TYPES_BTP = ['CLAS', 'INTF', 'DDLS', 'DDLX', 'BDEF', 'SRVD'] as const;

const batchObjectSchemaOnprem = z.object({
  type: z.enum(SAPWRITE_TYPES_ONPREM),
  name: z.string(),
  source: z.string().optional(),
  description: z.string().optional(),
});

const batchObjectSchemaBtp = z.object({
  type: z.enum(SAPWRITE_TYPES_BTP),
  name: z.string(),
  source: z.string().optional(),
  description: z.string().optional(),
});

export const SAPWriteSchema = z.object({
  action: z.enum(['create', 'update', 'delete', 'edit_method', 'batch_create']),
  type: z.enum(SAPWRITE_TYPES_ONPREM).optional(),
  name: z.string().optional(),
  source: z.string().optional(),
  method: z.string().optional(),
  description: z.string().optional(),
  package: z.string().optional(),
  transport: z.string().optional(),
  objects: z.array(batchObjectSchemaOnprem).optional(),
});

export const SAPWriteSchemaBtp = z.object({
  action: z.enum(['create', 'update', 'delete', 'edit_method', 'batch_create']),
  type: z.enum(SAPWRITE_TYPES_BTP).optional(),
  name: z.string().optional(),
  source: z.string().optional(),
  method: z.string().optional(),
  description: z.string().optional(),
  package: z.string().optional(),
  transport: z.string().optional(),
  objects: z.array(batchObjectSchemaBtp).optional(),
});

// ─── SAPActivate ────────────────────────────────────────────────────

export const SAPActivateSchema = z.object({
  name: z.string().optional(),
  type: z.string().optional(),
  objects: z
    .array(
      z.object({
        type: z.string(),
        name: z.string(),
      }),
    )
    .optional(),
});

// ─── SAPNavigate ────────────────────────────────────────────────────

export const SAPNavigateSchema = z.object({
  action: z.enum(['definition', 'references', 'completion']),
  uri: z.string().optional(),
  type: z.string().optional(),
  name: z.string().optional(),
  objectType: z.string().optional(),
  line: z.coerce.number().optional(),
  column: z.coerce.number().optional(),
  source: z.string().optional(),
});

// ─── SAPLint ────────────────────────────────────────────────────────

export const SAPLintSchema = z.object({
  action: z.enum(['lint', 'lint_and_fix', 'list_rules']),
  source: z.string().optional(),
  name: z.string().optional(),
  rules: z.record(z.string(), z.any()).optional(),
});

// ─── SAPDiagnose ────────────────────────────────────────────────────

export const SAPDiagnoseSchema = z.object({
  action: z.enum(['syntax', 'unittest', 'atc', 'dumps', 'traces']),
  name: z.string().optional(),
  type: z.string().optional(),
  variant: z.string().optional(),
  id: z.string().optional(),
  user: z.string().optional(),
  maxResults: z.coerce.number().optional(),
  analysis: z.enum(['hitlist', 'statements', 'dbAccesses']).optional(),
});

// ─── SAPTransport ───────────────────────────────────────────────────

export const SAPTransportSchema = z.object({
  action: z.enum(['list', 'get', 'create', 'release']),
  id: z.string().optional(),
  description: z.string().optional(),
  user: z.string().optional(),
});

// ─── SAPContext ─────────────────────────────────────────────────────

const SAPCONTEXT_TYPES_ONPREM = ['CLAS', 'INTF', 'PROG', 'FUNC', 'DDLS'] as const;
const SAPCONTEXT_TYPES_BTP = ['CLAS', 'INTF', 'DDLS'] as const;

export const SAPContextSchema = z.object({
  action: z.enum(['deps', 'usages']).optional(),
  type: z.enum(SAPCONTEXT_TYPES_ONPREM).optional(),
  name: z.string(),
  source: z.string().optional(),
  group: z.string().optional(),
  maxDeps: z.coerce.number().optional(),
  depth: z.coerce.number().min(1).max(3).optional(),
});

export const SAPContextSchemaBtp = z.object({
  action: z.enum(['deps', 'usages']).optional(),
  type: z.enum(SAPCONTEXT_TYPES_BTP).optional(),
  name: z.string(),
  source: z.string().optional(),
  maxDeps: z.coerce.number().optional(),
  depth: z.coerce.number().min(1).max(3).optional(),
});

// ─── SAPManage ──────────────────────────────────────────────────────

export const SAPManageSchema = z.object({
  action: z.enum(['features', 'probe', 'cache_stats']),
});

// ─── Hyperfocused SAP ───────────────────────────────────────────────

export const SAPHyperfocusedSchema = z.object({
  action: z.string(),
  type: z.string().optional(),
  name: z.string().optional(),
  params: z.record(z.string(), z.any()).optional(),
});

// ─── Schema Lookup ──────────────────────────────────────────────────

/**
 * Get the Zod schema for a given tool name.
 * Returns BTP or on-prem variant based on isBtp flag.
 * When textSearchAvailable is false, returns a restricted SAPSearch schema.
 */
export function getToolSchema(toolName: string, isBtp: boolean, textSearchAvailable?: boolean): z.ZodType | undefined {
  switch (toolName) {
    case 'SAPRead':
      return isBtp ? SAPReadSchemaBtp : SAPReadSchema;
    case 'SAPSearch':
      return textSearchAvailable === false ? SAPSearchSchemaNoSource : SAPSearchSchema;
    case 'SAPQuery':
      return SAPQuerySchema;
    case 'SAPWrite':
      return isBtp ? SAPWriteSchemaBtp : SAPWriteSchema;
    case 'SAPActivate':
      return SAPActivateSchema;
    case 'SAPNavigate':
      return SAPNavigateSchema;
    case 'SAPLint':
      return SAPLintSchema;
    case 'SAPDiagnose':
      return SAPDiagnoseSchema;
    case 'SAPTransport':
      return SAPTransportSchema;
    case 'SAPContext':
      return isBtp ? SAPContextSchemaBtp : SAPContextSchema;
    case 'SAPManage':
      return SAPManageSchema;
    case 'SAP':
      return SAPHyperfocusedSchema;
    default:
      return undefined;
  }
}
