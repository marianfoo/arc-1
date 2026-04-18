import { beforeAll, describe, expect, it } from 'vitest';
import type { AdtClient } from '../../src/adt/client.js';
import { defaultFeatureConfig } from '../../src/adt/config.js';
import { probeFeatures } from '../../src/adt/features.js';
import {
  cloneRepo,
  getConfig,
  getSystemInfo,
  getTransportHistory,
  getUserInfo,
  listRepos,
} from '../../src/adt/gcts.js';
import { unrestrictedSafetyConfig } from '../../src/adt/safety.js';
import { expectSapFailureClass } from '../helpers/expected-error.js';
import { requireOrSkip, SkipReason } from '../helpers/skip-policy.js';
import { getTestClient, requireSapCredentials } from './helpers.js';

describe('gCTS integration', () => {
  let client: AdtClient;
  let gctsAvailable: boolean | undefined;

  beforeAll(async () => {
    requireSapCredentials();
    client = getTestClient();
    const features = await probeFeatures(client.http, defaultFeatureConfig());
    gctsAvailable = features.gcts?.available;
  });

  it('getSystemInfo returns basic system status', async (ctx) => {
    requireOrSkip(ctx, gctsAvailable ? true : undefined, SkipReason.BACKEND_UNSUPPORTED);
    const info = await getSystemInfo(client.http, client.safety);
    expect(info.result.sid).toBeTruthy();
    expect(info.result.version).toBeTruthy();
    expect(Array.isArray(info.result.status)).toBe(true);
  });

  it('getUserInfo returns current user and scope info', async (ctx) => {
    requireOrSkip(ctx, gctsAvailable ? true : undefined, SkipReason.BACKEND_UNSUPPORTED);
    const userInfo = await getUserInfo(client.http, client.safety);
    expect(userInfo.user.user).toBeTruthy();
  });

  it('getConfig returns gCTS config entries', async (ctx) => {
    requireOrSkip(ctx, gctsAvailable ? true : undefined, SkipReason.BACKEND_UNSUPPORTED);
    const config = await getConfig(client.http, client.safety);
    expect(Array.isArray(config)).toBe(true);
    if (config.length > 0) {
      expect(config.some((entry) => typeof entry.ckey === 'string' && entry.ckey.length > 0)).toBe(true);
    }
  });

  it('listRepos always returns an array (including empty backend shape)', async (ctx) => {
    requireOrSkip(ctx, gctsAvailable ? true : undefined, SkipReason.BACKEND_UNSUPPORTED);
    const repos = await listRepos(client.http, client.safety);
    expect(Array.isArray(repos)).toBe(true);
  });

  it('clone operations are blocked when enableGit is disabled', async (ctx) => {
    requireOrSkip(ctx, gctsAvailable ? true : undefined, SkipReason.BACKEND_UNSUPPORTED);
    const noGitSafety = { ...unrestrictedSafetyConfig(), enableGit: false };
    await expect(
      cloneRepo(client.http, noGitSafety, {
        url: 'https://github.com/example/repo.git',
        package: '$TMP',
      }),
    ).rejects.toThrow(/Git operation/);
  });

  it('getTransportHistory for unknown repo returns expected backend error class', async (ctx) => {
    requireOrSkip(ctx, gctsAvailable ? true : undefined, SkipReason.BACKEND_UNSUPPORTED);
    try {
      await getTransportHistory(client.http, client.safety, `ZARC1_UNKNOWN_${Date.now()}`);
      // Some systems may return an empty payload instead of raising an error.
    } catch (err) {
      expectSapFailureClass(err, [500, 404], [/No relation between system and repository/i, /not found/i]);
    }
  });
});
