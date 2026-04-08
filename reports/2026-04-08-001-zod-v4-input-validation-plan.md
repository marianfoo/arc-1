# Zod v4 Input Validation Plan

**Date:** 2026-04-08
**Status:** Proposed
**Scope:** Upgrade Zod to v4, add runtime input validation for all MCP tool calls

## Background

ARC-1 defines 11 MCP tools with hand-written JSON Schema objects in `src/handlers/tools.ts`. At runtime, the MCP SDK validates the request envelope but **does not validate tool arguments** against these schemas. Each handler in `src/handlers/intent.ts` manually coerces arguments with `String(args.type ?? '')` / `Number(args.maxRows ?? 100)` and performs ad-hoc required-field checks that can drift from the schema definitions.

Zod is listed as a dependency (`^3.24.0`) but is not imported anywhere in the codebase.

## Goals

1. **Single source of truth** — Define tool input schemas once in Zod; derive both runtime validation and MCP JSON Schema from them.
2. **Runtime validation at the boundary** — Parse and validate all tool arguments before handler logic runs, catching type mismatches, missing fields, and invalid enum values early.
3. **Better LLM error messages** — Surface Zod's structured validation errors (field paths, expected vs. received) as actionable feedback to the MCP client, integrated with the existing `formatErrorForLLM` pattern.
4. **Upgrade to Zod v4** — Take advantage of built-in `z.toJSONSchema()`, smaller bundle, and improved TypeScript inference.

## Non-Goals

- Changing the existing error handling architecture (AdtApiError, AdtSafetyError, etc.)
- Migrating from low-level `Server` API to `McpServer.registerTool()` (can be done later)
- Adding output schema validation (tool responses to the client)

## Current Architecture

```
MCP Client
  |
  v
server.setRequestHandler(CallToolRequestSchema, handler)    # server/server.ts
  |
  v
handleToolCall(client, config, toolName, args, ...)          # handlers/intent.ts
  |
  +-- scope check (authInfo.scopes vs TOOL_SCOPES)
  +-- switch(toolName) -> handleSAPRead / handleSAPWrite / ...
        |
        +-- String(args.type ?? '') coercion
        +-- if (!source) return errorResult(...)  // ad-hoc required checks
        +-- client.getProgram(name) ...
```

**Problems with current approach:**
- JSON Schema in `tools.ts` and coercion logic in `intent.ts` are separate — they can (and do) drift
- No type safety on `args` — it's `Record<string, unknown>` everywhere
- Invalid enum values pass coercion silently and fail deep in ADT with unhelpful SAP errors
- Missing optional-vs-required semantics (e.g., `maxRows` defaults are scattered across handlers)

## Proposed Architecture

```
MCP Client
  |
  v
server.setRequestHandler(CallToolRequestSchema, handler)    # server/server.ts
  |
  v
handleToolCall(client, config, toolName, args, ...)          # handlers/intent.ts
  |
  +-- scope check (unchanged)
  +-- TOOL_SCHEMAS[toolName].safeParse(args)                 # NEW: Zod validation
  |     |
  |     +-- failure -> formatZodError(error) -> errorResult  # NEW: structured error
  |     +-- success -> typed, validated args
  |
  +-- switch(toolName) -> handleSAPRead(client, parsedArgs)
        |
        +-- no more String() coercion needed
        +-- no more ad-hoc required checks
        +-- client.getProgram(parsedArgs.name) ...
```

## Implementation Plan

### Phase 1: Upgrade Zod and Define Schemas

**Files:** `package.json`, new file `src/handlers/schemas.ts`

1. **Upgrade Zod** in `package.json`: change `"zod": "^3.24.0"` to `"zod": "^4.0.0"`.

2. **Create `src/handlers/schemas.ts`** with Zod schemas for all 11 tools. Example:

