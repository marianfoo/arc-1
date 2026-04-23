/**
 * Tests for XSUAA OAuth provider.
 *
 * Tests the in-memory client store, chained token verifier,
 * and provider factory without requiring a live XSUAA instance.
 */

import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { describe, expect, it, vi } from 'vitest';
import { createChainedTokenVerifier, InMemoryClientStore } from '../../../src/server/xsuaa.js';

// ─── InMemoryClientStore ─────────────────────────────────────────────

describe('InMemoryClientStore', () => {
  it('pre-registers the XSUAA client', async () => {
    const store = new InMemoryClientStore('my-client-id', 'my-client-secret');
    const client = await store.getClient('my-client-id');
    expect(client).toBeDefined();
    expect(client!.client_id).toBe('my-client-id');
    expect(client!.client_secret).toBe('my-client-secret');
    expect(client!.client_name).toBe('ARC-1 XSUAA Default Client');
  });

  it('returns undefined for unknown client', async () => {
    const store = new InMemoryClientStore('my-client-id', 'my-client-secret');
    const client = await store.getClient('unknown-id');
    expect(client).toBeUndefined();
  });

  it('registers a new client with generated credentials', async () => {
    const store = new InMemoryClientStore('my-client-id', 'my-client-secret');
    const registered = await store.registerClient({
      redirect_uris: ['http://localhost:3000/callback'],
      client_name: 'Test MCP Client',
      client_secret: undefined,
    });

    expect(registered.client_id).toMatch(/^arc1-/);
    expect(registered.client_secret).toBeDefined();
    expect(registered.redirect_uris).toEqual(['http://localhost:3000/callback']);
    expect(registered.client_name).toBe('Test MCP Client');

    // Should be retrievable
    const retrieved = await store.getClient(registered.client_id);
    expect(retrieved).toBeDefined();
    expect(retrieved!.client_id).toBe(registered.client_id);
  });

  it('registers multiple clients independently', async () => {
    const store = new InMemoryClientStore('xsuaa-id', 'xsuaa-secret');
    const client1 = await store.registerClient({
      redirect_uris: ['http://localhost:3000/callback'],
      client_name: 'Client 1',
    });
    const client2 = await store.registerClient({
      redirect_uris: ['http://localhost:4000/callback'],
      client_name: 'Client 2',
    });

    expect(client1.client_id).not.toBe(client2.client_id);
    expect(await store.getClient(client1.client_id)).toBeDefined();
    expect(await store.getClient(client2.client_id)).toBeDefined();
  });
});

// ─── createChainedTokenVerifier ──────────────────────────────────────

