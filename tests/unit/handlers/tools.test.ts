import { describe, expect, it } from 'vitest';
import { getToolDefinitions } from '../../../src/handlers/tools.js';
import { DEFAULT_CONFIG } from '../../../src/server/types.js';

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
    const tools = getToolDefinitions({
      ...DEFAULT_CONFIG,
      readOnly: false,
      blockFreeSQL: false,
      enableTransports: true,
    });
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

  it('hides SAPTransport when readOnly=false but enableTransports=false', () => {
    const tools = getToolDefinitions({ ...DEFAULT_CONFIG, readOnly: false, enableTransports: false });
    const names = tools.map((t) => t.name);
    expect(names).not.toContain('SAPTransport');
  });

  it('shows SAPTransport when enableTransports=true', () => {
    const tools = getToolDefinitions({ ...DEFAULT_CONFIG, enableTransports: true });
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

  it('SAPManage exposes package and FLP actions', () => {
    const tools = getToolDefinitions({ ...DEFAULT_CONFIG, readOnly: false });
    const sapManage = tools.find((t) => t.name === 'SAPManage')!;
    const schema = sapManage.inputSchema as Record<string, any>;
    const actionEnum: string[] = schema.properties.action.enum;

    expect(actionEnum).toContain('create_package');
    expect(actionEnum).toContain('delete_package');
    expect(actionEnum).toContain('flp_list_catalogs');
    expect(actionEnum).toContain('flp_list_groups');
    expect(actionEnum).toContain('flp_list_tiles');
    expect(actionEnum).toContain('flp_create_catalog');
    expect(actionEnum).toContain('flp_create_group');
    expect(actionEnum).toContain('flp_create_tile');
    expect(actionEnum).toContain('flp_add_tile_to_group');
    expect(actionEnum).toContain('flp_delete_catalog');
  });

  it('includes SAPLint but hides SAPQuery by default (blockFreeSQL=true)', () => {
    const tools = getToolDefinitions(DEFAULT_CONFIG);
    const names = tools.map((t) => t.name);
    expect(names).toContain('SAPLint');
    expect(names).not.toContain('SAPQuery');
  });

  it('shows SAPQuery when blockFreeSQL=false', () => {
    const tools = getToolDefinitions({ ...DEFAULT_CONFIG, blockFreeSQL: false });
    const names = tools.map((t) => t.name);
    expect(names).toContain('SAPQuery');
  });

  it('SAPLint only exposes lint action (atc/syntax moved to SAPDiagnose)', () => {
    const tools = getToolDefinitions(DEFAULT_CONFIG);
    const sapLint = tools.find((t) => t.name === 'SAPLint')!;
    const schema = sapLint.inputSchema as Record<string, any>;
    const actionEnum: string[] = schema.properties.action.enum;

    expect(actionEnum).toContain('lint');
    expect(actionEnum).not.toContain('atc');
    expect(actionEnum).not.toContain('syntax');
    expect(actionEnum).toContain('lint_and_fix');
    expect(actionEnum).toContain('list_rules');
    expect(actionEnum).toHaveLength(3);
  });

  it('SAPLint description mentions SAPDiagnose for server-side checks', () => {
    const tools = getToolDefinitions(DEFAULT_CONFIG);
    const sapLint = tools.find((t) => t.name === 'SAPLint')!;
    expect(sapLint.description).toContain('SAPDiagnose');
  });

  it('SAPDiagnose exposes syntax, unittest, atc, dumps, traces', () => {
    const tools = getToolDefinitions(DEFAULT_CONFIG);
    const sapDiagnose = tools.find((t) => t.name === 'SAPDiagnose')!;
    const schema = sapDiagnose.inputSchema as Record<string, any>;
    const actionEnum: string[] = schema.properties.action.enum;

    expect(actionEnum).toContain('syntax');
    expect(actionEnum).toContain('unittest');
    expect(actionEnum).toContain('atc');
    expect(actionEnum).toContain('dumps');
    expect(actionEnum).toContain('traces');
  });

  // ─── textSearch-based SAPSearch adaptation ───────────────────────

  describe('SAPSearch textSearch adaptation', () => {
    it('includes source_code in searchType when textSearch is available', () => {
      const tools = getToolDefinitions(DEFAULT_CONFIG, true);
      const sapSearch = tools.find((t) => t.name === 'SAPSearch')!;
      const schema = sapSearch.inputSchema as Record<string, any>;
      expect(schema.properties.searchType).toBeDefined();
      expect(schema.properties.searchType.enum).toContain('source_code');
      expect(schema.properties.objectType).toBeDefined();
      expect(schema.properties.packageName).toBeDefined();
    });

    it('omits source_code from SAPSearch when textSearch is unavailable', () => {
      const tools = getToolDefinitions(DEFAULT_CONFIG, false);
      const sapSearch = tools.find((t) => t.name === 'SAPSearch')!;
      const schema = sapSearch.inputSchema as Record<string, any>;
      expect(schema.properties.searchType).toBeUndefined();
      expect(schema.properties.objectType).toBeUndefined();
      expect(schema.properties.packageName).toBeUndefined();
    });

    it('includes source_code when textSearch is undefined (not yet probed)', () => {
      const tools = getToolDefinitions(DEFAULT_CONFIG);
      const sapSearch = tools.find((t) => t.name === 'SAPSearch')!;
      const schema = sapSearch.inputSchema as Record<string, any>;
      expect(schema.properties.searchType).toBeDefined();
      expect(schema.properties.searchType.enum).toContain('source_code');
    });

    it('SAPSearch description omits source_code mode when unavailable', () => {
      const tools = getToolDefinitions(DEFAULT_CONFIG, false);
      const sapSearch = tools.find((t) => t.name === 'SAPSearch')!;
      expect(sapSearch.description).not.toContain('source_code');
      expect(sapSearch.description).not.toContain('Source code search');
    });
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

  // ─── BTP System Type Adaptation ─────────────────────────────────

  describe('BTP system type adaptation', () => {
    const btpConfig = { ...DEFAULT_CONFIG, readOnly: false, blockFreeSQL: false, systemType: 'btp' as const };
    const onpremConfig = { ...DEFAULT_CONFIG, readOnly: false, blockFreeSQL: false, systemType: 'onprem' as const };
    const autoConfig = { ...DEFAULT_CONFIG, readOnly: false, blockFreeSQL: false, systemType: 'auto' as const };

    it('removes PROG, INCL, VIEW, TEXT_ELEMENTS, VARIANTS from SAPRead on BTP', () => {
      const tools = getToolDefinitions(btpConfig);
      const sapRead = tools.find((t) => t.name === 'SAPRead')!;
      const schema = sapRead.inputSchema as Record<string, any>;
      const typeEnum: string[] = schema.properties.type.enum;

      expect(typeEnum).not.toContain('PROG');
      expect(typeEnum).not.toContain('INCL');
      expect(typeEnum).not.toContain('VIEW');
      expect(typeEnum).not.toContain('TEXT_ELEMENTS');
      expect(typeEnum).not.toContain('VARIANTS');
      expect(typeEnum).not.toContain('SOBJ');
    });

    it('keeps CLAS, INTF, DDLS, DDLX, BDEF, SRVD, SRVB on BTP', () => {
      const tools = getToolDefinitions(btpConfig);
      const sapRead = tools.find((t) => t.name === 'SAPRead')!;
      const schema = sapRead.inputSchema as Record<string, any>;
      const typeEnum: string[] = schema.properties.type.enum;

      expect(typeEnum).toContain('CLAS');
      expect(typeEnum).toContain('INTF');
      expect(typeEnum).toContain('DDLS');
      expect(typeEnum).toContain('DDLX');
      expect(typeEnum).toContain('BDEF');
      expect(typeEnum).toContain('SRVD');
      expect(typeEnum).toContain('SRVB');
      expect(typeEnum).toContain('TABLE_CONTENTS');
    });

    it('includes all types on on-premise', () => {
      const tools = getToolDefinitions(onpremConfig);
      const sapRead = tools.find((t) => t.name === 'SAPRead')!;
      const schema = sapRead.inputSchema as Record<string, any>;
      const typeEnum: string[] = schema.properties.type.enum;

      expect(typeEnum).toContain('PROG');
      expect(typeEnum).toContain('INCL');
      expect(typeEnum).toContain('VIEW');
      expect(typeEnum).toContain('TEXT_ELEMENTS');
      expect(typeEnum).toContain('VARIANTS');
      expect(typeEnum).toContain('SOBJ');
      expect(typeEnum).toContain('DDLX');
      expect(typeEnum).toContain('SRVB');
    });

    it('includes DDLS, DDLX, BDEF, SRVD, SRVB, TABL, DOMA, DTEL in SAPWrite types on both BTP and on-prem', () => {
      for (const config of [btpConfig, onpremConfig]) {
        const tools = getToolDefinitions(config);
        const sapWrite = tools.find((t) => t.name === 'SAPWrite')!;
        const schema = sapWrite.inputSchema as Record<string, any>;
        const typeEnum: string[] = schema.properties.type.enum;

        expect(typeEnum).toContain('DDLS');
        expect(typeEnum).toContain('DDLX');
        expect(typeEnum).toContain('BDEF');
        expect(typeEnum).toContain('SRVD');
        expect(typeEnum).toContain('SRVB');
        expect(typeEnum).toContain('TABL');
        expect(typeEnum).toContain('DOMA');
        expect(typeEnum).toContain('DTEL');
      }
    });

    it('SAPActivate schema includes objects array for batch activation', () => {
      const tools = getToolDefinitions(onpremConfig);
      const sapActivate = tools.find((t) => t.name === 'SAPActivate')!;
      const schema = sapActivate.inputSchema as Record<string, any>;

      expect(schema.properties.objects).toBeDefined();
      expect(schema.properties.objects.type).toBe('array');
      expect(schema.properties.objects.items).toBeDefined();
      expect(schema.properties.objects.items.properties.type).toBeDefined();
      expect(schema.properties.objects.items.properties.name).toBeDefined();
    });

    it('uses on-premise types when systemType is auto (default)', () => {
      const tools = getToolDefinitions(autoConfig);
      const sapRead = tools.find((t) => t.name === 'SAPRead')!;
      const schema = sapRead.inputSchema as Record<string, any>;
      const typeEnum: string[] = schema.properties.type.enum;

      // auto mode = full tool set (on-premise superset)
      expect(typeEnum).toContain('PROG');
      expect(typeEnum).toContain('INCL');
    });

    it('removes PROG and INCL from SAPWrite on BTP', () => {
      const tools = getToolDefinitions(btpConfig);
      const sapWrite = tools.find((t) => t.name === 'SAPWrite')!;
      const schema = sapWrite.inputSchema as Record<string, any>;
      const typeEnum: string[] = schema.properties.type.enum;

      expect(typeEnum).not.toContain('PROG');
      expect(typeEnum).not.toContain('INCL');
      expect(typeEnum).not.toContain('FUNC');
      expect(typeEnum).toContain('CLAS');
      expect(typeEnum).toContain('INTF');
      expect(typeEnum).toContain('TABL');
      expect(typeEnum).toContain('SRVB');
      expect(typeEnum).toContain('DOMA');
      expect(typeEnum).toContain('DTEL');
    });

    it('removes PROG and FUNC from SAPContext on BTP', () => {
      const tools = getToolDefinitions(btpConfig);
      const sapContext = tools.find((t) => t.name === 'SAPContext')!;
      const schema = sapContext.inputSchema as Record<string, any>;
      const typeEnum: string[] = schema.properties.type.enum;

      expect(typeEnum).not.toContain('PROG');
      expect(typeEnum).not.toContain('FUNC');
      expect(typeEnum).toContain('CLAS');
      expect(typeEnum).toContain('INTF');
    });

    it('BTP SAPQuery description warns about blocked tables and suggests CDS views', () => {
      const tools = getToolDefinitions(btpConfig);
      const sapQuery = tools.find((t) => t.name === 'SAPQuery')!;

      expect(sapQuery.description).toContain('BTP');
      expect(sapQuery.description).toContain('custom Z/Y tables');
      expect(sapQuery.description).toContain('blocked');
      expect(sapQuery.description).toContain('I_LANGUAGE');
    });

    it('on-premise SAPQuery description suggests metadata tables for reverse-engineering', () => {
      const tools = getToolDefinitions(onpremConfig);
      const sapQuery = tools.find((t) => t.name === 'SAPQuery')!;

      expect(sapQuery.description).toContain('DD02L');
      expect(sapQuery.description).toContain('TADIR');
      expect(sapQuery.description).toContain('reverse-engineering');
    });

    it('BTP SAPTransport description mentions gCTS', () => {
      const tools = getToolDefinitions({ ...btpConfig, enableTransports: true });
      const sapTransport = tools.find((t) => t.name === 'SAPTransport')!;

      expect(sapTransport.description).toContain('gCTS');
      expect(sapTransport.description).toContain('BTP');
    });

    it('BTP SAPRead description mentions BTP limitations', () => {
      const tools = getToolDefinitions(btpConfig);
      const sapRead = tools.find((t) => t.name === 'SAPRead')!;

      expect(sapRead.description).toContain('BTP');
      expect(sapRead.description).toContain('IF_OO_ADT_CLASSRUN');
    });

    it('BTP SAPSearch description mentions released objects', () => {
      const tools = getToolDefinitions(btpConfig);
      const sapSearch = tools.find((t) => t.name === 'SAPSearch')!;

      expect(sapSearch.description).toContain('BTP');
      expect(sapSearch.description).toContain('released');
    });

    it('includes method but not expand_includes on BTP SAPRead', () => {
      const tools = getToolDefinitions(btpConfig);
      const sapRead = tools.find((t) => t.name === 'SAPRead')!;
      const schema = sapRead.inputSchema as Record<string, any>;

      // method is available on both BTP and on-prem (for CLAS method-level reads)
      expect(schema.properties.method).toBeDefined();
      // expand_includes is on-prem only (for FUGR)
      expect(schema.properties.expand_includes).toBeUndefined();
    });

    it('includes method and expand_includes props on on-premise SAPRead', () => {
      const tools = getToolDefinitions(onpremConfig);
      const sapRead = tools.find((t) => t.name === 'SAPRead')!;
      const schema = sapRead.inputSchema as Record<string, any>;

      expect(schema.properties.method).toBeDefined();
      expect(schema.properties.expand_includes).toBeDefined();
    });

    it('does not include group prop in BTP SAPContext', () => {
      const tools = getToolDefinitions(btpConfig);
      const sapContext = tools.find((t) => t.name === 'SAPContext')!;
      const schema = sapContext.inputSchema as Record<string, any>;

      expect(schema.properties.group).toBeUndefined();
    });

    it('still passes schema validation for BTP tools', () => {
      const tools = getToolDefinitions(btpConfig);
      for (const tool of tools) {
        const schema = tool.inputSchema as Record<string, any>;
        expect(schema.type).toBe('object');
        expect(tool.description.length).toBeGreaterThan(10);
        // Check array items (Issue #47)
        if (schema.properties) {
          for (const [propName, propDef] of Object.entries(schema.properties as Record<string, any>)) {
            if (propDef.type === 'array') {
              expect(propDef.items, `BTP Tool ${tool.name}, property ${propName}: array missing items`).toBeDefined();
            }
          }
        }
      }
    });
  });
});