```typescript
import { z } from 'zod';

// Shared enums
const SAPReadType = z.enum([
  'PROG', 'CLAS', 'INTF', 'FUNC', 'FUGR', 'TABL', 'TABLE_CONTENTS',
  'INCL', 'DEVC', 'SYSTEM', 'COMPONENTS', 'STRUCTURE', 'CALLGRAPH',
  'MESSAGES', 'TEXT_ELEMENTS', 'VARIANTS', 'FEATURES', 'VIEW',
  'DOMA', 'DTEL', 'MSAG', 'TTYP', 'SHLP', 'ENQU',
  'DDLS', 'DCLS', 'BDEF', 'SRVD', 'DDLX', 'SMBC', 'BOR',
]);

const SAPReadTypeBtp = z.enum([
  'CLAS', 'INTF', 'TABL', 'TABLE_CONTENTS', 'DEVC', 'SYSTEM',
  'COMPONENTS', 'STRUCTURE', 'CALLGRAPH', 'MESSAGES', 'FEATURES',
  'DOMA', 'DTEL', 'MSAG', 'TTYP', 'SHLP', 'ENQU',
  'DDLS', 'DCLS', 'BDEF', 'SRVD', 'DDLX', 'SMBC', 'BOR',
]);

export const SAPReadSchema = z.object({
  type: SAPReadType,
  name: z.string().optional(),
  include: z.string().optional(),
  group: z.string().optional(),
  method: z.string().optional(),
  expand_includes: z.boolean().optional().default(false),
  maxRows: z.number().optional().default(100),
  sqlFilter: z.string().optional(),
});

// BTP variant — narrower type enum, no expand_includes
export const SAPReadSchemaBtp = SAPReadSchema.omit({ expand_includes: true }).extend({
  type: SAPReadTypeBtp,
});

export const SAPSearchSchema = z.object({
  query: z.string(),
  maxResults: z.number().optional().default(50),
  searchType: z.enum(['quick', 'source_code']).optional(),
  objectType: z.string().optional(),
  packageName: z.string().optional(),
});

export const SAPQuerySchema = z.object({
  sql: z.string(),
  maxRows: z.number().optional().default(100),
});

export const SAPWriteSchema = z.object({
  action: z.enum(['update', 'create', 'delete', 'edit_method']),
  type: z.string(),
  name: z.string(),
  source: z.string().optional(),
  method: z.string().optional(),
  package: z.string().optional(),
  transport: z.string().optional(),
  description: z.string().optional(),
});

export const SAPActivateSchema = z.object({
  name: z.string().optional(),
  type: z.string().optional(),
  objects: z.array(z.object({
    name: z.string(),
    type: z.string(),
  })).optional(),
});

export const SAPNavigateSchema = z.object({
  action: z.enum([
    'find_definition', 'find_references', 'where_used',
    'completion', 'element_info', 'expand_includes',
  ]),
  uri: z.string().optional(),
  type: z.string().optional(),
  name: z.string().optional(),
  objectType: z.string().optional(),
  line: z.number().optional(),
  column: z.number().optional(),
  source: z.string().optional(),
});

export const SAPLintSchema = z.object({
  action: z.enum(['lint', 'lint_and_fix']),
  source: z.string().optional(),
  name: z.string().optional(),
  rules: z.record(z.unknown()).optional(),
});

export const SAPDiagnoseSchema = z.object({
  action: z.enum([
    'atc_run', 'atc_customizing', 'short_dumps',
    'short_dump_detail', 'profiler_list', 'profiler_detail',
  ]),
  name: z.string().optional(),
  type: z.string().optional(),
  variant: z.string().optional(),
  id: z.string().optional(),
  user: z.string().optional(),
  maxResults: z.number().optional(),
  analysis: z.string().optional(),
});

export const SAPTransportSchema = z.object({
  action: z.enum(['list', 'get', 'create', 'release']),
  id: z.string().optional(),
  description: z.string().optional(),
  user: z.string().optional(),
});

export const SAPContextSchema = z.object({
  action: z.enum(['compress', 'list_methods', 'get_method']).optional(),
  type: z.string().optional(),
  name: z.string(),
  source: z.string().optional(),
  group: z.string().optional(),
  method: z.string().optional(),
  maxDeps: z.number().optional(),
  depth: z.number().optional(),
});

export const SAPManageSchema = z.object({
  action: z.enum(['probe', 'features', 'cache_stats', 'invalidate_cache']),
});

// Map tool name -> schema (used for runtime validation)
export function getToolSchema(toolName: string, isBtp: boolean): z.ZodType | undefined {
  switch (toolName) {
    case 'SAPRead': return isBtp ? SAPReadSchemaBtp : SAPReadSchema;
    case 'SAPSearch': return SAPSearchSchema;
    case 'SAPQuery': return SAPQuerySchema;
    case 'SAPWrite': return SAPWriteSchema;
    case 'SAPActivate': return SAPActivateSchema;
    case 'SAPNavigate': return SAPNavigateSchema;
    case 'SAPLint': return SAPLintSchema;
    case 'SAPDiagnose': return SAPDiagnoseSchema;
    case 'SAPTransport': return SAPTransportSchema;
    case 'SAPContext': return SAPContextSchema;
    case 'SAPManage': return SAPManageSchema;
    default: return undefined;
  }
}
```

