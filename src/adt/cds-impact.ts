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
