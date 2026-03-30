import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuditEvent } from '../../../../ts-src/server/audit.js';
import { BTPAuditLogSink, parseBTPAuditLogConfig } from '../../../../ts-src/server/sinks/btp-auditlog.js';

describe('BTP Audit Log Sink', () => {
  describe('parseBTPAuditLogConfig', () => {
    const originalEnv = process.env.VCAP_SERVICES;

    afterEach(() => {
      if (originalEnv === undefined) {
        delete process.env.VCAP_SERVICES;
      } else {
        process.env.VCAP_SERVICES = originalEnv;
      }
    });

    it('returns undefined when VCAP_SERVICES is not set', () => {
      delete process.env.VCAP_SERVICES;
      expect(parseBTPAuditLogConfig()).toBeUndefined();
    });

    it('returns undefined when no auditlog binding exists', () => {
      process.env.VCAP_SERVICES = JSON.stringify({ xsuaa: [] });
      expect(parseBTPAuditLogConfig()).toBeUndefined();
    });

    it('parses premium plan binding', () => {
      process.env.VCAP_SERVICES = JSON.stringify({
        auditlog: [
          {
            plan: 'premium',
            credentials: {
              url: 'https://api.auditlog.cf.example.com:6081',
              uaa: {
                url: 'https://sub.auth.example.com',
                certurl: 'https://sub.auth.cert.example.com',
                clientid: 'my-client-id',
                certificate: '-----BEGIN CERT-----',
                key: '-----BEGIN KEY-----',
              },
            },
          },
        ],
      });

      const config = parseBTPAuditLogConfig();
      expect(config).toBeDefined();
      expect(config!.url).toBe('https://api.auditlog.cf.example.com:6081');
      expect(config!.uaa.clientid).toBe('my-client-id');
    });

    it('returns undefined for invalid JSON', () => {
      process.env.VCAP_SERVICES = 'not-json';
      expect(parseBTPAuditLogConfig()).toBeUndefined();
    });
  });

  describe('Event categorization', () => {
    let stderrSpy: ReturnType<typeof vi.spyOn>;
    let fetchSpy: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
      // Mock global fetch
      fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ access_token: 'test-token', expires_in: 3600 }),
        text: () => Promise.resolve(''),
      });
      vi.stubGlobal('fetch', fetchSpy);
    });

    afterEach(() => {
      stderrSpy.mockRestore();
      vi.unstubAllGlobals();
    });

    const config = {
      url: 'https://api.auditlog.test:6081',
      uaa: {
        url: 'https://sub.auth.test',
        certurl: 'https://sub.auth.cert.test',
        clientid: 'test-client',
        certificate: 'cert',
        key: 'key',
      },
    };

    it('sends security events for auth_scope_denied', async () => {
      const sink = new BTPAuditLogSink(config);
      const event: AuditEvent = {
        timestamp: '',
        level: 'warn',
        event: 'auth_scope_denied',
        tool: 'SAPWrite',
        requiredScope: 'write',
        availableScopes: ['read'],
      };
      sink.write(event);
      await sink.flush();

      // First call is token fetch, second is audit log write
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      const auditCall = fetchSpy.mock.calls[1]!;
      expect(auditCall[0]).toContain('/security-events');
    });

    it('sends data-accesses for read tool calls', async () => {
      const sink = new BTPAuditLogSink(config);
      const event: AuditEvent = {
        timestamp: '',
        level: 'info',
        event: 'tool_call_end',
        tool: 'SAPRead',
        durationMs: 100,
        status: 'success',
      };
      sink.write(event);
      await sink.flush();

      const auditCall = fetchSpy.mock.calls[1]!;
      expect(auditCall[0]).toContain('/data-accesses');
    });

    it('sends data-modifications for write tool calls', async () => {
      const sink = new BTPAuditLogSink(config);
      const event: AuditEvent = {
        timestamp: '',
        level: 'info',
        event: 'tool_call_end',
        tool: 'SAPWrite',
        durationMs: 200,
        status: 'success',
      };
      sink.write(event);
      await sink.flush();

      const auditCall = fetchSpy.mock.calls[1]!;
      expect(auditCall[0]).toContain('/data-modifications');
    });

    it('sends configuration-changes for transport tool calls', async () => {
      const sink = new BTPAuditLogSink(config);
      const event: AuditEvent = {
        timestamp: '',
        level: 'info',
        event: 'tool_call_end',
        tool: 'SAPTransport',
        durationMs: 300,
        status: 'success',
      };
      sink.write(event);
      await sink.flush();

      const auditCall = fetchSpy.mock.calls[1]!;
      expect(auditCall[0]).toContain('/configuration-changes');
    });

    it('does not send http_request events', async () => {
      const sink = new BTPAuditLogSink(config);
      const event: AuditEvent = {
        timestamp: '',
        level: 'debug',
        event: 'http_request',
        method: 'GET',
        path: '/test',
        statusCode: 200,
        durationMs: 50,
      };
      sink.write(event);
      await sink.flush();

      // Only token fetch should happen, no audit log write
      expect(fetchSpy).toHaveBeenCalledTimes(0);
    });

    it('does not send server_start events', async () => {
      const sink = new BTPAuditLogSink(config);
      const event: AuditEvent = {
        timestamp: '',
        level: 'info',
        event: 'server_start',
        version: '3.0.0',
        transport: 'stdio',
        readOnly: false,
        url: 'http://test',
      };
      sink.write(event);
      await sink.flush();

      expect(fetchSpy).toHaveBeenCalledTimes(0);
    });

    it('handles fetch errors gracefully (fire-and-forget)', async () => {
      fetchSpy.mockRejectedValue(new Error('Network error'));
      const sink = new BTPAuditLogSink(config);
      const event: AuditEvent = {
        timestamp: '',
        level: 'warn',
        event: 'safety_blocked',
        operation: 'CreateObject',
        reason: 'readOnly mode',
      };
      sink.write(event);

      // Should not throw
      await sink.flush();
      // Error should be logged to stderr
      expect(stderrSpy).toHaveBeenCalled();
    });
  });
});
