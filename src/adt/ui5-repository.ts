/**
 * OData client for SAP ABAP Repository Service (UI5 app deployment).
 *
 * Queries deployed BSP/UI5 apps via `/sap/opu/odata/UI5/ABAP_REPOSITORY_SRV`.
 * This is the same OData V2 service used by SAP Business Application Studio
 * and @sap-ux/deploy-tooling for UI5 app deployment.
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

  const path = `${SERVICE_PATH}/Repositories('${encodeURIComponent(appName)}')?$format=json`;
  let resp: AdtResponse;
  try {
    resp = await http.get(path, {
      Accept: 'application/json',
    });
  } catch (err) {
    if (err instanceof AdtApiError && err.statusCode === 404) {
      return undefined;
    }
    throw err;
  }

  const data = JSON.parse(resp.body);
  const d = data.d;
  if (!d) throw new Error('Unexpected OData response: missing "d" property');
  return {
    name: d.Name ?? '',
    package: d.Package ?? '',
    description: d.Description ?? '',
    info: d.Info ?? '',
  };
}
