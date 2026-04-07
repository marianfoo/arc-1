/**
 * Intent-based tool handler for ARC-1.
 *
 * Routes MCP tool calls to the appropriate ADT client methods.
 * Each of the 11 tools (SAPRead, SAPSearch, etc.) dispatches
 * based on its `type` or `action` parameter.
 *
 * Error handling: all errors are caught and returned as MCP error
 * responses. Internal details (stack traces, SAP XML) are NOT
 * leaked to the LLM — only user-friendly error messages.
 */

import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { AdtClient } from '../adt/client.js';
import {
  findDefinition,
  findReferences,
  findWhereUsed,
  getCompletion,
  type ReferenceResult,
  type WhereUsedResult,
} from '../adt/codeintel.js';
import { createObject, deleteObject, lockObject, safeUpdateSource, unlockObject } from '../adt/crud.js';
import { activate, activateBatch, runAtcCheck, runUnitTests, syntaxCheck } from '../adt/devtools.js';
import {
  getDump,
  getTraceDbAccesses,
  getTraceHitlist,
  getTraceStatements,
  listDumps,
  listTraces,
} from '../adt/diagnostics.js';
import { AdtApiError, AdtNetworkError, AdtSafetyError, isNotFoundError } from '../adt/errors.js';
import { classifyTextSearchError, mapSapReleaseToAbaplintVersion, probeFeatures } from '../adt/features.js';
import { isOperationAllowed, OperationType } from '../adt/safety.js';
import { createTransport, getTransport, listTransports, releaseTransport } from '../adt/transport.js';
import type { ResolvedFeatures } from '../adt/types.js';
import type { CachingLayer } from '../cache/caching-layer.js';
import { extractCdsElements } from '../context/cds-deps.js';
import { compressCdsContext, compressContext } from '../context/compressor.js';
import { extractMethod, formatMethodListing, listMethods, spliceMethod } from '../context/method-surgery.js';
import {
  buildLintConfig,
  type LintConfigOptions,
  listRulesFromConfig,
  type RuleOverrides,
} from '../lint/config-builder.js';
import { detectFilename, lintAbapSource, lintAndFix, validateBeforeWrite } from '../lint/lint.js';
import { sanitizeArgs } from '../server/audit.js';
import { generateRequestId, requestContext } from '../server/context.js';
import { logger } from '../server/logger.js';
import type { ServerConfig } from '../server/types.js';
import { expandHyperfocusedArgs, getHyperfocusedScope } from './hyperfocused.js';

/** MCP tool call result */
export interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

/**
 * Scope required for each tool.
 *
 * Scope enforcement is ADDITIVE to the safety system:
 * - Safety system (readOnly, allowedOps, etc.) gates operations at the ADT client level
 * - Scopes gate operations at the MCP tool level (only enforced when authInfo is present)
 * - Both must pass for an operation to succeed
 *
 * A user with `write` scope but `readOnly=true` in config still can't write.
 */
export const TOOL_SCOPES: Record<string, string> = {
  SAPRead: 'read',
  SAPSearch: 'read',
  SAPQuery: 'sql',
  SAPNavigate: 'read',
  SAPContext: 'read',
  SAPLint: 'read',
  SAPDiagnose: 'read',
  SAPWrite: 'write',
  SAPActivate: 'write',
  SAPManage: 'write',
  SAPTransport: 'write',
};

/**
 * Check if authInfo has the required scope, respecting implied scopes:
 * - `write` implies `read`
 * - `sql` implies `data`
 */
export function hasRequiredScope(authInfo: AuthInfo, requiredScope: string): boolean {
  const scopes = authInfo.scopes;
  if (scopes.includes(requiredScope)) return true;

  // Implied scopes
  if (requiredScope === 'read' && scopes.includes('write')) return true;
  if (requiredScope === 'data' && scopes.includes('sql')) return true;

  return false;
}

function textResult(text: string): ToolResult {
  return { content: [{ type: 'text', text }] };
}

function errorResult(message: string): ToolResult {
  return { content: [{ type: 'text', text: message }], isError: true };
}

/** Classify error type for audit logging */
/** Format error messages with LLM-friendly remediation hints */
function formatErrorForLLM(err: unknown, message: string, _tool: string, args: Record<string, unknown>): string {
  if (err instanceof AdtApiError) {
    if (err.isNotFound) {
      const name = String(args.name ?? '');
      const type = String(args.type ?? '');
      return `${message}\n\nHint: Object "${name}" (type ${type}) was not found. Use SAPSearch with query "${name}" to verify the name exists and check the correct type.`;
    }
    if (err.isUnauthorized || err.isForbidden) {
      return `${message}\n\nHint: Authorization error. Check SAP_CLIENT (default: '100'), SAP_USER, and SAP_PASSWORD. The configured SAP user may lack permissions for this object.`;
    }
  }

  if (err instanceof AdtNetworkError) {
    return `${message}\n\nHint: Cannot reach the SAP system. This is a connectivity issue, not a usage error.`;
  }

  return message;
}

function classifyError(err: unknown): string {
  if (err instanceof AdtApiError) return 'AdtApiError';
  if (err instanceof AdtNetworkError) return 'AdtNetworkError';
  if (err instanceof AdtSafetyError) return 'AdtSafetyError';
  if (err instanceof Error) return err.constructor.name;
  return 'Unknown';
}

/**
 * Handle an MCP tool call.
 *
 * @param authInfo - Authenticated user context from MCP SDK (XSUAA/OIDC/API key).
 *   When present, scope enforcement is active. When absent (stdio, no auth),
 *   all tools are allowed (backward compatibility).
 * @param server - MCP Server instance for elicitation support.
 */
