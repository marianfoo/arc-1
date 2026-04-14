/**
 * XML builders for DDIC metadata objects (DOMA, DTEL, MSAG).
 *
 * Unlike source-based objects, these ADT object types are fully defined by
 * structured XML payloads on create/update.
 */

export interface DomainFixedValue {
  low: string;
  high?: string;
  description?: string;
}

export interface DomainCreateParams {
  name: string;
  description: string;
  package: string;
  dataType: string;
  length: number | string;
  decimals?: number | string;
  outputLength?: number | string;
  conversionExit?: string;
  signExists?: boolean;
  lowercase?: boolean;
  fixedValues?: DomainFixedValue[];
  valueTable?: string;
}

export interface DataElementCreateParams {
  name: string;
  description: string;
  package: string;
  typeKind?: 'domain' | 'predefinedAbapType';
  typeName?: string;
  domainName?: string;
  dataType?: string;
  length?: number | string;
  decimals?: number | string;
  shortLabel?: string;
  mediumLabel?: string;
  longLabel?: string;
  headingLabel?: string;
  searchHelp?: string;
  searchHelpParameter?: string;
  setGetParameter?: string;
  defaultComponentName?: string;
  changeDocument?: boolean;
}

export interface PackageCreateParams {
  name: string;
  description: string;
  superPackage?: string;
  softwareComponent?: string;
  transportLayer?: string;
  packageType?: 'development' | 'structure' | 'main';
}

export interface ServiceBindingCreateParams {
  name: string;
  description: string;
  package: string;
  serviceDefinition: string;
  bindingType?: string;
  category?: '0' | '1';
  version?: string;
}

const DTEL_MAX_LABEL_LENGTHS = {
  short: 10,
  medium: 20,
  long: 40,
  heading: 55,
} as const;

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatLength(value: number | string | undefined, width: number): string {
  if (value === undefined || value === null || String(value).trim() === '') {
    return ''.padStart(width, '0');
  }
  const raw = String(value).trim();
  if (/^\d+$/.test(raw)) {
    return raw.padStart(width, '0');
  }
  const parsed = Number(raw);
  if (Number.isFinite(parsed) && parsed >= 0) {
    return String(Math.floor(parsed)).padStart(width, '0');
  }
  return ''.padStart(width, '0');
}

function formatLabelLength(label: string, maxLength: number): string {
  if (!label) return String(maxLength).padStart(2, '0');
  return String(Math.min(label.length, maxLength)).padStart(2, '0');
}

function boolToXml(value: boolean | undefined): string {
  return value ? 'true' : 'false';
}

export function buildDomainXml(params: DomainCreateParams): string {
  const fixedValues = params.fixedValues ?? [];
  const valueTable = params.valueTable?.trim();
  const fixValuesXml =
    fixedValues.length === 0
      ? '      <doma:fixValues/>'
      : [
          '      <doma:fixValues>',
          ...fixedValues.map(
            (value, index) => `        <doma:fixValue>
          <doma:position>${String(index + 1).padStart(4, '0')}</doma:position>
          <doma:low>${escapeXml(value.low)}</doma:low>
          <doma:high>${escapeXml(value.high ?? '')}</doma:high>
          <doma:text>${escapeXml(value.description ?? '')}</doma:text>
        </doma:fixValue>`,
          ),
          '      </doma:fixValues>',
        ].join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<doma:domain xmlns:doma="http://www.sap.com/dictionary/domain"
             xmlns:adtcore="http://www.sap.com/adt/core"
             adtcore:description="${escapeXml(params.description)}"
             adtcore:name="${escapeXml(params.name)}"
             adtcore:type="DOMA/DD"
             adtcore:masterLanguage="EN"
             adtcore:masterSystem="H00"
             adtcore:responsible="DEVELOPER">
  <adtcore:packageRef adtcore:name="${escapeXml(params.package)}"/>
  <doma:content>
    <doma:typeInformation>
      <doma:datatype>${escapeXml(params.dataType)}</doma:datatype>
      <doma:length>${formatLength(params.length, 6)}</doma:length>
      <doma:decimals>${formatLength(params.decimals, 6)}</doma:decimals>
    </doma:typeInformation>
    <doma:outputInformation>
      <doma:length>${formatLength(params.outputLength ?? params.length, 6)}</doma:length>
      <doma:style>00</doma:style>
      <doma:conversionExit>${escapeXml(params.conversionExit ?? '')}</doma:conversionExit>
      <doma:signExists>${boolToXml(params.signExists)}</doma:signExists>
      <doma:lowercase>${boolToXml(params.lowercase)}</doma:lowercase>
      <doma:ampmFormat>false</doma:ampmFormat>
    </doma:outputInformation>
    <doma:valueInformation>
${valueTable ? `      <doma:valueTableRef adtcore:type="TABL/DT" adtcore:name="${escapeXml(valueTable)}"/>` : ''}
      <doma:appendExists>false</doma:appendExists>
${fixValuesXml}
    </doma:valueInformation>
  </doma:content>
</doma:domain>`;
}

export interface MessageClassMessage {
  number: string;
  shortText: string;
}

export interface MessageClassCreateParams {
  name: string;
  description: string;
  package: string;
  messages?: MessageClassMessage[];
}

export function buildMessageClassXml(params: MessageClassCreateParams): string {
  const messages = params.messages ?? [];
  const messagesXml =
    messages.length === 0
      ? ''
      : '\n' +
        messages
          .map(
            (m) =>
              `  <mc:messages mc:msgno="${escapeXml(m.number)}" mc:msgtext="${escapeXml(m.shortText)}" mc:selfexplainatory="true" mc:documented="false"/>`,
          )
          .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<mc:messageClass xmlns:mc="http://www.sap.com/adt/MessageClass"
                 xmlns:adtcore="http://www.sap.com/adt/core"
                 adtcore:description="${escapeXml(params.description)}"
                 adtcore:name="${escapeXml(params.name)}">
  <adtcore:packageRef adtcore:name="${escapeXml(params.package)}"/>${messagesXml}
</mc:messageClass>`;
}

