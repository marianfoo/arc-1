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
import type { AdtClient } from '../adt/client.js';
import { detectFilename, lintAbapSource } from '../lint/lint.js';
import { logger } from '../server/logger.js';
import type { ServerConfig } from '../server/types.js';

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
  SAPQuery: 'read',
  SAPNavigate: 'read',
  SAPContext: 'read',
  SAPLint: 'read',
  SAPDiagnose: 'read',
  SAPWrite: 'write',
  SAPActivate: 'write',
  SAPManage: 'write',
  SAPTransport: 'admin',
};

function textResult(text: string): ToolResult {
  return { content: [{ type: 'text', text }] };
}

function errorResult(message: string): ToolResult {
  return { content: [{ type: 'text', text: message }], isError: true };
}

/**
 * Handle an MCP tool call.
 *
 * @param authInfo - Authenticated user context from MCP SDK (XSUAA/OIDC/API key).
 *   When present, scope enforcement is active. When absent (stdio, no auth),
 *   all tools are allowed (backward compatibility).
 */
export async function handleToolCall(
  client: AdtClient,
  _config: ServerConfig,
  toolName: string,
  args: Record<string, unknown>,
  authInfo?: AuthInfo,
): Promise<ToolResult> {
  const start = Date.now();

  // Build user context for audit logging
  const userCtx: Record<string, unknown> = {};
  if (authInfo) {
    if (authInfo.extra?.userName) userCtx.user = authInfo.extra.userName;
    if (authInfo.extra?.email) userCtx.email = authInfo.extra.email;
    if (authInfo.clientId) userCtx.clientId = authInfo.clientId;
  }

  // Scope enforcement — only when authInfo is present (XSUAA/OIDC mode)
  if (authInfo) {
    const requiredScope = TOOL_SCOPES[toolName];
    if (requiredScope && !authInfo.scopes.includes(requiredScope)) {
      logger.warn('Tool call blocked by scope', { tool: toolName, requiredScope, scopes: authInfo.scopes, ...userCtx });
      return errorResult(
        `Insufficient scope: '${requiredScope}' required for ${toolName}. Your scopes: [${authInfo.scopes.join(', ')}]`,
      );
    }
  }

  try {
    let result: ToolResult;

    switch (toolName) {
      case 'SAPRead':
        result = await handleSAPRead(client, args);
        break;
      case 'SAPSearch':
        result = await handleSAPSearch(client, args);
        break;
      case 'SAPQuery':
        result = await handleSAPQuery(client, args);
        break;
      case 'SAPLint':
        result = await handleSAPLint(client, args);
        break;
      default:
        result = errorResult(`Unknown tool: ${toolName}`);
    }

    logger.info('Tool call completed', {
      tool: toolName,
      ...userCtx,
      duration: Date.now() - start,
    });

    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('Tool call failed', { tool: toolName, error: message, ...userCtx, duration: Date.now() - start });
    return errorResult(message);
  }
}

// ─── Individual Tool Handlers ────────────────────────────────────────

async function handleSAPRead(client: AdtClient, args: Record<string, unknown>): Promise<ToolResult> {
  const type = String(args.type ?? '');
  const name = String(args.name ?? '');

  switch (type) {
    case 'PROG':
      return textResult(await client.getProgram(name));
    case 'CLAS':
      return textResult(await client.getClass(name, args.include as string | undefined));
    case 'INTF':
      return textResult(await client.getInterface(name));
    case 'FUNC':
      return textResult(await client.getFunction(String(args.group ?? ''), name));
    case 'FUGR': {
      const fg = await client.getFunctionGroup(name);
      return textResult(JSON.stringify(fg, null, 2));
    }
    case 'INCL':
      return textResult(await client.getInclude(name));
    case 'DDLS':
      return textResult(await client.getDdls(name));
    case 'BDEF':
      return textResult(await client.getBdef(name));
    case 'SRVD':
      return textResult(await client.getSrvd(name));
    case 'TABL':
      return textResult(await client.getTable(name));
    case 'VIEW':
      return textResult(await client.getView(name));
    case 'TABLE_CONTENTS': {
      const maxRows = Number(args.maxRows ?? 100);
      const data = await client.getTableContents(name, maxRows, args.sqlFilter as string | undefined);
      return textResult(JSON.stringify(data, null, 2));
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
        `Unknown SAPRead type: ${type}. Supported: PROG, CLAS, INTF, FUNC, FUGR, INCL, DDLS, BDEF, SRVD, TABL, VIEW, TABLE_CONTENTS, DEVC, SYSTEM, COMPONENTS, MESSAGES, TEXT_ELEMENTS, VARIANTS`,
      );
  }
}

async function handleSAPSearch(client: AdtClient, args: Record<string, unknown>): Promise<ToolResult> {
  const query = String(args.query ?? '');
  const maxResults = Number(args.maxResults ?? 100);
  const results = await client.searchObject(query, maxResults);
  return textResult(JSON.stringify(results, null, 2));
}

async function handleSAPQuery(client: AdtClient, args: Record<string, unknown>): Promise<ToolResult> {
  const sql = String(args.sql ?? '');
  const maxRows = Number(args.maxRows ?? 100);
  const data = await client.runQuery(sql, maxRows);
  return textResult(JSON.stringify(data, null, 2));
}

async function handleSAPLint(_client: AdtClient, args: Record<string, unknown>): Promise<ToolResult> {
  const action = String(args.action ?? '');

  switch (action) {
    case 'lint': {
      const source = String(args.source ?? '');
      const name = String(args.name ?? 'UNKNOWN');
      const filename = detectFilename(source, name);
      const issues = lintAbapSource(source, filename);
      return textResult(JSON.stringify(issues, null, 2));
    }
    default:
      return errorResult(`Unknown SAPLint action: ${action}. Supported: lint, atc, syntax`);
  }
}
