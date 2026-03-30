import { describe, expect, it } from 'vitest';
import { getToolDefinitions } from '../../../ts-src/handlers/tools.js';
import { DEFAULT_CONFIG } from '../../../ts-src/server/types.js';

describe('Tool Definitions', () => {
  it('returns tools for default config', () => {
    const tools = getToolDefinitions(DEFAULT_CONFIG);
    expect(tools.length).toBeGreaterThan(0);
  });

  it('always includes SAPRead and SAPSearch', () => {
    const tools = getToolDefinitions(DEFAULT_CONFIG);
    const names = tools.map((t) => t.name);
    expect(names).toContain('SAPRead');
    expect(names).toContain('SAPSearch');
  });

  it('registers all implemented tools', () => {
    const tools = getToolDefinitions({ ...DEFAULT_CONFIG, readOnly: false });
    const names = tools.map((t) => t.name);
    // All implemented tools should be registered
    expect(names).toContain('SAPRead');
    expect(names).toContain('SAPSearch');
    expect(names).toContain('SAPQuery');
    expect(names).toContain('SAPLint');
    expect(names).toContain('SAPWrite');
    expect(names).toContain('SAPActivate');
    expect(names).toContain('SAPNavigate');
    expect(names).toContain('SAPDiagnose');
    expect(names).toContain('SAPTransport');
    // SAPContext and SAPManage are now implemented
    expect(names).toContain('SAPContext');
    expect(names).toContain('SAPManage');
  });

  it('hides write tools in read-only mode', () => {
    const tools = getToolDefinitions({ ...DEFAULT_CONFIG, readOnly: true });
    const names = tools.map((t) => t.name);
    expect(names).not.toContain('SAPWrite');
    expect(names).not.toContain('SAPActivate');
    expect(names).not.toContain('SAPManage');
    // Navigate, Diagnose, and SAPContext should still be available
    expect(names).toContain('SAPNavigate');
    expect(names).toContain('SAPDiagnose');
    expect(names).toContain('SAPContext');
  });

  it('hides SAPTransport in read-only mode without enableTransports', () => {
    const tools = getToolDefinitions({ ...DEFAULT_CONFIG, readOnly: true, enableTransports: false });
    const names = tools.map((t) => t.name);
    expect(names).not.toContain('SAPTransport');
  });

  it('shows SAPTransport in read-only mode with enableTransports', () => {
    const tools = getToolDefinitions({ ...DEFAULT_CONFIG, readOnly: true, enableTransports: true });
    const names = tools.map((t) => t.name);
    expect(names).toContain('SAPTransport');
  });

  it('all tools have required schema properties', () => {
    const tools = getToolDefinitions(DEFAULT_CONFIG);
    for (const tool of tools) {
      expect(tool.name).toBeTruthy();
      expect(tool.description).toBeTruthy();
      expect(tool.inputSchema).toBeDefined();
      expect(tool.inputSchema.type).toBe('object');
    }
  });

  it('includes SAPLint and SAPQuery', () => {
    const tools = getToolDefinitions(DEFAULT_CONFIG);
    const names = tools.map((t) => t.name);
    expect(names).toContain('SAPLint');
    expect(names).toContain('SAPQuery');
  });

  // ─── Schema Validation (Issue #47: OpenAI compatibility) ─────────

  it('every array property has an items definition (Issue #47)', () => {
    // OpenAI/GPT models reject tool schemas where array types lack `items`.
    // This caused Eclipse GitHub Copilot to fail with:
    // "Invalid schema for function: array schema missing items"
    const tools = getToolDefinitions(DEFAULT_CONFIG);
    for (const tool of tools) {
      const schema = tool.inputSchema as Record<string, any>;
      if (schema.properties) {
        for (const [propName, propDef] of Object.entries(schema.properties as Record<string, any>)) {
          if (propDef.type === 'array') {
            expect(propDef.items, `Tool ${tool.name}, property ${propName}: array missing items`).toBeDefined();
          }
        }
      }
    }
  });

  it('all schemas have valid JSON Schema structure', () => {
    const tools = getToolDefinitions(DEFAULT_CONFIG);
    for (const tool of tools) {
      const schema = tool.inputSchema as Record<string, any>;
      expect(schema.type).toBe('object');
      // properties should be an object if present
      if (schema.properties) {
        expect(typeof schema.properties).toBe('object');
      }
      // required should be an array if present
      if (schema.required) {
        expect(Array.isArray(schema.required)).toBe(true);
      }
    }
  });

  it('descriptions are non-empty and reasonable length', () => {
    const tools = getToolDefinitions(DEFAULT_CONFIG);
    for (const tool of tools) {
      expect(tool.description.length, `Tool ${tool.name} description too short`).toBeGreaterThan(10);
    }
  });
});