export function buildDataElementXml(params: DataElementCreateParams): string {
  const typeKind = params.typeKind ?? (params.dataType ? 'predefinedAbapType' : 'domain');
  const shortLabel = params.shortLabel ?? '';
  const mediumLabel = params.mediumLabel ?? '';
  const longLabel = params.longLabel ?? '';
  const headingLabel = params.headingLabel ?? '';
  const typeName = params.typeName ?? params.domainName ?? '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<blue:wbobj xmlns:blue="http://www.sap.com/wbobj/dictionary/dtel"
            xmlns:adtcore="http://www.sap.com/adt/core"
            adtcore:description="${escapeXml(params.description)}"
            adtcore:name="${escapeXml(params.name)}"
            adtcore:type="DTEL/DE"
            adtcore:masterLanguage="EN"
            adtcore:masterSystem="H00"
            adtcore:responsible="DEVELOPER">
  <adtcore:packageRef adtcore:name="${escapeXml(params.package)}"/>
  <dtel:dataElement xmlns:dtel="http://www.sap.com/adt/dictionary/dataelements">
    <dtel:typeKind>${escapeXml(typeKind)}</dtel:typeKind>
    <dtel:typeName>${escapeXml(typeName)}</dtel:typeName>
    <dtel:dataType>${escapeXml(params.dataType ?? '')}</dtel:dataType>
    <dtel:dataTypeLength>${formatLength(params.length, 6)}</dtel:dataTypeLength>
    <dtel:dataTypeDecimals>${formatLength(params.decimals, 6)}</dtel:dataTypeDecimals>
    <dtel:shortFieldLabel>${escapeXml(shortLabel)}</dtel:shortFieldLabel>
    <dtel:shortFieldLength>${formatLabelLength(shortLabel, DTEL_MAX_LABEL_LENGTHS.short)}</dtel:shortFieldLength>
    <dtel:shortFieldMaxLength>${String(DTEL_MAX_LABEL_LENGTHS.short).padStart(2, '0')}</dtel:shortFieldMaxLength>
    <dtel:mediumFieldLabel>${escapeXml(mediumLabel)}</dtel:mediumFieldLabel>
    <dtel:mediumFieldLength>${formatLabelLength(mediumLabel, DTEL_MAX_LABEL_LENGTHS.medium)}</dtel:mediumFieldLength>
    <dtel:mediumFieldMaxLength>${DTEL_MAX_LABEL_LENGTHS.medium}</dtel:mediumFieldMaxLength>
    <dtel:longFieldLabel>${escapeXml(longLabel)}</dtel:longFieldLabel>
    <dtel:longFieldLength>${formatLabelLength(longLabel, DTEL_MAX_LABEL_LENGTHS.long)}</dtel:longFieldLength>
    <dtel:longFieldMaxLength>${DTEL_MAX_LABEL_LENGTHS.long}</dtel:longFieldMaxLength>
    <dtel:headingFieldLabel>${escapeXml(headingLabel)}</dtel:headingFieldLabel>
    <dtel:headingFieldLength>${formatLabelLength(headingLabel, DTEL_MAX_LABEL_LENGTHS.heading)}</dtel:headingFieldLength>
    <dtel:headingFieldMaxLength>${DTEL_MAX_LABEL_LENGTHS.heading}</dtel:headingFieldMaxLength>
    <dtel:searchHelp>${escapeXml(params.searchHelp ?? '')}</dtel:searchHelp>
    <dtel:searchHelpParameter>${escapeXml(params.searchHelpParameter ?? '')}</dtel:searchHelpParameter>
    <dtel:setGetParameter>${escapeXml(params.setGetParameter ?? '')}</dtel:setGetParameter>
    <dtel:defaultComponentName>${escapeXml(params.defaultComponentName ?? '')}</dtel:defaultComponentName>
    <dtel:deactivateInputHistory>false</dtel:deactivateInputHistory>
    <dtel:changeDocument>${boolToXml(params.changeDocument)}</dtel:changeDocument>
    <dtel:leftToRightDirection>false</dtel:leftToRightDirection>
    <dtel:deactivateBIDIFiltering>false</dtel:deactivateBIDIFiltering>
  </dtel:dataElement>
</blue:wbobj>`;
}

export function buildPackageXml(params: PackageCreateParams): string {
  const packageType = params.packageType ?? 'development';
  const superPackage = params.superPackage ?? '';
  const softwareComponent = params.softwareComponent ?? 'LOCAL';
  const transportLayer = params.transportLayer ?? '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<pak:package xmlns:pak="http://www.sap.com/adt/packages"
             xmlns:adtcore="http://www.sap.com/adt/core"
             adtcore:description="${escapeXml(params.description)}"
             adtcore:name="${escapeXml(params.name)}"
             adtcore:type="DEVC/K"
             adtcore:version="active"
             adtcore:responsible="DEVELOPER">
  <adtcore:packageRef adtcore:name="${escapeXml(params.name)}"/>
  <pak:attributes pak:packageType="${escapeXml(packageType)}"/>
  <pak:superPackage adtcore:name="${escapeXml(superPackage)}"/>
  <pak:applicationComponent/>
  <pak:transport>
    <pak:softwareComponent pak:name="${escapeXml(softwareComponent)}"/>
    <pak:transportLayer pak:name="${escapeXml(transportLayer)}"/>
  </pak:transport>
  <pak:translation/>
  <pak:useAccesses/>
  <pak:packageInterfaces/>
  <pak:subPackages/>
</pak:package>`;
}