export async function handleToolCall(
  client: AdtClient,
  config: ServerConfig,
  toolName: string,
  args: Record<string, unknown>,
  authInfo?: AuthInfo,
  _server?: Server,
  cachingLayer?: CachingLayer,
  isPerUserClient?: boolean,
): Promise<ToolResult> {
  const reqId = generateRequestId();
  const start = Date.now();

  // Build user context for audit logging
  const user = authInfo?.extra?.userName as string | undefined;
  const clientId = authInfo?.clientId;

  // Emit tool_call_start audit event
  logger.emitAudit({
    timestamp: new Date().toISOString(),
    level: 'info',
    event: 'tool_call_start',
    requestId: reqId,
    user,
    clientId,
    tool: toolName,
    args: sanitizeArgs(args),
  });

  // Scope enforcement — only when authInfo is present (XSUAA/OIDC mode)
  if (authInfo) {
    const requiredScope = TOOL_SCOPES[toolName];
    if (requiredScope && !hasRequiredScope(authInfo, requiredScope)) {
      logger.emitAudit({
        timestamp: new Date().toISOString(),
        level: 'warn',
        event: 'auth_scope_denied',
        requestId: reqId,
        user,
        clientId,
        tool: toolName,
        requiredScope,
        availableScopes: authInfo.scopes,
      });
      return errorResult(
        `Insufficient scope: '${requiredScope}' required for ${toolName}. Your scopes: [${authInfo.scopes.join(', ')}]`,
      );
    }
  }

  // Run within request context so HTTP-level logs get the requestId
  return requestContext.run({ requestId: reqId, user, tool: toolName }, async () => {
    try {
      let result: ToolResult;

      switch (toolName) {
        case 'SAPRead':
          result = await handleSAPRead(client, args, cachingLayer);
          break;
        case 'SAPSearch':
          result = await handleSAPSearch(client, args);
          break;
        case 'SAPQuery':
          result = await handleSAPQuery(client, args);
          break;
        case 'SAPWrite':
          result = await handleSAPWrite(client, args, config, cachingLayer);
          break;
        case 'SAPActivate':
          result = await handleSAPActivate(client, args);
          break;
        case 'SAPNavigate':
          result = await handleSAPNavigate(client, args);
          break;
        case 'SAPLint':
          result = await handleSAPLint(client, args, config);
          break;
        case 'SAPDiagnose':
          result = await handleSAPDiagnose(client, args);
          break;
        case 'SAPTransport':
          result = await handleSAPTransport(client, args);
          break;
        case 'SAPContext':
          result = await handleSAPContext(client, args, cachingLayer);
          break;
        case 'SAPManage':
          result = await handleSAPManage(client, config, args, cachingLayer, isPerUserClient);
          break;
        case 'SAP': {
          // Hyperfocused mode: route to the appropriate handler
          const expanded = expandHyperfocusedArgs(args);
          if ('error' in expanded) {
            result = errorResult(expanded.error);
            break;
          }
          // Check scope for the delegated action
          if (authInfo) {
            const requiredScope = getHyperfocusedScope(String(args.action ?? ''));
            if (!hasRequiredScope(authInfo, requiredScope)) {
              result = errorResult(
                `Insufficient scope: '${requiredScope}' required for SAP(action="${args.action}"). Your scopes: [${authInfo.scopes.join(', ')}]`,
              );
              break;
            }
          }
          // Delegate to the real handler (recursive call, but with the mapped tool name)
          result = await handleToolCall(
            client,
            config,
            expanded.toolName,
            expanded.expandedArgs,
            authInfo,
            _server,
            cachingLayer,
            isPerUserClient,
          );
          break;
        }
        default:
          result = errorResult(`Unknown tool: ${toolName}`);
      }

      const durationMs = Date.now() - start;
      const fullText = result.content.map((c) => c.text).join('');
      const resultSize = fullText.length;
      const resultPreview = fullText.length > 500 ? `${fullText.slice(0, 500)}...` : fullText;

      logger.emitAudit({
        timestamp: new Date().toISOString(),
        level: result.isError ? 'error' : 'info',
        event: 'tool_call_end',
        requestId: reqId,
        user,
        clientId,
        tool: toolName,
        durationMs,
        status: result.isError ? 'error' : 'success',
        errorMessage: result.isError ? result.content[0]?.text : undefined,
        errorClass: result.isError ? 'result-path' : undefined,
        resultSize,
        resultPreview,
      });

      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const durationMs = Date.now() - start;

      logger.emitAudit({
        timestamp: new Date().toISOString(),
        level: 'error',
        event: 'tool_call_end',
        requestId: reqId,
        user,
        clientId,
        tool: toolName,
        durationMs,
        status: 'error',
        errorClass: classifyError(err),
        errorMessage: message,
      });

      return errorResult(formatErrorForLLM(err, message, toolName, args));
    }
  });
}

// ─── Individual Tool Handlers ────────────────────────────────────────

/** Check if the connected system is BTP ABAP Environment */
function isBtpSystem(): boolean {
  return cachedFeatures?.systemType === 'btp';
}

/** BTP-specific error messages for unavailable operations */
const BTP_HINTS: Record<string, string> = {
  PROG: 'Executable programs (reports) are not available on BTP ABAP Environment. Use CLAS with IF_OO_ADT_CLASSRUN for console applications.',
  INCL: 'Includes are not available on BTP ABAP Environment. Use classes and interfaces instead — INCLUDE is forbidden in ABAP Cloud.',
  VIEW: 'Classic DDIC views are not available on BTP ABAP Environment. Use DDLS (CDS views) instead.',
  TEXT_ELEMENTS:
    'Text elements are not available on BTP ABAP Environment (no classic programs). Use message classes or constant classes instead.',
  VARIANTS: 'Variants are not available on BTP ABAP Environment (no classic programs).',
  SOBJ: 'BOR business objects (SOBJ) are not available on BTP ABAP Environment. Use RAP behavior definitions (BDEF) instead.',
  TRAN: 'Transaction codes (TRAN) are not available on BTP ABAP Environment. Use SAPSearch to find apps and services instead.',
};

