/**
 * Feature detection for ARC-1.
 *
 * Probes SAP system capabilities to determine which optional features
 * are available (abapGit, RAP, AMDP, UI5, Transport, HANA).
 *
 * Each feature can be:
 * - "auto": probe SAP system at startup, enable if available
 * - "on": force enabled (skip probe, fail if feature is used but unavailable)
 * - "off": force disabled (skip probe, hide related tools)
 *
 * The "safety network" concept: if a feature is "auto" and the probe
 * returns 404 (endpoint doesn't exist), the feature is gracefully
 * disabled. This prevents errors when connecting to older SAP systems.
 *
 * Probe endpoints are lightweight HEAD requests — they don't fetch data,
 * just check if the endpoint exists (returns 200 or 404).
 */

import { Version } from '@abaplint/core';
import type { FeatureConfig, FeatureMode } from './config.js';
import type { AdtHttpClient } from './http.js';
import type { FeatureStatus, ResolvedFeatures } from './types.js';
import { parseInstalledComponents } from './xml-parser.js';

/** Probe definition: which URL to check for each feature */
interface FeatureProbe {
  id: keyof ResolvedFeatures;
  endpoint: string;
  description: string;
}

const PROBES: FeatureProbe[] = [
  { id: 'hana', endpoint: '/sap/bc/adt/ddic/sysinfo/hanainfo', description: 'HANA database' },
  { id: 'abapGit', endpoint: '/sap/bc/adt/abapgit/repos', description: 'abapGit integration' },
  { id: 'rap', endpoint: '/sap/bc/adt/ddic/ddl/sources', description: 'RAP/CDS development' },
  { id: 'amdp', endpoint: '/sap/bc/adt/debugger/amdp', description: 'AMDP debugging' },
  { id: 'ui5', endpoint: '/sap/bc/adt/filestore/ui5-bsp', description: 'UI5/Fiori BSP' },
  { id: 'transport', endpoint: '/sap/bc/adt/cts/transportrequests', description: 'CTS transport management' },
];

/** Resolve a single feature based on its mode */
function resolveFeature(mode: FeatureMode, probeResult: boolean, id: string, description: string): FeatureStatus {
  if (mode === 'on') {
    return { id, available: true, mode: 'on', message: 'Forced on by configuration' };
  }
  if (mode === 'off') {
    return { id, available: false, mode: 'off', message: 'Disabled by configuration' };
  }
  // auto
  return {
    id,
    available: probeResult,
    mode: 'auto',
    message: probeResult ? `${description} is available` : `${description} is not available`,
    probedAt: new Date().toISOString(),
  };
}

/**
 * Probe all features and return resolved status.
 *
 * Runs all probes in parallel for speed.
 * Each probe is a HEAD request — if it returns 2xx, the feature exists.
 * 404 or network error means the feature is not available.
 */
export async function probeFeatures(client: AdtHttpClient, config: FeatureConfig): Promise<ResolvedFeatures> {
  const modeMap: Record<string, FeatureMode> = {
    hana: config.hana,
    abapGit: config.abapGit,
    rap: config.rap,
    amdp: config.amdp,
    ui5: config.ui5,
    transport: config.transport,
  };

  // Only probe features that are in "auto" mode
  const probesToRun = PROBES.filter((p) => modeMap[p.id] === 'auto');

  // Run feature probes + release detection in parallel
  const [probeResults, abapRelease] = await Promise.all([
    Promise.all(
      probesToRun.map(async (probe) => {
        try {
          const response = await client.get(probe.endpoint);
          return { id: probe.id, available: response.statusCode < 400 };
        } catch {
          return { id: probe.id, available: false };
        }
      }),
    ),
    detectAbapRelease(client),
  ]);

  // Build result map
  const resultMap = new Map<string, boolean>();
  for (const result of probeResults) {
    resultMap.set(result.id, result.available);
  }

  // Resolve all features
  const result: Record<string, FeatureStatus> = {};
  for (const probe of PROBES) {
    const mode = modeMap[probe.id] ?? 'auto';
    const probeResult = resultMap.get(probe.id) ?? false;
    result[probe.id] = resolveFeature(mode, probeResult, probe.id, probe.description);
  }

  const resolved = result as unknown as ResolvedFeatures;
  if (abapRelease) {
    resolved.abapRelease = abapRelease;
  }
  return resolved;
}

/**
 * Map SAP_BASIS release string to the closest @abaplint/core Version.
 *
 * abaplint versions are additive — each version accepts all syntax from
 * previous versions plus new features. We map to the closest matching
 * version, falling back to Cloud (the superset) for unknown releases.
 *
 * SAP_BASIS release examples: "700", "702", "740", "750", "757", "758"
 * BTP ABAP Environment reports release like "sap_btp" or similar.
 */
export function mapSapReleaseToAbaplintVersion(release: string): Version {
  const r = release.replace(/\D/g, ''); // strip non-digits ("750" → "750", "7.57" → "757")
  const num = Number.parseInt(r, 10);

  if (Number.isNaN(num)) return Version.Cloud;

  if (num >= 758) return Version.v758;
  if (num >= 757) return Version.v757;
  if (num >= 756) return Version.v756;
  if (num >= 755) return Version.v755;
  if (num >= 754) return Version.v754;
  if (num >= 753) return Version.v753;
  if (num >= 752) return Version.v752;
  if (num >= 751) return Version.v751;
  if (num >= 750) return Version.v750;
  // v740 has sub-versions in abaplint
  if (num >= 74008) return Version.v740sp08;
  if (num >= 74005) return Version.v740sp05;
  if (num >= 740) return Version.v740sp02;
  if (num >= 702) return Version.v702;
  return Version.v700;
}

/**
 * Detect the SAP_BASIS release from installed components.
 * Returns the release string (e.g. "757") or undefined on failure.
 */
async function detectAbapRelease(client: AdtHttpClient): Promise<string | undefined> {
  try {
    const resp = await client.get('/sap/bc/adt/system/components');
    if (resp.statusCode >= 400) return undefined;
    const components = parseInstalledComponents(resp.body);
    const basis = components.find((c) => c.name.toUpperCase() === 'SAP_BASIS');
    return basis?.release || undefined;
  } catch {
    return undefined;
  }
}

/** Get features without probing (for offline/test scenarios) */
export function resolveWithoutProbing(config: FeatureConfig): ResolvedFeatures {
  const result: Record<string, FeatureStatus> = {};
  const descriptions: Record<string, string> = {
    hana: 'HANA database',
    abapGit: 'abapGit integration',
    rap: 'RAP/CDS development',
    amdp: 'AMDP debugging',
    ui5: 'UI5/Fiori BSP',
    transport: 'CTS transport management',
  };

  for (const [id, mode] of Object.entries(config)) {
    result[id] = resolveFeature(
      mode as FeatureMode,
      mode === 'on', // Without probing, "auto" defaults to unavailable
      id,
      descriptions[id] ?? id,
    );
  }

  return result as unknown as ResolvedFeatures;
}
