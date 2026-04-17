import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { classifyCdsImpact } from '../../../src/adt/cds-impact.js';
import type { WhereUsedResult } from '../../../src/adt/codeintel.js';
import { findDeepNodes, parseXml } from '../../../src/adt/xml-parser.js';

const fixturesDir = join(import.meta.dirname, '../../fixtures/xml');

function parseFixtureWhereUsed(xml: string): WhereUsedResult[] {
  const parsed = parseXml(xml);
  const refs = findDeepNodes(parsed, 'referencedObject');
  const results: WhereUsedResult[] = [];

  for (const ref of refs) {
    const adtObj = (ref.adtObject ?? {}) as Record<string, unknown>;
    const pkgRef = (adtObj.packageRef ?? {}) as Record<string, unknown>;
    const usageRaw = String(ref['@_usageInformation'] ?? '');
    const usageTokens = usageRaw
      .split(',')
      .map((token) => token.trim())
      .filter((token) => token.length > 0);

    results.push({
      uri: String(ref['@_uri'] ?? ''),
      type: String(adtObj['@_type'] ?? ''),
      name: String(adtObj['@_name'] ?? ''),
      line: 0,
      column: 0,
      packageName: String(pkgRef['@_name'] ?? ''),
      snippet: '',
      objectDescription: String(adtObj['@_description'] ?? ''),
      parentUri: asOptionalString(ref['@_parentUri']),
      isResult: parseOptionalBoolean(ref['@_isResult']),
      canHaveChildren: parseOptionalBoolean(ref['@_canHaveChildren']),
      usageInformation:
        usageRaw.length > 0
          ? {
              direct: usageTokens.includes('gradeDirect'),
              productive: usageTokens.includes('includeProductive'),
              raw: usageRaw,
            }
          : undefined,
    });
  }

  return results;
}

function asOptionalString(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  const str = String(value);
  return str.length > 0 ? str : undefined;
}

function parseOptionalBoolean(value: unknown): boolean | undefined {
  if (value === null || value === undefined) return undefined;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  return undefined;
}

function makeResult(type: string, name: string, direct = true): WhereUsedResult {
  return {
    uri: `/sap/bc/adt/mock/${type}/${name.toLowerCase()}`,
    type,
    name,
    line: 0,
    column: 0,
    packageName: '$TMP',
    snippet: '',
    objectDescription: '',
    usageInformation: {
      direct,
      productive: true,
      raw: direct ? 'gradeDirect,includeProductive' : 'gradeIndirect,includeProductive',
    },
  };
}

describe('classifyCdsImpact', () => {
  it('classifies access controls from live-like where-used fixture', () => {
    const xml = readFileSync(join(fixturesDir, 'where-used-cds-impact.xml'), 'utf-8');
    const results = parseFixtureWhereUsed(xml);
    const downstream = classifyCdsImpact(results);

    expect(downstream.accessControls.some((item) => item.name === 'I_ABAPPACKAGE' && item.type === 'DCLS/DL')).toBe(
      true,
    );
  });

  it('classifies SKTD entries as documentation', () => {
    const xml = readFileSync(join(fixturesDir, 'where-used-cds-impact.xml'), 'utf-8');
    const results = parseFixtureWhereUsed(xml);
    const downstream = classifyCdsImpact(results);

    expect(downstream.documentation.some((item) => item.name === 'I_ABAPPACKAGE' && item.type === 'SKTD/TYP')).toBe(
      true,
    );
  });

  it('does not classify package-group DEVC nodes', () => {
    const xml = readFileSync(join(fixturesDir, 'where-used-cds-impact.xml'), 'utf-8');
    const results = parseFixtureWhereUsed(xml);
    const downstream = classifyCdsImpact(results, { includeIndirect: true });

    const allClassified = [
      ...downstream.projectionViews,
      ...downstream.bdefs,
      ...downstream.serviceDefinitions,
      ...downstream.serviceBindings,
      ...downstream.accessControls,
      ...downstream.metadataExtensions,
      ...downstream.abapConsumers,
      ...downstream.tables,
      ...downstream.documentation,
      ...downstream.other,
    ];
    expect(allClassified.some((item) => item.type === 'DEVC/K')).toBe(false);
  });

  it('routes RAP-relevant object types into their dedicated buckets', () => {
    const results: WhereUsedResult[] = [
      makeResult('DDLS/DF', 'ZI_ARC1_ROOT'),
      makeResult('BDEF/BO', 'ZI_ARC1_ROOT'),
      makeResult('SRVD/SD', 'ZI_ARC1_SERVICE'),
      makeResult('SRVB/SB', 'ZI_ARC1_BINDING'),
    ];
    const downstream = classifyCdsImpact(results);

    expect(downstream.projectionViews.map((item) => item.name)).toEqual(['ZI_ARC1_ROOT']);
    expect(downstream.bdefs.map((item) => item.name)).toEqual(['ZI_ARC1_ROOT']);
    expect(downstream.serviceDefinitions.map((item) => item.name)).toEqual(['ZI_ARC1_SERVICE']);
    expect(downstream.serviceBindings.map((item) => item.name)).toEqual(['ZI_ARC1_BINDING']);
  });

  it('drops indirect entries by default', () => {
    const results: WhereUsedResult[] = [
      makeResult('DDLS/DF', 'ZI_DIRECT', true),
      makeResult('DDLS/DF', 'ZI_IND', false),
    ];
    const downstream = classifyCdsImpact(results);

    expect(downstream.projectionViews.map((item) => item.name)).toEqual(['ZI_DIRECT']);
    expect(downstream.summary.indirect).toBe(0);
  });

  it('keeps indirect entries when includeIndirect=true', () => {
    const results: WhereUsedResult[] = [
      makeResult('DDLS/DF', 'ZI_DIRECT', true),
      makeResult('DDLS/DF', 'ZI_IND', false),
    ];
    const downstream = classifyCdsImpact(results, { includeIndirect: true });

    expect(downstream.projectionViews.map((item) => item.name)).toEqual(['ZI_DIRECT', 'ZI_IND']);
    expect(downstream.summary.indirect).toBe(1);
  });

  it('routes unknown object types into other', () => {
    const downstream = classifyCdsImpact([makeResult('ZZZ/XX', 'ZUNKNOWN')]);
    expect(downstream.other.map((item) => item.name)).toEqual(['ZUNKNOWN']);
  });

  it('reports summary.total from included entries', () => {
    const results: WhereUsedResult[] = [
      makeResult('DDLS/DF', 'ZI_A', true),
      makeResult('DDLS/DF', 'ZI_B', false),
      {
        ...makeResult('DEVC/K', 'SCTS_CAT', true),
        isResult: false,
        canHaveChildren: true,
      },
    ];

    const defaultResult = classifyCdsImpact(results);
    const expandedResult = classifyCdsImpact(results, { includeIndirect: true });

    expect(defaultResult.summary.total).toBe(1);
    expect(expandedResult.summary.total).toBe(2);
  });
});
