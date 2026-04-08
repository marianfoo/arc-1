import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PROFILE_SCOPES, PROFILES, parseApiKeys, parseArgs } from '../../../src/server/config.js';

describe('parseArgs', () => {
  // Save and restore env to avoid test pollution
  const savedEnv = { ...process.env };

  beforeEach(() => {
    // Clear SAP_* and ARC1_* env vars for clean test state
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('SAP_') || key.startsWith('TEST_SAP_') || key.startsWith('ARC1_')) {
        delete process.env[key];
      }
    }
  });

  afterEach(() => {
    process.env = { ...savedEnv };
  });

  it('returns defaults when no args or env vars', () => {
    const config = parseArgs([]);
    expect(config.url).toBe('');
    expect(config.client).toBe('100');
    expect(config.language).toBe('EN');
    expect(config.transport).toBe('stdio');
    expect(config.readOnly).toBe(false);
    expect(config.verbose).toBe(false);
  });

  it('parses CLI flags (--flag value)', () => {
    const config = parseArgs(['--url', 'http://sap:8000', '--user', 'admin', '--password', 'secret']);
    expect(config.url).toBe('http://sap:8000');
    expect(config.username).toBe('admin');
    expect(config.password).toBe('secret');
  });

  it('parses CLI flags (--flag=value)', () => {
    const config = parseArgs(['--url=http://sap:8000', '--client=100']);
    expect(config.url).toBe('http://sap:8000');
    expect(config.client).toBe('100');
  });

  it('reads from environment variables', () => {
    process.env.SAP_URL = 'http://env:8000';
    process.env.SAP_USER = 'envuser';
    process.env.SAP_CLIENT = '200';
    const config = parseArgs([]);
    expect(config.url).toBe('http://env:8000');
    expect(config.username).toBe('envuser');
    expect(config.client).toBe('200');
  });

  it('CLI flags take precedence over env vars', () => {
    process.env.SAP_URL = 'http://env:8000';
    const config = parseArgs(['--url', 'http://cli:9000']);
    expect(config.url).toBe('http://cli:9000');
  });

  it('parses boolean flags', () => {
    const config = parseArgs(['--read-only', 'true', '--verbose', 'true']);
    expect(config.readOnly).toBe(true);
    expect(config.verbose).toBe(true);
  });

  it('parses boolean env vars', () => {
    process.env.SAP_READ_ONLY = 'true';
    process.env.SAP_BLOCK_FREE_SQL = '1';
    const config = parseArgs([]);
    expect(config.readOnly).toBe(true);
    expect(config.blockFreeSQL).toBe(true);
  });

  it('parses transport type', () => {
    const config = parseArgs(['--transport', 'http-streamable']);
    expect(config.transport).toBe('http-streamable');
  });

  it('defaults unknown transport to stdio', () => {
    const config = parseArgs(['--transport', 'invalid']);
    expect(config.transport).toBe('stdio');
  });

  it('parses feature toggles', () => {
    const config = parseArgs(['--feature-abapgit', 'on', '--feature-rap', 'off']);
    expect(config.featureAbapGit).toBe('on');
    expect(config.featureRap).toBe('off');
  });

  it('defaults unknown feature toggle to auto', () => {
    const config = parseArgs(['--feature-abapgit', 'invalid']);
    expect(config.featureAbapGit).toBe('auto');
  });

  it('parses allowed packages as comma-separated list', () => {
    process.env.SAP_ALLOWED_PACKAGES = 'Z*,$TMP,YFOO';
    const config = parseArgs([]);
    expect(config.allowedPackages).toEqual(['Z*', '$TMP', 'YFOO']);
  });

  it('returns empty array for no allowed packages', () => {
    const config = parseArgs([]);
    expect(config.allowedPackages).toEqual([]);
  });

  it('parses cookie auth options', () => {
    const config = parseArgs(['--cookie-file', '/path/cookies.txt', '--cookie-string', 'a=b; c=d']);
    expect(config.cookieFile).toBe('/path/cookies.txt');
    expect(config.cookieString).toBe('a=b; c=d');
  });

  it('defaults xsuaaAuth to false', () => {
    const config = parseArgs([]);
    expect(config.xsuaaAuth).toBe(false);
  });

  it('parses --xsuaa-auth flag', () => {
    const config = parseArgs(['--xsuaa-auth', 'true']);
    expect(config.xsuaaAuth).toBe(true);
  });

  it('parses SAP_XSUAA_AUTH env var', () => {
    process.env.SAP_XSUAA_AUTH = 'true';
    const config = parseArgs([]);
    expect(config.xsuaaAuth).toBe(true);
  });

  // --- BTP ABAP Environment (service key) ---

  it('defaults BTP service key fields', () => {
    const config = parseArgs([]);
    expect(config.btpServiceKey).toBeUndefined();
    expect(config.btpServiceKeyFile).toBeUndefined();
    expect(config.btpOAuthCallbackPort).toBe(0);
  });

  it('parses --btp-service-key flag', () => {
    const config = parseArgs(['--btp-service-key', '{"uaa":{}}']);
    expect(config.btpServiceKey).toBe('{"uaa":{}}');
  });

  it('parses SAP_BTP_SERVICE_KEY env var', () => {
    process.env.SAP_BTP_SERVICE_KEY = '{"uaa":{"url":"x"}}';
    const config = parseArgs([]);
    expect(config.btpServiceKey).toBe('{"uaa":{"url":"x"}}');
  });

  it('parses --btp-service-key-file flag', () => {
    const config = parseArgs(['--btp-service-key-file', '/path/to/key.json']);
    expect(config.btpServiceKeyFile).toBe('/path/to/key.json');
  });

  it('parses SAP_BTP_SERVICE_KEY_FILE env var', () => {
    process.env.SAP_BTP_SERVICE_KEY_FILE = '/path/to/key.json';
    const config = parseArgs([]);
    expect(config.btpServiceKeyFile).toBe('/path/to/key.json');
  });

  it('parses --btp-oauth-callback-port flag', () => {
    const config = parseArgs(['--btp-oauth-callback-port', '3001']);
    expect(config.btpOAuthCallbackPort).toBe(3001);
  });

  it('parses SAP_BTP_OAUTH_CALLBACK_PORT env var', () => {
    process.env.SAP_BTP_OAUTH_CALLBACK_PORT = '4001';
    const config = parseArgs([]);
    expect(config.btpOAuthCallbackPort).toBe(4001);
  });

  // --- System Type Detection ---

  it('defaults systemType to auto', () => {
    const config = parseArgs([]);
    expect(config.systemType).toBe('auto');
  });

  it('parses --system-type btp flag', () => {
    const config = parseArgs(['--system-type', 'btp']);
    expect(config.systemType).toBe('btp');
  });

  it('parses --system-type onprem flag', () => {
    const config = parseArgs(['--system-type', 'onprem']);
    expect(config.systemType).toBe('onprem');
  });

  it('parses SAP_SYSTEM_TYPE env var', () => {
    process.env.SAP_SYSTEM_TYPE = 'btp';
    const config = parseArgs([]);
    expect(config.systemType).toBe('btp');
  });

  it('defaults unknown system type to auto', () => {
    const config = parseArgs(['--system-type', 'invalid']);
    expect(config.systemType).toBe('auto');
  });

  it('CLI --system-type takes precedence over SAP_SYSTEM_TYPE env', () => {
    process.env.SAP_SYSTEM_TYPE = 'onprem';
    const config = parseArgs(['--system-type', 'btp']);
    expect(config.systemType).toBe('btp');
  });

  // --- blockData ---

  it('parses --block-data flag', () => {
    const config = parseArgs(['--block-data', 'true']);
    expect(config.blockData).toBe(true);
  });

  it('parses SAP_BLOCK_DATA env var', () => {
    process.env.SAP_BLOCK_DATA = '1';
    const config = parseArgs([]);
    expect(config.blockData).toBe(true);
  });

  it('defaults blockData to false without profile', () => {
    const config = parseArgs([]);
    expect(config.blockData).toBe(false);
  });

  // --- Profile ---

  it('--profile viewer sets readOnly, blockData, blockFreeSQL', () => {
    const config = parseArgs(['--profile', 'viewer']);
    expect(config.readOnly).toBe(true);
    expect(config.blockData).toBe(true);
    expect(config.blockFreeSQL).toBe(true);
    expect(config.enableTransports).toBe(false);
    expect(config.allowTransportableEdits).toBe(false);
  });

  it('--profile developer sets write-enabled defaults', () => {
    const config = parseArgs(['--profile', 'developer']);
    expect(config.readOnly).toBe(false);
    expect(config.blockData).toBe(true);
    expect(config.blockFreeSQL).toBe(true);
    expect(config.enableTransports).toBe(true);
    expect(config.allowTransportableEdits).toBe(true);
  });

  it('--profile developer-data allows data but blocks SQL', () => {
    const config = parseArgs(['--profile', 'developer-data']);
    expect(config.readOnly).toBe(false);
    expect(config.blockData).toBe(false);
    expect(config.blockFreeSQL).toBe(true);
    expect(config.enableTransports).toBe(true);
  });

  it('--profile viewer-sql allows both data and SQL but stays read-only', () => {
    const config = parseArgs(['--profile', 'viewer-sql']);
    expect(config.readOnly).toBe(true);
    expect(config.blockData).toBe(false);
    expect(config.blockFreeSQL).toBe(false);
  });

  it('--profile developer-sql allows everything', () => {
    const config = parseArgs(['--profile', 'developer-sql']);
    expect(config.readOnly).toBe(false);
    expect(config.blockData).toBe(false);
    expect(config.blockFreeSQL).toBe(false);
    expect(config.enableTransports).toBe(true);
    expect(config.allowTransportableEdits).toBe(true);
  });

  it('explicit flag overrides profile default', () => {
    const config = parseArgs(['--profile', 'viewer', '--read-only', 'false']);
    expect(config.readOnly).toBe(false);
    // Other profile defaults remain
    expect(config.blockData).toBe(true);
    expect(config.blockFreeSQL).toBe(true);
  });

  it('ARC1_PROFILE env var selects profile', () => {
    process.env.ARC1_PROFILE = 'developer';
    const config = parseArgs([]);
    expect(config.readOnly).toBe(false);
    expect(config.enableTransports).toBe(true);
    expect(config.allowTransportableEdits).toBe(true);
  });

  it('unknown profile name throws error', () => {
    expect(() => parseArgs(['--profile', 'nonexistent'])).toThrow(/Unknown profile 'nonexistent'/);
  });

  it('PROFILES constant contains all expected profiles', () => {
    expect(Object.keys(PROFILES).sort()).toEqual([
      'developer',
      'developer-data',
      'developer-sql',
      'viewer',
      'viewer-data',
      'viewer-sql',
    ]);
  });

  it('PROFILE_SCOPES has an entry for every profile', () => {
    for (const name of Object.keys(PROFILES)) {
      expect(PROFILE_SCOPES[name]).toBeDefined();
      expect(PROFILE_SCOPES[name].length).toBeGreaterThan(0);
    }
  });

  // --- Multi-key API keys ---

  it('parses ARC1_API_KEYS env var', () => {
    process.env.ARC1_API_KEYS = 'key1:viewer,key2:developer';
    const config = parseArgs([]);
    expect(config.apiKeys).toEqual([
      { key: 'key1', profile: 'viewer' },
      { key: 'key2', profile: 'developer' },
    ]);
  });

  it('parses --api-keys flag', () => {
    const config = parseArgs(['--api-keys', 'abc:viewer-data,def:developer-sql']);
    expect(config.apiKeys).toEqual([
      { key: 'abc', profile: 'viewer-data' },
      { key: 'def', profile: 'developer-sql' },
    ]);
  });

  it('--api-keys flag takes precedence over ARC1_API_KEYS env', () => {
    process.env.ARC1_API_KEYS = 'env-key:viewer';
    const config = parseArgs(['--api-keys', 'cli-key:developer']);
    expect(config.apiKeys).toEqual([{ key: 'cli-key', profile: 'developer' }]);
  });

  it('apiKeys is undefined when not configured', () => {
    const config = parseArgs([]);
    expect(config.apiKeys).toBeUndefined();
  });

  it('both apiKey and apiKeys can coexist', () => {
    process.env.ARC1_API_KEY = 'legacy-key';
    process.env.ARC1_API_KEYS = 'new-key:viewer';
    const config = parseArgs([]);
    expect(config.apiKey).toBe('legacy-key');
    expect(config.apiKeys).toEqual([{ key: 'new-key', profile: 'viewer' }]);
  });
});

