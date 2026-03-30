/**
 * Stderr log sink for ARC-1.
 *
 * Writes audit events to stderr in text or JSON format.
 * This is the default sink — always active.
 *
 * Critical: never write to stdout (reserved for MCP JSON-RPC).
 */

import type { AuditEvent } from '../audit.js';
import type { LogLevel } from '../logger.js';
import type { LogSink } from './types.js';

export type LogFormat = 'text' | 'json';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export class StderrSink implements LogSink {
  private minLevel: number;

  constructor(
    private format: LogFormat = 'text',
    minLevel: LogLevel = 'info',
  ) {
    this.minLevel = LEVEL_PRIORITY[minLevel];
  }

  write(event: AuditEvent): void {
    if (LEVEL_PRIORITY[event.level] < this.minLevel) return;

    const safeEvent = redactSensitive(event);

    if (this.format === 'json') {
      process.stderr.write(`${JSON.stringify(safeEvent)}\n`);
    } else {
      const { timestamp, level, event: eventType, ...rest } = safeEvent;
      const ctx = Object.keys(rest).length > 0 ? ` ${JSON.stringify(rest)}` : '';
      process.stderr.write(`[${timestamp}] ${level.toUpperCase()}: [${eventType}]${ctx}\n`);
    }
  }
}

/** Redact known sensitive fields to prevent credential leakage in logs */
function redactSensitive(event: AuditEvent): AuditEvent {
  const sensitiveKeys = ['password', 'token', 'cookie', 'authorization', 'secret', 'csrf'];
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(event)) {
    if (sensitiveKeys.some((s) => key.toLowerCase().includes(s))) {
      result[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      // Shallow redaction for nested objects (e.g., args)
      const nested: Record<string, unknown> = {};
      for (const [nk, nv] of Object.entries(value as Record<string, unknown>)) {
        if (sensitiveKeys.some((s) => nk.toLowerCase().includes(s))) {
          nested[nk] = '[REDACTED]';
        } else {
          nested[nk] = nv;
        }
      }
      result[key] = nested;
    } else {
      result[key] = value;
    }
  }

  return result as unknown as AuditEvent;
}
