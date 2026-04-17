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
  'DCLS',
  'DDLX',
  'BDEF',
  'SRVD',
  'SRVB',
  'SKTD',
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
  'API_STATE',
  'INACTIVE_OBJECTS',
  'AUTH',
  'FTG2',
  'ENHO',
] as const;

const SAPREAD_TYPES_BTP = [
  'CLAS',
  'INTF',
  'FUNC',
  'FUGR',
  'DDLS',
  'DCLS',
  'DDLX',
  'BDEF',
  'SRVD',
  'SRVB',
  'SKTD',
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
  'API_STATE',
  'INACTIVE_OBJECTS',
] as const;

const SAPREAD_CLAS_INCLUDES = ['main', 'testclasses', 'definitions', 'implementations', 'macros'] as const;
const SAPREAD_DDLS_INCLUDES = ['elements'] as const;

function validateSapReadInclude(
  input: { type: string; include?: string },
  ctx: { addIssue: (issue: { code: 'custom'; path: string[]; message: string }) => void },
): void {
  if (!input.include) return;

  const include = input.include.toLowerCase();
  if (input.type === 'CLAS' && !SAPREAD_CLAS_INCLUDES.includes(include as (typeof SAPREAD_CLAS_INCLUDES)[number])) {
    ctx.addIssue({
      code: 'custom',
      path: ['include'],
      message: `Invalid include value "${input.include}" for type CLAS. Valid values: ${SAPREAD_CLAS_INCLUDES.join(', ')}`,
    });
  }

  if (input.type === 'DDLS' && !SAPREAD_DDLS_INCLUDES.includes(include as (typeof SAPREAD_DDLS_INCLUDES)[number])) {
    ctx.addIssue({
      code: 'custom',
      path: ['include'],
      message: `Invalid include value "${input.include}" for type DDLS. Valid values: ${SAPREAD_DDLS_INCLUDES.join(', ')}`,
    });
  }
}

export const SAPReadSchema = z
  .object({
    type: z.enum(SAPREAD_TYPES_ONPREM),
    name: z.string().optional(),
    include: z.string().optional(),
    group: z.string().optional(),
    method: z.string().optional(),
    expand_includes: z.coerce.boolean().optional(),
    format: z.enum(['text', 'structured']).optional(),
    maxRows: z.coerce.number().optional(),
    sqlFilter: z.string().optional(),
    objectType: z.string().optional(),
  })
  .superRefine((input, ctx) => validateSapReadInclude(input, ctx));

export const SAPReadSchemaBtp = z
  .object({
    type: z.enum(SAPREAD_TYPES_BTP),
    name: z.string().optional(),
    include: z.string().optional(),
    group: z.string().optional(),
    method: z.string().optional(),
    format: z.enum(['text', 'structured']).optional(),
    maxRows: z.coerce.number().optional(),
    sqlFilter: z.string().optional(),
    objectType: z.string().optional(),
  })
  .superRefine((input, ctx) => validateSapReadInclude(input, ctx));

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

const SAPWRITE_TYPES_ONPREM = [
  'PROG',
  'CLAS',
  'INTF',
  'FUNC',
  'INCL',
  'DDLS',
  'DCLS',
  'DDLX',
  'BDEF',
  'SRVD',
  'SRVB',
  'SKTD',
  'TABL',
  'DOMA',
  'DTEL',
  'MSAG',
] as const;
const SAPWRITE_TYPES_BTP = [
  'CLAS',
  'INTF',
  'DDLS',
  'DCLS',
  'DDLX',
  'BDEF',
  'SRVD',
  'SRVB',
  'SKTD',
  'TABL',
  'DOMA',
  'DTEL',
  'MSAG',
] as const;

const ddicFixedValueSchema = z.object({
  low: z.string(),
  high: z.string().optional(),
  description: z.string().optional(),
});

const messageClassMessageSchema = z.object({
  number: z.string(),
  shortText: z.string(),
});

const batchObjectSchemaOnprem = z.object({
  type: z.enum(SAPWRITE_TYPES_ONPREM),
  name: z.string(),
  source: z.string().optional(),
  description: z.string().optional(),
  dataType: z.string().optional(),
  length: z.coerce.number().optional(),
  decimals: z.coerce.number().optional(),
  outputLength: z.coerce.number().optional(),
  conversionExit: z.string().optional(),
  signExists: z.coerce.boolean().optional(),
  lowercase: z.coerce.boolean().optional(),
  fixedValues: z.array(ddicFixedValueSchema).optional(),
  valueTable: z.string().optional(),
  typeKind: z.enum(['domain', 'predefinedAbapType']).optional(),
  typeName: z.string().optional(),
  domainName: z.string().optional(),
  shortLabel: z.string().optional(),
  mediumLabel: z.string().optional(),
  longLabel: z.string().optional(),
  headingLabel: z.string().optional(),
  searchHelp: z.string().optional(),
  searchHelpParameter: z.string().optional(),
  setGetParameter: z.string().optional(),
  defaultComponentName: z.string().optional(),
  changeDocument: z.coerce.boolean().optional(),
  messages: z.array(messageClassMessageSchema).optional(),
  serviceDefinition: z.string().optional(),
  bindingType: z.string().optional(),
  odataVersion: z.enum(['V2', 'V4']).optional(),
  category: z.enum(['0', '1']).optional(),
  version: z.string().optional(),
});