### Phase 2: Add Validation to handleToolCall

**File:** `src/handlers/intent.ts`

Add a validation step immediately after the scope check, before dispatching to individual handlers:

```typescript
import { getToolSchema } from './schemas.js';
import { formatZodError } from './zod-errors.js';

// Inside handleToolCall, after scope check:
const schema = getToolSchema(toolName, isBtpMode(config));
if (schema) {
  const result = schema.safeParse(args);
  if (!result.success) {
    return errorResult(formatZodError(result.error, toolName));
  }
  args = result.data; // Use parsed (typed, defaulted) args from here on
}
```

### Phase 3: Zod Error Formatting

**New file:** `src/handlers/zod-errors.ts`

Format Zod validation errors into LLM-friendly messages that integrate with the existing error style:

```typescript
import type { ZodError } from 'zod';

export function formatZodError(error: ZodError, toolName: string): string {
  const issues = error.issues.map(issue => {
    const path = issue.path.length > 0 ? `"${issue.path.join('.')}"` : 'input';
    switch (issue.code) {
      case 'invalid_enum_value':
        return `${path}: got "${issue.received}", expected one of: ${issue.options.join(', ')}`;
      case 'invalid_type':
        return `${path}: expected ${issue.expected}, got ${issue.received}`;
      case 'unrecognized_keys':
        return `Unknown parameter(s): ${issue.keys.join(', ')}`;
      default:
        return `${path}: ${issue.message}`;
    }
  });

  return [
    `Invalid arguments for ${toolName}:`,
    ...issues.map(i => `  - ${i}`),
    '',
    'Hint: Check the tool schema for valid parameter types and values.',
  ].join('\n');
}
```

### Phase 4: Derive JSON Schema from Zod (Replace Hand-Written Schemas)

**File:** `src/handlers/tools.ts`

Replace the hand-written `inputSchema` objects with Zod-derived JSON Schema:

```typescript
import { z } from 'zod';
import { SAPReadSchema, SAPReadSchemaBtp } from './schemas.js';

// Before (hand-written):
inputSchema: {
  type: 'object',
  properties: {
    type: { type: 'string', enum: SAPREAD_TYPES_ONPREM },
    name: { type: 'string' },
    // ...
  },
  required: ['type'],
}

// After (Zod-derived):
inputSchema: z.toJSONSchema(isBtp ? SAPReadSchemaBtp : SAPReadSchema)
```

Zod v4's built-in `z.toJSONSchema()` produces standard JSON Schema — no extra library needed.

### Phase 5: Remove Manual Coercion from Handlers

**File:** `src/handlers/intent.ts`

Since Zod `.safeParse()` already validates and transforms the input, remove the manual `String()` / `Number()` / `Boolean()` coercion from each handler:

```typescript
// Before:
async function handleSAPRead(client: AdtClient, args: Record<string, unknown>) {
  const type = String(args.type ?? '');
  const name = String(args.name ?? '');
  const maxRows = Number(args.maxRows ?? 100);
  // ...
}

// After:
async function handleSAPRead(client: AdtClient, args: z.infer<typeof SAPReadSchema>) {
  const { type, name, maxRows } = args;
  // type is already a valid enum, name is string|undefined, maxRows defaults to 100
}
```

Also remove ad-hoc required-field checks that Zod now handles:
```typescript
// Remove these — Zod enforces them:
if (!source) return errorResult('"source" is required for lint action.');
if (!id) return errorResult('Transport ID is required for "get" action.');
```

