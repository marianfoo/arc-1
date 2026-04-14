import { describe, expect, it } from 'vitest';
import {
  buildDataElementXml,
  buildDomainXml,
  buildMessageClassXml,
  buildPackageXml,
  buildServiceBindingXml,
} from '../../../src/adt/ddic-xml.js';

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
      expect(xml).toContain('<doma:position>0001</doma:position>');
      expect(xml).toContain('<doma:low>A</doma:low>');
      expect(xml).toContain('<doma:position>0002</doma:position>');
      expect(xml).toContain('<doma:high>Z</doma:high>');
      expect(xml).toContain('<doma:text>Inactive range</doma:text>');
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

  describe('buildMessageClassXml', () => {
    it('builds empty message class XML', () => {
      const xml = buildMessageClassXml({
        name: 'ZCM_TRAVEL',
        description: 'Travel messages',
        package: '$TMP',
      });

      expect(xml).toContain('<mc:messageClass');
      expect(xml).toContain('xmlns:mc="http://www.sap.com/adt/MessageClass"');
      expect(xml).toContain('adtcore:name="ZCM_TRAVEL"');
      expect(xml).toContain('adtcore:description="Travel messages"');
      expect(xml).toContain('<adtcore:packageRef adtcore:name="$TMP"/>');
      expect(xml).not.toContain('<mc:messages');
    });

    it('builds message class with messages', () => {
      const xml = buildMessageClassXml({
        name: 'ZCM_TRAVEL',
        description: 'Travel messages',
        package: '$TMP',
        messages: [
          { number: '001', shortText: 'Booking &1 created' },
          { number: '002', shortText: 'Flight not found' },
        ],
      });

      expect(xml).toContain('mc:msgno="001"');
      expect(xml).toContain('mc:msgtext="Booking &amp;1 created"');
      expect(xml).toContain('mc:msgno="002"');
      expect(xml).toContain('mc:msgtext="Flight not found"');
      expect(xml).toContain('mc:selfexplainatory="true"');
      expect(xml).toContain('mc:documented="false"');
    });

    it('escapes special characters in message text', () => {
      const xml = buildMessageClassXml({
        name: 'ZTEST',
        description: 'Test "class" <msgs>',
        package: '$TMP',
        messages: [{ number: '001', shortText: 'Error: &1 < &2 "quoted"' }],
      });

      expect(xml).toContain('adtcore:description="Test &quot;class&quot; &lt;msgs&gt;"');
      expect(xml).toContain('mc:msgtext="Error: &amp;1 &lt; &amp;2 &quot;quoted&quot;"');
    });
  });

  describe('buildPackageXml', () => {
    it('builds basic package XML with name and description', () => {
      const xml = buildPackageXml({
        name: 'ZPKG_TEST',
        description: 'Test package',
      });

      expect(xml).toContain('<pak:package');
      expect(xml).toContain('adtcore:type="DEVC/K"');
      expect(xml).toContain('adtcore:name="ZPKG_TEST"');
      expect(xml).toContain('adtcore:description="Test package"');
      expect(xml).toContain('<adtcore:packageRef adtcore:name="ZPKG_TEST"/>');
    });

    it('includes superPackage when provided', () => {
      const xml = buildPackageXml({
        name: 'ZPKG_CHILD',
        description: 'Child package',
        superPackage: 'ZPKG_PARENT',
      });

      expect(xml).toContain('<pak:superPackage adtcore:name="ZPKG_PARENT"/>');
    });

    it('includes softwareComponent and transportLayer when provided', () => {
      const xml = buildPackageXml({
        name: 'ZPKG_TR',
        description: 'Transport package',
        softwareComponent: 'HOME',
        transportLayer: 'HOME',
      });

      expect(xml).toContain('<pak:softwareComponent pak:name="HOME"/>');
      expect(xml).toContain('<pak:transportLayer pak:name="HOME"/>');
    });

    it('supports packageType structure', () => {
      const xml = buildPackageXml({
        name: 'ZPKG_STR',
        description: 'Structure package',
        packageType: 'structure',
      });

      expect(xml).toContain('<pak:attributes pak:packageType="structure"/>');
    });

    it('uses defaults for packageType and superPackage', () => {
      const xml = buildPackageXml({
        name: 'ZPKG_DEFAULT',
        description: 'Defaults',
      });

      expect(xml).toContain('<pak:attributes pak:packageType="development"/>');
      expect(xml).toContain('<pak:superPackage adtcore:name=""/>');
    });

    it('escapes XML special characters', () => {
      const xml = buildPackageXml({
        name: 'ZPKG_ESC',
        description: 'Package "A&B" <test> \'quote\'',
        superPackage: 'ZPARENT&A',
      });

      expect(xml).toContain('Package &quot;A&amp;B&quot; &lt;test&gt; &apos;quote&apos;');
      expect(xml).toContain('<pak:superPackage adtcore:name="ZPARENT&amp;A"/>');
    });
  });

  describe('buildServiceBindingXml', () => {
    it('builds basic service binding XML with SRVB/SVB type', () => {
      const xml = buildServiceBindingXml({
        name: 'ZSB_TRAVEL_O4',
        description: 'Travel service binding',
        package: '$TMP',
        serviceDefinition: 'ZSD_TRAVEL',
      });

      expect(xml).toContain('<srvb:serviceBinding');
      expect(xml).toContain('xmlns:srvb="http://www.sap.com/adt/ddic/ServiceBindings"');
      expect(xml).toContain('adtcore:type="SRVB/SVB"');
      expect(xml).toContain('adtcore:name="ZSB_TRAVEL_O4"');
      expect(xml).toContain('<adtcore:packageRef adtcore:name="$TMP"/>');
    });

    it('includes nested service definition reference', () => {
      const xml = buildServiceBindingXml({
        name: 'ZSB_TRAVEL_O4',
        description: 'Travel service binding',
        package: '$TMP',
        serviceDefinition: 'ZSD_TRAVEL',
      });

      expect(xml).toContain('<srvb:services srvb:name="ZSB_TRAVEL_O4">');
      expect(xml).toContain('<srvb:content srvb:version="0001">');
      expect(xml).toContain('<srvb:serviceDefinition adtcore:name="ZSD_TRAVEL"/>');
    });

    it('uses default category=0 and bindingType=ODATA', () => {
      const xml = buildServiceBindingXml({
        name: 'ZSB_DEFAULTS',
        description: 'Defaults',
        package: '$TMP',
        serviceDefinition: 'ZSD_DEFAULTS',
      });

      expect(xml).toContain('<srvb:binding srvb:category="0" srvb:type="ODATA" srvb:version="V2">');
    });

    it('supports category=1 for alternate binding category', () => {
      const xml = buildServiceBindingXml({
        name: 'ZSB_UI',
        description: 'UI binding',
        package: '$TMP',
        serviceDefinition: 'ZSD_UI',
        category: '1',
      });

      expect(xml).toContain('<srvb:binding srvb:category="1" srvb:type="ODATA" srvb:version="V2">');
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
    const srvbXml = buildServiceBindingXml({
      name: 'ZSB_XML',
      description: 'Service "A&B" <binding>',
      package: '$TMP',
      serviceDefinition: 'ZSD_<TEST>&',
      bindingType: 'ODATA"&',
    });

    expect(domainXml).toContain('&quot;A&amp;B&quot; &lt;test&gt; &apos;apostrophe&apos;');
    expect(domainXml).toContain('<doma:low>A&amp;B</doma:low>');
    expect(domainXml).toContain('<doma:text>A &lt; B</doma:text>');
    expect(dtelXml).toContain('Data &quot;element&quot;');
    expect(dtelXml).toContain('<dtel:shortFieldLabel>A&amp;B</dtel:shortFieldLabel>');
    expect(srvbXml).toContain('Service &quot;A&amp;B&quot; &lt;binding&gt;');
    expect(srvbXml).toContain('<srvb:serviceDefinition adtcore:name="ZSD_&lt;TEST&gt;&amp;"/>');
    expect(srvbXml).toContain('srvb:type="ODATA&quot;&amp;"');
  });
});
