import { describe, expect, it } from 'vitest';
import type { AuditEvent, ToolCallEndEvent, ToolCallStartEvent } from '../../../ts-src/server/audit.js';
import { sanitizeArgs } from '../../../ts-src/server/audit.js';

describe('Audit Events', () => {
  describe('sanitizeArgs', () => {
    it('passes through normal args unchanged', () => {
      const args = { type: 'PROG', name: 'ZHELLO' };
      expect(sanitizeArgs(args)).toEqual({ type: 'PROG', name: 'ZHELLO' });
    });

    it('redacts sensitive keys', () => {
      const args = { password: 'secret', token: 'abc123', type: 'PROG' };
      const result = sanitizeArgs(args);
      expect(result.password).toBe('[REDACTED]');
      expect(result.token).toBe('[REDACTED]');
      expect(result.type).toBe('PROG');
    });

    it('truncates long string values', () => {
      const longString = 'A'.repeat(600);
      const args = { source: longString };
      const result = sanitizeArgs(args);
      expect(result.source).toContain('[truncated 600 chars]');
      expect((result.source as string).length).toBeLessThan(300);
    });

    it('handles empty args', () => {
      expect(sanitizeArgs({})).toEqual({});
    });

    it('is case-insensitive for sensitive keys', () => {
      const args = { Authorization: 'Bearer xyz', apiKey: 'key123' };
      const result = sanitizeArgs(args);
      expect(result.Authorization).toBe('[REDACTED]');
      expect(result.apiKey).toBe('[REDACTED]');
    });
  });

  describe('Type shapes', () => {
    it('ToolCallStartEvent has expected fields', () => {
      const event: ToolCallStartEvent = {
        timestamp: new Date().toISOString(),
        level: 'info',
        event: 'tool_call_start',
        requestId: 'REQ-1',
        user: 'testuser',
        tool: 'SAPRead',
        args: { type: 'PROG', name: 'ZHELLO' },
      };
      expect(event.event).toBe('tool_call_start');
      expect(event.tool).toBe('SAPRead');
    });

    it('ToolCallEndEvent captures error info', () => {
      const event: ToolCallEndEvent = {
        timestamp: new Date().toISOString(),
        level: 'error',
        event: 'tool_call_end',
        requestId: 'REQ-1',
        tool: 'SAPRead',
        durationMs: 150,
        status: 'error',
        errorClass: 'AdtApiError',
        errorMessage: 'Not found',
      };
      expect(event.status).toBe('error');
      expect(event.errorClass).toBe('AdtApiError');
    });

    it('AuditEvent union accepts all event types', () => {
      const events: AuditEvent[] = [
        {
          timestamp: '',
          level: 'info',
          event: 'tool_call_start',
          tool: 'SAPRead',
          args: {},
        },
        {
          timestamp: '',
          level: 'info',
          event: 'tool_call_end',
          tool: 'SAPRead',
          durationMs: 0,
          status: 'success',
        },
        {
          timestamp: '',
          level: 'debug',
          event: 'http_request',
          method: 'GET',
          path: '/sap/bc/adt/programs',
          statusCode: 200,
          durationMs: 50,
        },
        {
          timestamp: '',
          level: 'warn',
          event: 'auth_scope_denied',
          tool: 'SAPWrite',
          requiredScope: 'write',
          availableScopes: ['read'],
        },
        {
          timestamp: '',
          level: 'info',
          event: 'server_start',
          version: '3.0.0',
          transport: 'stdio',
          readOnly: false,
          url: 'http://sap:8000',
        },
      ];
      expect(events).toHaveLength(5);
    });
  });
});