### Phase 6: Handle BTP/Feature-Conditional Schemas

The current system has conditional schemas based on:
- **BTP vs on-prem:** Different enum values for `type` fields
- **Feature probing:** `searchType="source_code"` hidden when text search unavailable

Approach:
- BTP variants: Create separate Zod schemas (e.g., `SAPReadSchemaBtp`) and select at validation time based on `config.systemType` / cached features.
- Feature-conditional fields: Keep using the current approach of building schemas dynamically in `getTools()`, but derive the JSON Schema from the appropriate Zod variant.

```typescript
export function getToolSchema(toolName: string, config: ServerConfig, features?: ResolvedFeatures) {
  if (toolName === 'SAPRead') {
    return isBtpMode(config) ? SAPReadSchemaBtp : SAPReadSchema;
  }
  if (toolName === 'SAPSearch' && features?.textSearch === false) {
    return SAPSearchSchemaNoSource; // variant without source_code enum
  }
  // ...
}
```

### Phase 7: Hyperfocused Mode

**File:** `src/handlers/hyperfocused.ts`

The hyperfocused `SAP` tool expands args into a tool name + args, then calls `handleToolCall` recursively. Validation happens naturally on the recursive call. The hyperfocused schema itself is simple:

```typescript
export const SAPHyperfocusedSchema = z.object({
  action: z.string(), // validated by resolveHyperfocusedTool()
  type: z.string().optional(),
  name: z.string().optional(),
  params: z.record(z.unknown()).optional(),
});
```

### Phase 8: Unit Tests

**New file:** `tests/unit/handlers/schemas.test.ts`

Test that:
1. Each Zod schema accepts valid input and rejects invalid input
2. `z.toJSONSchema()` output matches expected JSON Schema structure
3. Default values are applied correctly
4. BTP variants exclude the right types
5. `formatZodError()` produces readable messages

**Update existing tests:** Handler tests that mock `args` should continue to work since Zod-parsed args have the same shape, just typed.

## Migration Order

The phases can be implemented incrementally — each phase is independently valuable:

| Phase | Value | Risk | Effort |
|-------|-------|------|--------|
| 1. Upgrade Zod + define schemas | Foundation | Low (no runtime change) | Medium |
| 2. Add validation to handleToolCall | Runtime safety | Low (validation only, existing logic untouched) | Small |
| 3. Zod error formatting | Better LLM feedback | None | Small |
| 4. Derive JSON Schema from Zod | Single source of truth | Medium (schema drift if conversion differs) | Medium |
| 5. Remove manual coercion | Code cleanup | Medium (behavior changes if schemas are wrong) | Medium |
| 6. Conditional schemas | Feature parity | Low | Small |
| 7. Hyperfocused mode | Completeness | Low | Small |
| 8. Unit tests | Confidence | None | Medium |

**Recommended approach:** Implement phases 1-3 first as a single PR (add validation without changing existing behavior). Then phases 4-8 in a follow-up PR (refactor to use Zod as the single source of truth).

## Zod v4 Considerations

Key changes from v3 to v4 relevant to this project:
- `z.toJSONSchema()` is built-in (no need for `zod-to-json-schema` library)
- `z.enum()` works with native TypeScript enums (replaces `z.nativeEnum()`)
- String format validators moved to top-level (`z.email()` instead of `z.string().email()`) — not relevant here
- `.describe()` deprecated in favor of `.meta()` — use `.meta({ description: '...' })` for JSON Schema descriptions
- Error structure: `message` param renamed to `error` — relevant for custom error messages

## Risk Assessment

- **Low risk:** Zod validation is additive — it runs before existing handler logic and only rejects clearly invalid input.
- **Behavior change:** Arguments that previously passed silently (e.g., `type: "PROGG"` → `String("PROGG")` → SAP 404) will now fail at the validation boundary with a clear error. This is strictly better for the LLM client.
- **Coercion edge case:** MCP clients may send numbers as strings (`"100"` instead of `100`). Zod's `z.coerce.number()` handles this, but we should use it for numeric fields to avoid breaking existing clients.
- **Bundle size:** Zod v4 core is ~13KB gzipped. Minimal impact for a server-side tool.
