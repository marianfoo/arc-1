/**
 * OData client for SAP ABAP Repository Service (UI5 app deployment).
 *
 * Queries deployed BSP/UI5 apps via `/sap/opu/odata/UI5/ABAP_REPOSITORY_SRV`.
 * This is the same OData V2 service used by SAP Business Application Studio
 * and @sap-ux/deploy-tooling for UI5 app deployment.
 *
 * NOTE: CSRF token sharing with ADT endpoints needs manual verification
 * on a real SAP system. The implementation piggybacks a CSRF Fetch header
 * on GET requests so the token is available for future write operations (Phase 4).
 */

import { AdtApiError } from './errors.js';
import type { AdtHttpClient, AdtResponse } from './http.js';
import { checkOperation, OperationType, type SafetyConfig } from './safety.js';
import type { BspDeployInfo } from './types.js';

/** Base path for the ABAP Repository OData Service */
export const SERVICE_PATH = '/sap/opu/odata/UI5/ABAP_REPOSITORY_SRV';

/**
 * Get metadata for a deployed BSP/UI5 app.
 *
 * @returns App info, or undefined if the app does not exist (404).
 */
export async function getAppInfo(
  http: AdtHttpClient,
  safety: SafetyConfig,
  appName: string,
): Promise<BspDeployInfo | undefined> {
  checkOperation(safety, OperationType.Read, 'GetBSPDeployInfo');

  const path = `${SERVICE_PATH}/Repositories('${encodeURIComponent(appName)}')`;
  let resp: AdtResponse;
  try {
    resp = await http.get(path, {
      Accept: 'application/json',
      'X-Csrf-Token': 'Fetch',
    });
  } catch (err) {
    if (err instanceof AdtApiError && err.statusCode === 404) {
      return undefined;
    }
    throw err;
  }

  const data = JSON.parse(resp.body);
  const d = data.d;
  return {
    name: d.Name,
    package: d.Package,
    description: d.Description,
    info: d.Info ?? '',
  };
}

/**
 * Download a deployed BSP/UI5 app as a ZIP buffer.
 *
 * @returns ZIP buffer, or undefined if the app has no content or does not exist.
 */
export async function downloadApp(
  http: AdtHttpClient,
  safety: SafetyConfig,
  appName: string,
): Promise<Buffer | undefined> {
  checkOperation(safety, OperationType.Read, 'DownloadBSPApp');

  const path =
    `${SERVICE_PATH}/Repositories('${encodeURIComponent(appName)}')` +
    '?CodePage=UTF8&DownloadFiles=RUNTIME&$format=json';
  let resp: AdtResponse;
  try {
    resp = await http.get(path, {
      Accept: 'application/json',
      'X-Csrf-Token': 'Fetch',
    });
  } catch (err) {
    if (err instanceof AdtApiError && err.statusCode === 404) {
      return undefined;
    }
    throw err;
  }

  const data = JSON.parse(resp.body);
  const zipBase64: string = data.d?.ZipArchive ?? '';
  if (!zipBase64) {
    return undefined;
  }

  return Buffer.from(zipBase64, 'base64');
}

/**
 * Probe whether the ABAP Repository OData Service is available.
 *
 * @returns true if the service responds (2xx or 405), false on 404.
 */
export async function probeService(http: AdtHttpClient): Promise<boolean> {
  try {
    await http.get(SERVICE_PATH, { Accept: 'application/json' });
    return true;
  } catch (err) {
    if (err instanceof AdtApiError) {
      if (err.statusCode === 405) return true;
      if (err.statusCode === 404) return false;
    }
    return false;
  }
}
