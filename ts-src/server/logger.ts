/**
 * Logger for ARC-1.
 *
 * Critical: ALL output goes to stderr, never stdout.
 * stdout is reserved for the MCP JSON-RPC stream (stdio transport).
 * Using console.log() would corrupt the MCP protocol.
 *
 * Supports two output formats:
 * - 'text': human-readable for local development
 * - 'json': structured for cloud deployments (CF, K8s, Datadog)
 *
 * Per OWASP MCP guide and Datadog recommendations, every log entry
 * includes timestamp and level. Tool call logs include correlation
 * context (session ID, tool name, duration).
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogFormat = 'text' | 'json';

export interface LogContext {
  [key: string]: unknown;
}

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export class Logger {
  private minLevel: number;

  constructor(
    private format: LogFormat = 'text',
    verbose: boolean = false,
  ) {
    this.minLevel = verbose ? LEVEL_PRIORITY.debug : LEVEL_PRIORITY.info;
  }

  debug(message: string, context?: LogContext): void {
    this.write('debug', message, context);
  }

  info(message: string, context?: LogContext): void {
    this.write('info', message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.write('warn', message, context);
  }

  error(message: string, context?: LogContext): void {
    this.write('error', message, context);
  }

  private write(level: LogLevel, message: string, context?: LogContext): void {
    if (LEVEL_PRIORITY[level] < this.minLevel) return;

    // Redact sensitive fields from context
    const safeContext = context ? redactSensitive(context) : undefined;

    if (this.format === 'json') {
      const entry = {
        timestamp: new Date().toISOString(),
        level,
        message,
        ...safeContext,
      };
      process.stderr.write(`${JSON.stringify(entry)}\n`);
    } else {
      const ts = new Date().toISOString();
      const ctx = safeContext ? ` ${JSON.stringify(safeContext)}` : '';
      process.stderr.write(`[${ts}] ${level.toUpperCase()}: ${message}${ctx}\n`);
    }
  }
}

/** Redact known sensitive fields to prevent credential leakage in logs */
function redactSensitive(context: LogContext): LogContext {
  const sensitiveKeys = ['password', 'token', 'cookie', 'authorization', 'secret', 'csrf'];
  const result: LogContext = {};

  for (const [key, value] of Object.entries(context)) {
    if (sensitiveKeys.some((s) => key.toLowerCase().includes(s))) {
      result[key] = '[REDACTED]';
    } else {
      result[key] = value;
    }
  }

  return result;
}

/** Global logger instance — initialized during server startup */
export let logger = new Logger('text', false);

/** Initialize the global logger with server configuration */
export function initLogger(format: LogFormat, verbose: boolean): void {
  logger = new Logger(format, verbose);
}
