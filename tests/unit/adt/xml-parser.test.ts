import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  escapeXmlAttr,
  findDeepNodes,
  parseApiReleaseState,
  parseBspAppList,
  parseBspFolderListing,
  parseClassMetadata,
  parseDataElementMetadata,
  parseDomainMetadata,
  parseFunctionGroup,
  parseInstalledComponents,
  parsePackageContents,
  parseSearchResults,
  parseServiceBinding,
  parseSourceSearchResults,
  parseSystemInfo,
  parseTableContents,
  parseTransactionMetadata,
  parseXml,
} from '../../../src/adt/xml-parser.js';

const fixturesDir = join(import.meta.dirname, '../../fixtures/xml');
const loadFixture = (name: string) => readFileSync(join(fixturesDir, name), 'utf-8');

describe('XML Parser', () => {
  // ─── parseXml ──────────────────────────────────────────────────────

  describe('parseXml', () => {
    it('parses simple XML', () => {
      const result = parseXml('<root><child attr="val">text</child></root>');
      expect(result).toBeDefined();
      expect((result.root as any).child).toBeDefined();
    });

    it('strips namespace prefixes', () => {
      const result = parseXml(
        '<adtcore:root xmlns:adtcore="http://www.sap.com/adt/core"><adtcore:child>val</adtcore:child></adtcore:root>',
      );
      expect(result.root).toBeDefined();
    });

    it('preserves attributes with @_ prefix', () => {
      const result = parseXml('<item name="test" type="PROG"/>');
      const item = result.item as Record<string, unknown>;
      expect(item['@_name']).toBe('test');
      expect(item['@_type']).toBe('PROG');
    });

    it('keeps values as strings (does not parse numbers)', () => {
      const result = parseXml('<item code="001"/>');
      const item = result.item as Record<string, unknown>;
      expect(item['@_code']).toBe('001'); // NOT number 1
    });

    it('handles empty XML', () => {
      const result = parseXml('<root/>');
      expect(result.root).toBeDefined();
    });
  });

  // ─── parseSearchResults ────────────────────────────────────────────

  describe('parseSearchResults', () => {
    it('parses search results from fixture', () => {
      const xml = loadFixture('search-results.xml');
      const results = parseSearchResults(xml);

      expect(results.length).toBeGreaterThan(0);
      expect(results[0]?.objectName).toBeTruthy();
      expect(results[0]?.objectType).toBeTruthy();
    });

    it('handles single result (not array)', () => {
      const xml = `<adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">
        <adtcore:objectReference uri="/sap/bc/adt/programs/programs/ZTEST" type="PROG/P" name="ZTEST" packageName="$TMP" description="Test"/>
      </adtcore:objectReferences>`;
      const results = parseSearchResults(xml);
      expect(results).toHaveLength(1);
      expect(results[0]?.objectName).toBe('ZTEST');
      expect(results[0]?.objectType).toBe('PROG/P');
      expect(results[0]?.packageName).toBe('$TMP');
      expect(results[0]?.description).toBe('Test');
    });

    it('handles empty results', () => {
      const xml = '<adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core"/>';
      const results = parseSearchResults(xml);
      expect(results).toEqual([]);
    });

    it('handles multiple results', () => {
      const xml = `<adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">
        <adtcore:objectReference uri="/uri1" type="PROG/P" name="PROG1" packageName="$TMP" description="P1"/>
        <adtcore:objectReference uri="/uri2" type="CLAS/OC" name="ZCL_1" packageName="ZTEST" description="C1"/>
      </adtcore:objectReferences>`;
      const results = parseSearchResults(xml);
      expect(results).toHaveLength(2);
      expect(results[0]?.objectName).toBe('PROG1');
      expect(results[1]?.objectName).toBe('ZCL_1');
    });

    it('handles missing attributes gracefully', () => {
      const xml = `<adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">
        <adtcore:objectReference uri="/uri"/>
      </adtcore:objectReferences>`;
      const results = parseSearchResults(xml);
      expect(results).toHaveLength(1);
      expect(results[0]?.objectName).toBe('');
      expect(results[0]?.objectType).toBe('');
    });
  });

  // ─── parseTableContents ────────────────────────────────────────────

  describe('parseTableContents', () => {
    it('parses table contents from fixture (old asx format)', () => {
      const xml = loadFixture('table-contents.xml');
      const result = parseTableContents(xml);

      expect(result.columns.length).toBeGreaterThan(0);
      expect(result.rows.length).toBeGreaterThan(0);
      expect(result.columns).toContain('MANDT');
    });

    it('handles empty table', () => {
      const xml = `<?xml version="1.0" encoding="utf-8"?>
        <asx:abap xmlns:asx="http://www.sap.com/abapxml" version="1.0">
          <asx:values><COLUMNS></COLUMNS></asx:values>
        </asx:abap>`;
      const result = parseTableContents(xml);
      expect(result.columns).toEqual([]);
      expect(result.rows).toEqual([]);
    });

    it('parses dataPreview namespace format (newer SAP systems)', () => {
      const xml = `<?xml version="1.0" encoding="utf-8"?>
<dataPreview:tableData xmlns:dataPreview="http://www.sap.com/adt/dataPreview">
  <dataPreview:totalRows>2</dataPreview:totalRows>
  <dataPreview:columns>
    <dataPreview:metadata dataPreview:name="MANDT" dataPreview:type="C"/>
    <dataPreview:dataSet>
      <dataPreview:data>001</dataPreview:data>
      <dataPreview:data>002</dataPreview:data>
    </dataPreview:dataSet>
  </dataPreview:columns>
  <dataPreview:columns>
    <dataPreview:metadata dataPreview:name="MTEXT" dataPreview:type="C"/>
    <dataPreview:dataSet>
      <dataPreview:data>Dev</dataPreview:data>
      <dataPreview:data>Test</dataPreview:data>
    </dataPreview:dataSet>
  </dataPreview:columns>
</dataPreview:tableData>`;
      const result = parseTableContents(xml);
      expect(result.columns).toEqual(['MANDT', 'MTEXT']);
      expect(result.rows).toHaveLength(2);
      expect(result.rows[0]).toEqual({ MANDT: '001', MTEXT: 'Dev' });
      expect(result.rows[1]).toEqual({ MANDT: '002', MTEXT: 'Test' });
    });

    it('handles single-row dataPreview response', () => {
      const xml = `<?xml version="1.0" encoding="utf-8"?>
<dataPreview:tableData xmlns:dataPreview="http://www.sap.com/adt/dataPreview">
  <dataPreview:columns>
    <dataPreview:metadata dataPreview:name="COL1" dataPreview:type="C"/>
    <dataPreview:dataSet>
      <dataPreview:data>val1</dataPreview:data>
    </dataPreview:dataSet>
  </dataPreview:columns>
</dataPreview:tableData>`;
      const result = parseTableContents(xml);
      expect(result.columns).toEqual(['COL1']);
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]).toEqual({ COL1: 'val1' });
    });

    it('handles column with no data rows', () => {
      const xml = `<?xml version="1.0" encoding="utf-8"?>
<dataPreview:tableData xmlns:dataPreview="http://www.sap.com/adt/dataPreview">
  <dataPreview:columns>
    <dataPreview:metadata dataPreview:name="EMPTY_COL" dataPreview:type="C"/>
    <dataPreview:dataSet/>
  </dataPreview:columns>
</dataPreview:tableData>`;
      const result = parseTableContents(xml);
      expect(result.columns).toEqual(['EMPTY_COL']);
      expect(result.rows).toEqual([]);
    });
  });

  // ─── parseInstalledComponents ──────────────────────────────────────

  describe('parseInstalledComponents', () => {
    it('parses installed components from fixture (Atom feed format)', () => {
      const xml = loadFixture('installed-components.xml');
      const components = parseInstalledComponents(xml);

      expect(components).toHaveLength(3);
      expect(components[0]).toEqual({
        name: 'SAP_BASIS',
        release: '753',
        description: 'SAP Basis Component',
      });
      expect(components[1]?.name).toBe('SAP_ABA');
      expect(components[2]?.name).toBe('SAP_GWFND');
    });

    it('handles empty feed', () => {
      const xml = `<?xml version="1.0" encoding="utf-8"?>
<atom:feed xmlns:atom="http://www.w3.org/2005/Atom">
  <atom:title>Installed Components</atom:title>
</atom:feed>`;
      const components = parseInstalledComponents(xml);
      expect(components).toEqual([]);
    });

    it('handles single entry', () => {
      const xml = `<?xml version="1.0" encoding="utf-8"?>
<atom:feed xmlns:atom="http://www.w3.org/2005/Atom">
  <atom:entry>
    <atom:id>S4CORE</atom:id>
    <atom:title>108;SAPK-10808INS4CORE;0008;SAP S/4HANA Core</atom:title>
  </atom:entry>
</atom:feed>`;
      const components = parseInstalledComponents(xml);
      expect(components).toHaveLength(1);
      expect(components[0]).toEqual({
        name: 'S4CORE',
        release: '108',
        description: 'SAP S/4HANA Core',
      });
    });

    it('handles title with fewer semicolons gracefully', () => {
      const xml = `<?xml version="1.0" encoding="utf-8"?>
<atom:feed xmlns:atom="http://www.w3.org/2005/Atom">
  <atom:entry>
    <atom:id>CUSTOM</atom:id>
    <atom:title>100;SP01</atom:title>
  </atom:entry>
</atom:feed>`;
      const components = parseInstalledComponents(xml);
      expect(components[0]?.name).toBe('CUSTOM');
      expect(components[0]?.release).toBe('100');
    });
  });

  // ─── parseFunctionGroup ────────────────────────────────────────────

  describe('parseFunctionGroup', () => {
    it('parses function group with modules from fixture', () => {
      const xml = loadFixture('function-group.xml');
      const result = parseFunctionGroup(xml);
      expect(result.name).toBeTruthy();
      expect(result.functions.length).toBeGreaterThan(0);
    });

    it('handles empty function group', () => {
      const xml = '<group name="ZEMPTY"/>';
      const result = parseFunctionGroup(xml);
      expect(result.name).toBe('ZEMPTY');
      expect(result.functions).toEqual([]);
    });

    it('handles single function module', () => {
      const xml = `<group name="ZGROUP">
        <functionModule name="Z_SINGLE_FUNC"/>
      </group>`;
      const result = parseFunctionGroup(xml);
      expect(result.name).toBe('ZGROUP');
      expect(result.functions).toEqual(['Z_SINGLE_FUNC']);
    });

    it('handles multiple function modules', () => {
      const xml = `<group name="ZGROUP">
        <functionModule name="Z_FUNC1"/>
        <functionModule name="Z_FUNC2"/>
        <functionModule name="Z_FUNC3"/>
      </group>`;
      const result = parseFunctionGroup(xml);
      expect(result.functions).toHaveLength(3);
    });
  });

  // ─── parsePackageContents ──────────────────────────────────────────

  describe('parsePackageContents', () => {
    it('parses package contents from fixture', () => {
      const xml = loadFixture('package-contents.xml');
      const contents = parsePackageContents(xml);
      expect(contents.length).toBeGreaterThan(0);
    });

    it('handles empty package', () => {
      const xml = `<?xml version="1.0" encoding="utf-8"?>
<asx:abap xmlns:asx="http://www.sap.com/abapxml" version="1.0">
  <asx:values><DATA><TREE_CONTENT/></DATA></asx:values>
</asx:abap>`;
      const contents = parsePackageContents(xml);
      expect(contents).toEqual([]);
    });
  });

  // ─── parseSystemInfo ──────────────────────────────────────────────

  describe('parseSystemInfo', () => {
    it('parses discovery XML with workspaces and collections', () => {
      const xml = `<?xml version="1.0" encoding="utf-8"?>
<app:service xmlns:app="http://www.w3.org/2007/app" xmlns:atom="http://www.w3.org/2005/Atom">
  <app:workspace>
    <atom:title>Object Discovery</atom:title>
    <app:collection href="/sap/bc/adt/repository/nodestructure">
      <atom:title>Object Types</atom:title>
    </app:collection>
    <app:collection href="/sap/bc/adt/repository/informationsystem/search">
      <atom:title>Search</atom:title>
    </app:collection>
  </app:workspace>
  <app:workspace>
    <atom:title>Source Code Library</atom:title>
    <app:collection href="/sap/bc/adt/programs/programs">
      <atom:title>Programs</atom:title>
    </app:collection>
  </app:workspace>
</app:service>`;
      const result = parseSystemInfo(xml, 'DEVELOPER');
      expect(result.user).toBe('DEVELOPER');
      expect(result.collections.length).toBeGreaterThan(0);
      const search = result.collections.find((c) => c.title === 'Search');
      expect(search).toBeDefined();
      expect(search?.href).toBe('/sap/bc/adt/repository/informationsystem/search');
      const programs = result.collections.find((c) => c.title === 'Programs');
      expect(programs).toBeDefined();
      expect(programs?.href).toBe('/sap/bc/adt/programs/programs');
    });

    it('returns username even with empty discovery XML', () => {
      const xml = '<service/>';
      const result = parseSystemInfo(xml, 'ADMIN');
      expect(result.user).toBe('ADMIN');
      expect(result.collections).toEqual([]);
    });

    it('handles single workspace with single collection', () => {
      const xml = `<?xml version="1.0" encoding="utf-8"?>
<app:service xmlns:app="http://www.w3.org/2007/app" xmlns:atom="http://www.w3.org/2005/Atom">
  <app:workspace>
    <atom:title>Single</atom:title>
    <app:collection href="/sap/bc/adt/core">
      <atom:title>Core</atom:title>
    </app:collection>
  </app:workspace>
</app:service>`;
      const result = parseSystemInfo(xml, 'TEST_USER');
      expect(result.user).toBe('TEST_USER');
      expect(result.collections).toHaveLength(1);
      expect(result.collections[0]).toEqual({ title: 'Core', href: '/sap/bc/adt/core' });
    });
  });

  // ─── parseDomainMetadata ───────────────────────────────────────────

  describe('parseDomainMetadata', () => {
    it('parses domain metadata from fixture', () => {
      const xml = loadFixture('domain-metadata.xml');
      const domain = parseDomainMetadata(xml);
      expect(domain.name).toBe('BUKRS');
      expect(domain.description).toBe('Company code');
      expect(domain.dataType).toBe('CHAR');
      expect(domain.length).toBe('000004');
      expect(domain.decimals).toBe('000000');
      expect(domain.outputLength).toBe('000004');
      expect(domain.signExists).toBe(false);
      expect(domain.lowercase).toBe(false);
      expect(domain.valueTable).toBe('T001');
      expect(domain.fixedValues).toEqual([]);
      expect(domain.package).toBe('BF');
    });

    it('parses domain with fixed values', () => {
      const xml = loadFixture('domain-with-fixvalues.xml');
      const domain = parseDomainMetadata(xml);
      expect(domain.name).toBe('BAPI_MTYPE');
      expect(domain.description).toBe('Message type: S, E, W, I, A');
      expect(domain.dataType).toBe('CHAR');
      expect(domain.length).toBe('000001');
      expect(domain.fixedValues.length).toBe(5);
      expect(domain.fixedValues[0]).toEqual({ low: 'S', high: '', description: 'Success' });
      expect(domain.fixedValues[4]).toEqual({ low: 'A', high: '', description: 'Abort' });
    });

    it('handles minimal domain XML', () => {
      const xml =
        '<doma:domain adtcore:name="ZTEST" adtcore:description="Test" xmlns:doma="http://www.sap.com/dictionary/domain" xmlns:adtcore="http://www.sap.com/adt/core"/>';
      const domain = parseDomainMetadata(xml);
      expect(domain.name).toBe('ZTEST');
      expect(domain.description).toBe('Test');
      expect(domain.dataType).toBe('');
      expect(domain.fixedValues).toEqual([]);
    });
  });

  // ─── parseDataElementMetadata ─────────────────────────────────────

  describe('parseDataElementMetadata', () => {
    it('parses data element metadata from fixture', () => {
      const xml = loadFixture('dataelement-metadata.xml');
      const dtel = parseDataElementMetadata(xml);
      expect(dtel.name).toBe('BUKRS');
      expect(dtel.description).toBe('Company code');
      expect(dtel.typeKind).toBe('domain');
      expect(dtel.typeName).toBe('BUKRS');
      expect(dtel.dataType).toBe('CHAR');
      expect(dtel.length).toBe('000004');
      expect(dtel.decimals).toBe('000000');
      expect(dtel.shortLabel).toBe('CoCd');
      expect(dtel.mediumLabel).toBe('Company Code');
      expect(dtel.longLabel).toBe('Company Code');
      expect(dtel.headingLabel).toBe('CoCd');
      expect(dtel.searchHelp).toBe('C_T001');
      expect(dtel.defaultComponentName).toBe('COMP_CODE');
      expect(dtel.package).toBe('BF');
    });

    it('handles minimal data element XML', () => {
      const xml =
        '<blue:wbobj adtcore:name="ZTEST" adtcore:description="Test Element" xmlns:blue="http://www.sap.com/wbobj/dictionary/dtel" xmlns:adtcore="http://www.sap.com/adt/core"/>';
      const dtel = parseDataElementMetadata(xml);
      expect(dtel.name).toBe('ZTEST');
      expect(dtel.description).toBe('Test Element');
      expect(dtel.typeKind).toBe('');
      expect(dtel.typeName).toBe('');
    });
  });

  // ─── parseTransactionMetadata ─────────────────────────────────────

  describe('parseTransactionMetadata', () => {
    it('parses transaction metadata from fixture', () => {
      const xml = loadFixture('transaction-metadata.xml');
      const tran = parseTransactionMetadata(xml);
      expect(tran.code).toBe('SE38');
      expect(tran.description).toBe('ABAP Editor');
      expect(tran.program).toBe(''); // Program not in this endpoint
      expect(tran.package).toBe('SEDT');
    });

    it('handles minimal transaction XML', () => {
      const xml =
        '<adtcore:mainObject adtcore:name="ZT01" adtcore:description="Custom Transaction" xmlns:adtcore="http://www.sap.com/adt/core"/>';
      const tran = parseTransactionMetadata(xml);
      expect(tran.code).toBe('ZT01');
      expect(tran.description).toBe('Custom Transaction');
      expect(tran.package).toBe('');
    });
  });

  // ─── parseApiReleaseState ──────────────────────────────────────────

  describe('parseApiReleaseState', () => {
    it('parses released object from fixture', () => {
      const xml = loadFixture('api-release-state.xml');
      const state = parseApiReleaseState(xml);
      expect(state.objectUri).toBe('/sap/bc/adt/oo/classes/cl_salv_table');
      expect(state.objectType).toBe('CLAS/OC');
      expect(state.objectName).toBe('CL_SALV_TABLE');
      expect(state.isAnyContractReleased).toBe(true);
      expect(state.isAnyAssignmentPossible).toBe(true);
      expect(state.contracts).toHaveLength(1);
      expect(state.contracts[0]!.contract).toBe('C1');
      expect(state.contracts[0]!.state).toBe('RELEASED');
      expect(state.contracts[0]!.stateDescription).toBe('Released');
      expect(state.contracts[0]!.useInKeyUserApps).toBe(true);
      expect(state.contracts[0]!.useInSAPCloudPlatform).toBe(true);
    });

    it('parses deprecated object with successor', () => {
      const xml = `<?xml version="1.0" encoding="utf-8"?>
<apirelease:apiReleaseInfos xmlns:apirelease="http://www.sap.com/adt/apirelease" xmlns:adtcore="http://www.sap.com/adt/core">
  <apirelease:releasableObject adtcore:uri="/sap/bc/adt/oo/classes/cl_gui_alv_grid" adtcore:type="CLAS/OC" adtcore:name="CL_GUI_ALV_GRID"/>
  <apirelease:c1Release apirelease:contract="C1" apirelease:useInKeyUserApps="false" apirelease:useInSAPCloudPlatform="false">
    <apirelease:status apirelease:state="DEPRECATED" apirelease:stateDescription="Deprecated — use successor"/>
    <apirelease:successors>
      <apirelease:successor adtcore:uri="/sap/bc/adt/oo/classes/cl_salv_table" adtcore:type="CLAS/OC" adtcore:name="CL_SALV_TABLE"/>
    </apirelease:successors>
  </apirelease:c1Release>
  <apirelease:apiCatalogData apirelease:isAnyAssignmentPossible="false" apirelease:isAnyContractReleased="false"/>
</apirelease:apiReleaseInfos>`;
      const state = parseApiReleaseState(xml);
      expect(state.objectName).toBe('CL_GUI_ALV_GRID');
      expect(state.contracts[0]!.state).toBe('DEPRECATED');
      expect(state.contracts[0]!.successors).toHaveLength(1);
      expect(state.contracts[0]!.successors[0]!.name).toBe('CL_SALV_TABLE');
      expect(state.isAnyContractReleased).toBe(false);
    });

    it('parses not-released object', () => {
      const xml = `<?xml version="1.0" encoding="utf-8"?>
<apirelease:apiReleaseInfos xmlns:apirelease="http://www.sap.com/adt/apirelease" xmlns:adtcore="http://www.sap.com/adt/core">
  <apirelease:releasableObject adtcore:uri="/sap/bc/adt/oo/classes/cl_internal_helper" adtcore:type="CLAS/OC" adtcore:name="CL_INTERNAL_HELPER"/>
  <apirelease:apiCatalogData apirelease:isAnyAssignmentPossible="false" apirelease:isAnyContractReleased="false"/>
</apirelease:apiReleaseInfos>`;
      const state = parseApiReleaseState(xml);
      expect(state.objectName).toBe('CL_INTERNAL_HELPER');
      expect(state.contracts).toHaveLength(0);
      expect(state.isAnyContractReleased).toBe(false);
    });

    it('parses object with multiple contracts', () => {
      const xml = `<?xml version="1.0" encoding="utf-8"?>
<apirelease:apiReleaseInfos xmlns:apirelease="http://www.sap.com/adt/apirelease" xmlns:adtcore="http://www.sap.com/adt/core">
  <apirelease:releasableObject adtcore:uri="/sap/bc/adt/oo/classes/cl_multi" adtcore:type="CLAS/OC" adtcore:name="CL_MULTI"/>
  <apirelease:c0Release apirelease:contract="C0">
    <apirelease:status apirelease:state="NOT_RELEASED" apirelease:stateDescription="Not Released"/>
  </apirelease:c0Release>
  <apirelease:c1Release apirelease:contract="C1" apirelease:useInKeyUserApps="true" apirelease:useInSAPCloudPlatform="true">
    <apirelease:status apirelease:state="RELEASED" apirelease:stateDescription="Released"/>
  </apirelease:c1Release>
  <apirelease:c2Release apirelease:contract="C2" apirelease:useInKeyUserApps="false" apirelease:useInSAPCloudPlatform="true">
    <apirelease:status apirelease:state="RELEASED" apirelease:stateDescription="Released"/>
  </apirelease:c2Release>
  <apirelease:apiCatalogData apirelease:isAnyAssignmentPossible="true" apirelease:isAnyContractReleased="true"/>
</apirelease:apiReleaseInfos>`;
      const state = parseApiReleaseState(xml);
      expect(state.contracts).toHaveLength(3);
      expect(state.contracts[0]!.contract).toBe('C0');
      expect(state.contracts[0]!.state).toBe('NOT_RELEASED');
      expect(state.contracts[1]!.contract).toBe('C1');
      expect(state.contracts[1]!.state).toBe('RELEASED');
      expect(state.contracts[2]!.contract).toBe('C2');
      expect(state.contracts[2]!.state).toBe('RELEASED');
      expect(state.contracts[2]!.useInSAPCloudPlatform).toBe(true);
    });

    it('handles minimal response with no contracts or catalog', () => {
      const xml = `<?xml version="1.0" encoding="utf-8"?>
<apirelease:apiReleaseInfos xmlns:apirelease="http://www.sap.com/adt/apirelease" xmlns:adtcore="http://www.sap.com/adt/core">
  <apirelease:releasableObject adtcore:uri="/sap/bc/adt/oo/classes/cl_minimal" adtcore:type="CLAS/OC" adtcore:name="CL_MINIMAL"/>
</apirelease:apiReleaseInfos>`;
      const state = parseApiReleaseState(xml);
      expect(state.objectName).toBe('CL_MINIMAL');
      expect(state.contracts).toHaveLength(0);
      expect(state.isAnyContractReleased).toBe(false);
      expect(state.isAnyAssignmentPossible).toBe(false);
    });

    it('parses deprecated with multiple successors', () => {
      const xml = `<?xml version="1.0" encoding="utf-8"?>
<apirelease:apiReleaseInfos xmlns:apirelease="http://www.sap.com/adt/apirelease" xmlns:adtcore="http://www.sap.com/adt/core">
  <apirelease:releasableObject adtcore:uri="/sap/bc/adt/oo/classes/cl_old" adtcore:type="CLAS/OC" adtcore:name="CL_OLD"/>
  <apirelease:c1Release apirelease:contract="C1">
    <apirelease:status apirelease:state="DEPRECATED" apirelease:stateDescription="Deprecated"/>
    <apirelease:successors>
      <apirelease:successor adtcore:uri="/sap/bc/adt/oo/classes/cl_new_a" adtcore:type="CLAS/OC" adtcore:name="CL_NEW_A"/>
      <apirelease:successor adtcore:uri="/sap/bc/adt/oo/classes/cl_new_b" adtcore:type="CLAS/OC" adtcore:name="CL_NEW_B"/>
    </apirelease:successors>
  </apirelease:c1Release>
  <apirelease:apiCatalogData apirelease:isAnyAssignmentPossible="false" apirelease:isAnyContractReleased="false"/>
</apirelease:apiReleaseInfos>`;
      const state = parseApiReleaseState(xml);
      expect(state.contracts[0]!.successors).toHaveLength(2);
      expect(state.contracts[0]!.successors[0]!.name).toBe('CL_NEW_A');
      expect(state.contracts[0]!.successors[1]!.name).toBe('CL_NEW_B');
    });
  });

  // ─── findDeepNodes ─────────────────────────────────────────────────

  describe('findDeepNodes', () => {
    it('finds nested elements at any depth', () => {
      const obj = { a: { b: { target: [{ val: 1 }, { val: 2 }] } } };
      const result = findDeepNodes(obj, 'target');
      expect(result).toHaveLength(2);
    });

    it('returns empty array for non-existent key', () => {
      const result = findDeepNodes({ a: 1 }, 'missing');
      expect(result).toEqual([]);
    });

    it('returns empty for null input', () => {
      expect(findDeepNodes(null, 'key')).toEqual([]);
    });

    it('wraps single object in array', () => {
      const obj = { wrapper: { target: { name: 'single' } } };
      const result = findDeepNodes(obj, 'target');
      expect(result).toHaveLength(1);
      expect((result[0] as any).name).toBe('single');
    });
  });

  // ─── parseServiceBinding ──────────────────────────────────────────

  describe('parseServiceBinding', () => {
    it('parses service binding XML from fixture', () => {
      const xml = loadFixture('service-binding.xml');
      const result = JSON.parse(parseServiceBinding(xml));
      expect(result.name).toBe('/DMO/UI_TRAVEL_D_D_O4');
      expect(result.description).toBe('Service Binding Travel Draft Scenario');
      expect(result.type).toBe('SRVB/SVB');
      expect(result.odataVersion).toBe('V4');
      expect(result.bindingType).toBe('ODATA');
      expect(result.bindingCategory).toBe('UI'); // category "0" = UI
      expect(result.published).toBe(true);
      expect(result.bindingCreated).toBe(true);
      expect(result.contract).toBe('C1');
      expect(result.serviceDefinition).toBe('/DMO/UI_TRAVEL_D_D');
      expect(result.serviceName).toBe('/DMO/UI_TRAVEL_D_D');
      expect(result.serviceVersion).toBe('0001');
      expect(result.releaseState).toBe('NOT_RELEASED');
      expect(result.package).toBe('/DMO/FLIGHT_DRAFT');
      expect(result.implementation).toBe('/DMO/UI_TRAVEL_D_D_O4');
    });

    it('parses V2 service binding with Web API category', () => {
      const xml = `<?xml version="1.0" encoding="utf-8"?>
<srvb:serviceBinding srvb:contract="C1" srvb:published="false" srvb:bindingCreated="true"
    adtcore:name="ZAPI_TRAVEL" adtcore:type="SRVB/SVB" adtcore:description="Travel API"
    adtcore:language="EN" xmlns:srvb="http://www.sap.com/adt/ddic/ServiceBindings"
    xmlns:adtcore="http://www.sap.com/adt/core">
  <adtcore:packageRef adtcore:name="ZTRAVEL"/>
  <srvb:services srvb:name="ZAPI_TRAVEL">
    <srvb:content srvb:version="0001" srvb:releaseState="RELEASED">
      <srvb:serviceDefinition adtcore:name="ZSD_TRAVEL"/>
    </srvb:content>
  </srvb:services>
  <srvb:binding srvb:type="ODATA" srvb:version="V2" srvb:category="1">
    <srvb:implementation adtcore:name="ZAPI_TRAVEL"/>
  </srvb:binding>
</srvb:serviceBinding>`;

      const result = JSON.parse(parseServiceBinding(xml));
      expect(result.name).toBe('ZAPI_TRAVEL');
      expect(result.odataVersion).toBe('V2');
      expect(result.bindingCategory).toBe('Web API'); // category "1" = Web API
      expect(result.published).toBe(false);
      expect(result.releaseState).toBe('RELEASED');
    });

    it('handles minimal service binding XML gracefully', () => {
      const xml = `<?xml version="1.0"?><srvb:serviceBinding
        xmlns:srvb="http://www.sap.com/adt/ddic/ServiceBindings"
        xmlns:adtcore="http://www.sap.com/adt/core">
        <srvb:binding/>
      </srvb:serviceBinding>`;
      const result = JSON.parse(parseServiceBinding(xml));
      expect(result.name).toBe('');
      expect(result.odataVersion).toBe('');
    });
  });

  // ─── parseClassMetadata ─────────────────────────────────────────────

  describe('parseClassMetadata', () => {
    it('parses class metadata from fixture', () => {
      const xml = loadFixture('class-metadata.xml');
      const result = parseClassMetadata(xml);

      expect(result.name).toBe('ZCL_EXAMPLE');
      expect(result.description).toBe('Example test class');
      expect(result.language).toBe('EN');
      expect(result.abapLanguageVersion).toBe('standard');
      expect(result.category).toBe('generalObjectType');
      expect(result.fixPointArithmetic).toBe(true);
      expect(result.package).toBe('$TMP');
    });

    it('handles missing optional fields', () => {
      const xml = `<?xml version="1.0" encoding="utf-8"?>
<class:abapClass adtcore:name="ZCL_MINIMAL" adtcore:description="Minimal" adtcore:language="EN"
    class:fixPointArithmetic="false"
    xmlns:class="http://www.sap.com/adt/oo/classes" xmlns:adtcore="http://www.sap.com/adt/core">
  <adtcore:packageRef adtcore:name="ZTEST"/>
</class:abapClass>`;
      const result = parseClassMetadata(xml);

      expect(result.name).toBe('ZCL_MINIMAL');
      expect(result.abapLanguageVersion).toBeUndefined();
      expect(result.category).toBe('');
      expect(result.fixPointArithmetic).toBe(false);
    });

    it('extracts package from nested packageRef', () => {
      const xml = `<?xml version="1.0"?>
<class:abapClass adtcore:name="ZCL_PKG" adtcore:description="Pkg test" adtcore:language="EN"
    class:fixPointArithmetic="true"
    xmlns:class="http://www.sap.com/adt/oo/classes" xmlns:adtcore="http://www.sap.com/adt/core">
  <adtcore:packageRef adtcore:name="ZFLIGHT" adtcore:description="Flight demo"/>
</class:abapClass>`;
      const result = parseClassMetadata(xml);
      expect(result.package).toBe('ZFLIGHT');
    });

    it('maps category codes to human-readable strings', () => {
      const makeXml = (cat: string) => `<?xml version="1.0"?>
<class:abapClass adtcore:name="ZCL_CAT" adtcore:description="Cat" adtcore:language="EN"
    class:category="${cat}" class:fixPointArithmetic="true"
    xmlns:class="http://www.sap.com/adt/oo/classes" xmlns:adtcore="http://www.sap.com/adt/core">
</class:abapClass>`;

      expect(parseClassMetadata(makeXml('00')).category).toBe('generalObjectType');
      expect(parseClassMetadata(makeXml('01')).category).toBe('exceptionClass');
      expect(parseClassMetadata(makeXml('40')).category).toBe('exitClass');
      expect(parseClassMetadata(makeXml('41')).category).toBe('testclassAbapUnit');
    });

    it('passes through unknown category codes as-is', () => {
      const xml = `<?xml version="1.0"?>
<class:abapClass adtcore:name="ZCL_UNK" adtcore:description="Unknown" adtcore:language="EN"
    class:category="99" class:fixPointArithmetic="true"
    xmlns:class="http://www.sap.com/adt/oo/classes" xmlns:adtcore="http://www.sap.com/adt/core">
</class:abapClass>`;
      expect(parseClassMetadata(xml).category).toBe('99');
    });

    it('handles empty/minimal XML gracefully', () => {
      const xml = `<?xml version="1.0"?>
<class:abapClass xmlns:class="http://www.sap.com/adt/oo/classes" xmlns:adtcore="http://www.sap.com/adt/core"/>`;
      const result = parseClassMetadata(xml);
      expect(result.name).toBe('');
      expect(result.description).toBe('');
      expect(result.language).toBe('');
      expect(result.fixPointArithmetic).toBe(false);
      expect(result.package).toBe('');
    });
  });

  // ─── parseBspAppList ─────────────────────────────────────────────────

  describe('parseBspAppList', () => {
    it('parses app list from fixture', () => {
      const xml = loadFixture('bsp-app-list.xml');
      const apps = parseBspAppList(xml);
      expect(apps).toHaveLength(3);
      expect(apps[0]).toEqual({ name: 'ZAPP_BOOKING', description: 'Manage Bookings' });
      expect(apps[1]).toEqual({ name: 'ZAPP_TRAVEL', description: 'Travel Management' });
      expect(apps[2]).toEqual({ name: 'ZAPP_MONITOR', description: 'System Monitor' });
    });

    it('returns empty array for empty feed', () => {
      const xml = `<?xml version="1.0"?>
<atom:feed xmlns:atom="http://www.w3.org/2005/Atom">
  <atom:id>empty</atom:id>
</atom:feed>`;
      const apps = parseBspAppList(xml);
      expect(apps).toEqual([]);
    });

    it('handles single entry (no array)', () => {
      const xml = `<?xml version="1.0"?>
<atom:feed xmlns:atom="http://www.w3.org/2005/Atom">
  <atom:entry>
    <atom:title>ZSINGLE_APP</atom:title>
    <atom:summary>Single app</atom:summary>
  </atom:entry>
</atom:feed>`;
      const apps = parseBspAppList(xml);
      expect(apps).toHaveLength(1);
      expect(apps[0]).toEqual({ name: 'ZSINGLE_APP', description: 'Single app' });
    });
  });

  // ─── parseBspFolderListing ───────────────────────────────────────────

  describe('parseBspFolderListing', () => {
    it('parses folder listing from fixture', () => {
      const xml = loadFixture('bsp-folder-listing.xml');
      const nodes = parseBspFolderListing(xml, 'ZAPP_BOOKING');
      expect(nodes).toHaveLength(4);
    });

    it('detects files and folders', () => {
      const xml = loadFixture('bsp-folder-listing.xml');
      const nodes = parseBspFolderListing(xml, 'ZAPP_BOOKING');
      const files = nodes.filter((n) => n.type === 'file');
      const folders = nodes.filter((n) => n.type === 'folder');
      expect(files).toHaveLength(2);
      expect(folders).toHaveLength(2);
    });

    it('extracts etag for file entries', () => {
      const xml = loadFixture('bsp-folder-listing.xml');
      const nodes = parseBspFolderListing(xml, 'ZAPP_BOOKING');
      const componentJs = nodes.find((n) => n.name === 'Component.js');
      expect(componentJs).toBeDefined();
      expect(componentJs!.etag).toBe('20230112203908');
    });

    it('omits etag for folder entries', () => {
      const xml = loadFixture('bsp-folder-listing.xml');
      const nodes = parseBspFolderListing(xml, 'ZAPP_BOOKING');
      const i18n = nodes.find((n) => n.name === 'i18n');
      expect(i18n).toBeDefined();
      expect(i18n!.etag).toBeUndefined();
    });

    it('extracts relative path from title', () => {
      const xml = loadFixture('bsp-folder-listing.xml');
      const nodes = parseBspFolderListing(xml, 'ZAPP_BOOKING');
      const componentJs = nodes.find((n) => n.name === 'Component.js');
      expect(componentJs!.path).toBe('/Component.js');
      const i18n = nodes.find((n) => n.name === 'i18n');
      expect(i18n!.path).toBe('/i18n');
    });

    it('returns empty array for empty folder', () => {
      const xml = `<?xml version="1.0"?>
<atom:feed xmlns:atom="http://www.w3.org/2005/Atom">
  <atom:id>ZAPP_EMPTY</atom:id>
</atom:feed>`;
      const nodes = parseBspFolderListing(xml, 'ZAPP_EMPTY');
      expect(nodes).toEqual([]);
    });
  });

  // ─── parseSourceSearchResults ─────────────────────────────────────────

  describe('parseSourceSearchResults', () => {
    it('extracts textSearchResult matches with line and snippet', () => {
      const xml = `<?xml version="1.0" encoding="utf-8"?>
<adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core" xmlns:txt="http://www.sap.com/adt/textsearch">
  <adtcore:objectReference uri="/sap/bc/adt/programs/programs/ZTEST" type="PROG/P" name="ZTEST">
    <txt:textSearchResult line="10" snippet="DATA lv_test TYPE string."/>
    <txt:textSearchResult line="25" snippet="lv_test = 'hello'."/>
  </adtcore:objectReference>
</adtcore:objectReferences>`;
      const results = parseSourceSearchResults(xml);
      expect(results).toHaveLength(1);
      expect(results[0]?.objectName).toBe('ZTEST');
      expect(results[0]?.matches).toHaveLength(2);
      expect(results[0]?.matches[0]).toEqual({ line: 10, snippet: 'DATA lv_test TYPE string.' });
      expect(results[0]?.matches[1]).toEqual({ line: 25, snippet: "lv_test = 'hello'." });
    });

    it('handles single textSearchResult child (still returns array)', () => {
      const xml = `<?xml version="1.0" encoding="utf-8"?>
<adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core" xmlns:txt="http://www.sap.com/adt/textsearch">
  <adtcore:objectReference uri="/sap/bc/adt/oo/classes/ZCL_TEST" type="CLAS/OC" name="ZCL_TEST">
    <txt:textSearchResult line="42" snippet="METHOD do_something."/>
  </adtcore:objectReference>
</adtcore:objectReferences>`;
      const results = parseSourceSearchResults(xml);
      expect(results).toHaveLength(1);
      expect(results[0]?.matches).toHaveLength(1);
      expect(results[0]?.matches[0]).toEqual({ line: 42, snippet: 'METHOD do_something.' });
    });

    it('returns empty matches for objectReference with no textSearchResult children', () => {
      const xml = `<?xml version="1.0" encoding="utf-8"?>
<adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">
  <adtcore:objectReference uri="/sap/bc/adt/programs/programs/ZTEST" type="PROG/P" name="ZTEST"/>
</adtcore:objectReferences>`;
      const results = parseSourceSearchResults(xml);
      expect(results).toHaveLength(1);
      expect(results[0]?.objectName).toBe('ZTEST');
      expect(results[0]?.matches).toEqual([]);
    });

    it('falls back to Atom feed format', () => {
      const xml = `<?xml version="1.0" encoding="utf-8"?>
<atom:feed xmlns:atom="http://www.w3.org/2005/Atom">
  <atom:entry>
    <atom:id>/sap/bc/adt/programs/programs/ZTEST</atom:id>
    <atom:title>ZTEST</atom:title>
  </atom:entry>
</atom:feed>`;
      const results = parseSourceSearchResults(xml);
      expect(results).toHaveLength(1);
      expect(results[0]?.objectName).toBe('ZTEST');
      expect(results[0]?.uri).toBe('/sap/bc/adt/programs/programs/ZTEST');
      expect(results[0]?.matches).toEqual([]);
    });
  });

  // ─── escapeXmlAttr ──────────────────────────────────────────────────

  describe('escapeXmlAttr', () => {
    it('escapes & < > " and single quote', () => {
      expect(escapeXmlAttr('a&b<c>d"e\'f')).toBe('a&amp;b&lt;c&gt;d&quot;e&apos;f');
    });

    it('passes through normal strings unchanged', () => {
      expect(escapeXmlAttr('/sap/bc/adt/oo/classes/ZCL_TEST')).toBe('/sap/bc/adt/oo/classes/ZCL_TEST');
    });

    it('handles empty string', () => {
      expect(escapeXmlAttr('')).toBe('');
    });
  });
});
