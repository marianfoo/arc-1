/**
 * Integration test helpers for ARC-1.
 *
 * Integration tests run against a live SAP system.
 * They are SKIPPED automatically when TEST_SAP_URL is not set.
 *
 * Credentials (resolved in priority order):
 *   TEST_SAP_URL      > SAP_URL
 *   TEST_SAP_USER     > SAP_USER
 *   TEST_SAP_PASSWORD > SAP_PASSWORD
 *   TEST_SAP_CLIENT   > SAP_CLIENT   (default: 001)
 *   TEST_SAP_LANGUAGE > SAP_LANGUAGE  (default: EN)
 *   TEST_SAP_INSECURE > SAP_INSECURE (default: false)
 *
 * Using TEST_SAP_* lets a running MCP server and integration tests
 * point at different users/systems simultaneously.
 */

import { config } from 'dotenv';
import { AdtClient } from '../../ts-src/adt/client.js';
import { unrestrictedSafetyConfig } from '../../ts-src/adt/safety.js';

// Load .env before anything else
config();

/** Check if SAP credentials are configured */
export function hasSapCredentials(): boolean {
  return !!(process.env.TEST_SAP_URL || process.env.SAP_URL);
}

/** Skip reason message */
export const SKIP_REASON = 'No SAP credentials configured (set TEST_SAP_URL or SAP_URL in .env)';

/** Create an ADT client configured for integration tests */
export function getTestClient(): AdtClient {
  const url = process.env.TEST_SAP_URL || process.env.SAP_URL || '';
  const username = process.env.TEST_SAP_USER || process.env.SAP_USER || '';
  const password = process.env.TEST_SAP_PASSWORD || process.env.SAP_PASSWORD || '';
  const client = process.env.TEST_SAP_CLIENT || process.env.SAP_CLIENT || '001';
  const language = process.env.TEST_SAP_LANGUAGE || process.env.SAP_LANGUAGE || 'EN';
  const insecure = (process.env.TEST_SAP_INSECURE || process.env.SAP_INSECURE) === 'true';

  return new AdtClient({
    baseUrl: url,
    username,
    password,
    client,
    language,
    insecure,
    safety: unrestrictedSafetyConfig(),
  });
}