describe('createChainedTokenVerifier', () => {
  it('returns API key auth when token matches (multi-key admin profile)', async () => {
    const verifier = createChainedTokenVerifier({
      apiKeys: [{ key: 'my-key', profile: 'admin' }],
    });
    const result = await verifier('my-key');
    expect(result.clientId).toBe('api-key:admin');
    expect(result.scopes).toContain('admin');
    expect(result.scopes).toContain('read');
    expect(result.scopes).toContain('write');
    expect(result.scopes).toContain('transports');
    expect(result.scopes).toContain('git');
    // Must have expiresAt for MCP SDK's requireBearerAuth middleware
    expect(result.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it('throws when API key does not match and no other verifiers', async () => {
    const verifier = createChainedTokenVerifier({
      apiKeys: [{ key: 'my-key', profile: 'viewer' }],
    });
    await expect(verifier('wrong-key')).rejects.toThrow('Token validation failed');
  });

  it('tries XSUAA verifier first', async () => {
    const xsuaaVerifier = vi.fn().mockResolvedValue({
      token: 'xsuaa-token',
      clientId: 'xsuaa-client',
      scopes: ['read'],
      extra: {},
    } satisfies AuthInfo);

    const verifier = createChainedTokenVerifier({ apiKeys: [{ key: 'my-key', profile: 'viewer' }] }, xsuaaVerifier);
    const result = await verifier('xsuaa-token');
    expect(result.clientId).toBe('xsuaa-client');
    expect(xsuaaVerifier).toHaveBeenCalledWith('xsuaa-token');
  });

  it('falls through to OIDC when XSUAA fails', async () => {
    const xsuaaVerifier = vi.fn().mockRejectedValue(new Error('Invalid token'));
    const oidcVerifier = vi.fn().mockResolvedValue({
      token: 'oidc-token',
      clientId: 'oidc-client',
      scopes: ['read', 'write', 'admin'],
      extra: {},
    } satisfies AuthInfo);

    const verifier = createChainedTokenVerifier({}, xsuaaVerifier, oidcVerifier);
    const result = await verifier('oidc-token');
    expect(result.clientId).toBe('oidc-client');
    expect(xsuaaVerifier).toHaveBeenCalled();
    expect(oidcVerifier).toHaveBeenCalled();
  });

  it('falls through to API key when both XSUAA and OIDC fail', async () => {
    const xsuaaVerifier = vi.fn().mockRejectedValue(new Error('XSUAA fail'));
    const oidcVerifier = vi.fn().mockRejectedValue(new Error('OIDC fail'));

    const verifier = createChainedTokenVerifier(
      { apiKeys: [{ key: 'my-key', profile: 'admin' }] },
      xsuaaVerifier,
      oidcVerifier,
    );
    const result = await verifier('my-key');
    expect(result.clientId).toBe('api-key:admin');
  });

  it('throws when all verifiers fail and no API key', async () => {
    const xsuaaVerifier = vi.fn().mockRejectedValue(new Error('XSUAA fail'));
    const oidcVerifier = vi.fn().mockRejectedValue(new Error('OIDC fail'));

    const verifier = createChainedTokenVerifier({}, xsuaaVerifier, oidcVerifier);
    await expect(verifier('invalid-token')).rejects.toThrow('Token validation failed');
  });

  it('works with no verifiers configured', async () => {
    const verifier = createChainedTokenVerifier({});
    await expect(verifier('any-token')).rejects.toThrow('Token validation failed');
  });

  // --- Multi-key API key support ---

  it('matches multi-key with viewer profile', async () => {
    const verifier = createChainedTokenVerifier({
      apiKeys: [{ key: 'viewer-key', profile: 'viewer' }],
    });
    const result = await verifier('viewer-key');
    expect(result.clientId).toBe('api-key:viewer');
    expect(result.scopes).toEqual(['read']);
    expect(result.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it('matches multi-key with developer-sql profile (includes transports, git, data, sql)', async () => {
    const verifier = createChainedTokenVerifier({
      apiKeys: [{ key: 'dev-key', profile: 'developer-sql' }],
    });
    const result = await verifier('dev-key');
    expect(result.clientId).toBe('api-key:developer-sql');
    // developer-sql now includes transports + git per new API_KEY_PROFILES
    expect(result.scopes).toContain('read');
    expect(result.scopes).toContain('write');
    expect(result.scopes).toContain('data');
    expect(result.scopes).toContain('sql');
    expect(result.scopes).toContain('transports');
    expect(result.scopes).toContain('git');
  });

  it('matches correct key from multiple apiKeys', async () => {
    const verifier = createChainedTokenVerifier({
      apiKeys: [
        { key: 'viewer-key', profile: 'viewer' },
        { key: 'dev-key', profile: 'developer' },
      ],
    });
    const viewerResult = await verifier('viewer-key');
    expect(viewerResult.scopes).toEqual(['read']);

    const devResult = await verifier('dev-key');
    // developer now has read, write, transports, git
    expect(devResult.scopes).toContain('read');
    expect(devResult.scopes).toContain('write');
    expect(devResult.scopes).toContain('transports');
    expect(devResult.scopes).toContain('git');
  });

  it('rejects unknown key when only apiKeys is configured', async () => {
    const verifier = createChainedTokenVerifier({
      apiKeys: [{ key: 'known-key', profile: 'viewer' }],
    });
    await expect(verifier('unknown-key')).rejects.toThrow('Token validation failed');
  });
});

// ─── XSUAA scope extraction (via chained verifier mock) ────────────

describe('XSUAA scope extraction and implied expansion', () => {
  it('extracts data scope from XSUAA token', async () => {
    const xsuaaVerifier = vi.fn().mockImplementation(async () => ({
      token: 'tok',
      clientId: 'xsuaa-client',
      scopes: ['read', 'data'],
      extra: {},
    }));
    const verifier = createChainedTokenVerifier({}, xsuaaVerifier);
    const result = await verifier('tok');
    expect(result.scopes).toContain('data');
    expect(result.scopes).toContain('read');
  });

  it('extracts sql scope from XSUAA token', async () => {
    const xsuaaVerifier = vi.fn().mockImplementation(async () => ({
      token: 'tok',
      clientId: 'xsuaa-client',
      scopes: ['read', 'sql', 'data'],
      extra: {},
    }));
    const verifier = createChainedTokenVerifier({}, xsuaaVerifier);
    const result = await verifier('tok');
    expect(result.scopes).toContain('sql');
    expect(result.scopes).toContain('data');
  });

  it('legacy tokens with only read/write/admin still work', async () => {
    const xsuaaVerifier = vi.fn().mockImplementation(async () => ({
      token: 'tok',
      clientId: 'xsuaa-client',
      scopes: ['read', 'write', 'admin'],
      extra: {},
    }));
    const verifier = createChainedTokenVerifier({}, xsuaaVerifier);
    const result = await verifier('tok');
    expect(result.scopes).toEqual(['read', 'write', 'admin']);
    expect(result.scopes).not.toContain('data');
    expect(result.scopes).not.toContain('sql');
  });
});

// ─── createXsuaaTokenVerifier implied scope expansion ───────────────

describe('expandScopes (scope expansion integration)', () => {
  it('admin scope implies all 7 scopes', async () => {
    const { expandScopes } = await import('../../../src/authz/policy.js');
    const result = expandScopes(['admin']);
    expect(result).toContain('read');
    expect(result).toContain('write');
    expect(result).toContain('data');
    expect(result).toContain('sql');
    expect(result).toContain('transports');
    expect(result).toContain('git');
    expect(result).toContain('admin');
    expect(result.length).toBe(7);
  });

  it('write implies read', async () => {
    const { expandScopes } = await import('../../../src/authz/policy.js');
    expect(expandScopes(['write']).sort()).toEqual(['read', 'write']);
  });

  it('sql implies data', async () => {
    const { expandScopes } = await import('../../../src/authz/policy.js');
    expect(expandScopes(['sql']).sort()).toEqual(['data', 'sql']);
  });
});

// ─── createXsuaaOAuthProvider ────────────────────────────────────────

describe('createXsuaaOAuthProvider', () => {
  // Note: We can't fully test the provider without a live XSUAA instance.
  // The XsuaaService constructor requires real credentials to set up JWKS.
  // Instead we test the factory indirectly via the client store and verifier.

  it('createXsuaaTokenVerifier returns a function', async () => {
    // We can at least verify the module exports are correct
    const { createXsuaaTokenVerifier } = await import('../../../src/server/xsuaa.js');
    expect(typeof createXsuaaTokenVerifier).toBe('function');
  });
});

// ─── getAppUrl ───────────────────────────────────────────────────────

describe('getAppUrl', () => {
  it('extracts app URL from VCAP_APPLICATION', async () => {
    const { getAppUrl } = await import('../../../src/adt/btp.js');

    const originalEnv = process.env.VCAP_APPLICATION;
    process.env.VCAP_APPLICATION = JSON.stringify({
      application_uris: ['arc1-mcp-server.cfapps.us10-001.hana.ondemand.com'],
    });

    expect(getAppUrl()).toBe('https://arc1-mcp-server.cfapps.us10-001.hana.ondemand.com');

    process.env.VCAP_APPLICATION = originalEnv;
  });

  it('returns undefined when VCAP_APPLICATION is not set', async () => {
    const { getAppUrl } = await import('../../../src/adt/btp.js');

    const originalEnv = process.env.VCAP_APPLICATION;
    delete process.env.VCAP_APPLICATION;

    expect(getAppUrl()).toBeUndefined();

    process.env.VCAP_APPLICATION = originalEnv;
  });

  it('returns undefined for invalid JSON', async () => {
    const { getAppUrl } = await import('../../../src/adt/btp.js');

    const originalEnv = process.env.VCAP_APPLICATION;
    process.env.VCAP_APPLICATION = 'not-json';

    expect(getAppUrl()).toBeUndefined();

    process.env.VCAP_APPLICATION = originalEnv;
  });

  it('falls back to uris field', async () => {
    const { getAppUrl } = await import('../../../src/adt/btp.js');

    const originalEnv = process.env.VCAP_APPLICATION;
    process.env.VCAP_APPLICATION = JSON.stringify({
      uris: ['my-app.cfapps.eu10.hana.ondemand.com'],
    });

    expect(getAppUrl()).toBe('https://my-app.cfapps.eu10.hana.ondemand.com');

    process.env.VCAP_APPLICATION = originalEnv;
  });
});

// ─── InMemoryClientStore — DCR Validation ───────────────────────────

describe('InMemoryClientStore DCR validation', () => {
  it('rejects redirect URI with javascript: scheme', async () => {
    const store = new InMemoryClientStore('xsuaa-client', 'xsuaa-secret');
    await expect(
      store.registerClient({
        redirect_uris: ['javascript:alert(1)'],
        client_name: 'evil',
      } as any),
    ).rejects.toThrow("'javascript:' scheme is not allowed");
  });

  it('rejects redirect URI with data: scheme', async () => {
    const store = new InMemoryClientStore('xsuaa-client', 'xsuaa-secret');
    await expect(
      store.registerClient({
        redirect_uris: ['data:text/html,<script>alert(1)</script>'],
        client_name: 'evil',
      } as any),
    ).rejects.toThrow("'data:' scheme is not allowed");
  });

  it('accepts redirect URI with https: scheme', async () => {
    const store = new InMemoryClientStore('xsuaa-client', 'xsuaa-secret');
    const client = await store.registerClient({
      redirect_uris: ['https://example.com/callback'],
      client_name: 'legit',
    } as any);
    expect(client.client_id).toMatch(/^arc1-/);
  });

  it('accepts redirect URI with http://localhost', async () => {
    const store = new InMemoryClientStore('xsuaa-client', 'xsuaa-secret');
    const client = await store.registerClient({
      redirect_uris: ['http://localhost:6274/oauth/callback'],
      client_name: 'inspector',
    } as any);
    expect(client.client_id).toMatch(/^arc1-/);
  });

  it('accepts redirect URI with claude: custom scheme', async () => {
    const store = new InMemoryClientStore('xsuaa-client', 'xsuaa-secret');
    const client = await store.registerClient({
      redirect_uris: ['claude://callback'],
      client_name: 'claude',
    } as any);
    expect(client.client_id).toMatch(/^arc1-/);
  });

  it('rejects http: redirect URI to non-loopback host', async () => {
    const store = new InMemoryClientStore('xsuaa-client', 'xsuaa-secret');
    await expect(
      store.registerClient({
        redirect_uris: ['http://evil.com/callback'],
        client_name: 'evil',
      } as any),
    ).rejects.toThrow('http:// is only allowed for localhost');
  });

  it('rejects registration after 100 dynamic clients', async () => {
    const store = new InMemoryClientStore('xsuaa-client', 'xsuaa-secret');
    // Register 100 clients
    for (let i = 0; i < 100; i++) {
      await store.registerClient({
        redirect_uris: ['https://example.com/cb'],
        client_name: `client-${i}`,
      } as any);
    }
    // 101st should fail
    await expect(
      store.registerClient({
        redirect_uris: ['https://example.com/cb'],
        client_name: 'overflow',
      } as any),
    ).rejects.toThrow('Client registration limit reached');
  });

  it('expires dynamic clients after 24 hours', async () => {
    const store = new InMemoryClientStore('xsuaa-client', 'xsuaa-secret');
    const client = await store.registerClient({
      redirect_uris: ['https://example.com/cb'],
      client_name: 'temp',
    } as any);

    // Verify client exists
    expect(await store.getClient(client.client_id)).toBeDefined();

    // Manually set client_id_issued_at to 25 hours ago to simulate expiry
    const storedClient = await store.getClient(client.client_id);
    if (storedClient) {
      (storedClient as any).client_id_issued_at = Math.floor(Date.now() / 1000) - 90000;
    }

    // Client should now be expired
    expect(await store.getClient(client.client_id)).toBeUndefined();
  });

  it('rejects registration with mixed valid/invalid redirect URIs', async () => {
    const store = new InMemoryClientStore('xsuaa-client', 'xsuaa-secret');
    await expect(
      store.registerClient({
        redirect_uris: ['https://good.com/callback', 'javascript:alert(1)'],
        client_name: 'mixed',
      } as any),
    ).rejects.toThrow("'javascript:' scheme is not allowed");
  });
});

describe('InMemoryClientStore ensureRedirectUri loose match', () => {
  // Simulates the BAS/Cline flow: register with one percent-encoding, authorize with another.
  it('accepts %3F in path when the registered URI uses a literal ?', async () => {
    const store = new InMemoryClientStore('xsuaa-client', 'xsuaa-secret');
    const client = await store.registerClient({
      redirect_uris: ['https://theia-workspaces-ws-x.eu10.applicationstudio.cloud.sap/oss/callback?vscode-reqid=1'],
      client_name: 'bas-cline',
    } as any);

    store.ensureRedirectUri(
      client.client_id,
      'https://theia-workspaces-ws-x.eu10.applicationstudio.cloud.sap/oss/callback%3Fvscode-reqid=1',
    );

    const updated = await store.getClient(client.client_id);
    expect(updated?.redirect_uris).toContain(
      'https://theia-workspaces-ws-x.eu10.applicationstudio.cloud.sap/oss/callback%3Fvscode-reqid=1',
    );
  });

  it('rejects loose match across different hostnames', async () => {
    const store = new InMemoryClientStore('xsuaa-client', 'xsuaa-secret');
    const client = await store.registerClient({
      redirect_uris: ['https://trusted.example.com/callback'],
      client_name: 'host-test',
    } as any);

    store.ensureRedirectUri(client.client_id, 'https://attacker.example.com/callback');

    const updated = await store.getClient(client.client_id);
    expect(updated?.redirect_uris).toEqual(['https://trusted.example.com/callback']);
  });

  it('rejects loose match across different ports', async () => {
    const store = new InMemoryClientStore('xsuaa-client', 'xsuaa-secret');
    const client = await store.registerClient({
      redirect_uris: ['https://app.example.com:8443/callback'],
      client_name: 'port-test',
    } as any);

    store.ensureRedirectUri(client.client_id, 'https://app.example.com:9999/callback');

    const updated = await store.getClient(client.client_id);
    expect(updated?.redirect_uris).toEqual(['https://app.example.com:8443/callback']);
  });

  it('is a no-op when the requested URI is already registered', async () => {
    const store = new InMemoryClientStore('xsuaa-client', 'xsuaa-secret');
    const client = await store.registerClient({
      redirect_uris: ['https://app.example.com/callback'],
      client_name: 'dup-test',
    } as any);

    store.ensureRedirectUri(client.client_id, 'https://app.example.com/callback');

    const updated = await store.getClient(client.client_id);
    expect(updated?.redirect_uris).toEqual(['https://app.example.com/callback']);
  });

  it('does not loose-match for the pre-registered XSUAA client (that path accepts any URI)', async () => {
    // The pre-registered client accepts any https URI unconditionally — this
    // verifies the old behaviour is preserved for client_ids that don't start with "arc1-".
    const store = new InMemoryClientStore('xsuaa-client', 'xsuaa-secret');
    store.ensureRedirectUri('xsuaa-client', 'https://completely-new-host.example.com/cb');

    const client = await store.getClient('xsuaa-client');
    expect(client?.redirect_uris).toContain('https://completely-new-host.example.com/cb');
  });
});
