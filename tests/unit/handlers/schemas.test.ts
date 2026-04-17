import { describe, expect, it } from 'vitest';
import {
  getToolSchema,
  SAPActivateSchema,
  SAPContextSchema,
  SAPContextSchemaBtp,
  SAPDiagnoseSchema,
  SAPHyperfocusedSchema,
  SAPLintSchema,
  SAPManageSchema,
  SAPNavigateSchema,
  SAPQuerySchema,
  SAPReadSchema,
  SAPReadSchemaBtp,
  SAPSearchSchema,
  SAPSearchSchemaNoSource,
  SAPTransportSchema,
  SAPWriteSchema,
  SAPWriteSchemaBtp,
} from '../../../src/handlers/schemas.js';

describe('SAPReadSchema', () => {
  it('accepts valid on-prem input', () => {
    const result = SAPReadSchema.safeParse({ type: 'PROG', name: 'ZTEST' });
    expect(result.success).toBe(true);
  });

  it('accepts all optional fields', () => {
    const result = SAPReadSchema.safeParse({
      type: 'CLAS',
      name: 'ZCL_TEST',
      include: 'definitions',
      method: '*',
      expand_includes: true,
      maxRows: 50,
      sqlFilter: "MANDT = '100'",
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing required type', () => {
    const result = SAPReadSchema.safeParse({ name: 'ZTEST' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid type enum', () => {
    const result = SAPReadSchema.safeParse({ type: 'INVALID' });
    expect(result.success).toBe(false);
  });

  it('coerces numeric maxRows from string', () => {
    const result = SAPReadSchema.safeParse({ type: 'TABLE_CONTENTS', maxRows: '50' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.maxRows).toBe(50);
    }
  });

  it('coerces boolean expand_includes from string', () => {
    const result = SAPReadSchema.safeParse({ type: 'FUGR', expand_includes: 'true' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.expand_includes).toBe(true);
    }
  });

  it('accepts type-only input (name is optional)', () => {
    const result = SAPReadSchema.safeParse({ type: 'SYSTEM' });
    expect(result.success).toBe(true);
  });

  it('accepts on-prem AUTH/FTG2/ENHO types', () => {
    expect(SAPReadSchema.safeParse({ type: 'AUTH', name: 'BUKRS' }).success).toBe(true);
    expect(SAPReadSchema.safeParse({ type: 'FTG2', name: 'ABC_TOGGLE' }).success).toBe(true);
    expect(SAPReadSchema.safeParse({ type: 'ENHO', name: 'ZMY_BADI_IMPL' }).success).toBe(true);
  });

  it('accepts VERSIONS on on-prem', () => {
    const result = SAPReadSchema.safeParse({ type: 'VERSIONS', name: 'ZARC1_TEST_REPORT' });
    expect(result.success).toBe(true);
  });

  it('accepts VERSION_SOURCE only when versionUri is provided and ADT-scoped', () => {
    const result = SAPReadSchema.safeParse({
      type: 'VERSION_SOURCE',
      versionUri: '/sap/bc/adt/programs/programs/ZARC1_TEST_REPORT/source/main/versions/20260410185851/00000/content',
    });
    expect(result.success).toBe(true);
  });

  it('rejects VERSION_SOURCE when versionUri is missing', () => {
    const result = SAPReadSchema.safeParse({ type: 'VERSION_SOURCE' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.join('.') === 'versionUri')).toBe(true);
    }
  });

  it('rejects VERSION_SOURCE when versionUri is not an ADT path', () => {
    const result = SAPReadSchema.safeParse({ type: 'VERSION_SOURCE', versionUri: 'https://evil.example/source' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain('/sap/bc/adt/');
    }
  });

  it('accepts format field with valid values', () => {
    expect(SAPReadSchema.safeParse({ type: 'CLAS', name: 'ZCL_TEST', format: 'text' }).success).toBe(true);
    expect(SAPReadSchema.safeParse({ type: 'CLAS', name: 'ZCL_TEST', format: 'structured' }).success).toBe(true);
  });

  it('rejects invalid format values', () => {
    expect(SAPReadSchema.safeParse({ type: 'CLAS', name: 'ZCL_TEST', format: 'xml' }).success).toBe(false);
    expect(SAPReadSchema.safeParse({ type: 'CLAS', name: 'ZCL_TEST', format: 'json' }).success).toBe(false);
  });

  it('rejects invalid CLAS include values and lists allowed includes', () => {
    const result = SAPReadSchema.safeParse({ type: 'CLAS', name: 'ZCL_TEST', include: 'invalid_include' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const message = result.error.issues[0]?.message ?? '';
      expect(message).toContain('Valid values');
      expect(message).toContain('main');
      expect(message).toContain('testclasses');
    }
  });

  it('rejects invalid DDLS include values', () => {
    const result = SAPReadSchema.safeParse({ type: 'DDLS', name: 'ZI_TEST', include: 'main' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain('Valid values: elements');
    }
  });

  it('allows free-form include for BSP paths', () => {
    const result = SAPReadSchema.safeParse({ type: 'BSP', name: 'ZAPP', include: 'webapp/Component.js' });
    expect(result.success).toBe(true);
  });
});

describe('SAPReadSchemaBtp', () => {
  it('accepts BTP types', () => {
    const result = SAPReadSchemaBtp.safeParse({ type: 'CLAS', name: 'ZCL_TEST' });
    expect(result.success).toBe(true);
    expect(SAPReadSchemaBtp.safeParse({ type: 'DCLS', name: 'ZI_TEST_DCL' }).success).toBe(true);
  });

  it('rejects on-prem-only types', () => {
    expect(SAPReadSchemaBtp.safeParse({ type: 'PROG' }).success).toBe(false);
    expect(SAPReadSchemaBtp.safeParse({ type: 'INCL' }).success).toBe(false);
    expect(SAPReadSchemaBtp.safeParse({ type: 'VIEW' }).success).toBe(false);
    expect(SAPReadSchemaBtp.safeParse({ type: 'TEXT_ELEMENTS' }).success).toBe(false);
    expect(SAPReadSchemaBtp.safeParse({ type: 'VARIANTS' }).success).toBe(false);
    expect(SAPReadSchemaBtp.safeParse({ type: 'AUTH' }).success).toBe(false);
    expect(SAPReadSchemaBtp.safeParse({ type: 'FTG2' }).success).toBe(false);
    expect(SAPReadSchemaBtp.safeParse({ type: 'ENHO' }).success).toBe(false);
  });

  it('does not have expand_includes field', () => {
    const result = SAPReadSchemaBtp.safeParse({ type: 'CLAS', expand_includes: true });
    // Should succeed — extra keys are ignored by default in z.object
    expect(result.success).toBe(true);
    if (result.success) {
      expect('expand_includes' in result.data).toBe(false);
    }
  });
});

describe('SAPSearchSchema', () => {
  it('accepts valid input with query', () => {
    const result = SAPSearchSchema.safeParse({ query: 'ZCL_*' });
    expect(result.success).toBe(true);
  });

  it('accepts all optional fields', () => {
    const result = SAPSearchSchema.safeParse({
      query: 'ZCL_*',
      maxResults: 50,
      searchType: 'source_code',
      objectType: 'CLAS',
      packageName: 'ZTEST',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing query', () => {
    const result = SAPSearchSchema.safeParse({ maxResults: 10 });
    expect(result.success).toBe(false);
  });

  it('rejects invalid searchType', () => {
    const result = SAPSearchSchema.safeParse({ query: 'test', searchType: 'invalid' });
    expect(result.success).toBe(false);
  });
});

describe('SAPSearchSchemaNoSource', () => {
  it('accepts query without searchType', () => {
    const result = SAPSearchSchemaNoSource.safeParse({ query: 'ZCL_*' });
    expect(result.success).toBe(true);
  });

  it('ignores searchType (not in schema)', () => {
    const result = SAPSearchSchemaNoSource.safeParse({ query: 'test', searchType: 'source_code' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect('searchType' in result.data).toBe(false);
    }
  });
});

describe('SAPQuerySchema', () => {
  it('accepts valid SQL', () => {
    const result = SAPQuerySchema.safeParse({ sql: 'SELECT * FROM MARA' });
    expect(result.success).toBe(true);
  });

  it('rejects missing sql', () => {
    const result = SAPQuerySchema.safeParse({ maxRows: 10 });
    expect(result.success).toBe(false);
  });

  it('coerces maxRows from string', () => {
    const result = SAPQuerySchema.safeParse({ sql: 'SELECT * FROM MARA', maxRows: '200' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.maxRows).toBe(200);
    }
  });
});

describe('SAPWriteSchema', () => {
  it('accepts valid create input', () => {
    const result = SAPWriteSchema.safeParse({ action: 'create', type: 'CLAS', name: 'ZCL_NEW' });
    expect(result.success).toBe(true);
  });

  it('accepts DOMA/DTEL write fields', () => {
    const doma = SAPWriteSchema.safeParse({
      action: 'create',
      type: 'DOMA',
      name: 'ZDOMAIN',
      dataType: 'CHAR',
      length: '1',
      decimals: '0',
      outputLength: '1',
      signExists: 'true',
      lowercase: 'false',
      fixedValues: [{ low: 'A', description: 'Active' }],
      valueTable: 'T001',
    });
    expect(doma.success).toBe(true);
    if (doma.success) {
      expect(doma.data.length).toBe(1);
      expect(doma.data.signExists).toBe(true);
    }

    const dtel = SAPWriteSchema.safeParse({
      action: 'create',
      type: 'DTEL',
      name: 'ZDELEM',
      typeKind: 'domain',
      typeName: 'ZDOMAIN',
      shortLabel: 'Status',
      changeDocument: 'true',
    });
    expect(dtel.success).toBe(true);
    if (dtel.success) {
      expect(dtel.data.changeDocument).toBe(true);
    }
  });

  it('accepts SRVB fields and validates category enum', () => {
    const srvb = SAPWriteSchema.safeParse({
      action: 'create',
      type: 'SRVB',
      name: 'ZSB_TRAVEL_O4',
      serviceDefinition: 'ZSD_TRAVEL',
      bindingType: 'ODATA',
      category: '0',
    });
    expect(srvb.success).toBe(true);

    const invalidCategory = SAPWriteSchema.safeParse({
      action: 'create',
      type: 'SRVB',
      name: 'ZSB_TRAVEL_O4',
      serviceDefinition: 'ZSD_TRAVEL',
      category: '2',
    });
    expect(invalidCategory.success).toBe(false);
  });

  it('accepts edit_method with all fields', () => {
    const result = SAPWriteSchema.safeParse({
      action: 'edit_method',
      type: 'CLAS',
      name: 'ZCL_TEST',
      method: 'get_name',
      source: 'METHOD get_name.\nENDMETHOD.',
      transport: 'DEVK900001',
    });
    expect(result.success).toBe(true);
  });

  it('accepts TABL for source-based writes', () => {
    const result = SAPWriteSchema.safeParse({
      action: 'create',
      type: 'TABL',
      name: 'ZTABL_TEST',
      source: 'define table ztabl_test { key client : abap.clnt; key id : abap.numc(8); }',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing action', () => {
    expect(SAPWriteSchema.safeParse({ type: 'CLAS', name: 'ZCL_TEST' }).success).toBe(false);
  });

  it('rejects invalid action', () => {
    const result = SAPWriteSchema.safeParse({ action: 'invalid', type: 'CLAS', name: 'ZCL_TEST' });
    expect(result.success).toBe(false);
  });

  it('accepts batch_create action', () => {
    const result = SAPWriteSchema.safeParse({
      action: 'batch_create',
      package: '$TMP',
      objects: [
        { type: 'DDLS', name: 'ZI_TRAVEL', source: 'define view entity ZI_TRAVEL {}' },
        { type: 'BDEF', name: 'ZI_TRAVEL' },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('validates objects array structure', () => {
    // Valid: objects with type and name
    expect(
      SAPWriteSchema.safeParse({
        action: 'batch_create',
        objects: [{ type: 'CLAS', name: 'ZCL_NEW', source: 'CLASS zcl_new.', description: 'New class' }],
      }).success,
    ).toBe(true);

    // Invalid: object missing type
    expect(
      SAPWriteSchema.safeParse({
        action: 'batch_create',
        objects: [{ name: 'ZCL_NEW' }],
      }).success,
    ).toBe(false);

    // Invalid: object missing name
    expect(
      SAPWriteSchema.safeParse({
        action: 'batch_create',
        objects: [{ type: 'CLAS' }],
      }).success,
    ).toBe(false);
  });
});

describe('SAPWriteSchemaBtp', () => {
  it('rejects on-prem-only types', () => {
    expect(SAPWriteSchemaBtp.safeParse({ action: 'create', type: 'PROG', name: 'Z' }).success).toBe(false);
    expect(SAPWriteSchemaBtp.safeParse({ action: 'create', type: 'FUNC', name: 'Z' }).success).toBe(false);
    expect(SAPWriteSchemaBtp.safeParse({ action: 'create', type: 'INCL', name: 'Z' }).success).toBe(false);
  });

  it('accepts BTP types', () => {
    expect(SAPWriteSchemaBtp.safeParse({ action: 'create', type: 'CLAS', name: 'Z' }).success).toBe(true);
    expect(SAPWriteSchemaBtp.safeParse({ action: 'create', type: 'DDLS', name: 'Z' }).success).toBe(true);
    expect(SAPWriteSchemaBtp.safeParse({ action: 'create', type: 'DCLS', name: 'ZI_TEST_DCL' }).success).toBe(true);
    expect(SAPWriteSchemaBtp.safeParse({ action: 'create', type: 'TABL', name: 'ZTABL' }).success).toBe(true);
    expect(
      SAPWriteSchemaBtp.safeParse({ action: 'create', type: 'SRVB', name: 'ZSB', serviceDefinition: 'ZSD' }).success,
    ).toBe(true);
    expect(SAPWriteSchemaBtp.safeParse({ action: 'create', type: 'DOMA', name: 'ZDOMAIN' }).success).toBe(true);
    expect(SAPWriteSchemaBtp.safeParse({ action: 'create', type: 'DTEL', name: 'ZDELEM' }).success).toBe(true);
  });
});

describe('SAPActivateSchema', () => {
  it('accepts single object activation', () => {
    const result = SAPActivateSchema.safeParse({ name: 'ZCL_TEST', type: 'CLAS' });
    expect(result.success).toBe(true);
  });

  it('accepts batch activation', () => {
    const result = SAPActivateSchema.safeParse({
      objects: [
        { type: 'DDLS', name: 'ZI_TRAVEL' },
        { type: 'BDEF', name: 'ZI_TRAVEL' },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('accepts empty input (all fields optional)', () => {
    const result = SAPActivateSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('accepts publish_srvb action', () => {
    const result = SAPActivateSchema.safeParse({ action: 'publish_srvb', name: 'ZSB_BOOKING_V4' });
    expect(result.success).toBe(true);
  });

  it('accepts unpublish_srvb action', () => {
    const result = SAPActivateSchema.safeParse({ action: 'unpublish_srvb', name: 'ZSB_BOOKING_V4' });
    expect(result.success).toBe(true);
  });

  it('rejects invalid action', () => {
    const result = SAPActivateSchema.safeParse({ action: 'invalid_action', name: 'ZSB_TEST' });
    expect(result.success).toBe(false);
  });
});

describe('SAPNavigateSchema', () => {
  it('accepts definition action', () => {
    const result = SAPNavigateSchema.safeParse({
      action: 'definition',
      uri: '/sap/bc/adt/programs/programs/ztest',
      line: 10,
      column: 5,
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid action', () => {
    const result = SAPNavigateSchema.safeParse({ action: 'invalid' });
    expect(result.success).toBe(false);
  });

  it('coerces line/column from strings', () => {
    const result = SAPNavigateSchema.safeParse({ action: 'definition', line: '10', column: '5' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.line).toBe(10);
      expect(result.data.column).toBe(5);
    }
  });
});

describe('SAPLintSchema', () => {
  it('accepts lint with source', () => {
    const result = SAPLintSchema.safeParse({ action: 'lint', source: 'REPORT ztest.' });
    expect(result.success).toBe(true);
  });

  it('accepts list_rules without source', () => {
    const result = SAPLintSchema.safeParse({ action: 'list_rules' });
    expect(result.success).toBe(true);
  });

  it('accepts formatter actions', () => {
    expect(SAPLintSchema.safeParse({ action: 'format', source: 'report ztest.' }).success).toBe(true);
    expect(SAPLintSchema.safeParse({ action: 'get_formatter_settings' }).success).toBe(true);
    expect(SAPLintSchema.safeParse({ action: 'set_formatter_settings', style: 'keywordLower' }).success).toBe(true);
  });

  it('coerces indentation for set_formatter_settings', () => {
    const result = SAPLintSchema.safeParse({ action: 'set_formatter_settings', indentation: 0 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.indentation).toBe(false);
    }
  });

  it('rejects invalid action', () => {
    const result = SAPLintSchema.safeParse({ action: 'invalid' });
    expect(result.success).toBe(false);
  });
});

describe('SAPDiagnoseSchema', () => {
  it('accepts syntax check', () => {
    const result = SAPDiagnoseSchema.safeParse({ action: 'syntax', name: 'ZTEST', type: 'PROG' });
    expect(result.success).toBe(true);
  });

  it('accepts dumps with optional filters', () => {
    const result = SAPDiagnoseSchema.safeParse({ action: 'dumps', user: 'DEVELOPER', maxResults: 10 });
    expect(result.success).toBe(true);
  });

  it('accepts traces with analysis type', () => {
    const result = SAPDiagnoseSchema.safeParse({ action: 'traces', id: '123', analysis: 'hitlist' });
    expect(result.success).toBe(true);
  });

  it('rejects invalid analysis type', () => {
    const result = SAPDiagnoseSchema.safeParse({ action: 'traces', id: '123', analysis: 'invalid' });
    expect(result.success).toBe(false);
  });

  it('accepts quickfix with source position fields', () => {
    const result = SAPDiagnoseSchema.safeParse({
      action: 'quickfix',
      name: 'ZCL_TEST',
      type: 'CLAS',
      source: 'CLASS zcl_test DEFINITION. ENDCLASS.',
      line: '12',
      column: '4',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.line).toBe(12);
      expect(result.data.column).toBe(4);
    }
  });

  it('accepts apply_quickfix with proposal data', () => {
    const result = SAPDiagnoseSchema.safeParse({
      action: 'apply_quickfix',
      name: 'ZCL_TEST',
      type: 'CLAS',
      source: 'CLASS zcl_test DEFINITION. ENDCLASS.',
      line: 12,
      proposalUri: '/sap/bc/adt/quickfixes/1',
      proposalUserContent: 'opaque-state',
    });
    expect(result.success).toBe(true);
  });
});

describe('SAPTransportSchema', () => {
  it('accepts list action', () => {
    const result = SAPTransportSchema.safeParse({ action: 'list' });
    expect(result.success).toBe(true);
  });

  it('accepts create with description', () => {
    const result = SAPTransportSchema.safeParse({ action: 'create', description: 'Test transport' });
    expect(result.success).toBe(true);
  });

  it('rejects invalid action', () => {
    const result = SAPTransportSchema.safeParse({ action: 'invalid' });
    expect(result.success).toBe(false);
  });

  it('accepts history with type and name', () => {
    const result = SAPTransportSchema.safeParse({ action: 'history', type: 'CLAS', name: 'ZCL_X' });
    expect(result.success).toBe(true);
  });

  it('accepts history without type/name at schema level', () => {
    const result = SAPTransportSchema.safeParse({ action: 'history' });
    expect(result.success).toBe(true);
  });
});

describe('SAPContextSchema', () => {
  it('accepts minimal input (name only)', () => {
    const result = SAPContextSchema.safeParse({ name: 'ZCL_ORDER' });
    expect(result.success).toBe(true);
  });

  it('accepts full input', () => {
    const result = SAPContextSchema.safeParse({
      action: 'impact',
      type: 'CLAS',
      name: 'ZCL_ORDER',
      maxDeps: 10,
      depth: 2,
      includeIndirect: true,
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing name', () => {
    const result = SAPContextSchema.safeParse({ type: 'CLAS' });
    expect(result.success).toBe(false);
  });

  it('rejects depth > 3', () => {
    const result = SAPContextSchema.safeParse({ name: 'ZCL_TEST', depth: 5 });
    expect(result.success).toBe(false);
  });

  it('rejects depth < 1', () => {
    const result = SAPContextSchema.safeParse({ name: 'ZCL_TEST', depth: 0 });
    expect(result.success).toBe(false);
  });
});

describe('SAPContextSchemaBtp', () => {
  it('rejects on-prem-only types', () => {
    expect(SAPContextSchemaBtp.safeParse({ name: 'Z', type: 'PROG' }).success).toBe(false);
    expect(SAPContextSchemaBtp.safeParse({ name: 'Z', type: 'FUNC' }).success).toBe(false);
  });

  it('accepts BTP types', () => {
    expect(SAPContextSchemaBtp.safeParse({ name: 'Z', type: 'CLAS' }).success).toBe(true);
    expect(SAPContextSchemaBtp.safeParse({ name: 'Z', type: 'DDLS' }).success).toBe(true);
    expect(SAPContextSchemaBtp.safeParse({ name: 'Z', type: 'DDLS', action: 'impact' }).success).toBe(true);
  });

  it('does not have group field', () => {
    const result = SAPContextSchemaBtp.safeParse({ name: 'Z', group: 'TEST' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect('group' in result.data).toBe(false);
    }
  });
});

describe('SAPManageSchema', () => {
  it('accepts valid actions', () => {
    expect(SAPManageSchema.safeParse({ action: 'features' }).success).toBe(true);
    expect(SAPManageSchema.safeParse({ action: 'probe' }).success).toBe(true);
    expect(SAPManageSchema.safeParse({ action: 'cache_stats' }).success).toBe(true);
    expect(
      SAPManageSchema.safeParse({
        action: 'create_package',
        name: 'ZPKG',
        description: 'Package',
        superPackage: '$TMP',
      }).success,
    ).toBe(true);
    expect(SAPManageSchema.safeParse({ action: 'delete_package', name: 'ZPKG' }).success).toBe(true);
    expect(
      SAPManageSchema.safeParse({
        action: 'change_package',
        objectName: 'ZARC1_TEST',
        objectType: 'DDLS/DF',
        oldPackage: '$TMP',
        newPackage: 'Z_TARGET',
        transport: 'A4HK900123',
      }).success,
    ).toBe(true);
    expect(SAPManageSchema.safeParse({ action: 'flp_list_catalogs' }).success).toBe(true);
    expect(SAPManageSchema.safeParse({ action: 'flp_list_groups' }).success).toBe(true);
    expect(SAPManageSchema.safeParse({ action: 'flp_list_tiles', catalogId: 'ZCAT' }).success).toBe(true);
    expect(
      SAPManageSchema.safeParse({ action: 'flp_create_catalog', domainId: 'ZCAT', title: 'Test Catalog' }).success,
    ).toBe(true);
    expect(SAPManageSchema.safeParse({ action: 'flp_create_group', groupId: 'ZGROUP', title: 'Group' }).success).toBe(
      true,
    );
    expect(
      SAPManageSchema.safeParse({
        action: 'flp_create_tile',
        catalogId: 'ZCAT',
        tile: { id: 'tile-1', title: 'Tile', semanticObject: 'ZSO', semanticAction: 'display' },
      }).success,
    ).toBe(true);
    expect(
      SAPManageSchema.safeParse({
        action: 'flp_add_tile_to_group',
        groupId: 'ZGROUP',
        catalogId: 'ZCAT',
        tileInstanceId: 'TILE123',
      }).success,
    ).toBe(true);
    expect(
      SAPManageSchema.safeParse({
        action: 'flp_delete_catalog',
        catalogId: 'X-SAP-UI2-CATALOGPAGE:ZARC1_TEST',
      }).success,
    ).toBe(true);
  });

  it('rejects invalid action', () => {
    expect(SAPManageSchema.safeParse({ action: 'invalid' }).success).toBe(false);
  });

  it('rejects missing action', () => {
    expect(SAPManageSchema.safeParse({}).success).toBe(false);
  });

  it('rejects invalid tile object', () => {
    const result = SAPManageSchema.safeParse({
      action: 'flp_create_tile',
      catalogId: 'ZCAT',
      tile: { id: 'tile-1', title: 'Tile', semanticObject: 'ZSO' },
    });
    expect(result.success).toBe(false);
  });
});

describe('SAPHyperfocusedSchema', () => {
  it('accepts any action string', () => {
    const result = SAPHyperfocusedSchema.safeParse({ action: 'read', type: 'CLAS', name: 'ZCL_TEST' });
    expect(result.success).toBe(true);
  });

  it('accepts params object', () => {
    const result = SAPHyperfocusedSchema.safeParse({
      action: 'write',
      params: { action: 'create', source: 'REPORT z.' },
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing action', () => {
    const result = SAPHyperfocusedSchema.safeParse({ type: 'CLAS' });
    expect(result.success).toBe(false);
  });
});

describe('getToolSchema', () => {
  it('returns on-prem schema for SAPRead when isBtp=false', () => {
    const schema = getToolSchema('SAPRead', false);
    expect(schema).toBe(SAPReadSchema);
  });

  it('returns BTP schema for SAPRead when isBtp=true', () => {
    const schema = getToolSchema('SAPRead', true);
    expect(schema).toBe(SAPReadSchemaBtp);
  });

  it('returns restricted search schema when textSearch unavailable', () => {
    const schema = getToolSchema('SAPSearch', false, false);
    expect(schema).toBe(SAPSearchSchemaNoSource);
  });

  it('returns full search schema when textSearch available', () => {
    const schema = getToolSchema('SAPSearch', false, true);
    expect(schema).toBe(SAPSearchSchema);
  });

  it('returns undefined for unknown tool', () => {
    expect(getToolSchema('UnknownTool', false)).toBeUndefined();
  });

  it('returns schema for all 11 tools + hyperfocused', () => {
    const tools = [
      'SAPRead',
      'SAPSearch',
      'SAPQuery',
      'SAPWrite',
      'SAPActivate',
      'SAPNavigate',
      'SAPLint',
      'SAPDiagnose',
      'SAPTransport',
      'SAPContext',
      'SAPManage',
      'SAP',
    ];
    for (const tool of tools) {
      expect(getToolSchema(tool, false)).toBeDefined();
    }
  });
});
