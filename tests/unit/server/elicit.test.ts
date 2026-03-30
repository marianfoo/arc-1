import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { confirmDestructive, promptString, selectOption } from '../../../ts-src/server/elicit.js';

// Mock the logger to avoid stderr output in tests
vi.mock('../../../ts-src/server/logger.js', () => ({
  logger: {
    emitAudit: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

/** Create a mock MCP Server with elicitation support */
function createMockServer(elicitResult?: { action: string; content?: Record<string, unknown> }) {
  return {
    getClientCapabilities: vi.fn().mockReturnValue({
      elicitation: { form: {} },
    }),
    elicitInput: vi.fn().mockResolvedValue(elicitResult ?? { action: 'accept', content: { confirm: true } }),
  } as unknown as import('@modelcontextprotocol/sdk/server/index.js').Server;
}

/** Create a mock server without elicitation support */
function createMockServerNoElicitation() {
  return {
    getClientCapabilities: vi.fn().mockReturnValue({}),
    elicitInput: vi.fn(),
  } as unknown as import('@modelcontextprotocol/sdk/server/index.js').Server;
}

describe('Elicitation Helpers', () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stderrSpy.mockRestore();
  });

  describe('confirmDestructive', () => {
    it('returns true when user confirms', async () => {
      const server = createMockServer({ action: 'accept', content: { confirm: true } });
      const result = await confirmDestructive(server, 'SAPManage', 'Delete object?');
      expect(result).toBe(true);
      expect(server.elicitInput).toHaveBeenCalled();
    });

    it('returns false when user declines', async () => {
      const server = createMockServer({ action: 'decline' });
      const result = await confirmDestructive(server, 'SAPManage', 'Delete object?');
      expect(result).toBe(false);
    });

    it('returns false when user cancels', async () => {
      const server = createMockServer({ action: 'cancel' });
      const result = await confirmDestructive(server, 'SAPManage', 'Delete object?');
      expect(result).toBe(false);
    });

    it('returns false when confirm is false', async () => {
      const server = createMockServer({ action: 'accept', content: { confirm: false } });
      const result = await confirmDestructive(server, 'SAPManage', 'Delete object?');
      expect(result).toBe(false);
    });

    it('returns true when server is undefined (fallback)', async () => {
      const result = await confirmDestructive(undefined, 'SAPManage', 'Delete object?');
      expect(result).toBe(true);
    });

    it('returns true when client does not support elicitation (fallback)', async () => {
      const server = createMockServerNoElicitation();
      const result = await confirmDestructive(server, 'SAPManage', 'Delete object?');
      expect(result).toBe(true);
      expect(server.elicitInput).not.toHaveBeenCalled();
    });

    it('returns true when elicitInput throws (graceful fallback)', async () => {
      const server = createMockServer();
      (server.elicitInput as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Not supported'));
      const result = await confirmDestructive(server, 'SAPManage', 'Delete object?');
      expect(result).toBe(true);
    });
  });

  describe('selectOption', () => {
    const options = [
      { value: '$TMP', title: 'Local ($TMP)' },
      { value: 'ZPACKAGE', title: 'Custom (ZPACKAGE)' },
    ];

    it('returns selected value when user accepts', async () => {
      const server = createMockServer({ action: 'accept', content: { selection: 'ZPACKAGE' } });
      const result = await selectOption(server, 'SAPWrite', 'Select package', options);
      expect(result).toBe('ZPACKAGE');
    });

    it('returns undefined when user cancels', async () => {
      const server = createMockServer({ action: 'cancel' });
      const result = await selectOption(server, 'SAPWrite', 'Select package', options);
      expect(result).toBeUndefined();
    });

    it('returns undefined when server is undefined', async () => {
      const result = await selectOption(undefined, 'SAPWrite', 'Select package', options);
      expect(result).toBeUndefined();
    });

    it('returns undefined when client does not support elicitation', async () => {
      const server = createMockServerNoElicitation();
      const result = await selectOption(server, 'SAPWrite', 'Select package', options);
      expect(result).toBeUndefined();
    });

    it('passes options to elicitInput schema', async () => {
      const server = createMockServer({ action: 'accept', content: { selection: '$TMP' } });
      await selectOption(server, 'SAPWrite', 'Select package', options);

      const call = (server.elicitInput as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
      expect(call.requestedSchema.properties.selection.enum).toEqual(['$TMP', 'ZPACKAGE']);
    });
  });

  describe('promptString', () => {
    it('returns string value when user accepts', async () => {
      const server = createMockServer({ action: 'accept', content: { description: 'My transport' } });
      const result = await promptString(server, 'SAPTransport', 'Enter description', 'description');
      expect(result).toBe('My transport');
    });

    it('returns undefined when user cancels', async () => {
      const server = createMockServer({ action: 'cancel' });
      const result = await promptString(server, 'SAPTransport', 'Enter description', 'description');
      expect(result).toBeUndefined();
    });

    it('returns undefined when server is undefined', async () => {
      const result = await promptString(undefined, 'SAPTransport', 'Enter description', 'description');
      expect(result).toBeUndefined();
    });

    it('uses fieldName in schema', async () => {
      const server = createMockServer({ action: 'accept', content: { myField: 'value' } });
      await promptString(server, 'SAPTransport', 'Enter value', 'myField', 'A custom description');

      const call = (server.elicitInput as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
      expect(call.requestedSchema.properties.myField).toBeDefined();
      expect(call.requestedSchema.properties.myField.description).toBe('A custom description');
    });
  });
});