async function handleSAPRead(
  client: AdtClient,
  args: Record<string, unknown>,
  cachingLayer?: CachingLayer,
): Promise<ToolResult> {
  const type = String(args.type ?? '');
  const name = String(args.name ?? '');

  // BTP: return helpful error for unavailable types
  if (isBtpSystem() && BTP_HINTS[type]) {
    return errorResult(BTP_HINTS[type]);
  }

  // Helper: get source with cache support
  const cachedGet = async (objType: string, objName: string, fetcher: () => Promise<string>): Promise<string> => {
    if (!cachingLayer) return fetcher();
    const { source } = await cachingLayer.getSource(objType, objName, fetcher);
    return source;
  };

  switch (type) {
    case 'PROG':
      return textResult(await cachedGet('PROG', name, () => client.getProgram(name)));
    case 'CLAS': {
      const methodParam = args.method as string | undefined;
      if (methodParam && !args.include) {
        // Method-level read — fetch full source then extract
        const fullSource = await cachedGet('CLAS', name, () => client.getClass(name));
        const abaplintVer = cachedFeatures?.abapRelease
          ? mapSapReleaseToAbaplintVersion(cachedFeatures.abapRelease)
          : undefined;
        if (methodParam === '*') {
          const listing = listMethods(fullSource, name, abaplintVer);
          return textResult(formatMethodListing(listing));
        }
        const extracted = extractMethod(fullSource, name, methodParam, abaplintVer);
        if (!extracted.success) {
          return errorResult(extracted.error ?? `Method "${methodParam}" not found in ${name}.`);
        }
        return textResult(extracted.methodSource);
      }
      // Only cache the full merged source (no include param), not individual includes
      if (!args.include) {
        return textResult(await cachedGet('CLAS', name, () => client.getClass(name)));
      }
      return textResult(await client.getClass(name, args.include as string | undefined));
    }
    case 'INTF':
      return textResult(await cachedGet('INTF', name, () => client.getInterface(name)));
    case 'FUNC': {
      let group = String(args.group ?? '');
      if (!group) {
        // Use cached func group resolution if available
        const resolved = cachingLayer
          ? await cachingLayer.resolveFuncGroup(client, name)
          : await client.resolveFunctionGroup(name);
        if (!resolved) {
          return errorResult(
            `Cannot resolve function group for "${name}". Provide the group parameter explicitly, or use SAPSearch("${name}") to find the function group.`,
          );
        }
        group = resolved;
      }
      return textResult(await cachedGet('FUNC', name, () => client.getFunction(group, name)));
    }
    case 'FUGR': {
      const expand = Boolean(args.expand_includes);
      if (expand) {
        const source = await client.getFunctionGroupSource(name);
        // Match INCLUDE statements but skip ABAP comment lines (starting with *)
        const includePattern = /^[^*\n]*\bINCLUDE\s+(\S+)\s*\./gim;
        const parts: string[] = [`=== FUGR ${name} (main) ===\n${source}`];
        let m: RegExpExecArray | null;
        while ((m = includePattern.exec(source)) !== null) {
          const inclName = m[1]!;
          try {
            const inclSource = await client.getInclude(inclName);
            parts.push(`\n=== ${inclName} ===\n${inclSource}`);
          } catch {
            parts.push(`\n=== ${inclName} ===\n[Could not read include "${inclName}"]`);
          }
        }
        return textResult(parts.join('\n'));
      }
      const fg = await client.getFunctionGroup(name);
      return textResult(JSON.stringify(fg, null, 2));
    }
    case 'INCL':
      return textResult(await cachedGet('INCL', name, () => client.getInclude(name)));
    case 'DDLS': {
      const ddlSource = await cachedGet('DDLS', name, () => client.getDdls(name));
      if ((args.include as string | undefined)?.toLowerCase() === 'elements') {
        return textResult(extractCdsElements(ddlSource, name));
      }
      return textResult(ddlSource);
    }
    case 'BDEF':
      return textResult(await cachedGet('BDEF', name, () => client.getBdef(name)));
    case 'SRVD':
      return textResult(await cachedGet('SRVD', name, () => client.getSrvd(name)));
    case 'DDLX': {
      try {
        return textResult(await cachedGet('DDLX', name, () => client.getDdlx(name)));
      } catch (err) {
        if (isNotFoundError(err)) {
          return textResult(
            `No metadata extension (DDLX) found for "${name}". This means no @UI annotations are defined via DDLX for this view. The view may use inline annotations in the DDLS source, or the Fiori app may configure columns via manifest.json / app descriptor.`,
          );
        }
        throw err;
      }
    }
    case 'SRVB':
      return textResult(await cachedGet('SRVB', name, () => client.getSrvb(name)));
    case 'TABL':
      return textResult(await cachedGet('TABL', name, () => client.getTable(name)));
    case 'VIEW':
      return textResult(await cachedGet('VIEW', name, () => client.getView(name)));
    case 'STRU':
      return textResult(await cachedGet('STRU', name, () => client.getStructure(name)));
    case 'DOMA': {
      const domain = await client.getDomain(name);
      return textResult(JSON.stringify(domain, null, 2));
    }
    case 'DTEL': {
      const dtel = await client.getDataElement(name);
      return textResult(JSON.stringify(dtel, null, 2));
    }
    case 'TRAN': {
      const tran = await client.getTransaction(name);
      // Enrich with program name via SQL — only if free SQL is allowed by safety config
      if (isOperationAllowed(client.safety, OperationType.FreeSQL)) {
        try {
          const safeName = name.toUpperCase().replace(/[^A-Z0-9_/]/g, '');
          const data = await client.runQuery(`SELECT TCODE, PGMNA FROM TSTC WHERE TCODE = '${safeName}'`, 1);
          if (data.rows.length > 0) {
            tran.program = String(data.rows[0]!.PGMNA ?? '').trim();
          }
        } catch {
          // SQL failed (e.g., TSTC not found on BTP) — still return metadata
        }
      }
      return textResult(JSON.stringify(tran, null, 2));
    }
    case 'TABLE_CONTENTS': {
      const maxRows = Number(args.maxRows ?? 100);
      const data = await client.getTableContents(name, maxRows, args.sqlFilter as string | undefined);
      return textResult(JSON.stringify(data, null, 2));
    }
    case 'SOBJ': {
      const method = String(args.method ?? '');
      // Sanitize inputs to prevent SQL injection — BOR names are alphanumeric + underscore only
      const safeName = name.toUpperCase().replace(/[^A-Z0-9_/]/g, '');
      const safeMethod = method.toUpperCase().replace(/[^A-Z0-9_]/g, '');
      if (safeName !== name.toUpperCase().replace(/\s/g, '')) {
        return errorResult(
          `Invalid BOR object name: "${name}". Only alphanumeric characters, underscores, and slashes are allowed.`,
        );
      }
      if (safeMethod) {
        // Read specific BOR method implementation via SWOTLV lookup
        const data = await client.runQuery(
          `SELECT PROGNAME, FORMNAME FROM SWOTLV WHERE LOBJTYPE = '${safeName}' AND VERB = '${safeMethod}'`,
          1,
        );
        if (data.rows.length > 0) {
          const prog = String(data.rows[0]!.PROGNAME ?? '').trim();
          if (!prog) {
            return errorResult(`BOR method "${method}" on "${name}" has no program assigned.`);
          }
          const source = await client.getProgram(prog);
          return textResult(
            `=== BOR ${name}.${method} (program: ${prog}, form: ${String(data.rows[0]!.FORMNAME ?? '').trim()}) ===\n${source}`,
          );
        }
        return errorResult(
          `BOR method "${method}" not found on object type "${name}". Use SAPRead(type="SOBJ", name="${name}") without method to list all methods.`,
        );
      }
      // List all methods for this BOR object
      const methods = await client.runQuery(
        `SELECT VERB, PROGNAME, FORMNAME, DESCRIPT FROM SWOTLV WHERE LOBJTYPE = '${safeName}'`,
        100,
      );
      if (methods.rows.length === 0) {
        return errorResult(`No BOR methods found for object type "${name}". Verify the BOR object type name.`);
      }
      return textResult(JSON.stringify(methods, null, 2));
    }
    case 'DEVC': {
      const contents = await client.getPackageContents(name);
      return textResult(JSON.stringify(contents, null, 2));
    }
    case 'SYSTEM':
      return textResult(await client.getSystemInfo());
    case 'COMPONENTS': {
      const components = await client.getInstalledComponents();
      return textResult(JSON.stringify(components, null, 2));
    }
    case 'MESSAGES':
      return textResult(await client.getMessages(name));
    case 'TEXT_ELEMENTS':
      return textResult(await client.getTextElements(name));
    case 'VARIANTS':
      return textResult(await client.getVariants(name));
    default:
      return errorResult(
        `Unknown SAPRead type: "${type}". Supported types: PROG, CLAS, INTF, FUNC, FUGR, INCL, DDLS, DDLX, BDEF, SRVD, SRVB, TABL, VIEW, STRU, DOMA, DTEL, TRAN, TABLE_CONTENTS, DEVC, SOBJ, SYSTEM, COMPONENTS, MESSAGES, TEXT_ELEMENTS, VARIANTS. ` +
          'Tip: Map objectType from SAPSearch results by dropping the slash suffix (e.g., DDLS/DF → type="DDLS", CLAS/OC → type="CLAS", PROG/P → type="PROG"). ' +
          'Do not pass a URI — use the "type" and "name" parameters instead.',
      );
  }
}

