/**
 * Audit event types for ARC-1.
 *
 * Every structured log entry is one of these typed events.
 * They are written to all registered sinks (stderr, file, BTP audit log).
 *
 * requestId correlates all events within a single MCP tool call,
 * including nested HTTP requests and auth events.
 */

import type { LogLevel } from './logger.js';

/** Base shape for all audit events */
export interface AuditEventBase {
  timestamp: string;
  level: LogLevel;
  event: string;
  requestId?: string;
  user?: string;
  clientId?: string;
}

/** MCP tool call started */
export interface ToolCallStartEvent extends AuditEventBase {
  event: 'tool_call_start';
  tool: string;
  args: Record<string, unknown>;
}

/** MCP tool call completed (success or error) */
export interface ToolCallEndEvent extends AuditEventBase {
  event: 'tool_call_end';
  tool: string;
  durationMs: number;
  status: 'success' | 'error';
  errorClass?: string;
  errorMessage?: string;
  resultSize?: number;
  /** First 500 chars of the response text (for debugging in server logs) */
  resultPreview?: string;
}

/** HTTP request to SAP ADT */
export interface HttpRequestEvent extends AuditEventBase {
  event: 'http_request';
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  errorBody?: string;
}

/** CSRF token fetch */
export interface HttpCsrfFetchEvent extends AuditEventBase {
  event: 'http_csrf_fetch';
  durationMs: number;
  success: boolean;
}

/** Auth scope denied */
export interface AuthScopeDeniedEvent extends AuditEventBase {
  event: 'auth_scope_denied';
  tool: string;
  requiredScope: string;
  availableScopes: string[];
}

/** Per-user ADT client created via principal propagation */
export interface AuthPPCreatedEvent extends AuditEventBase {
  event: 'auth_pp_created';
  destination: string;
  success: boolean;
  errorMessage?: string;
}

/** Safety system blocked an operation */
export interface SafetyBlockedEvent extends AuditEventBase {
  event: 'safety_blocked';
  operation: string;
  reason: string;
}

/** Server started */
export interface ServerStartEvent extends AuditEventBase {
  event: 'server_start';
  version: string;
  transport: string;
  readOnly: boolean;
  url: string;
  pid?: number;
}

/** Elicitation sent to client */
export interface ElicitationSentEvent extends AuditEventBase {
  event: 'elicitation_sent';
  tool: string;
  message: string;
  fields?: string[];
}

/** Elicitation response from client */
export interface ElicitationResponseEvent extends AuditEventBase {
  event: 'elicitation_response';
  tool: string;
  action: string;
}

/** Discriminated union of all audit events */
export type AuditEvent =
  | ToolCallStartEvent
  | ToolCallEndEvent
  | HttpRequestEvent
  | HttpCsrfFetchEvent
  | AuthScopeDeniedEvent
  | AuthPPCreatedEvent
  | SafetyBlockedEvent
  | ServerStartEvent
  | ElicitationSentEvent
  | ElicitationResponseEvent;

/** Sanitize tool call arguments — remove values that might contain sensitive data */
export function sanitizeArgs(args: Record<string, unknown>): Record<string, unknown> {
  const sensitiveKeys = ['password', 'token', 'secret', 'cookie', 'authorization', 'csrf', 'apikey'];
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    if (sensitiveKeys.some((s) => key.toLowerCase().includes(s))) {
      result[key] = '[REDACTED]';
    } else if (typeof value === 'string' && value.length > 500) {
      result[key] = `${value.slice(0, 200)}... [truncated ${value.length} chars]`;
    } else {
      result[key] = value;
    }
  }
  return result;
}