const batchObjectSchemaBtp = z.object({
  type: z.enum(SAPWRITE_TYPES_BTP),
  name: z.string(),
  source: z.string().optional(),
  description: z.string().optional(),
  dataType: z.string().optional(),
  length: z.coerce.number().optional(),
  decimals: z.coerce.number().optional(),
  outputLength: z.coerce.number().optional(),
  conversionExit: z.string().optional(),
  signExists: z.coerce.boolean().optional(),
  lowercase: z.coerce.boolean().optional(),
  fixedValues: z.array(ddicFixedValueSchema).optional(),
  valueTable: z.string().optional(),
  typeKind: z.enum(['domain', 'predefinedAbapType']).optional(),
  typeName: z.string().optional(),
  domainName: z.string().optional(),
  shortLabel: z.string().optional(),
  mediumLabel: z.string().optional(),
  longLabel: z.string().optional(),
  headingLabel: z.string().optional(),
  searchHelp: z.string().optional(),
  searchHelpParameter: z.string().optional(),
  setGetParameter: z.string().optional(),
  defaultComponentName: z.string().optional(),
  changeDocument: z.coerce.boolean().optional(),
  messages: z.array(messageClassMessageSchema).optional(),
  serviceDefinition: z.string().optional(),
  bindingType: z.string().optional(),
  odataVersion: z.enum(['V2', 'V4']).optional(),
  category: z.enum(['0', '1']).optional(),
  version: z.string().optional(),
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
  dataType: z.string().optional(),
  length: z.coerce.number().optional(),
  decimals: z.coerce.number().optional(),
  outputLength: z.coerce.number().optional(),
  conversionExit: z.string().optional(),
  signExists: z.coerce.boolean().optional(),
  lowercase: z.coerce.boolean().optional(),
  fixedValues: z.array(ddicFixedValueSchema).optional(),
  valueTable: z.string().optional(),
  typeKind: z.enum(['domain', 'predefinedAbapType']).optional(),
  typeName: z.string().optional(),
  domainName: z.string().optional(),
  shortLabel: z.string().optional(),
  mediumLabel: z.string().optional(),
  longLabel: z.string().optional(),
  headingLabel: z.string().optional(),
  searchHelp: z.string().optional(),
  searchHelpParameter: z.string().optional(),
  setGetParameter: z.string().optional(),
  defaultComponentName: z.string().optional(),
  changeDocument: z.coerce.boolean().optional(),
  messages: z.array(messageClassMessageSchema).optional(),
  serviceDefinition: z.string().optional(),
  bindingType: z.string().optional(),
  odataVersion: z.enum(['V2', 'V4']).optional(),
  category: z.enum(['0', '1']).optional(),
  version: z.string().optional(),
  lintBeforeWrite: z.coerce.boolean().optional(),
  refObjectType: z.string().optional(),
  refObjectName: z.string().optional(),
  refObjectDescription: z.string().optional(),
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
  dataType: z.string().optional(),
  length: z.coerce.number().optional(),
  decimals: z.coerce.number().optional(),
  outputLength: z.coerce.number().optional(),
  conversionExit: z.string().optional(),
  signExists: z.coerce.boolean().optional(),
  lowercase: z.coerce.boolean().optional(),
  fixedValues: z.array(ddicFixedValueSchema).optional(),
  valueTable: z.string().optional(),
  typeKind: z.enum(['domain', 'predefinedAbapType']).optional(),
  typeName: z.string().optional(),
  domainName: z.string().optional(),
  shortLabel: z.string().optional(),
  mediumLabel: z.string().optional(),
  longLabel: z.string().optional(),
  headingLabel: z.string().optional(),
  searchHelp: z.string().optional(),
  searchHelpParameter: z.string().optional(),
  setGetParameter: z.string().optional(),
  defaultComponentName: z.string().optional(),
  changeDocument: z.coerce.boolean().optional(),
  messages: z.array(messageClassMessageSchema).optional(),
  serviceDefinition: z.string().optional(),
  bindingType: z.string().optional(),
  odataVersion: z.enum(['V2', 'V4']).optional(),
  category: z.enum(['0', '1']).optional(),
  version: z.string().optional(),
  lintBeforeWrite: z.coerce.boolean().optional(),
  refObjectType: z.string().optional(),
  refObjectName: z.string().optional(),
  refObjectDescription: z.string().optional(),
  objects: z.array(batchObjectSchemaBtp).optional(),
});

