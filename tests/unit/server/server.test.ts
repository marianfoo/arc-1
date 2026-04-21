import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdtApiError } from '../../../src/adt/errors.js';
import { AdtHttpClient } from '../../../src/adt/http.js';
import { getToolDefinitions } from '../../../src/handlers/tools.js';
import { logger } from '../../../src/server/logger.js';
import {
  buildAdtConfig,
  createServer,
  filterToolsByAuthScope,
  formatStartupAuthPreflightToolError,
  logAuthSummary,
  runStartupAuthPreflight,
  VERSION,
} from '../../../src/server/server.js';
import { DEFAULT_CONFIG } from '../../../src/server/types.js';

describe('MCP Server', () => {
  it('creates a server instance with correct name and version', () => {
    const server = createServer(DEFAULT_CONFIG);
    expect(server).toBeDefined();
  });

  it('has a valid version string', () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('filters SAPManage actions to read-only set for read-scoped users', () => {
    const tools = getToolDefinitions({
      ...DEFAULT_CONFIG,
      readOnly: false,
      blockFreeSQL: false,
      enableTransports: true,
    });
    const filtered = filterToolsByAuthScope(tools, ['read']);
    const sapManage = filtered.find((tool) => tool.name === 'SAPManage');
    expect(sapManage).toBeDefined();
    const schema = sapManage!.inputSchema as Record<string, any>;
    const actionEnum: string[] = schema.properties.action.enum;
    expect(actionEnum).toEqual(['features', 'probe', 'cache_stats']);
    expect(filtered.map((tool) => tool.name)).not.toContain('SAPWrite');
  });

  it('keeps SAPManage write actions for write-scoped users', () => {
    const tools = getToolDefinitions({
      ...DEFAULT_CONFIG,
      readOnly: false,
      blockFreeSQL: false,
      enableTransports: true,
    });
    const filtered = filterToolsByAuthScope(tools, ['read', 'write']);
    const sapManage = filtered.find((tool) => tool.name === 'SAPManage');
    expect(sapManage).toBeDefined();
    const schema = sapManage!.inputSchema as Record<string, any>;
    const actionEnum: string[] = schema.properties.action.enum;
    expect(actionEnum).toContain('create_package');
    expect(actionEnum).toContain('flp_delete_catalog');
    expect(filtered.map((tool) => tool.name)).toContain('SAPWrite');
  });

  it('prunes hyperfocused SAP actions for read-scoped users', () => {
    const tools = getToolDefinitions({
      ...DEFAULT_CONFIG,
      toolMode: 'hyperfocused',
      readOnly: false,
      blockFreeSQL: false,
      enableTransports: true,
    });
    const filtered = filterToolsByAuthScope(tools, ['read']);
    const sap = filtered.find((tool) => tool.name === 'SAP');
    expect(sap).toBeDefined();
    const schema = sap!.inputSchema as Record<string, any>;
    const actionEnum: string[] = schema.properties.action.enum;

    expect(actionEnum).toContain('read');
    expect(actionEnum).toContain('manage');
    expect(actionEnum).not.toContain('query');
    expect(actionEnum).not.toContain('write');
    expect(actionEnum).not.toContain('activate');
    expect(actionEnum).not.toContain('transport');
  });

  it('keeps only query for sql-scoped users in hyperfocused mode', () => {
    const tools = getToolDefinitions({
      ...DEFAULT_CONFIG,
      toolMode: 'hyperfocused',
      readOnly: false,
      blockFreeSQL: false,
      enableTransports: true,
    });
    const filtered = filterToolsByAuthScope(tools, ['sql']);
    const sap = filtered.find((tool) => tool.name === 'SAP');
    expect(sap).toBeDefined();
    const schema = sap!.inputSchema as Record<string, any>;
    const actionEnum: string[] = schema.properties.action.enum;
    expect(actionEnum).toEqual(['query']);
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

describe('startup auth preflight', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('skips in principal propagation mode', async () => {
    const result = await runStartupAuthPreflight({
      ...DEFAULT_CONFIG,
      ppEnabled: true,
      url: 'http://sap.example.com:8000',
    });

    expect(result.status).toBe('skipped');
    expect(result.blocking).toBe(false);
    expect(result.reason.toLowerCase()).toContain('principal propagation');
  });

  it('skips when SAP URL is not configured', async () => {
    const result = await runStartupAuthPreflight({
      ...DEFAULT_CONFIG,
      ppEnabled: false,
      url: '',
    });

    expect(result.status).toBe('skipped');
    expect(result.blocking).toBe(false);
    expect(result.reason).toContain('SAP_URL');
  });

  it('formats a blocking preflight failure for tool calls', () => {
    const text = formatStartupAuthPreflightToolError({
      status: 'failed',
      blocking: true,
      endpoint: '/sap/bc/adt/core/discovery',
      checkedAt: '2026-04-21T00:00:00.000Z',
      statusCode: 401,
      reason: 'Authentication failed (401) during startup auth preflight.',
    });

    expect(text).toContain('Startup authentication preflight failed');
    expect(text).toContain('HTTP 401');
    expect(text).toContain('blocking shared SAP tool calls');
    expect(text).toContain('/sap/bc/adt/core/discovery');
  });

  it('returns blocking failure on 401/403 auth errors', async () => {
    vi.spyOn(AdtHttpClient.prototype, 'get').mockRejectedValue(
      new AdtApiError('Unauthorized', 401, '/sap/bc/adt/core/discovery', 'Unauthorized'),
    );

    const result = await runStartupAuthPreflight({
      ...DEFAULT_CONFIG,
      ppEnabled: false,
      url: 'http://sap.example.com:8000',
      username: 'TECH_USER',
      password: 'wrong',
    });

    expect(result.status).toBe('failed');
    expect(result.blocking).toBe(true);
    expect(result.statusCode).toBe(401);
  });

  it('returns inconclusive and non-blocking on non-auth failures', async () => {
    vi.spyOn(AdtHttpClient.prototype, 'get').mockRejectedValue(new Error('connect ECONNREFUSED'));

    const result = await runStartupAuthPreflight({
      ...DEFAULT_CONFIG,
      ppEnabled: false,
      url: 'http://sap.example.com:8000',
      username: 'TECH_USER',
      password: 'secret',
    });

    expect(result.status).toBe('inconclusive');
    expect(result.blocking).toBe(false);
  });
});
