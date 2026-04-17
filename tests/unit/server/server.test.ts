import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { logger } from '../../../src/server/logger.js';
import { buildAdtConfig, createServer, logAuthSummary, VERSION } from '../../../src/server/server.js';
import { DEFAULT_CONFIG } from '../../../src/server/types.js';

describe('MCP Server', () => {
  it('creates a server instance with correct name and version', () => {
    const server = createServer(DEFAULT_CONFIG);
    expect(server).toBeDefined();
  });

  it('has a valid version string', () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });
});

describe('buildAdtConfig', () => {
  function writeCookieFixture(content: string): { file: string; cleanup: () => void } {
    const dir = mkdtempSync(join(tmpdir(), 'arc1-server-cookies-test-'));
    const file = join(dir, 'cookies.txt');
    writeFileSync(file, content, 'utf-8');
    return {
      file,
      cleanup: () => rmSync(dir, { recursive: true, force: true }),
    };
  }

  it('includes username/password in shared config', () => {
    const cfg = buildAdtConfig({
      ...DEFAULT_CONFIG,
      url: 'http://sap.example.com:8000',
      username: 'DEVELOPER',
      password: 'secret',
    });

    expect(cfg.username).toBe('DEVELOPER');
    expect(cfg.password).toBe('secret');
  });

  it('omits shared credentials in per-user config', () => {
    const fixture = writeCookieFixture('.example.com\tTRUE\t/\tFALSE\t0\tSAP_SESSIONID\txyz789\n');
    const cfg = buildAdtConfig(
      {
        ...DEFAULT_CONFIG,
        url: 'http://sap.example.com:8000',
        username: 'DEVELOPER',
        password: 'secret',
        cookieFile: fixture.file,
      },
      undefined,
      undefined,
      { perUser: true },
    );
    try {
      expect(cfg.username).toBeUndefined();
      expect(cfg.password).toBeUndefined();
      expect(cfg.cookies).toBeUndefined();
    } finally {
      fixture.cleanup();
    }
  });

  it('preserves bearerTokenProvider for shared config', () => {
    const bearerTokenProvider = async () => 'token';
    const cfg = buildAdtConfig(
      {
        ...DEFAULT_CONFIG,
        url: 'http://sap.example.com:8000',
      },
      undefined,
      bearerTokenProvider,
    );

    expect(cfg.bearerTokenProvider).toBe(bearerTokenProvider);
  });

  it('preserves bearerTokenProvider for per-user config', () => {
    const bearerTokenProvider = async () => 'token';
    const cfg = buildAdtConfig(
      {
        ...DEFAULT_CONFIG,
        url: 'http://sap.example.com:8000',
        username: 'DEVELOPER',
        password: 'secret',
      },
      undefined,
      bearerTokenProvider,
      { perUser: true },
    );

    expect(cfg.bearerTokenProvider).toBe(bearerTokenProvider);
  });

  it('includes cookies in shared config when cookie file is provided', () => {
    const fixture = writeCookieFixture('.example.com\tTRUE\t/\tFALSE\t0\tSAP_SESSIONID\txyz789\n');
    const cfg = buildAdtConfig({
      ...DEFAULT_CONFIG,
      url: 'http://sap.example.com:8000',
      cookieFile: fixture.file,
    });

    try {
      expect(cfg.cookies).toEqual({ SAP_SESSIONID: 'xyz789' });
    } finally {
      fixture.cleanup();
    }
  });

  it('propagates disableSaml2 into ADT config', () => {
    const cfg = buildAdtConfig({
      ...DEFAULT_CONFIG,
      url: 'http://sap.example.com:8000',
      disableSaml2: true,
    });

    expect(cfg.disableSaml).toBe(true);
  });
});

describe('logAuthSummary', () => {
  const savedDestination = process.env.SAP_BTP_DESTINATION;

  afterEach(() => {
    if (savedDestination === undefined) {
      delete process.env.SAP_BTP_DESTINATION;
    } else {
      process.env.SAP_BTP_DESTINATION = savedDestination;
    }
    vi.restoreAllMocks();
  });

  it('logs api-key MCP auth and basic shared SAP auth', () => {
    delete process.env.SAP_BTP_DESTINATION;
    const infoSpy = vi.spyOn(logger, 'info').mockImplementation(() => undefined);

    logAuthSummary({
      ...DEFAULT_CONFIG,
      apiKey: 'k',
      username: 'DEVELOPER',
      password: 'secret',
    });

    expect(infoSpy).toHaveBeenCalledWith('auth: MCP=[api-key] SAP=basic (shared)');
  });

  it('logs oidc MCP auth and per-user PP SAP auth', () => {
    delete process.env.SAP_BTP_DESTINATION;
    const infoSpy = vi.spyOn(logger, 'info').mockImplementation(() => undefined);

    logAuthSummary({
      ...DEFAULT_CONFIG,
      oidcIssuer: 'https://issuer.example.com',
      oidcAudience: 'arc-1',
      ppEnabled: true,
    });

    expect(infoSpy).toHaveBeenCalledWith('auth: MCP=[oidc] SAP=pp (per-user)');
  });

  it('logs combined api-key+oidc MCP auth and cookie+pp SAP auth', () => {
    delete process.env.SAP_BTP_DESTINATION;
    const infoSpy = vi.spyOn(logger, 'info').mockImplementation(() => undefined);

    logAuthSummary({
      ...DEFAULT_CONFIG,
      apiKey: 'k',
      oidcIssuer: 'https://issuer.example.com',
      oidcAudience: 'arc-1',
      cookieFile: 'cookies.txt',
      ppAllowSharedCookies: true,
      ppEnabled: true,
    });

    expect(infoSpy).toHaveBeenCalledWith('auth: MCP=[api-key,oidc] SAP=cookie+pp (per-user)');
  });
});
