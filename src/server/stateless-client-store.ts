/**
 * Stateless OAuth Dynamic Client Registration store.
 *
 * MCP clients (Claude Desktop, Cursor, Copilot CLI…) register dynamically
 * via RFC 7591 and cache the returned `client_id` locally. With an
 * in-memory or local-disk store, every CF push / restart wipes the
 * server-side registry — the cached `client_id` then fails with
 * `invalid_client` and the user has to clear their MCP client's OAuth
 * cache to recover.
 *
 * This store eliminates the storage problem entirely. Each `client_id`
 * is a self-validating token: it carries the registration payload
 * (redirect_uris, grant_types, …) plus an HMAC-SHA256 signature derived
 * from a server-held key. `getClient` re-derives the payload by
 * verifying the signature; no persistence is needed. Any process with
 * the same signing key can validate any client_id ever issued.
 *
 * Tradeoffs vs the persisted in-memory store:
 *   + Survives `cf push`, `cf restart`, cell moves, multi-instance scale-out
 *   + No external dependency, no service binding, no native module
 *   - Per-client revocation is impossible (only TTL or full key rotation)
 *   - Rotating the signing key invalidates every outstanding registration
 *
 * The signing key is derived (via HKDF-style HMAC) from the XSUAA
 * `clientsecret`, so it's already as stable as the service binding —
 * service rebinding rotates both at once, which is the right boundary.
 */

import crypto from 'node:crypto';
import type { OAuthRegisteredClientsStore } from '@modelcontextprotocol/sdk/server/auth/clients.js';
import type { OAuthClientInformationFull } from '@modelcontextprotocol/sdk/shared/auth.js';
import { logger } from './logger.js';

const ID_PREFIX = 'arc1-';
const PAYLOAD_VERSION = 1;
const SIG_BYTES = 16; // truncated HMAC-SHA256 — 128 bits, plenty for non-replayable opaque IDs
const DEFAULT_TTL_SECONDS = 24 * 60 * 60;

/**
 * Compact JSON shape stored inside the signed `client_id`.
 *
 * Keys are intentionally short to keep the resulting URL-safe
 * `client_id` under a few hundred bytes — it appears in the `/authorize`
 * query string, which some intermediaries cap.
 */
interface SignedPayload {
  v: number;
  iat: number; // issued-at, seconds since epoch
  ru: string[]; // redirect_uris
  gt?: string[]; // grant_types
  rt?: string[]; // response_types
  am?: string; // token_endpoint_auth_method
  cn?: string; // client_name
}

export interface StatelessDcrClientStoreOptions {
  /** Override TTL for tests. Default: 24h. */
  ttlSeconds?: number;
  /** Clock injection for tests. Default: `Date.now`. */
  now?: () => number;
}

/**
 * Pre-registered XSUAA client config — MCP clients that hit the XSUAA
 * `clientid` directly resolve through this entry. The redirect_uris list
 * MUST also be registered in `xs-security.json` (XSUAA is the authoritative
 * validator for this client).
 */
function buildXsuaaDefaultClient(clientId: string, clientSecret: string): OAuthClientInformationFull {
  return {
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uris: [
      'http://localhost:6274/oauth/callback', // MCP Inspector
      'http://localhost:3000/oauth/callback', // Local dev
      'https://claude.ai/api/mcp/auth_callback', // Claude Desktop
      'cursor://anysphere.cursor-retrieval/oauth/callback', // Cursor
      'vscode://vscode.microsoft-authentication/callback', // VS Code
    ],
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'client_secret_post',
    client_name: 'ARC-1 XSUAA Default Client',
  };
}

export class StatelessDcrClientStore implements OAuthRegisteredClientsStore {
  private readonly xsuaaClient: OAuthClientInformationFull;
  private readonly hmacKey: Buffer;
  private readonly ttlSeconds: number;
  private readonly now: () => number;

  constructor(
    xsuaaClientId: string,
    xsuaaClientSecret: string,
    signingSecret: string,
    options: StatelessDcrClientStoreOptions = {},
  ) {
    if (!signingSecret) {
      throw new Error('StatelessDcrClientStore requires a non-empty signingSecret');
    }
    // Derive a dedicated HMAC key from the signing secret so we never
    // sign with the raw service-binding secret. The label ("arc1-dcr/v1")
    // doubles as a domain separator: rotating the label invalidates
    // every previously-issued client_id without changing the secret.
    this.hmacKey = crypto.createHmac('sha256', signingSecret).update('arc1-dcr/v1').digest();
    this.xsuaaClient = buildXsuaaDefaultClient(xsuaaClientId, xsuaaClientSecret);
    this.ttlSeconds = options.ttlSeconds ?? DEFAULT_TTL_SECONDS;
    this.now = options.now ?? (() => Date.now());
  }

  async getClient(clientId: string): Promise<OAuthClientInformationFull | undefined> {
    if (clientId === this.xsuaaClient.client_id) {
      return this.xsuaaClient;
    }
    if (!clientId.startsWith(ID_PREFIX)) {
      return undefined;
    }

    const payload = this.decodeAndVerify(clientId);
    if (!payload) {
      logger.debug('OAuth client lookup failed (invalid signature or malformed)', { clientId });
      return undefined;
    }

    const ageSec = Math.floor(this.now() / 1000) - payload.iat;
    if (ageSec > this.ttlSeconds) {
      logger.debug('OAuth client expired (TTL)', { clientId, ageSec, ttlSeconds: this.ttlSeconds });
      return undefined;
    }

    return {
      client_id: clientId,
      client_secret: this.deriveSecret(clientId),
      client_id_issued_at: payload.iat,
      redirect_uris: payload.ru,
      grant_types: payload.gt ?? ['authorization_code', 'refresh_token'],
      response_types: payload.rt ?? ['code'],
      token_endpoint_auth_method: payload.am ?? 'client_secret_post',
      client_name: payload.cn,
    };
  }

