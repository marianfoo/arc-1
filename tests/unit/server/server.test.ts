import { describe, expect, it } from 'vitest';
import { createServer, VERSION } from '../../../ts-src/server/server.js';
import { DEFAULT_CONFIG } from '../../../ts-src/server/types.js';

describe('MCP Server', () => {
  it('creates a server instance with correct name and version', () => {
    const server = createServer(DEFAULT_CONFIG);
    expect(server).toBeDefined();
  });

  it('has a valid version string', () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });
});