// ─── parseApiKeys ───────────────────────────────────────────────────

describe('parseApiKeys', () => {
  it('parses single key:profile pair', () => {
    expect(parseApiKeys('mykey:viewer')).toEqual([{ key: 'mykey', profile: 'viewer' }]);
  });

  it('parses multiple key:profile pairs', () => {
    expect(parseApiKeys('k1:viewer,k2:developer,k3:viewer-sql')).toEqual([
      { key: 'k1', profile: 'viewer' },
      { key: 'k2', profile: 'developer' },
      { key: 'k3', profile: 'viewer-sql' },
    ]);
  });

  it('trims whitespace', () => {
    expect(parseApiKeys(' k1:viewer , k2:developer ')).toEqual([
      { key: 'k1', profile: 'viewer' },
      { key: 'k2', profile: 'developer' },
    ]);
  });

  it('handles key with colons (e.g. base64)', () => {
    // Last colon splits key from profile — keys may contain colons
    expect(parseApiKeys('abc:def:ghi:viewer')).toEqual([{ key: 'abc:def:ghi', profile: 'viewer' }]);
  });

  it('throws on missing colon separator', () => {
    expect(() => parseApiKeys('keyonly')).toThrow(/expected 'key:profile' format/);
  });

  it('throws on empty key', () => {
    expect(() => parseApiKeys(':viewer')).toThrow(/key cannot be empty/);
  });

  it('throws on invalid profile name', () => {
    expect(() => parseApiKeys('mykey:nonexistent')).toThrow(/Invalid profile 'nonexistent'/);
  });

  it('throws on empty string', () => {
    expect(() => parseApiKeys('')).toThrow(/no valid entries/);
  });

  it('skips empty segments from trailing comma', () => {
    expect(parseApiKeys('k1:viewer,')).toEqual([{ key: 'k1', profile: 'viewer' }]);
  });

  it('accepts all valid profile names', () => {
    const profiles = ['viewer', 'viewer-data', 'viewer-sql', 'developer', 'developer-data', 'developer-sql'];
    for (const p of profiles) {
      expect(parseApiKeys(`testkey:${p}`)).toEqual([{ key: 'testkey', profile: p }]);
    }
  });
});
