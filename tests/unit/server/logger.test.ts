import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Logger } from '../../../ts-src/server/logger.js';

describe('Logger', () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stderrSpy.mockRestore();
  });

  it('writes to stderr, not stdout', () => {
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const logger = new Logger('text', true);
    logger.info('test message');
    expect(stderrSpy).toHaveBeenCalled();
    expect(stdoutSpy).not.toHaveBeenCalled();
    stdoutSpy.mockRestore();
  });

  it('outputs text format with timestamp and level', () => {
    const logger = new Logger('text', true);
    logger.info('hello world');
    const output = stderrSpy.mock.calls[0]?.[0] as string;
    expect(output).toMatch(/\[\d{4}-\d{2}-\d{2}T/);
    expect(output).toContain('INFO');
    expect(output).toContain('hello world');
  });

  it('outputs JSON format with structured fields', () => {
    const logger = new Logger('json', true);
    logger.info('test', { tool: 'SAPRead' });
    const output = stderrSpy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(output);
    expect(parsed.level).toBe('info');
    expect(parsed.message).toBe('test');
    expect(parsed.tool).toBe('SAPRead');
    expect(parsed.timestamp).toBeDefined();
  });

  it('respects log level (non-verbose suppresses debug)', () => {
    const logger = new Logger('text', false);
    logger.debug('should not appear');
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it('shows debug messages when verbose', () => {
    const logger = new Logger('text', true);
    logger.debug('debug message');
    expect(stderrSpy).toHaveBeenCalled();
  });

  it('redacts sensitive fields in context', () => {
    const logger = new Logger('json', true);
    logger.info('auth', { password: 'secret123', token: 'abc', username: 'admin' });
    const output = stderrSpy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(output);
    expect(parsed.password).toBe('[REDACTED]');
    expect(parsed.token).toBe('[REDACTED]');
    expect(parsed.username).toBe('admin'); // Not sensitive
  });
});