// ─── SAPActivate ────────────────────────────────────────────────────

export const SAPActivateSchema = z.object({
  action: z.enum(['activate', 'publish_srvb', 'unpublish_srvb']).optional(),
  name: z.string().optional(),
  type: z.string().optional(),
  version: z.string().optional(),
  service_type: z.enum(['odatav2', 'odatav4']).optional(),
  preaudit: z.coerce.boolean().optional(),
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
  action: z.enum(['definition', 'references', 'completion', 'hierarchy']),
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
  action: z.enum(['syntax', 'unittest', 'atc', 'dumps', 'traces', 'quickfix', 'apply_quickfix']),
  name: z.string().optional(),
  type: z.string().optional(),
  source: z.string().optional(),
  line: z.coerce.number().optional(),
  column: z.coerce.number().optional(),
  proposalUri: z.string().optional(),
  proposalUserContent: z.string().optional(),
  variant: z.string().optional(),
  id: z.string().optional(),
  user: z.string().optional(),
  maxResults: z.coerce.number().optional(),
  analysis: z.enum(['hitlist', 'statements', 'dbAccesses']).optional(),
});

// ─── SAPTransport ───────────────────────────────────────────────────

export const SAPTransportSchema = z.object({
  action: z.enum(['list', 'get', 'create', 'release', 'delete', 'reassign', 'release_recursive', 'check', 'history']),
  id: z.string().optional(),
  description: z.string().optional(),
  name: z.string().optional(),
  package: z.string().optional(),
  user: z.string().optional(),
  status: z.string().optional(),
  type: z.string().optional(),
  owner: z.string().optional(),
  recursive: z.boolean().optional(),
});

// ─── SAPContext ─────────────────────────────────────────────────────

const SAPCONTEXT_TYPES_ONPREM = ['CLAS', 'INTF', 'PROG', 'FUNC', 'DDLS'] as const;
const SAPCONTEXT_TYPES_BTP = ['CLAS', 'INTF', 'DDLS'] as const;

export const SAPContextSchema = z.object({
  action: z.enum(['deps', 'usages', 'impact']).optional(),
  type: z.enum(SAPCONTEXT_TYPES_ONPREM).optional(),
  name: z.string(),
  source: z.string().optional(),
  group: z.string().optional(),
  maxDeps: z.coerce.number().optional(),
  depth: z.coerce.number().min(1).max(3).optional(),
  includeIndirect: z.boolean().optional(),
});

export const SAPContextSchemaBtp = z.object({
  action: z.enum(['deps', 'usages', 'impact']).optional(),
  type: z.enum(SAPCONTEXT_TYPES_BTP).optional(),
  name: z.string(),
  source: z.string().optional(),
  maxDeps: z.coerce.number().optional(),
  depth: z.coerce.number().min(1).max(3).optional(),
  includeIndirect: z.boolean().optional(),
});

// ─── SAPManage ──────────────────────────────────────────────────────

const flpTileSchema = z.object({
  id: z.string(),
  title: z.string(),
  icon: z.string().optional(),
  semanticObject: z.string(),
  semanticAction: z.string(),
  url: z.string().optional(),
  subtitle: z.string().optional(),
  info: z.string().optional(),
});

export const SAPManageSchema = z.object({
  action: z.enum([
    'features',
    'probe',
    'cache_stats',
    'create_package',
    'delete_package',
    'change_package',
    'flp_list_catalogs',
    'flp_list_groups',
    'flp_list_tiles',
    'flp_create_catalog',
    'flp_create_group',
    'flp_create_tile',
    'flp_add_tile_to_group',
    'flp_delete_catalog',
  ]),
  catalogId: z.string().optional(),
  groupId: z.string().optional(),
  title: z.string().optional(),
  domainId: z.string().optional(),
  tileInstanceId: z.string().optional(),
  tile: flpTileSchema.optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  superPackage: z.string().optional(),
  softwareComponent: z.string().optional(),
  transportLayer: z.string().optional(),
  packageType: z.enum(['development', 'structure', 'main']).optional(),
  transport: z.string().optional(),
  objectUri: z.string().optional(),
  objectType: z.string().optional(),
  objectName: z.string().optional(),
  oldPackage: z.string().optional(),
  newPackage: z.string().optional(),
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
