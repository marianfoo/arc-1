import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  findDeepNodes,
  parseDataElementMetadata,
  parseDomainMetadata,
  parseFunctionGroup,
  parseInstalledComponents,
  parsePackageContents,
  parseSearchResults,
  parseSystemInfo,
  parseTableContents,
  parseTransactionMetadata,
  parseXml,
} from '../../../ts-src/adt/xml-parser.js';

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
});