async function handleSAPSearch(client: AdtClient, args: Record<string, unknown>): Promise<ToolResult> {
  const query = String(args.query ?? '');
  const maxResults = Number(args.maxResults ?? 100);
  const searchType = String(args.searchType ?? 'object');

  if (searchType === 'source_code') {
    // If probe already determined textSearch is unavailable, return the precise reason
    if (cachedFeatures?.textSearch && !cachedFeatures.textSearch.available) {
      return errorResult(
        `Source code search is not available on this SAP system. ${cachedFeatures.textSearch.reason ?? ''}` +
          `\nUse SAPSearch with searchType="object" to search by object name instead, or use SAPQuery to search metadata tables.`,
      );
    }
    const objectType = args.objectType as string | undefined;
    const packageName = args.packageName as string | undefined;
    try {
      const results = await client.searchSource(query, maxResults, objectType, packageName);
      return textResult(JSON.stringify(results, null, 2));
    } catch (err) {
      if (err instanceof AdtApiError) {
        const permanentCodes = [401, 403, 404, 501];
        if (permanentCodes.includes(err.statusCode)) {
          const classified = classifyTextSearchError(err.statusCode);
          return errorResult(
            `Source code search is not available on this SAP system. ${classified.reason ?? ''}` +
              `\nUse SAPSearch with searchType="object" to search by object name instead, or use SAPQuery to search metadata tables.`,
          );
        }
      }
      throw err;
    }
  }

  const results = await client.searchObject(query, maxResults);
  return textResult(JSON.stringify(results, null, 2));
}