export function buildServiceBindingXml(params: ServiceBindingCreateParams): string {
  const bindingType = params.bindingType?.trim() || 'ODATA';
  const category = params.category === '1' ? '1' : '0';
  const serviceVersion = params.version?.trim() || '0001';

  return `<?xml version="1.0" encoding="UTF-8"?>
<srvb:serviceBinding xmlns:srvb="http://www.sap.com/adt/ddic/ServiceBindings"
                     xmlns:adtcore="http://www.sap.com/adt/core"
                     adtcore:description="${escapeXml(params.description)}"
                     adtcore:name="${escapeXml(params.name)}"
                     adtcore:type="SRVB/SVB"
                     adtcore:language="EN"
                     adtcore:masterLanguage="EN"
                     adtcore:responsible="DEVELOPER">
  <adtcore:packageRef adtcore:name="${escapeXml(params.package)}"/>
  <srvb:services srvb:name="${escapeXml(params.name)}">
    <srvb:content srvb:version="${escapeXml(serviceVersion)}">
      <srvb:serviceDefinition adtcore:name="${escapeXml(params.serviceDefinition)}"/>
    </srvb:content>
  </srvb:services>
  <srvb:binding srvb:category="${category}" srvb:type="${escapeXml(bindingType)}" srvb:version="V2">
    <srvb:implementation adtcore:name=""/>
  </srvb:binding>
</srvb:serviceBinding>`;
}
