/**
 * ADT client configuration types.
 *
 * Separates ADT-level config (SAP connection, auth, safety) from
 * server-level config (MCP transport, HTTP address). The ADT client
 * only needs to know about SAP — it doesn't care about MCP.
 */

import type { BTPProxyConfig } from './btp.js';
import type { SafetyConfig } from './safety.js';
import { unrestrictedSafetyConfig } from './safety.js';

/** Feature mode: auto detects from SAP system, on/off forces */
export type FeatureMode = 'auto' | 'on' | 'off';

/** Feature configuration for optional SAP capabilities */
export interface FeatureConfig {
  hana: FeatureMode;
  abapGit: FeatureMode;
  rap: FeatureMode;
  amdp: FeatureMode;
  ui5: FeatureMode;
  transport: FeatureMode;
}

/** Default feature config: all auto-detect */
export function defaultFeatureConfig(): FeatureConfig {
  return {
    hana: 'auto',
    abapGit: 'auto',
    rap: 'auto',
    amdp: 'auto',
    ui5: 'auto',
    transport: 'auto',
  };
}

/** ADT client configuration */
export interface AdtClientConfig {
  /** SAP system URL (e.g., "http://sap:8000") */
  baseUrl: string;
  /** SAP username */
  username: string;
  /** SAP password */
  password: string;
  /** SAP client number (default: "001") */
  client: string;
  /** SAP language (default: "EN") */
  language: string;
  /** Skip TLS verification */
  insecure: boolean;
  /** Cookie-based auth (alternative to basic auth) */
  cookies: Record<string, string>;
  /** Safety configuration */
  safety: SafetyConfig;
  /** Feature detection config */
  features: FeatureConfig;
  /** Enable verbose logging */
  verbose: boolean;
  /** BTP Connectivity proxy (Cloud Connector) */
  btpProxy?: BTPProxyConfig;
}

/** Create default ADT client config */
export function defaultAdtClientConfig(): AdtClientConfig {
  return {
    baseUrl: '',
    username: '',
    password: '',
    client: '001',
    language: 'EN',
    insecure: false,
    cookies: {},
    safety: unrestrictedSafetyConfig(),
    features: defaultFeatureConfig(),
    verbose: false,
  };
}
