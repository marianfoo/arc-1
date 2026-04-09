import { Version } from '@abaplint/core';
import { describe, expect, it, vi } from 'vitest';
import type { FeatureConfig } from '../../../src/adt/config.js';
import {
  classifyAuthProbeError,
  detectSystemType,
  mapSapReleaseToAbaplintVersion,
  probeAuthorization,
  probeTextSearch,
  resolveWithoutProbing,
} from '../../../src/adt/features.js';
import type { AdtHttpClient } from '../../../src/adt/http.js';

describe('Feature Detection', () => {
  describe('resolveWithoutProbing', () => {
    it('forces all features on', () => {
      const config: FeatureConfig = {
        hana: 'on',
        abapGit: 'on',
        rap: 'on',
        amdp: 'on',
        ui5: 'on',
        transport: 'on',
        ui5repo: 'on',
      };
      const result = resolveWithoutProbing(config);

      expect(result.hana.available).toBe(true);
      expect(result.hana.mode).toBe('on');
      expect(result.abapGit.available).toBe(true);
      expect(result.rap.available).toBe(true);
    });

    it('forces all features off', () => {
      const config: FeatureConfig = {
        hana: 'off',
        abapGit: 'off',
        rap: 'off',
        amdp: 'off',
        ui5: 'off',
        transport: 'off',
        ui5repo: 'off',
      };
      const result = resolveWithoutProbing(config);

      expect(result.hana.available).toBe(false);
      expect(result.hana.mode).toBe('off');
      expect(result.abapGit.available).toBe(false);
    });

    it('auto defaults to unavailable without probing', () => {
      const config: FeatureConfig = {
        hana: 'auto',
        abapGit: 'auto',
        rap: 'auto',
        amdp: 'auto',
        ui5: 'auto',
        transport: 'auto',
        ui5repo: 'auto',
      };
      const result = resolveWithoutProbing(config);

      expect(result.hana.available).toBe(false);
      expect(result.hana.mode).toBe('auto');
    });

    it('handles mixed modes', () => {
      const config: FeatureConfig = {
        hana: 'on',
        abapGit: 'off',
        rap: 'auto',
        amdp: 'on',
        ui5: 'off',
        transport: 'auto',
        ui5repo: 'auto',
      };
      const result = resolveWithoutProbing(config);

      expect(result.hana.available).toBe(true);
      expect(result.abapGit.available).toBe(false);
      expect(result.rap.available).toBe(false);
      expect(result.amdp.available).toBe(true);
      expect(result.ui5.available).toBe(false);
      expect(result.transport.available).toBe(false);
    });

    it('includes descriptive messages', () => {
      const config: FeatureConfig = {
        hana: 'on',
        abapGit: 'off',
        rap: 'auto',
        amdp: 'auto',
        ui5: 'auto',
        transport: 'auto',
        ui5repo: 'auto',
      };
      const result = resolveWithoutProbing(config);

      expect(result.hana.message).toContain('Forced on');
      expect(result.abapGit.message).toContain('Disabled');
      expect(result.rap.message).toContain('not available');
    });

    it('resolves ui5repo feature when forced on', () => {
      const config: FeatureConfig = {
        hana: 'auto',
        abapGit: 'auto',
        rap: 'auto',
        amdp: 'auto',
        ui5: 'auto',
        transport: 'auto',
        ui5repo: 'on',
      };
      const result = resolveWithoutProbing(config);
      expect(result.ui5repo.available).toBe(true);
      expect(result.ui5repo.mode).toBe('on');
    });

    it('resolves ui5repo feature as unavailable in auto mode without probing', () => {
      const config: FeatureConfig = {
        hana: 'auto',
        abapGit: 'auto',
        rap: 'auto',
        amdp: 'auto',
        ui5: 'auto',
        transport: 'auto',
        ui5repo: 'auto',
      };
      const result = resolveWithoutProbing(config);
      expect(result.ui5repo.available).toBe(false);
      expect(result.ui5repo.mode).toBe('auto');
      expect(result.ui5repo.message).toContain('not available');
    });
  });

  describe('mapSapReleaseToAbaplintVersion', () => {
    it('maps SAP_BASIS releases to correct abaplint versions', () => {
      expect(mapSapReleaseToAbaplintVersion('700')).toBe(Version.v700);
      expect(mapSapReleaseToAbaplintVersion('702')).toBe(Version.v702);
      expect(mapSapReleaseToAbaplintVersion('740')).toBe(Version.v740sp02);
      expect(mapSapReleaseToAbaplintVersion('750')).toBe(Version.v750);
      expect(mapSapReleaseToAbaplintVersion('751')).toBe(Version.v751);
      expect(mapSapReleaseToAbaplintVersion('752')).toBe(Version.v752);
      expect(mapSapReleaseToAbaplintVersion('753')).toBe(Version.v753);
      expect(mapSapReleaseToAbaplintVersion('754')).toBe(Version.v754);
      expect(mapSapReleaseToAbaplintVersion('755')).toBe(Version.v755);
      expect(mapSapReleaseToAbaplintVersion('756')).toBe(Version.v756);
      expect(mapSapReleaseToAbaplintVersion('757')).toBe(Version.v757);
      expect(mapSapReleaseToAbaplintVersion('758')).toBe(Version.v758);
    });

    it('maps releases >= 758 to v758', () => {
      expect(mapSapReleaseToAbaplintVersion('759')).toBe(Version.v758);
      expect(mapSapReleaseToAbaplintVersion('800')).toBe(Version.v758);
    });

    it('returns Cloud for non-numeric or empty input', () => {
      expect(mapSapReleaseToAbaplintVersion('')).toBe(Version.Cloud);
      expect(mapSapReleaseToAbaplintVersion('sap_btp')).toBe(Version.Cloud);
      expect(mapSapReleaseToAbaplintVersion('unknown')).toBe(Version.Cloud);
    });

    it('handles versions between known mappings', () => {
      // 710 is between 702 and 740, should map to 702
      expect(mapSapReleaseToAbaplintVersion('710')).toBe(Version.v702);
      // 745 is between 740 and 750, should map to v740sp02
      expect(mapSapReleaseToAbaplintVersion('745')).toBe(Version.v740sp02);
    });
  });

  // ─── System Type Detection ──────────────────────────────────────────

  describe('detectSystemType', () => {
    it('detects BTP when SAP_CLOUD component is present', () => {
      const components = [
        { name: 'SAP_BASIS', release: '758', description: 'SAP Basis' },
        { name: 'SAP_CLOUD', release: '100', description: 'SAP Cloud' },
        { name: 'DW4CORE', release: '100', description: 'DW4 Core' },
      ];
      expect(detectSystemType(components)).toBe('btp');
    });

    it('detects on-premise when SAP_ABA is present and no SAP_CLOUD', () => {
      const components = [
        { name: 'SAP_BASIS', release: '757', description: 'SAP Basis' },
        { name: 'SAP_ABA', release: '757', description: 'SAP Application Basis' },
        { name: 'SAP_UI', release: '757', description: 'SAP UI' },
      ];
      expect(detectSystemType(components)).toBe('onprem');
    });

    it('detects on-premise when components list is empty', () => {
      expect(detectSystemType([])).toBe('onprem');
    });

    it('detects on-premise for typical S/4HANA components', () => {
      const components = [
        { name: 'SAP_BASIS', release: '758', description: 'SAP Basis' },
        { name: 'SAP_ABA', release: '758', description: 'SAP Application Basis' },
        { name: 'S4CORE', release: '108', description: 'S/4HANA Core' },
      ];
      expect(detectSystemType(components)).toBe('onprem');
    });

    it('is case-insensitive for component names', () => {
      const components = [
        { name: 'sap_basis', release: '758', description: 'SAP Basis' },
        { name: 'sap_cloud', release: '100', description: 'SAP Cloud' },
      ];
      expect(detectSystemType(components)).toBe('btp');
    });
  });

  // ─── probeTextSearch ───────────────────────────────────────────────

  describe('probeTextSearch', () => {
    function mockClient(statusCode: number): AdtHttpClient {
      return { get: vi.fn().mockResolvedValue({ statusCode, body: '' }) } as unknown as AdtHttpClient;
    }

    function mockClientThrows(statusCode: number): AdtHttpClient {
      return { get: vi.fn().mockRejectedValue({ statusCode }) } as unknown as AdtHttpClient;
    }

    function mockClientNetworkError(): AdtHttpClient {
      return { get: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')) } as unknown as AdtHttpClient;
    }

    it('returns available=true for 200 response', async () => {
      const result = await probeTextSearch(mockClient(200));
      expect(result.available).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('returns auth error for thrown 401', async () => {
      const result = await probeTextSearch(mockClientThrows(401));
      expect(result.available).toBe(false);
      expect(result.reason).toContain('authorization');
      expect(result.reason).toContain('S_ADT_RES');
    });

    it('returns auth error for thrown 403', async () => {
      const result = await probeTextSearch(mockClientThrows(403));
      expect(result.available).toBe(false);
      expect(result.reason).toContain('authorization');
    });

    it('returns SICF activation hint for thrown 404', async () => {
      const result = await probeTextSearch(mockClientThrows(404));
      expect(result.available).toBe(false);
      expect(result.reason).toContain('SICF');
      expect(result.reason).toContain('textSearch');
    });

    it('returns framework error for thrown 500', async () => {
      const result = await probeTextSearch(mockClientThrows(500));
      expect(result.available).toBe(false);
      expect(result.reason).toContain('BC-DWB-AIE');
    });

    it('returns not-implemented for thrown 501', async () => {
      const result = await probeTextSearch(mockClientThrows(501));
      expect(result.available).toBe(false);
      expect(result.reason).toContain('SAP_BASIS');
      expect(result.reason).toContain('7.51');
    });

    it('returns generic message for unexpected thrown status codes', async () => {
      const result = await probeTextSearch(mockClientThrows(502));
      expect(result.available).toBe(false);
      expect(result.reason).toContain('HTTP 502');
    });

    it('returns network error for generic errors', async () => {
      const result = await probeTextSearch(mockClientNetworkError());
      expect(result.available).toBe(false);
      expect(result.reason).toContain('Network error');
    });
  });

  // ─── probeAuthorization ─────────────────────────────────────────────

  describe('probeAuthorization', () => {
    function mockClientByUrl(urlMap: Record<string, number | 'throw' | 'network-error'>): AdtHttpClient {
      const getFn = vi.fn().mockImplementation((url: string) => {
        for (const [pattern, result] of Object.entries(urlMap)) {
          if (url.includes(pattern)) {
            if (result === 'network-error') {
              return Promise.reject(new Error('ECONNREFUSED'));
            }
            if (result === 'throw') {
              return Promise.reject({ statusCode: 403 });
            }
            if (typeof result === 'number' && result >= 400) {
              return Promise.reject({ statusCode: result });
            }
            return Promise.resolve({ statusCode: result, body: '' });
          }
        }
        return Promise.resolve({ statusCode: 200, body: '' });
      });
      return { get: getFn } as unknown as AdtHttpClient;
    }

    it('returns both available when search and transport succeed', async () => {
      const client = mockClientByUrl({
        quickSearch: 200,
        transportrequests: 200,
      });
      const result = await probeAuthorization(client);
      expect(result.searchAccess).toBe(true);
      expect(result.searchReason).toBeUndefined();
      expect(result.transportAccess).toBe(true);
      expect(result.transportReason).toBeUndefined();
    });

    it('reports search access denied on 403', async () => {
      const client = mockClientByUrl({
        quickSearch: 403,
        transportrequests: 200,
      });
      const result = await probeAuthorization(client);
      expect(result.searchAccess).toBe(false);
      expect(result.searchReason).toContain('S_ADT_RES');
      expect(result.transportAccess).toBe(true);
    });

    it('reports transport access denied on 403', async () => {
      const client = mockClientByUrl({
        quickSearch: 200,
        transportrequests: 403,
      });
      const result = await probeAuthorization(client);
      expect(result.searchAccess).toBe(true);
      expect(result.transportAccess).toBe(false);
      expect(result.transportReason).toContain('S_TRANSPRT');
    });

    it('reports both denied when both return 401', async () => {
      const client = mockClientByUrl({
        quickSearch: 401,
        transportrequests: 401,
      });
      const result = await probeAuthorization(client);
      expect(result.searchAccess).toBe(false);
      expect(result.searchReason).toContain('authorization');
      expect(result.transportAccess).toBe(false);
      expect(result.transportReason).toContain('authorization');
    });

    it('handles 404 (ICF service not activated)', async () => {
      const client = mockClientByUrl({
        quickSearch: 404,
        transportrequests: 404,
      });
      const result = await probeAuthorization(client);
      expect(result.searchAccess).toBe(false);
      expect(result.searchReason).toContain('SICF');
      expect(result.transportAccess).toBe(false);
      expect(result.transportReason).toContain('SICF');
    });

    it('handles network errors gracefully', async () => {
      const client = mockClientByUrl({
        quickSearch: 'network-error',
        transportrequests: 'network-error',
      });
      const result = await probeAuthorization(client);
      expect(result.searchAccess).toBe(false);
      expect(result.searchReason).toContain('Network error');
      expect(result.transportAccess).toBe(false);
      expect(result.transportReason).toContain('Network error');
    });
  });

  // ─── classifyAuthProbeError ─────────────────────────────────────────

  describe('classifyAuthProbeError', () => {
    it('classifies 403 for search probe', () => {
      const result = classifyAuthProbeError(403, 'search');
      expect(result.available).toBe(false);
      expect(result.reason).toContain('S_ADT_RES');
    });

    it('classifies 401 for search probe', () => {
      const result = classifyAuthProbeError(401, 'search');
      expect(result.available).toBe(false);
      expect(result.reason).toContain('S_ADT_RES');
    });

    it('classifies 403 for transport probe', () => {
      const result = classifyAuthProbeError(403, 'transport');
      expect(result.available).toBe(false);
      expect(result.reason).toContain('S_TRANSPRT');
    });

    it('classifies 404 as SICF not activated', () => {
      const result = classifyAuthProbeError(404, 'search');
      expect(result.available).toBe(false);
      expect(result.reason).toContain('SICF');
    });

    it('classifies unexpected status codes', () => {
      const result = classifyAuthProbeError(500, 'transport');
      expect(result.available).toBe(false);
      expect(result.reason).toContain('HTTP 500');
    });
  });
});
