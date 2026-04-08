/**
 * Unit tests for hyperfocused mode (single universal SAP tool).
 */

import { describe, expect, it } from 'vitest';
import {
  expandHyperfocusedArgs,
  getHyperfocusedScope,
  getHyperfocusedToolDefinition,
} from '../../../src/handlers/hyperfocused.js';
import { getToolDefinitions } from '../../../src/handlers/tools.js';
import { DEFAULT_CONFIG } from '../../../src/server/types.js';

describe('hyperfocused mode', () => {
  describe('expandHyperfocusedArgs', () => {
    it('routes read action to SAPRead', () => {
      const result = expandHyperfocusedArgs({ action: 'read', type: 'CLAS', name: 'ZCL_TEST' });
      expect('error' in result).toBe(false);
      if (!('error' in result)) {
        expect(result.toolName).toBe('SAPRead');
        expect(result.expandedArgs.type).toBe('CLAS');
        expect(result.expandedArgs.name).toBe('ZCL_TEST');
      }
    });

    it('routes search action to SAPSearch', () => {
      const result = expandHyperfocusedArgs({ action: 'search', params: { query: 'ZCL*' } });
      expect('error' in result).toBe(false);
      if (!('error' in result)) {
        expect(result.toolName).toBe('SAPSearch');
        expect(result.expandedArgs.query).toBe('ZCL*');
      }
    });

    it('routes write action to SAPWrite', () => {
      const result = expandHyperfocusedArgs({
        action: 'write',
        type: 'CLAS',
        name: 'ZCL_TEST',
        params: { action: 'update', source: 'CLASS zcl_test...' },
      });
      expect('error' in result).toBe(false);
      if (!('error' in result)) {
        expect(result.toolName).toBe('SAPWrite');
        expect(result.expandedArgs.type).toBe('CLAS');
        expect(result.expandedArgs.action).toBe('update');
        expect(result.expandedArgs.source).toBe('CLASS zcl_test...');
      }
    });

    it('routes all valid actions', () => {
      const actions = [
        'read',
        'search',
        'query',
        'write',
        'activate',
        'navigate',
        'lint',
        'diagnose',
        'transport',
        'context',
        'manage',
      ];
      for (const action of actions) {
        const result = expandHyperfocusedArgs({ action });
        expect('error' in result).toBe(false);
      }
    });

    it('returns error for unknown action', () => {
      const result = expandHyperfocusedArgs({ action: 'invalid' });
      expect('error' in result).toBe(true);
      if ('error' in result) {
        expect(result.error).toContain('Unknown action');
      }
    });

    it('top-level type/name take precedence over params', () => {
      const result = expandHyperfocusedArgs({
        action: 'read',
        type: 'CLAS',
        name: 'ZCL_A',
        params: { type: 'PROG', name: 'ZREPORT' },
      });
      expect('error' in result).toBe(false);
      if (!('error' in result)) {
        expect(result.expandedArgs.type).toBe('CLAS');
        expect(result.expandedArgs.name).toBe('ZCL_A');
      }
    });
  });

  describe('getHyperfocusedScope', () => {
    it('returns read scope for read actions', () => {
      expect(getHyperfocusedScope('read')).toBe('read');
      expect(getHyperfocusedScope('search')).toBe('read');
      expect(getHyperfocusedScope('context')).toBe('read');
    });

    it('returns write scope for write actions', () => {
      expect(getHyperfocusedScope('write')).toBe('write');
      expect(getHyperfocusedScope('activate')).toBe('write');
      expect(getHyperfocusedScope('manage')).toBe('write');
      expect(getHyperfocusedScope('transport')).toBe('write');
    });

    it('returns sql scope for query', () => {
      expect(getHyperfocusedScope('query')).toBe('sql');
    });
  });

  describe('getHyperfocusedToolDefinition', () => {
    it('returns a single tool named SAP', () => {
      const config = { ...DEFAULT_CONFIG };
      const tool = getHyperfocusedToolDefinition(config);
      expect(tool.name).toBe('SAP');
      expect(tool.description).toContain('Universal SAP tool');
    });

    it('includes all actions in non-readOnly mode', () => {
      const config = { ...DEFAULT_CONFIG, readOnly: false, enableTransports: true };
      const tool = getHyperfocusedToolDefinition(config);
      const schema = tool.inputSchema as Record<string, any>;
      const actions = schema.properties.action.enum as string[];
      expect(actions).toContain('read');
      expect(actions).toContain('write');
      expect(actions).toContain('transport');
    });

    it('excludes write actions in readOnly mode', () => {
      const config = { ...DEFAULT_CONFIG, readOnly: true };
      const tool = getHyperfocusedToolDefinition(config);
      const schema = tool.inputSchema as Record<string, any>;
      const actions = schema.properties.action.enum as string[];
      expect(actions).toContain('read');
      expect(actions).not.toContain('write');
      expect(actions).not.toContain('activate');
      expect(actions).not.toContain('manage');
    });
  });

  describe('getToolDefinitions integration', () => {
    it('returns single SAP tool in hyperfocused mode', () => {
      const config = { ...DEFAULT_CONFIG, toolMode: 'hyperfocused' as const };
      const tools = getToolDefinitions(config);
      expect(tools.length).toBe(1);
      expect(tools[0]!.name).toBe('SAP');
    });

    it('returns 11+ tools in standard mode', () => {
      const config = { ...DEFAULT_CONFIG, toolMode: 'standard' as const };
      const tools = getToolDefinitions(config);
      expect(tools.length).toBeGreaterThanOrEqual(11);
      expect(tools.find((t) => t.name === 'SAPRead')).toBeDefined();
    });
  });
});
