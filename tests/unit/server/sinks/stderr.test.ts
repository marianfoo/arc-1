import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuditEvent } from '../../../../ts-src/server/audit.js';
import { StderrSink } from '../../../../ts-src/server/sinks/stderr.js';

describe('StderrSink', () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stderrSpy.mockRestore();
  });

  const makeEvent = (overrides: Partial<AuditEvent> = {}): AuditEvent =>
    ({
      timestamp: '2026-03-30T10:00:00.000Z',
      level: 'info',
      event: 'tool_call_start',
      requestId: 'REQ-1',
      tool: 'SAPRead',
      args: { type: 'PROG' },
      ...overrides,
    }) as AuditEvent;

  it('writes to stderr in text format', () => {
    const sink = new StderrSink('text', 'info');
    sink.write(makeEvent());
    expect(stderrSpy).toHaveBeenCalled();
    const output = stderrSpy.mock.calls[0]?.[0] as string;
    expect(output).toContain('INFO');
    expect(output).toContain('[tool_call_start]');
  });

  it('writes to stderr in JSON format', () => {
    const sink = new StderrSink('json', 'info');
    sink.write(makeEvent());
    const output = stderrSpy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(output);
    expect(parsed.event).toBe('tool_call_start');
    expect(parsed.level).toBe('info');
    expect(parsed.requestId).toBe('REQ-1');
  });

  it('respects log level filtering', () => {
    const sink = new StderrSink('text', 'warn');
    sink.write(makeEvent({ level: 'info' }));
    expect(stderrSpy).not.toHaveBeenCalled();
    sink.write(makeEvent({ level: 'warn' }));
    expect(stderrSpy).toHaveBeenCalled();
  });

  it('allows error through when min level is warn', () => {
    const sink = new StderrSink('text', 'warn');
    sink.write(makeEvent({ level: 'error' }));
    expect(stderrSpy).toHaveBeenCalled();
  });

  it('redacts sensitive fields', () => {
    const sink = new StderrSink('json', 'info');
    sink.write(
      makeEvent({
        args: { password: 'secret', token: 'abc', name: 'visible' },
      } as Partial<AuditEvent>),
    );
    const output = stderrSpy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(output);
    expect(parsed.args.password).toBe('[REDACTED]');
    expect(parsed.args.token).toBe('[REDACTED]');
    expect(parsed.args.name).toBe('visible');
  });

  it('shows debug messages when min level is debug', () => {
    const sink = new StderrSink('text', 'debug');
    sink.write(makeEvent({ level: 'debug' }));
    expect(stderrSpy).toHaveBeenCalled();
  });
});
