import type { TaskContext } from 'vitest';
import { describe, expect, it, vi } from 'vitest';
import { requireOrSkip, SkipReason, skipWithReason } from '../../helpers/skip-policy.js';

/** Create a mock TaskContext with a spy on skip. */
function mockCtx(): TaskContext {
  return { skip: vi.fn() } as unknown as TaskContext;
}

describe('skip-policy', () => {
  describe('skipWithReason', () => {
    it('calls ctx.skip with the reason text', () => {
      const ctx = mockCtx();
      skipWithReason(ctx, 'No SAP system');
      expect(ctx.skip).toHaveBeenCalledWith('No SAP system');
    });

    it('calls ctx.skip even with an empty string reason', () => {
      const ctx = mockCtx();
      skipWithReason(ctx, '');
      expect(ctx.skip).toHaveBeenCalledWith('');
    });
  });

  describe('requireOrSkip', () => {
    it('does not skip when value is a non-empty string', () => {
      const ctx = mockCtx();
      const value: string | null = 'ZDDLS_TEST';
      requireOrSkip(ctx, value, 'No DDLS');
      expect(ctx.skip).not.toHaveBeenCalled();
    });

    it('skips when value is null', () => {
      const ctx = mockCtx();
      requireOrSkip(ctx, null, 'No DDLS candidate found');
      expect(ctx.skip).toHaveBeenCalledWith('No DDLS candidate found');
    });

    it('skips when value is undefined', () => {
      const ctx = mockCtx();
      requireOrSkip(ctx, undefined, 'No DDLS source available');
      expect(ctx.skip).toHaveBeenCalledWith('No DDLS source available');
    });

    it('does not skip when value is 0 (falsy but defined)', () => {
      const ctx = mockCtx();
      requireOrSkip(ctx, 0, 'Should not skip');
      expect(ctx.skip).not.toHaveBeenCalled();
    });

    it('does not skip when value is false (falsy but defined)', () => {
      const ctx = mockCtx();
      requireOrSkip(ctx, false, 'Should not skip');
      expect(ctx.skip).not.toHaveBeenCalled();
    });

    it('does not skip when value is empty string (falsy but defined)', () => {
      const ctx = mockCtx();
      requireOrSkip(ctx, '', 'Should not skip');
      expect(ctx.skip).not.toHaveBeenCalled();
    });

    it('narrows type after successful check', () => {
      const ctx = mockCtx();
      const value: string | null = 'ZDDLS_TEST';
      requireOrSkip(ctx, value, 'No DDLS');
      // After requireOrSkip, TypeScript treats value as string (non-null).
      // This assignment would fail to compile if type narrowing didn't work.
      const narrowed: string = value;
      expect(narrowed).toBe('ZDDLS_TEST');
    });
  });

  describe('SkipReason constants', () => {
    it('has expected constant values', () => {
      expect(SkipReason.NO_CREDENTIALS).toBe('SAP credentials not configured');
      expect(SkipReason.NO_FIXTURE).toBe('Required test fixture not available on system');
      expect(SkipReason.BACKEND_UNSUPPORTED).toBe('Backend does not support this feature');
      expect(SkipReason.NO_DDLS).toBe('No DDLS object found on system');
      expect(SkipReason.NO_DUMPS).toBe('No short dumps found on system');
      expect(SkipReason.NO_CUSTOM_OBJECTS).toBe('Custom Z objects not deployed on system');
    });

    it('has all six expected keys', () => {
      const keys = Object.keys(SkipReason);
      expect(keys).toHaveLength(6);
      expect(keys).toContain('NO_CREDENTIALS');
      expect(keys).toContain('NO_FIXTURE');
      expect(keys).toContain('BACKEND_UNSUPPORTED');
      expect(keys).toContain('NO_DDLS');
      expect(keys).toContain('NO_DUMPS');
      expect(keys).toContain('NO_CUSTOM_OBJECTS');
    });
  });
});