  /**
   * SDK hook: called before redirect_uri validation on /authorize.
   *
   * For the pre-registered XSUAA client we mutate in-place (XSUAA itself
   * is the authoritative validator via xs-security.json wildcards, so
   * the SDK's local check is decorative).
   *
   * For DCR (`arc1-…`) clients we are stateless by design: there's
   * nothing to mutate. The previous in-memory store implemented a
   * percent-encoding loose-match (BAS/Theia registers `?x=1` then
   * authorizes with `%3Fx=1`); reproducing that statelessly would
   * require either bundling every encoding variant in the signed
   * payload or keeping a per-process scratch map, both of which
   * undermine the "no state" goal. We accept the regression:
   * affected clients re-register on encoding-variant mismatch, which
   * is exactly what they do today after every restart anyway.
   */
  ensureRedirectUri(clientId: string, uri: string): void {
    if (clientId !== this.xsuaaClient.client_id) return;
    if (this.xsuaaClient.redirect_uris.includes(uri)) return;
    this.xsuaaClient.redirect_uris.push(uri);
    logger.debug('Dynamic redirect_uri registered for XSUAA client', { clientId, uri });
  }

  async registerClient(
    client: Omit<OAuthClientInformationFull, 'client_id' | 'client_id_issued_at'>,
  ): Promise<OAuthClientInformationFull> {
    if (client.redirect_uris) {
      for (const uri of client.redirect_uris) {
        validateRedirectUri(uri);
      }
    }

    const issuedAt = Math.floor(this.now() / 1000);
    const payload: SignedPayload = {
      v: PAYLOAD_VERSION,
      iat: issuedAt,
      ru: client.redirect_uris ?? [],
    };
    if (client.grant_types) payload.gt = client.grant_types;
    if (client.response_types) payload.rt = client.response_types;
    if (client.token_endpoint_auth_method) payload.am = client.token_endpoint_auth_method;
    if (client.client_name) payload.cn = client.client_name;

    const clientId = this.encode(payload);
    const clientSecret = this.deriveSecret(clientId);

    logger.debug('OAuth client registered (stateless)', {
      clientId,
      clientName: client.client_name,
      idBytes: clientId.length,
    });

    return {
      ...client,
      client_id: clientId,
      client_secret: clientSecret,
      client_id_issued_at: issuedAt,
    };
  }

  private encode(payload: SignedPayload): string {
    const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    const sig = this.sign(payloadB64);
    return `${ID_PREFIX}${payloadB64}.${sig}`;
  }

  private decodeAndVerify(clientId: string): SignedPayload | undefined {
    const stripped = clientId.slice(ID_PREFIX.length);
    const dot = stripped.lastIndexOf('.');
    if (dot < 0) return undefined;
    const payloadB64 = stripped.slice(0, dot);
    const sigB64 = stripped.slice(dot + 1);

    const expected = this.sign(payloadB64);
    const a = Buffer.from(sigB64, 'base64url');
    const b = Buffer.from(expected, 'base64url');
    if (a.length !== b.length || a.length !== SIG_BYTES) return undefined;
    if (!crypto.timingSafeEqual(a, b)) return undefined;

    try {
      const json = Buffer.from(payloadB64, 'base64url').toString('utf8');
      const parsed = JSON.parse(json) as SignedPayload;
      if (parsed.v !== PAYLOAD_VERSION) return undefined;
      if (typeof parsed.iat !== 'number' || !Array.isArray(parsed.ru)) return undefined;
      return parsed;
    } catch {
      return undefined;
    }
  }

  private sign(payloadB64: string): string {
    return crypto
      .createHmac('sha256', this.hmacKey)
      .update(payloadB64)
      .digest()
      .subarray(0, SIG_BYTES)
      .toString('base64url');
  }

  private deriveSecret(clientId: string): string {
    return crypto.createHmac('sha256', this.hmacKey).update(`secret:${clientId}`).digest('base64url');
  }
}

/**
 * Validate a redirect URI against allowed scheme/host policy.
 * Allowed: https://*, http://localhost or 127.0.0.1 or [::1], custom MCP client schemes.
 * Rejected: javascript:, data:, file:, ftp:, and any http:// to non-loopback hosts.
 */
export function validateRedirectUri(uri: string): void {
  const ALLOWED_CUSTOM_SCHEMES = ['claude:', 'cursor:', 'vscode:', 'vscode-insiders:'];
  const BLOCKED_SCHEMES = ['javascript:', 'data:', 'file:', 'ftp:'];

  for (const scheme of BLOCKED_SCHEMES) {
    if (uri.toLowerCase().startsWith(scheme)) {
      throw new Error(
        `Redirect URI rejected: '${scheme}' scheme is not allowed. Use https:// or a registered custom scheme.`,
      );
    }
  }

  for (const scheme of ALLOWED_CUSTOM_SCHEMES) {
    if (uri.toLowerCase().startsWith(scheme)) return;
  }

  try {
    const parsed = new URL(uri);
    if (parsed.protocol === 'https:') return;
    if (parsed.protocol === 'http:') {
      const host = parsed.hostname.toLowerCase();
      if (host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1') return;
      throw new Error(`Redirect URI rejected: http:// is only allowed for localhost/127.0.0.1. Got: '${uri}'`);
    }
    return;
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Redirect URI rejected')) throw err;
  }
}