async function handleSAPQuery(client: AdtClient, args: Record<string, unknown>): Promise<ToolResult> {
  const sql = String(args.sql ?? '');
  const maxRows = Number(args.maxRows ?? 100);

  try {
    const data = await client.runQuery(sql, maxRows);
    return textResult(JSON.stringify(data, null, 2));
  } catch (err) {
    if (err instanceof AdtApiError && err.isNotFound) {
      // Try to extract table name from SQL and suggest similar names
      const tableMatch = sql.match(/FROM\s+["']?([A-Za-z0-9_/$]+)["']?/i);
      if (tableMatch) {
        const tableName = tableMatch[1]!;

        try {
          const suggestions = await client.searchObject(`${tableName}*`, 10);
          const tableNames = suggestions
            .filter(
              (s) =>
                s.objectType.startsWith('TABL') || s.objectType.startsWith('VIEW') || s.objectType.startsWith('DDLS'),
            )
            .map((s) => s.objectName)
            .slice(0, 5);
          if (tableNames.length > 0) {
            return errorResult(
              `Table "${tableName}" not found.\n\nDid you mean: ${tableNames.join(', ')}?\n\nUse SAPSearch("${tableName}*") for more results, or discover tables with: SAPQuery(sql="SELECT tabname FROM dd02l WHERE tabname LIKE '%${tableName}%'")`,
            );
          }
        } catch {
          // Search failed — fall through to original error
        }
      }
    }
    // JOIN-aware error: ADT freestyle SQL parser has known edge cases with JOINs (SAP Note 3605050)
    if (err instanceof AdtApiError && err.statusCode === 400 && /\bJOIN\b/i.test(sql)) {
      return errorResult(
        `${err.message}\n\nMulti-table JOIN query failed. The ADT freestyle SQL endpoint has known parser edge cases with JOINs (SAP Note 3605050). Try splitting into separate single-table queries.`,
      );
    }
    throw err;
  }
}

// _client unused: SAPLint runs offline via @abaplint/core (no SAP round-trip).
// Signature matches other handlers for consistency with handleToolCall dispatch.
async function handleSAPLint(
  _client: AdtClient,
  args: Record<string, unknown>,
  config: ServerConfig,
): Promise<ToolResult> {
  const action = String(args.action ?? '');
  const ruleOverrides = args.rules as RuleOverrides | undefined;
  const configOptions = buildLintConfigOptions(config, ruleOverrides);

  switch (action) {
    case 'lint': {
      const source = String(args.source ?? '');
      if (!source) return errorResult('"source" is required for lint action.');
      const name = String(args.name ?? 'UNKNOWN');
      const filename = detectFilename(source, name);
      const lintConfig = buildLintConfig(configOptions);
      const issues = lintAbapSource(source, filename, lintConfig);
      return textResult(JSON.stringify(issues, null, 2));
    }
    case 'lint_and_fix': {
      const source = String(args.source ?? '');
      if (!source) return errorResult('"source" is required for lint_and_fix action.');
      const name = String(args.name ?? 'UNKNOWN');
      const filename = detectFilename(source, name);
      const lintConfig = buildLintConfig(configOptions);
      const result = lintAndFix(source, filename, lintConfig);
      return textResult(JSON.stringify(result, null, 2));
    }
    case 'list_rules': {
      const lintConfig = buildLintConfig(configOptions);
      const rules = listRulesFromConfig(lintConfig);
      const enabled = rules.filter((r) => r.enabled);
      const disabled = rules.filter((r) => !r.enabled);
      return textResult(
        JSON.stringify(
          {
            preset: configOptions.systemType === 'btp' ? 'cloud' : 'onprem',
            abapVersion: cachedFeatures?.abapRelease ?? 'unknown',
            enabledRules: enabled.length,
            disabledRules: disabled.length,
            rules: enabled,
            disabledRuleNames: disabled.map((r) => r.rule),
          },
          null,
          2,
        ),
      );
    }
    default:
      return errorResult(
        `Unknown SAPLint action: "${action}". Supported: lint, lint_and_fix, list_rules. For atc/syntax/unittest, use SAPDiagnose instead.`,
      );
  }
}

/**
 * Build LintConfigOptions from server config and cached features.
 *
 * Uses cachedFeatures (from SAPManage probe) when available, but falls back
 * to config.systemType so that --system-type btp works even before the first
 * probe. Without this fallback, cloud lint rules wouldn't apply until a probe
 * populates cachedFeatures.
 */
function buildLintConfigOptions(config: ServerConfig, ruleOverrides?: RuleOverrides): LintConfigOptions {
  // Probe-detected system type is most accurate; fall back to CLI config
  const systemType = cachedFeatures?.systemType ?? (config.systemType !== 'auto' ? config.systemType : undefined);
  return {
    systemType,
    abapRelease: cachedFeatures?.abapRelease,
    configFile: config.abaplintConfig,
    ruleOverrides,
  };
}

// ─── Object Creation XML ─────────────────────────────────────────────

/**
 * Build the type-specific XML body for ADT object creation.
 *
 * SAP ADT requires each object type to have its own root XML element.
 * Using a generic body (e.g. adtcore:objectReferences) returns 400:
 *   "System expected the element '{http://www.sap.com/adt/programs/programs}abapProgram'"
 */
function buildCreateXml(type: string, name: string, pkg: string, description: string): string {
  switch (type) {
    case 'PROG':
      return `<?xml version="1.0" encoding="UTF-8"?>
<program:abapProgram xmlns:program="http://www.sap.com/adt/programs/programs"
                     xmlns:adtcore="http://www.sap.com/adt/core"
                     adtcore:description="${escapeXml(description)}"
                     adtcore:name="${escapeXml(name)}"
                     adtcore:type="PROG/P"
                     adtcore:masterLanguage="EN"
                     adtcore:masterSystem="H00"
                     adtcore:responsible="DEVELOPER">
  <adtcore:packageRef adtcore:name="${escapeXml(pkg)}"/>
</program:abapProgram>`;
    case 'CLAS':
      return `<?xml version="1.0" encoding="UTF-8"?>
<class:abapClass xmlns:class="http://www.sap.com/adt/oo/classes"
                 xmlns:adtcore="http://www.sap.com/adt/core"
                 adtcore:description="${escapeXml(description)}"
                 adtcore:name="${escapeXml(name)}"
                 adtcore:type="CLAS/OC"
                 adtcore:masterLanguage="EN"
                 adtcore:masterSystem="H00"
                 adtcore:responsible="DEVELOPER">
  <adtcore:packageRef adtcore:name="${escapeXml(pkg)}"/>
</class:abapClass>`;
    case 'INTF':
      return `<?xml version="1.0" encoding="UTF-8"?>
<intf:abapInterface xmlns:intf="http://www.sap.com/adt/oo/interfaces"
                    xmlns:adtcore="http://www.sap.com/adt/core"
                    adtcore:description="${escapeXml(description)}"
                    adtcore:name="${escapeXml(name)}"
                    adtcore:type="INTF/OI"
                    adtcore:masterLanguage="EN"
                    adtcore:masterSystem="H00"
                    adtcore:responsible="DEVELOPER">
  <adtcore:packageRef adtcore:name="${escapeXml(pkg)}"/>
</intf:abapInterface>`;
    case 'INCL':
      return `<?xml version="1.0" encoding="UTF-8"?>
<include:abapInclude xmlns:include="http://www.sap.com/adt/programs/includes"
                     xmlns:adtcore="http://www.sap.com/adt/core"
                     adtcore:description="${escapeXml(description)}"
                     adtcore:name="${escapeXml(name)}"
                     adtcore:type="PROG/I"
                     adtcore:masterLanguage="EN"
                     adtcore:masterSystem="H00"
                     adtcore:responsible="DEVELOPER">
  <adtcore:packageRef adtcore:name="${escapeXml(pkg)}"/>
</include:abapInclude>`;
    default:
      // Fallback — generic objectReferences (may not work for all types)
      return `<?xml version="1.0" encoding="UTF-8"?>
<adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">
  <adtcore:objectReference adtcore:uri="/sap/bc/adt/programs/programs/${escapeXml(name)}" adtcore:type="${escapeXml(type)}" adtcore:name="${escapeXml(name)}" adtcore:packageName="${escapeXml(pkg)}"/>
</adtcore:objectReferences>`;
  }
}

/** Escape special characters for XML attribute values */
function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ─── Object URL Mapping ──────────────────────────────────────────────

/** Map object type + name to the ADT object URL used by CRUD/DevTools/etc. */
function objectUrlForType(type: string, name: string): string {
  const encoded = encodeURIComponent(name);
  switch (type) {
    case 'PROG':
      return `/sap/bc/adt/programs/programs/${encoded}`;
    case 'CLAS':
      return `/sap/bc/adt/oo/classes/${encoded}`;
    case 'INTF':
      return `/sap/bc/adt/oo/interfaces/${encoded}`;
    case 'FUNC':
      return `/sap/bc/adt/functions/groups/${encoded}`;
    case 'INCL':
      return `/sap/bc/adt/programs/includes/${encoded}`;
    case 'FUGR':
      return `/sap/bc/adt/functions/groups/${encoded}`;
    case 'DDLS':
      return `/sap/bc/adt/ddic/ddl/sources/${encoded}`;
    case 'BDEF':
      return `/sap/bc/adt/bo/behaviordefinitions/${encoded}`;
    case 'SRVD':
      return `/sap/bc/adt/ddic/srvd/sources/${encoded}`;
    case 'DDLX':
      return `/sap/bc/adt/ddic/ddlx/sources/${encoded}`;
    case 'SRVB':
      return `/sap/bc/adt/businessservices/bindings/${encoded}`;
    case 'TABL':
      return `/sap/bc/adt/ddic/tables/${encoded}`;
    case 'STRU':
      return `/sap/bc/adt/ddic/structures/${encoded}`;
    case 'DOMA':
      return `/sap/bc/adt/ddic/domains/${encoded}`;
    case 'DTEL':
      return `/sap/bc/adt/ddic/dataelements/${encoded}`;
    case 'TRAN':
      return `/sap/bc/adt/vit/wb/object_type/trant/object_name/${encoded}`;
    default:
      return `/sap/bc/adt/programs/programs/${encoded}`;
  }
}

/** Get the source URL for an object (appends /source/main) */
function sourceUrlForType(type: string, name: string): string {
  return `${objectUrlForType(type, name)}/source/main`;
}

// ─── SAPWrite Handler ────────────────────────────────────────────────

async function handleSAPWrite(
  client: AdtClient,
  args: Record<string, unknown>,
  config: ServerConfig,
  cachingLayer?: CachingLayer,
): Promise<ToolResult> {
  const action = String(args.action ?? '');
  const type = String(args.type ?? '');
  const name = String(args.name ?? '');
  const source = String(args.source ?? '');
  const transport = args.transport as string | undefined;

  const objectUrl = objectUrlForType(type, name);
  const srcUrl = sourceUrlForType(type, name);

  switch (action) {
    case 'update': {
      // Pre-write lint validation
      const lintWarnings = runPreWriteLint(source, type, name, config);
      if (lintWarnings.blocked) return lintWarnings.result!;

      await safeUpdateSource(client.http, client.safety, objectUrl, srcUrl, source, transport);
      cachingLayer?.invalidate(type, name);
      const msg = `Successfully updated ${type} ${name}.`;
      return lintWarnings.warnings ? textResult(`${msg}\n\n${lintWarnings.warnings}`) : textResult(msg);
    }
    case 'create': {
      const pkg = String(args.package ?? '$TMP');
      const description = String(args.description ?? name);

      // Build type-specific creation XML body.
      // SAP ADT requires the root element to match the object type —
      // a generic objectReferences body returns 400 "System expected the element ...".
      const body = buildCreateXml(type, name, pkg, description);

      // Step 1: Create the object (metadata only)
      const createUrl = objectUrl.replace(/\/[^/]+$/, ''); // parent collection URL
      const result = await createObject(client.http, client.safety, createUrl, body, 'application/xml', transport);

      // Step 2: Write source code if provided
      if (source) {
        // Pre-write lint validation
        const lintWarnings = runPreWriteLint(source, type, name, config);
        if (lintWarnings.blocked) {
          return textResult(
            `Created ${type} ${name} in package ${pkg}, but source was rejected by lint:\n${lintWarnings.result!.content[0].text}`,
          );
        }

        await safeUpdateSource(client.http, client.safety, objectUrl, srcUrl, source, transport);
        cachingLayer?.invalidate(type, name);
        const msg = `Created ${type} ${name} in package ${pkg} and wrote source code.`;
        return lintWarnings.warnings ? textResult(`${msg}\n\n${lintWarnings.warnings}`) : textResult(msg);
      }

      return textResult(`Created ${type} ${name} in package ${pkg}.\n${result}`);
    }
    case 'edit_method': {
      const method = String(args.method ?? '');
      if (!method) return errorResult('"method" is required for edit_method action.');
      if (!source) return errorResult('"source" (new method body) is required for edit_method action.');
      if (type !== 'CLAS') return errorResult('edit_method is only supported for type=CLAS.');

      // Fetch current full source (use cache if available)
      const currentSource = cachingLayer
        ? (await cachingLayer.getSource('CLAS', name, () => client.getClass(name))).source
        : await client.getClass(name);

      // Use detected ABAP version from probe if available
      const abaplintVer = cachedFeatures?.abapRelease
        ? mapSapReleaseToAbaplintVersion(cachedFeatures.abapRelease)
        : undefined;

      // Splice in the new method body
      const spliced = spliceMethod(currentSource, name, method, source, abaplintVer);
      if (!spliced.success) {
        return errorResult(spliced.error ?? `Failed to splice method "${method}" in ${name}.`);
      }

      // Pre-write lint validation on the full spliced source
      const lintWarnings = runPreWriteLint(spliced.newSource, type, name, config);
      if (lintWarnings.blocked) return lintWarnings.result!;

      // Write the full source back (existing lock/modify/unlock flow)
      await safeUpdateSource(client.http, client.safety, objectUrl, srcUrl, spliced.newSource, transport);
      cachingLayer?.invalidate(type, name);
      const msg = `Successfully updated method "${method}" in ${type} ${name}.`;
      return lintWarnings.warnings ? textResult(`${msg}\n\n${lintWarnings.warnings}`) : textResult(msg);
    }
    case 'delete': {
      // Lock, delete, unlock pattern
      await client.http.withStatefulSession(async (session) => {
        const lock = await lockObject(session, client.safety, objectUrl);
        try {
          await deleteObject(session, client.safety, objectUrl, lock.lockHandle, transport);
        } finally {
          try {
            await unlockObject(session, objectUrl, lock.lockHandle);
          } catch {
            // Object may already be deleted — unlock failure is expected
          }
        }
      });
      cachingLayer?.invalidate(type, name);
      return textResult(`Deleted ${type} ${name}.`);
    }
    default:
      return errorResult(`Unknown SAPWrite action: ${action}. Supported: create, update, delete, edit_method`);
  }
}

/** Pre-write lint check result */
interface PreWriteLintResult {
  /** Whether the write was blocked by lint errors */
  blocked: boolean;
  /** Error result to return if blocked */
  result?: ToolResult;
  /** Warning text to append to success message */
  warnings?: string;
}

/**
 * Run pre-write lint validation on source code.
 *
 * This is a "lint-before-lock" optimization (pattern from vibing-steampunk):
 * by validating locally before acquiring the SAP object lock, we avoid
 * holding locks on objects that would fail validation anyway.
 *
 * Only runs a strict subset of correctness rules (parser_error, cloud_types, etc.)
 * — not style/formatting rules. This prevents false rejections from opinionated
 * style checks while catching genuine errors that would fail server-side anyway.
 *
 * If lint itself throws (e.g., abaplint bug on unusual syntax), we don't block
 * the write — we let the SAP server-side syntax check handle it instead.
 */
function runPreWriteLint(source: string, type: string, name: string, config: ServerConfig): PreWriteLintResult {
  if (!config.lintBeforeWrite || !source) {
    return { blocked: false };
  }

  try {
    const filename = detectFilename(source, name);
    const systemType = cachedFeatures?.systemType ?? (config.systemType !== 'auto' ? config.systemType : undefined);
    const configOptions: LintConfigOptions = {
      systemType,
      abapRelease: cachedFeatures?.abapRelease,
      configFile: config.abaplintConfig,
    };
    const result = validateBeforeWrite(source, filename, configOptions);

    if (!result.pass) {
      const errorLines = result.errors.map((e) => `  Line ${e.line}: [${e.rule}] ${e.message}`).join('\n');
      return {
        blocked: true,
        result: errorResult(
          `Pre-write lint check failed for ${type} ${name}. Fix these errors before writing:\n${errorLines}\n\n` +
            'Use SAPLint action="lint_and_fix" to auto-fix, or disable with --lint-before-write=false.',
        ),
      };
    }

    if (result.warnings.length > 0) {
      const warningLines = result.warnings.map((w) => `  Line ${w.line}: [${w.rule}] ${w.message}`).join('\n');
      return {
        blocked: false,
        warnings: `Lint warnings:\n${warningLines}`,
      };
    }

    return { blocked: false };
  } catch {
    // If lint itself fails, don't block the write
    return { blocked: false };
  }
}

// ─── SAPActivate Handler ─────────────────────────────────────────────

async function handleSAPActivate(client: AdtClient, args: Record<string, unknown>): Promise<ToolResult> {
  const type = String(args.type ?? '');

  // Batch activation: multiple objects at once (for RAP stacks etc.)
  if (args.objects && Array.isArray(args.objects)) {
    const objects = (args.objects as Array<Record<string, unknown>>).map((o) => {
      const objType = String(o.type ?? type);
      const objName = String(o.name ?? '');
      return { url: objectUrlForType(objType, objName), name: objName };
    });

    const result = await activateBatch(client.http, client.safety, objects);
    const names = objects.map((o) => o.name).join(', ');

    if (result.success) {
      return textResult(
        `Successfully activated ${objects.length} objects: ${names}.${result.messages.length > 0 ? `\nMessages: ${result.messages.join('; ')}` : ''}`,
      );
    }
    return errorResult(`Batch activation failed for: ${names}.\nErrors: ${result.messages.join('; ')}`);
  }

  // Single activation (existing behavior)
  const name = String(args.name ?? '');
  const objectUrl = objectUrlForType(type, name);

  const result = await activate(client.http, client.safety, objectUrl);

  if (result.success) {
    return textResult(
      `Successfully activated ${type} ${name}.${result.messages.length > 0 ? `\nMessages: ${result.messages.join('; ')}` : ''}`,
    );
  }
  return errorResult(`Activation failed for ${type} ${name}.\nErrors: ${result.messages.join('; ')}`);
}

// ─── SAPNavigate Handler ─────────────────────────────────────────────

async function handleSAPNavigate(client: AdtClient, args: Record<string, unknown>): Promise<ToolResult> {
  const action = String(args.action ?? '');
  let uri = String(args.uri ?? '');
  const line = Number(args.line ?? 1);
  const column = Number(args.column ?? 1);
  const source = String(args.source ?? '');

  // Allow symbolic type+name as alternative to uri for references
  if (!uri && args.type && args.name) {
    const symType = String(args.type);
    const symName = String(args.name);
    if (symType === 'FUNC') {
      // FUNC needs group to build URL — auto-resolve it
      const group = await client.resolveFunctionGroup(symName);
      if (group) {
        uri = `/sap/bc/adt/functions/groups/${encodeURIComponent(group)}/fmodules/${encodeURIComponent(symName)}`;
      } else {
        return errorResult(
          `Cannot resolve function group for "${symName}". Provide the full uri parameter, or use SAPSearch("${symName}") to find the ADT URI.`,
        );
      }
    } else {
      uri = objectUrlForType(symType, symName);
    }
  }

  switch (action) {
    case 'definition': {
      if (!uri) {
        return errorResult('Provide uri (or type+name) and line+column for definition lookup.');
      }
      const result = await findDefinition(client.http, client.safety, uri, line, column, source);
      if (!result) {
        return textResult('No definition found at this position.');
      }
      return textResult(JSON.stringify(result, null, 2));
    }
    case 'references': {
      if (!uri) {
        return errorResult('Provide uri or type+name to find references.');
      }
      const objectType = args.objectType ? String(args.objectType) : undefined;
      let results: WhereUsedResult[] | ReferenceResult[];
      try {
        results = await findWhereUsed(client.http, client.safety, uri, objectType);
      } catch (err) {
        // Only fall back for HTTP errors indicating the endpoint is not available (older SAP systems)
        if (err instanceof AdtApiError && [404, 405, 415, 501].includes(err.statusCode)) {
          results = await findReferences(client.http, client.safety, uri);
          if (results.length === 0) {
            return textResult('No references found.');
          }
          const json = JSON.stringify(results, null, 2);
          if (objectType) {
            return textResult(
              JSON.stringify(
                {
                  note: `This SAP system does not support scope-based Where-Used. The objectType filter "${objectType}" was ignored — results below are unfiltered.`,
                  results,
                },
                null,
                2,
              ),
            );
          }
          return textResult(json);
        } else {
          throw err;
        }
      }
      if (results.length === 0) {
        return textResult('No references found.');
      }
      return textResult(JSON.stringify(results, null, 2));
    }
    case 'completion': {
      const proposals = await getCompletion(client.http, client.safety, uri, line, column, source);
      return textResult(JSON.stringify(proposals, null, 2));
    }
    default:
      return errorResult(`Unknown SAPNavigate action: ${action}. Supported: definition, references, completion`);
  }
}

// ─── SAPDiagnose Handler ─────────────────────────────────────────────

async function handleSAPDiagnose(client: AdtClient, args: Record<string, unknown>): Promise<ToolResult> {
  const action = String(args.action ?? '');
  const name = String(args.name ?? '');
  const type = String(args.type ?? '');

  switch (action) {
    case 'syntax': {
      const objectUrl = objectUrlForType(type, name);
      const result = await syntaxCheck(client.http, client.safety, objectUrl);
      return textResult(JSON.stringify(result, null, 2));
    }
    case 'unittest': {
      const objectUrl = objectUrlForType(type, name);
      const results = await runUnitTests(client.http, client.safety, objectUrl);
      return textResult(JSON.stringify(results, null, 2));
    }
    case 'atc': {
      const objectUrl = objectUrlForType(type, name);
      const variant = args.variant as string | undefined;
      const result = await runAtcCheck(client.http, client.safety, objectUrl, variant);
      return textResult(JSON.stringify(result, null, 2));
    }
    case 'dumps': {
      const id = args.id as string | undefined;
      if (id) {
        // Get single dump detail
        const detail = await getDump(client.http, client.safety, id);
        return textResult(JSON.stringify(detail, null, 2));
      }
      // List dumps
      const user = args.user as string | undefined;
      const maxResults = args.maxResults ? Number(args.maxResults) : undefined;
      const dumps = await listDumps(client.http, client.safety, { user, maxResults });
      return textResult(JSON.stringify(dumps, null, 2));
    }
    case 'traces': {
      const id = args.id as string | undefined;
      if (id) {
        // Get trace analysis
        const analysis = String(args.analysis ?? 'hitlist');
        switch (analysis) {
          case 'hitlist': {
            const hitlist = await getTraceHitlist(client.http, client.safety, id);
            return textResult(JSON.stringify(hitlist, null, 2));
          }
          case 'statements': {
            const statements = await getTraceStatements(client.http, client.safety, id);
            return textResult(JSON.stringify(statements, null, 2));
          }
          case 'dbAccesses': {
            const dbAccesses = await getTraceDbAccesses(client.http, client.safety, id);
            return textResult(JSON.stringify(dbAccesses, null, 2));
          }
          default:
            return errorResult(`Unknown trace analysis type: ${analysis}. Supported: hitlist, statements, dbAccesses`);
        }
      }
      // List traces
      const traces = await listTraces(client.http, client.safety);
      return textResult(JSON.stringify(traces, null, 2));
    }
    default:
      return errorResult(`Unknown SAPDiagnose action: ${action}. Supported: syntax, unittest, atc, dumps, traces`);
  }
}

// ─── SAPTransport Handler ────────────────────────────────────────────

async function handleSAPTransport(client: AdtClient, args: Record<string, unknown>): Promise<ToolResult> {
  const action = String(args.action ?? '');

  switch (action) {
    case 'list': {
      const user = args.user as string | undefined;
      const transports = await listTransports(client.http, client.safety, user);
      return textResult(JSON.stringify(transports, null, 2));
    }
    case 'get': {
      const id = String(args.id ?? '');
      if (!id) return errorResult('Transport ID is required for "get" action.');
      const transport = await getTransport(client.http, client.safety, id);
      if (!transport) return textResult(`Transport ${id} not found.`);
      return textResult(JSON.stringify(transport, null, 2));
    }
    case 'create': {
      const description = String(args.description ?? '');
      if (!description) return errorResult('Description is required for "create" action.');
      const id = await createTransport(client.http, client.safety, description);
      return textResult(`Created transport request: ${id}`);
    }
    case 'release': {
      const id = String(args.id ?? '');
      if (!id) return errorResult('Transport ID is required for "release" action.');
      await releaseTransport(client.http, client.safety, id);
      return textResult(`Released transport request: ${id}`);
    }
    default:
      return errorResult(`Unknown SAPTransport action: ${action}. Supported: list, get, create, release`);
  }
}

// ─── SAPContext Handler ───────────────────────────────────────────────

async function handleSAPContext(
  client: AdtClient,
  args: Record<string, unknown>,
  cachingLayer?: CachingLayer,
): Promise<ToolResult> {
  const action = String(args.action ?? '');
  const type = String(args.type ?? '');
  const name = String(args.name ?? '');
  const maxDeps = Number(args.maxDeps ?? 20);
  const depth = Math.min(Math.max(Number(args.depth ?? 1), 1), 3);

  // ─── Reverse dep lookup (pre-warmer only) ─────────────────────────
  if (action === 'usages') {
    if (!name) return errorResult('"name" is required for usages action.');
    if (!cachingLayer) {
      return errorResult(
        'Reverse dependency lookup requires object caching. Cache is disabled (ARC1_CACHE=none). ' +
          'Enable caching and run cache warmup to use this feature.',
      );
    }
    const usages = cachingLayer.getUsages(name);
    if (usages === null) {
      return errorResult(
        `Reverse dependency lookup requires a pre-warmed cache. The cache warmup has not been run yet.\n\n` +
          `To enable this feature:\n` +
          `1. Start ARC-1 with --cache-warmup (or set ARC1_CACHE_WARMUP=true)\n` +
          `2. Wait for the warmup to complete (indexes all custom objects)\n` +
          `3. Then retry SAPContext(action="usages", name="${name}")\n\n` +
          `Alternative: Use SAPNavigate(action="references", type="CLAS", name="${name}") for a live ADT lookup (slower, but works without warmup).`,
      );
    }
    if (usages.length === 0) {
      return textResult(`No objects found that depend on "${name}" in the cached index.`);
    }
    return textResult(JSON.stringify({ name, usageCount: usages.length, usages }, null, 2));
  }

  if (!type || !name) {
    return errorResult('Both "type" and "name" are required for SAPContext.');
  }

  // Helper: get source with cache support
  const cachedGet = async (objType: string, objName: string, fetcher: () => Promise<string>): Promise<string> => {
    if (!cachingLayer) return fetcher();
    const { source } = await cachingLayer.getSource(objType, objName, fetcher);
    return source;
  };

  // Get source — either provided or fetched from SAP
  let source: string;
  if (args.source) {
    source = String(args.source);
  } else {
    switch (type) {
      case 'CLAS':
        source = await cachedGet('CLAS', name, () => client.getClass(name));
        break;
      case 'INTF':
        source = await cachedGet('INTF', name, () => client.getInterface(name));
        break;
      case 'PROG':
        source = await cachedGet('PROG', name, () => client.getProgram(name));
        break;
      case 'FUNC': {
        const group = String(args.group ?? '');
        if (!group) {
          return errorResult(
            'The "group" parameter is required for FUNC type. Use SAPSearch to find the function group.',
          );
        }
        source = await cachedGet('FUNC', name, () => client.getFunction(group, name));
        break;
      }
      case 'DDLS': {
        const ddlSource = await cachedGet('DDLS', name, () => client.getDdls(name));
        const cdsResult = await compressCdsContext(client, ddlSource, name, maxDeps, depth, cachingLayer);
        return textResult(cdsResult.output);
      }
      default:
        return errorResult(`SAPContext supports types: CLAS, INTF, PROG, FUNC, DDLS. Got: ${type}`);
    }
  }

  // Check dep graph cache — if source hash matches, return cached contracts
  if (cachingLayer) {
    const cachedGraph = cachingLayer.getCachedDepGraph(source);
    if (cachedGraph) {
      const successful = cachedGraph.contracts.filter((c) => c.success);
      const failed = cachedGraph.contracts.filter((c) => !c.success);
      const lines: string[] = [];
      lines.push(
        `* === Dependency context for ${name} (${successful.length} deps resolved${failed.length > 0 ? `, ${failed.length} failed` : ''}) [cached] ===`,
      );
      lines.push('');
      for (const contract of successful) {
        const typeLabel = contract.type.toLowerCase();
        const methodLabel = contract.methodCount > 0 ? `, ${contract.methodCount} methods` : '';
        lines.push(`* --- ${contract.name} (${typeLabel}${methodLabel}) ---`);
        lines.push(contract.source.trim());
        lines.push('');
      }
      if (failed.length > 0) {
        lines.push('* --- Failed dependencies ---');
        for (const f of failed) {
          lines.push(`* ${f.name}: ${f.error}`);
        }
        lines.push('');
      }
      const totalLines = lines.length;
      lines.push(
        `* Stats: ${successful.length + failed.length} deps found, ${successful.length} resolved, ${failed.length} failed, ${totalLines} lines [from cache]`,
      );
      return textResult(lines.join('\n'));
    }
  }

  // Use detected ABAP version from probe if available, otherwise Cloud (superset)
  const abaplintVersion = cachedFeatures?.abapRelease
    ? mapSapReleaseToAbaplintVersion(cachedFeatures.abapRelease)
    : undefined;

  const result = await compressContext(client, source, name, type, maxDeps, depth, abaplintVersion, cachingLayer);
  return textResult(result.output);
}

// ─── SAPManage Handler ────────────────────────────────────────────────

/** Cached feature status — populated on first probe */
let cachedFeatures: ResolvedFeatures | undefined;

async function handleSAPManage(
  client: AdtClient,
  config: ServerConfig,
  args: Record<string, unknown>,
  cachingLayer?: CachingLayer,
  isPerUserClient?: boolean,
): Promise<ToolResult> {
  const action = String(args.action ?? '');

  switch (action) {
    case 'features': {
      if (!cachedFeatures) {
        return textResult(
          JSON.stringify({ message: 'No features probed yet. Use action="probe" to probe the SAP system first.' }),
        );
      }
      return textResult(JSON.stringify(cachedFeatures, null, 2));
    }

    case 'cache_stats': {
      if (!cachingLayer) {
        return textResult(JSON.stringify({ enabled: false, message: 'Object cache is disabled (ARC1_CACHE=none).' }));
      }
      const stats = cachingLayer.stats();
      return textResult(
        JSON.stringify(
          {
            enabled: true,
            warmupAvailable: cachingLayer.isWarmupAvailable,
            ...stats,
          },
          null,
          2,
        ),
      );
    }

    case 'probe': {
      const { defaultFeatureConfig } = await import('../adt/config.js');
      const featureConfig = defaultFeatureConfig();
      // Override with server config feature toggles
      featureConfig.hana = config.featureHana as 'auto' | 'on' | 'off';
      featureConfig.abapGit = config.featureAbapGit as 'auto' | 'on' | 'off';
      featureConfig.rap = config.featureRap as 'auto' | 'on' | 'off';
      featureConfig.amdp = config.featureAmdp as 'auto' | 'on' | 'off';
      featureConfig.ui5 = config.featureUi5 as 'auto' | 'on' | 'off';
      featureConfig.transport = config.featureTransport as 'auto' | 'on' | 'off';

      const probed = await probeFeatures(client.http, featureConfig, config.systemType);

      // In PP mode with a per-user client, auth-sensitive results (401/403 on any
      // feature) must not poison the global cache — another user may have different
      // authorizations.  Return the per-user result to the caller but keep the global
      // cache unchanged.  However, when PP is enabled but the request fell back to the
      // shared/default client (no JWT, missing btpConfig, or non-strict fallback), the
      // probe ran with the same service-account credentials as the startup probe, so
      // updating the cache is safe and allows a manual probe to repair a failed startup.
      // Apply the same auth-failure sanitization as the startup probe: in PP mode,
      // shared-client 401/403 on textSearch must not hide source_code from users who
      // might have authorization via per-user clients.
      if (!isPerUserClient) {
        if (config.ppEnabled && probed.textSearch && !probed.textSearch.available) {
          const reason = probed.textSearch.reason ?? '';
          if (reason.includes('authorization') || reason.includes('401') || reason.includes('403')) {
            probed.textSearch = undefined;
          }
        }
        cachedFeatures = probed;
      }
      return textResult(JSON.stringify(probed, null, 2));
    }

    default:
      return errorResult(`Unknown SAPManage action: ${action}. Supported: features, probe, cache_stats`);
  }
}

/** Reset cached features (for testing) */
export function resetCachedFeatures(): void {
  cachedFeatures = undefined;
}

/** Set cached features directly (for testing BTP mode, etc.) */
export function setCachedFeatures(features: ResolvedFeatures | undefined): void {
  cachedFeatures = features;
}

/** Get cached features (for tool definition adaptation) */
export function getCachedFeatures(): ResolvedFeatures | undefined {
  return cachedFeatures;
}
