/**
 * Tests for BTP principal propagation (per-user destination lookup).
 *
 * Tests the lookupDestinationWithUserToken function which calls the
 * BTP Destination Service "Find Destination" API with X-User-Token header
 * for per-user SAP authentication via Cloud Connector.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Must import AFTER mocking fetch
const { lookupDestinationWithUserToken } = await import('../../../ts-src/adt/btp.js');

import type { BTPConfig } from '../../../ts-src/adt/btp.js';

const TEST_BTP_CONFIG: BTPConfig = {
  xsuaaUrl: 'https://test.auth.example.com',
  xsuaaClientId: 'xsuaa-client',
  xsuaaSecret: 'xsuaa-secret',
  destinationUrl: 'https://destination.example.com',
  destinationClientId: 'dest-client',
  destinationSecret: 'dest-secret',
  destinationTokenUrl: 'https://test.auth.example.com/oauth/token',
  connectivityProxyHost: 'proxy.internal',
  connectivityProxyPort: '20003',
  connectivityClientId: 'conn-client',
  connectivitySecret: 'conn-secret',
  connectivityTokenUrl: 'https://test.auth.example.com/oauth/token',
};

describe('lookupDestinationWithUserToken', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends X-User-Token header and returns PrincipalPropagation auth tokens', async () => {
    // Mock token endpoint
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'service-token-123', expires_in: 3600 }),
    });

    // Mock destination lookup with per-user auth tokens
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        destinationConfiguration: {
          Name: 'SAP_TRIAL',
          URL: 'http://sap:50000',
          Authentication: 'PrincipalPropagation',
          ProxyType: 'OnPremise',
          User: '',
          Password: '',
        },
        authTokens: [
          {
            type: 'PrincipalPropagationToken',
            value: 'saml-assertion-encoded',
            http_header: {
              key: 'SAP-Connectivity-Authentication',
              value: 'Bearer saml-assertion-encoded',
            },
          },
        ],
      }),
    });

    const result = await lookupDestinationWithUserToken(TEST_BTP_CONFIG, 'SAP_TRIAL', 'user-jwt-token');

    // Verify destination was resolved
    expect(result.destination.Name).toBe('SAP_TRIAL');
    expect(result.destination.Authentication).toBe('PrincipalPropagation');

    // Verify auth tokens were extracted
    expect(result.authTokens.sapConnectivityAuth).toBe('Bearer saml-assertion-encoded');

    // Verify X-User-Token header was sent
    const destCallArgs = mockFetch.mock.calls[1];
    expect(destCallArgs[1].headers['X-user-token']).toBe('user-jwt-token');
    expect(destCallArgs[1].headers.Authorization).toBe('Bearer service-token-123');
  });

  it('returns Bearer token for OAuth2SAMLBearerAssertion destinations', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'svc-token', expires_in: 3600 }),
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        destinationConfiguration: {
          Name: 'S4_CLOUD',
          URL: 'https://s4.cloud.sap',
          Authentication: 'OAuth2SAMLBearerAssertion',
          ProxyType: 'Internet',
          User: '',
          Password: '',
        },
        authTokens: [
          {
            type: 'Bearer',
            value: 'oauth-access-token-for-user',
          },
        ],
      }),
    });

    const result = await lookupDestinationWithUserToken(TEST_BTP_CONFIG, 'S4_CLOUD', 'user-jwt');

    expect(result.authTokens.bearerToken).toBe('oauth-access-token-for-user');
    expect(result.authTokens.sapConnectivityAuth).toBeUndefined();
  });

  it('throws on auth token error from Destination Service', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'svc-token', expires_in: 3600 }),
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        destinationConfiguration: {
          Name: 'SAP_TRIAL',
          URL: 'http://sap:50000',
          Authentication: 'PrincipalPropagation',
          ProxyType: 'OnPremise',
          User: '',
          Password: '',
        },
        authTokens: [
          {
            type: 'PrincipalPropagationToken',
            value: '',
            error: 'User token validation failed: token expired',
          },
        ],
      }),
    });

    await expect(lookupDestinationWithUserToken(TEST_BTP_CONFIG, 'SAP_TRIAL', 'expired-jwt')).rejects.toThrow(
      'auth token error',
    );
  });

  it('throws on HTTP error from Destination Service', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'svc-token', expires_in: 3600 }),
    });

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: async () => 'Destination not found',
    });

    await expect(lookupDestinationWithUserToken(TEST_BTP_CONFIG, 'NONEXISTENT', 'user-jwt')).rejects.toThrow(
      'HTTP 404',
    );
  });

  it('handles destinations with no authTokens array', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'svc-token', expires_in: 3600 }),
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        destinationConfiguration: {
          Name: 'SAP_BASIC',
          URL: 'http://sap:50000',
          Authentication: 'BasicAuthentication',
          ProxyType: 'OnPremise',
          User: 'DEVELOPER',
          Password: 'pass123',
        },
        // No authTokens for BasicAuthentication
      }),
    });

    const result = await lookupDestinationWithUserToken(TEST_BTP_CONFIG, 'SAP_BASIC', 'user-jwt');

    expect(result.destination.Authentication).toBe('BasicAuthentication');
    expect(result.authTokens.sapConnectivityAuth).toBeUndefined();
    expect(result.authTokens.bearerToken).toBeUndefined();
  });
});
