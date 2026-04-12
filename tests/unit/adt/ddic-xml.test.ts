import { describe, expect, it } from 'vitest';
import { buildDataElementXml, buildDomainXml } from '../../../src/adt/ddic-xml.js';

describe('ddic-xml builders', () => {
  describe('buildDomainXml', () => {
    it('builds basic domain XML', () => {
      const xml = buildDomainXml({
        name: 'ZSTATUS',
        description: 'Status domain',
        package: '$TMP',
        dataType: 'CHAR',
        length: 1,
      });

      expect(xml).toContain('<doma:domain');
      expect(xml).toContain('adtcore:type="DOMA/DD"');
      expect(xml).toContain('<doma:datatype>CHAR</doma:datatype>');
      expect(xml).toContain('<doma:length>000001</doma:length>');
      expect(xml).toContain('<doma:decimals>000000</doma:decimals>');
      expect(xml).toContain('<adtcore:packageRef adtcore:name="$TMP"/>');
    });

    it('builds fix values when provided', () => {
      const xml = buildDomainXml({
        name: 'ZSTATUS',
        description: 'Status domain',
        package: '$TMP',
        dataType: 'CHAR',
        length: 1,
        fixedValues: [
          { low: 'A', description: 'Active' },
          { low: 'I', high: 'Z', description: 'Inactive range' },
        ],
      });

      expect(xml).toContain('<doma:fixValues>');
      expect(xml).toContain('<doma:low>A</doma:low>');
      expect(xml).toContain('<doma:high>Z</doma:high>');
      expect(xml).toContain('<doma:description>Inactive range</doma:description>');
    });

    it('includes value table when provided', () => {
      const xml = buildDomainXml({
        name: 'ZBUKRS',
        description: 'Company code',
        package: '$TMP',
        dataType: 'CHAR',
        length: 4,
        valueTable: 'T001',
      });

      expect(xml).toContain('<doma:valueTableRef adtcore:type="TABL/DT" adtcore:name="T001"/>');
    });

    it('zero pads numeric fields to 6 digits', () => {
      const xml = buildDomainXml({
        name: 'ZAMOUNT',
        description: 'Amount',
        package: '$TMP',
        dataType: 'DEC',
        length: 9,
        decimals: 2,
        outputLength: 11,
      });

      expect(xml).toContain('<doma:length>000009</doma:length>');
      expect(xml).toContain('<doma:decimals>000002</doma:decimals>');
      expect(xml).toContain('<doma:length>000011</doma:length>');
    });
  });

  describe('buildDataElementXml', () => {
    it('builds data element with domain reference', () => {
      const xml = buildDataElementXml({
        name: 'ZSTATUS',
        description: 'Status data element',
        package: '$TMP',
        typeKind: 'domain',
        typeName: 'ZSTATUS',
      });

      expect(xml).toContain('<dtel:typeKind>domain</dtel:typeKind>');
      expect(xml).toContain('<dtel:typeName>ZSTATUS</dtel:typeName>');
      expect(xml).toContain('<blue:wbobj');
      expect(xml).toContain('adtcore:type="DTEL/DE"');
    });

    it('builds data element with predefined ABAP type', () => {
      const xml = buildDataElementXml({
        name: 'ZTEXT20',
        description: 'Text',
        package: '$TMP',
        typeKind: 'predefinedAbapType',
        dataType: 'CHAR',
        length: 20,
      });

      expect(xml).toContain('<dtel:typeKind>predefinedAbapType</dtel:typeKind>');
      expect(xml).toContain('<dtel:dataType>CHAR</dtel:dataType>');
      expect(xml).toContain('<dtel:dataTypeLength>000020</dtel:dataTypeLength>');
    });

    it('emits fields in strict ADT order', () => {
      const xml = buildDataElementXml({
        name: 'ZORDER',
        description: 'Order',
        package: '$TMP',
      });

      const orderedTags = [
        '<dtel:typeKind>',
        '<dtel:typeName>',
        '<dtel:dataType>',
        '<dtel:dataTypeLength>',
        '<dtel:dataTypeDecimals>',
        '<dtel:shortFieldLabel>',
        '<dtel:shortFieldLength>',
        '<dtel:shortFieldMaxLength>',
        '<dtel:mediumFieldLabel>',
        '<dtel:mediumFieldLength>',
        '<dtel:mediumFieldMaxLength>',
        '<dtel:longFieldLabel>',
        '<dtel:longFieldLength>',
        '<dtel:longFieldMaxLength>',
        '<dtel:headingFieldLabel>',
        '<dtel:headingFieldLength>',
        '<dtel:headingFieldMaxLength>',
        '<dtel:searchHelp>',
        '<dtel:searchHelpParameter>',
        '<dtel:setGetParameter>',
        '<dtel:defaultComponentName>',
        '<dtel:deactivateInputHistory>',
        '<dtel:changeDocument>',
        '<dtel:leftToRightDirection>',
        '<dtel:deactivateBIDIFiltering>',
      ];

      let lastIndex = -1;
      for (const tag of orderedTags) {
        const idx = xml.indexOf(tag);
        expect(idx).toBeGreaterThan(lastIndex);
        lastIndex = idx;
      }
    });

    it('writes all optional fields when provided', () => {
      const xml = buildDataElementXml({
        name: 'ZSTATUS',
        description: 'Status',
        package: '$TMP',
        typeKind: 'domain',
        domainName: 'ZSTATUS',
        dataType: 'CHAR',
        length: 1,
        decimals: 0,
        shortLabel: 'St',
        mediumLabel: 'Status',
        longLabel: 'Order Status',
        headingLabel: 'Status',
        searchHelp: 'ZSH_STATUS',
        searchHelpParameter: 'STATUS',
        setGetParameter: 'ZST',
        defaultComponentName: 'STATUS',
        changeDocument: true,
      });

      expect(xml).toContain('<dtel:searchHelp>ZSH_STATUS</dtel:searchHelp>');
      expect(xml).toContain('<dtel:searchHelpParameter>STATUS</dtel:searchHelpParameter>');
      expect(xml).toContain('<dtel:setGetParameter>ZST</dtel:setGetParameter>');
      expect(xml).toContain('<dtel:defaultComponentName>STATUS</dtel:defaultComponentName>');
      expect(xml).toContain('<dtel:changeDocument>true</dtel:changeDocument>');
    });

    it('uses defaults for omitted values', () => {
      const xml = buildDataElementXml({
        name: 'ZDEFAULT',
        description: 'Defaults',
        package: '$TMP',
      });

      expect(xml).toContain('<dtel:dataTypeLength>000000</dtel:dataTypeLength>');
      expect(xml).toContain('<dtel:dataTypeDecimals>000000</dtel:dataTypeDecimals>');
      expect(xml).toContain('<dtel:shortFieldLength>10</dtel:shortFieldLength>');
      expect(xml).toContain('<dtel:mediumFieldLength>20</dtel:mediumFieldLength>');
      expect(xml).toContain('<dtel:longFieldLength>40</dtel:longFieldLength>');
      expect(xml).toContain('<dtel:headingFieldLength>55</dtel:headingFieldLength>');
      expect(xml).toContain('<dtel:changeDocument>false</dtel:changeDocument>');
    });
  });

  it('escapes XML special characters', () => {
    const domainXml = buildDomainXml({
      name: 'ZDOMA',
      description: 'Domain "A&B" <test> \'apostrophe\'',
      package: '$TMP',
      dataType: 'CHAR',
      length: 1,
      fixedValues: [{ low: 'A&B', description: 'A < B' }],
    });
    const dtelXml = buildDataElementXml({
      name: 'ZDTEL',
      description: 'Data "element"',
      package: '$TMP',
      shortLabel: 'A&B',
    });

    expect(domainXml).toContain('&quot;A&amp;B&quot; &lt;test&gt; &apos;apostrophe&apos;');
    expect(domainXml).toContain('<doma:low>A&amp;B</doma:low>');
    expect(domainXml).toContain('<doma:description>A &lt; B</doma:description>');
    expect(dtelXml).toContain('Data &quot;element&quot;');
    expect(dtelXml).toContain('<dtel:shortFieldLabel>A&amp;B</dtel:shortFieldLabel>');
  });
});
