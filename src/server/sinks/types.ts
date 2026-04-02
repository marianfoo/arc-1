/**
 * Log sink interface for ARC-1.
 *
 * Sinks receive structured audit events and persist them.
 * write() is fire-and-forget — sinks must not throw.
 */

import type { AuditEvent } from '../audit.js';

export interface LogSink {
  /** Write an audit event. Must not throw. */
  write(event: AuditEvent): void;
  /** Flush pending writes (for graceful shutdown). */
  flush?(): Promise<void>;
}
