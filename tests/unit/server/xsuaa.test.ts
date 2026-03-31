/**
 * Tests for XSUAA OAuth provider.
 *
 * Tests the in-memory client store, chained token verifier,
 * and provider factory without requiring a live XSUAA instance.
 */

import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { describe, expect, it, vi } from 'vitest';
import { createChainedTokenVerifier, InMemoryClientStore } from '../../../ts-src/server/xsuaa.js';

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
  it('returns API key auth when token matches', async () => {
    const verifier = createChainedTokenVerifier({ apiKey: 'my-key' });
    const result = await verifier('my-key');
    expect(result.clientId).toBe('api-key');
    expect(result.scopes).toEqual(['read', 'write', 'admin']);
    // Must have expiresAt for MCP SDK's requireBearerAuth middleware
    expect(result.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it('throws when API key does not match and no other verifiers', async () => {
    const verifier = createChainedTokenVerifier({ apiKey: 'my-key' });
    await expect(verifier('wrong-key')).rejects.toThrow('Token validation failed');
  });

  it('tries XSUAA verifier first', async () => {
    const xsuaaVerifier = vi.fn().mockResolvedValue({
      token: 'xsuaa-token',
      clientId: 'xsuaa-client',
      scopes: ['read'],
      extra: {},
    } satisfies AuthInfo);

    const verifier = createChainedTokenVerifier({ apiKey: 'my-key' }, xsuaaVerifier);
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

    const verifier = createChainedTokenVerifier({ apiKey: 'my-key' }, xsuaaVerifier, oidcVerifier);
    const result = await verifier('my-key');
    expect(result.clientId).toBe('api-key');
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
});

// ─── createXsuaaOAuthProvider ────────────────────────────────────────

describe('createXsuaaOAuthProvider', () => {
  // Note: We can't fully test the provider without a live XSUAA instance.
  // The XsuaaService constructor requires real credentials to set up JWKS.
  // Instead we test the factory indirectly via the client store and verifier.

  it('createXsuaaTokenVerifier returns a function', async () => {
    // We can at least verify the module exports are correct
    const { createXsuaaTokenVerifier } = await import('../../../ts-src/server/xsuaa.js');
    expect(typeof createXsuaaTokenVerifier).toBe('function');
  });
});

// ─── getAppUrl ───────────────────────────────────────────────────────

describe('getAppUrl', () => {
  it('extracts app URL from VCAP_APPLICATION', async () => {
    const { getAppUrl } = await import('../../../ts-src/adt/btp.js');

    const originalEnv = process.env.VCAP_APPLICATION;
    process.env.VCAP_APPLICATION = JSON.stringify({
      application_uris: ['arc1-mcp-server.cfapps.us10-001.hana.ondemand.com'],
    });

    expect(getAppUrl()).toBe('https://arc1-mcp-server.cfapps.us10-001.hana.ondemand.com');

    process.env.VCAP_APPLICATION = originalEnv;
  });

  it('returns undefined when VCAP_APPLICATION is not set', async () => {
    const { getAppUrl } = await import('../../../ts-src/adt/btp.js');

    const originalEnv = process.env.VCAP_APPLICATION;
    delete process.env.VCAP_APPLICATION;

    expect(getAppUrl()).toBeUndefined();

    process.env.VCAP_APPLICATION = originalEnv;
  });

  it('returns undefined for invalid JSON', async () => {
    const { getAppUrl } = await import('../../../ts-src/adt/btp.js');

    const originalEnv = process.env.VCAP_APPLICATION;
    process.env.VCAP_APPLICATION = 'not-json';

    expect(getAppUrl()).toBeUndefined();

    process.env.VCAP_APPLICATION = originalEnv;
  });

  it('falls back to uris field', async () => {
    const { getAppUrl } = await import('../../../ts-src/adt/btp.js');

    const originalEnv = process.env.VCAP_APPLICATION;
    process.env.VCAP_APPLICATION = JSON.stringify({
      uris: ['my-app.cfapps.eu10.hana.ondemand.com'],
    });

    expect(getAppUrl()).toBe('https://my-app.cfapps.eu10.hana.ondemand.com');

    process.env.VCAP_APPLICATION = originalEnv;
  });
});
