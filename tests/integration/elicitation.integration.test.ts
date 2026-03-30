/**
 * Integration tests for MCP Elicitation.
 *
 * Tests the elicitation helpers with a mock MCP Server that simulates
 * real client responses (accept, decline, cancel). Verifies the full
 * flow from helper → Server.elicitInput() → audit events.
 *
 * These tests don't need a live SAP system — they test the MCP protocol
 * interaction between server and client.
 */

import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuditEvent } from '../../ts-src/server/audit.js';
import { confirmDestructive, promptString, selectOption } from '../../ts-src/server/elicit.js';
import { logger } from '../../ts-src/server/logger.js';

describe('Elicitation Integration', () => {
  let events: AuditEvent[] = [];
  const captureSink = { write: (e: AuditEvent) => events.push(e) };
  let stderrSpy: ReturnType<typeof vi.spyOn>;
  let sinkAdded = false;

  beforeEach(() => {
    events = [];
    captureSink.write = (e: AuditEvent) => events.push(e);
    if (!sinkAdded) {
      logger.addSink(captureSink);
      sinkAdded = true;
    }
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stderrSpy.mockRestore();
  });

  /** Create a mock Server with full elicitation support */
  function mockServer(response: { action: string; content?: Record<string, unknown> }): Server {
    return {
      getClientCapabilities: () => ({ elicitation: { form: {} } }),
      elicitInput: vi.fn().mockResolvedValue(response),
    } as unknown as Server;
  }

  /** Create a mock Server where client doesn't support elicitation */
  function mockServerNoElicitation(): Server {
    return {
      getClientCapabilities: () => ({}),
      elicitInput: vi.fn(),
    } as unknown as Server;
  }

  /** Create a mock Server where elicitInput throws (connection error) */
  function mockServerBroken(): Server {
    return {
      getClientCapabilities: () => ({ elicitation: { form: {} } }),
      elicitInput: vi.fn().mockRejectedValue(new Error('Client disconnected')),
    } as unknown as Server;
  }

  // ─── confirmDestructive ──────────────────────────────────────────

  describe('confirmDestructive — full flow', () => {
    it('user confirms deletion → returns true + audit events', async () => {
      const server = mockServer({ action: 'accept', content: { confirm: true } });

      const result = await confirmDestructive(server, 'SAPManage', 'Delete ZCL_TEST?');

      expect(result).toBe(true);
      expect(server.elicitInput).toHaveBeenCalledTimes(1);

      // Verify elicitInput was called with correct schema
      const call = (server.elicitInput as ReturnType<typeof vi.fn>).mock.calls[0]![0];
      expect(call.message).toBe('Delete ZCL_TEST?');
      expect(call.requestedSchema.properties.confirm.type).toBe('boolean');

      // Verify audit events
      const sent = events.filter((e) => e.event === 'elicitation_sent');
      const response = events.filter((e) => e.event === 'elicitation_response');
      expect(sent.length).toBeGreaterThanOrEqual(1);
      expect(response.length).toBeGreaterThanOrEqual(1);
      expect((sent[0] as any).tool).toBe('SAPManage');
      expect((sent[0] as any).message).toBe('Delete ZCL_TEST?');
      expect((response[0] as any).action).toBe('accept');
    });

    it('user declines deletion → returns false', async () => {
      const server = mockServer({ action: 'decline' });

      const result = await confirmDestructive(server, 'SAPManage', 'Delete ZCL_TEST?');

      expect(result).toBe(false);
    });

    it('user cancels → returns false', async () => {
      const server = mockServer({ action: 'cancel' });

      const result = await confirmDestructive(server, 'SAPTransport', 'Release TR K900001?');

      expect(result).toBe(false);

      const response = events.filter((e) => e.event === 'elicitation_response');
      expect((response[0] as any).action).toBe('cancel');
    });

    it('user accepts but confirm=false → returns false', async () => {
      const server = mockServer({ action: 'accept', content: { confirm: false } });

      const result = await confirmDestructive(server, 'SAPManage', 'Delete?');

      expect(result).toBe(false);
    });

    it('no server → graceful fallback (returns true)', async () => {
      const result = await confirmDestructive(undefined, 'SAPManage', 'Delete?');

      expect(result).toBe(true);
      // No elicitation events should be emitted
      const sent = events.filter((e) => e.event === 'elicitation_sent');
      expect(sent).toHaveLength(0);
    });

    it('client without elicitation support → graceful fallback', async () => {
      const server = mockServerNoElicitation();

      const result = await confirmDestructive(server, 'SAPManage', 'Delete?');

      expect(result).toBe(true);
      expect(server.elicitInput).not.toHaveBeenCalled();
    });

    it('broken server connection → graceful fallback', async () => {
      const server = mockServerBroken();

      const result = await confirmDestructive(server, 'SAPManage', 'Delete?');

      // Should not throw, should return true (fallback)
      expect(result).toBe(true);
    });
  });

  // ─── selectOption ────────────────────────────────────────────────

  describe('selectOption — full flow', () => {
    const packages = [
      { value: '$TMP', title: 'Local package ($TMP)' },
      { value: 'ZPACKAGE', title: 'Custom package (ZPACKAGE)' },
      { value: 'ZTEST', title: 'Test package (ZTEST)' },
    ];

    it('user selects a package → returns selected value', async () => {
      const server = mockServer({ action: 'accept', content: { selection: 'ZPACKAGE' } });

      const result = await selectOption(server, 'SAPWrite', 'Select target package:', packages);

      expect(result).toBe('ZPACKAGE');

      // Verify schema has all enum values
      const call = (server.elicitInput as ReturnType<typeof vi.fn>).mock.calls[0]![0];
      expect(call.requestedSchema.properties.selection.enum).toEqual(['$TMP', 'ZPACKAGE', 'ZTEST']);
      expect(call.requestedSchema.properties.selection.enumNames).toEqual([
        'Local package ($TMP)',
        'Custom package (ZPACKAGE)',
        'Test package (ZTEST)',
      ]);
    });

    it('user cancels package selection → returns undefined', async () => {
      const server = mockServer({ action: 'cancel' });

      const result = await selectOption(server, 'SAPWrite', 'Select package:', packages);

      expect(result).toBeUndefined();
    });

    it('no server → returns undefined (not true like confirm)', async () => {
      const result = await selectOption(undefined, 'SAPWrite', 'Select package:', packages);

      expect(result).toBeUndefined();
    });

    it('selects transport from list', async () => {
      const transports = [
        { value: 'K900001', title: 'K900001 - Fix login bug' },
        { value: 'K900002', title: 'K900002 - New report' },
      ];
      const server = mockServer({ action: 'accept', content: { selection: 'K900001' } });

      const result = await selectOption(server, 'SAPWrite', 'Select transport:', transports);

      expect(result).toBe('K900001');
    });
  });

  // ─── promptString ────────────────────────────────────────────────

  describe('promptString — full flow', () => {
    it('user provides transport description → returns value', async () => {
      const server = mockServer({ action: 'accept', content: { description: 'Bug fix for login' } });

      const result = await promptString(
        server,
        'SAPTransport',
        'Enter transport description:',
        'description',
        'A short description for the transport request',
      );

      expect(result).toBe('Bug fix for login');

      // Verify schema
      const call = (server.elicitInput as ReturnType<typeof vi.fn>).mock.calls[0]![0];
      expect(call.requestedSchema.properties.description.type).toBe('string');
      expect(call.requestedSchema.properties.description.description).toBe(
        'A short description for the transport request',
      );
      expect(call.requestedSchema.required).toEqual(['description']);
    });

    it('user cancels → returns undefined', async () => {
      const server = mockServer({ action: 'cancel' });

      const result = await promptString(server, 'SAPTransport', 'Enter description:', 'description');

      expect(result).toBeUndefined();
    });

    it('no server → returns undefined', async () => {
      const result = await promptString(undefined, 'SAPTransport', 'Enter description:', 'description');

      expect(result).toBeUndefined();
    });

    it('custom field name is used correctly', async () => {
      const server = mockServer({ action: 'accept', content: { packageName: 'ZTEST' } });

      const result = await promptString(server, 'SAPWrite', 'Enter package name:', 'packageName');

      expect(result).toBe('ZTEST');

      const call = (server.elicitInput as ReturnType<typeof vi.fn>).mock.calls[0]![0];
      expect(call.requestedSchema.properties.packageName).toBeDefined();
    });

    it('broken server → returns undefined gracefully', async () => {
      const server = mockServerBroken();

      const result = await promptString(server, 'SAPTransport', 'Enter description:', 'description');

      expect(result).toBeUndefined();
    });
  });

  // ─── Audit Event Verification ────────────────────────────────────

  describe('audit events for elicitation', () => {
    it('elicitation_sent event has correct structure', async () => {
      const server = mockServer({ action: 'accept', content: { confirm: true } });
      events.length = 0;

      await confirmDestructive(server, 'SAPManage', 'Delete ZPROG?');

      const sent = events.filter((e) => e.event === 'elicitation_sent');
      expect(sent).toHaveLength(1);

      const e = sent[0] as any;
      expect(e.timestamp).toBeTruthy();
      expect(e.level).toBe('info');
      expect(e.tool).toBe('SAPManage');
      expect(e.message).toBe('Delete ZPROG?');
      expect(e.fields).toEqual(['confirm']);
    });

    it('elicitation_response event captures action', async () => {
      const server = mockServer({ action: 'decline' });
      events.length = 0;

      await confirmDestructive(server, 'SAPTransport', 'Release?');

      const resp = events.filter((e) => e.event === 'elicitation_response');
      expect(resp).toHaveLength(1);

      const e = resp[0] as any;
      expect(e.tool).toBe('SAPTransport');
      expect(e.action).toBe('decline');
    });

    it('no audit events when elicitation is not supported', async () => {
      const server = mockServerNoElicitation();
      events.length = 0;

      await confirmDestructive(server, 'SAPManage', 'Delete?');

      const elicitEvents = events.filter((e) => e.event === 'elicitation_sent' || e.event === 'elicitation_response');
      expect(elicitEvents).toHaveLength(0);
    });

    it('selectOption produces correct audit events', async () => {
      const server = mockServer({ action: 'accept', content: { selection: 'ZTEST' } });
      events.length = 0;

      await selectOption(server, 'SAPWrite', 'Pick package:', [{ value: 'ZTEST', title: 'Test' }]);

      const sent = events.filter((e) => e.event === 'elicitation_sent');
      expect(sent).toHaveLength(1);
      expect((sent[0] as any).fields).toEqual(['selection']);
    });

    it('promptString produces correct audit events', async () => {
      const server = mockServer({ action: 'accept', content: { name: 'MyTransport' } });
      events.length = 0;

      await promptString(server, 'SAPTransport', 'Enter name:', 'name');

      const sent = events.filter((e) => e.event === 'elicitation_sent');
      expect(sent).toHaveLength(1);
      expect((sent[0] as any).fields).toEqual(['name']);
    });
  });
});
