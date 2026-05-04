import type { WhereUsedResult } from './codeintel.js';

export interface CdsImpactDownstream {
  projectionViews: WhereUsedResult[];
  bdefs: WhereUsedResult[];
  serviceDefinitions: WhereUsedResult[];
  serviceBindings: WhereUsedResult[];
  accessControls: WhereUsedResult[];
  metadataExtensions: WhereUsedResult[];
  abapConsumers: WhereUsedResult[];
  tables: WhereUsedResult[];
  documentation: WhereUsedResult[];
  other: WhereUsedResult[];
  summary: {
    total: number;
    direct: number;
    indirect: number;
    byBucket: Record<string, number>;
  };
}

export interface SiblingExtensionCandidate {
  name: string;
  packageName: string;
  metadataExtensions: number;
}

export interface SiblingExtensionFindingInput {
  targetName: string;
  targetPackageName?: string;
  stem: string;
  targetMetadataExtensions: number;
  siblings: SiblingExtensionCandidate[];
}

export interface SiblingExtensionFinding {
  code: 'SIBLING_METADATA_EXTENSION_MISMATCH';
  targetName: string;
  targetPackageName?: string;
  stem: string;
  siblingsWithMetadataExtensions: SiblingExtensionCandidate[];
  message: string;
}

interface ClassifyOptions {
  includeIndirect?: boolean;
}

const BUCKETS = [
  'projectionViews',
  'bdefs',
  'serviceDefinitions',
  'serviceBindings',
  'accessControls',
  'metadataExtensions',
  'abapConsumers',
  'tables',
  'documentation',
  'other',
] as const;

type BucketName = (typeof BUCKETS)[number];

export function classifyCdsImpact(results: WhereUsedResult[], options?: ClassifyOptions): CdsImpactDownstream {
  const includeIndirect = options?.includeIndirect === true;

  const grouped: Record<BucketName, WhereUsedResult[]> = {
    projectionViews: [],
    bdefs: [],
    serviceDefinitions: [],
    serviceBindings: [],
    accessControls: [],
    metadataExtensions: [],
    abapConsumers: [],
    tables: [],
    documentation: [],
    other: [],
  };

  let direct = 0;
  let indirect = 0;

  for (const result of results) {
    // Skip package/group container nodes from the usageReferences tree.
    if (result.isResult === false && result.canHaveChildren === true && result.type.split('/')[0] === 'DEVC') {
      continue;
    }

    const isDirect = result.usageInformation?.direct !== false;
    if (!includeIndirect && !isDirect) {
      continue;
    }

    if (isDirect) {
      direct += 1;
    } else {
      indirect += 1;
    }

    const bucket = bucketForType(result.type);
    grouped[bucket].push(result);
  }

  const byBucket: Record<string, number> = {};
  let total = 0;
  for (const bucket of BUCKETS) {
    byBucket[bucket] = grouped[bucket].length;
    total += grouped[bucket].length;
  }

  return {
    ...grouped,
    summary: {
      total,
      direct,
      indirect,
      byBucket,
    },
  };
}

function bucketForType(type: string): BucketName {
  const mainType = type.split('/')[0]?.toUpperCase() ?? '';

  switch (mainType) {
    case 'DDLS':
      return 'projectionViews';
    case 'BDEF':
      return 'bdefs';
    case 'SRVD':
      return 'serviceDefinitions';
    case 'SRVB':
      return 'serviceBindings';
    case 'DCLS':
      return 'accessControls';
    case 'DDLX':
      return 'metadataExtensions';
    case 'CLAS':
    case 'INTF':
    case 'PROG':
    case 'FUGR':
      return 'abapConsumers';
    case 'TABL':
      return 'tables';
    case 'SKTD':
      return 'documentation';
    default:
      return 'other';
  }
}

/**
 * Derive a conservative sibling stem from a DDLS object name.
 * Example: ZI_SALESDATA3 -> ZI_SALESDATA
 */
export function deriveSiblingStem(name: string): string {
  const normalized = normalizeName(name);
  if (!normalized) return '';
  const withoutNumericSuffix = normalized.replace(/\d+$/, '');
  return withoutNumericSuffix || normalized;
}

/**
 * Conservative sibling matcher: same stem, not the same object, and only
 * empty-or-numeric suffixes after the stem.
 */
export function isSiblingNameMatch(targetName: string, candidateName: string, stem: string): boolean {
  const target = normalizeName(targetName);
  const candidate = normalizeName(candidateName);
  const normalizedStem = deriveSiblingStem(stem);

  if (!target || !candidate || !normalizedStem) return false;
  if (target === candidate) return false;
  if (!target.startsWith(normalizedStem) || !candidate.startsWith(normalizedStem)) return false;

  const targetSuffix = target.slice(normalizedStem.length);
  const candidateSuffix = candidate.slice(normalizedStem.length);

  if (!isNumericVariantSuffix(targetSuffix) || !isNumericVariantSuffix(candidateSuffix)) {
    return false;
  }

  return targetSuffix !== candidateSuffix;
}

/**
 * Build a sibling-extension consistency finding when the target has no DDLX
 * consumers but one or more siblings do.
 */
export function buildSiblingExtensionFinding(input: SiblingExtensionFindingInput): SiblingExtensionFinding | null {
  if (input.targetMetadataExtensions > 0) return null;

  const siblingsWithMetadataExtensions = input.siblings
    .filter((sibling) => sibling.metadataExtensions > 0)
    .sort((left, right) => {
      if (right.metadataExtensions !== left.metadataExtensions) {
        return right.metadataExtensions - left.metadataExtensions;
      }
      return left.name.localeCompare(right.name);
    });

  if (siblingsWithMetadataExtensions.length === 0) return null;

  const siblingSummary = siblingsWithMetadataExtensions
    .map((sibling) => `${sibling.name} (${sibling.metadataExtensions})`)
    .join(', ');
  const packageHint = input.targetPackageName ? ` in package ${input.targetPackageName}` : '';
  const message =
    `Possible sibling metadata-extension inconsistency${packageHint}: ` +
    `${input.targetName} has 0 DDLX consumers while sibling DDLS for stem "${input.stem}" have DDLX consumers ` +
    `(${siblingSummary}).`;

  return {
    code: 'SIBLING_METADATA_EXTENSION_MISMATCH',
    targetName: input.targetName,
    targetPackageName: input.targetPackageName,
    stem: input.stem,
    siblingsWithMetadataExtensions,
    message,
  };
}

function normalizeName(value: string): string {
  return String(value).trim().toUpperCase();
}

function isNumericVariantSuffix(value: string): boolean {
  return value.length === 0 || /^\d+$/.test(value);
}
