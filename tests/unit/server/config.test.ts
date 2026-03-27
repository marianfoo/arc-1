import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseArgs } from '../../../ts-src/server/config.js';

describe('parseArgs', () => {
  // Save and restore env to avoid test pollution
  const savedEnv = { ...process.env };

  beforeEach(() => {
    // Clear SAP_* env vars for clean test state
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('SAP_') || key.startsWith('TEST_SAP_')) {
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
    expect(config.client).toBe('001');
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
});
