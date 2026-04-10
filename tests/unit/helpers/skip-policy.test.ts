import type { TaskContext } from 'vitest';
import { describe, expect, it, vi } from 'vitest';
import { requireOrSkip } from '../../helpers/skip-policy.js';

/** Create a mock TaskContext with a spy on skip. */
function mockCtx(): TaskContext {
  return { skip: vi.fn() } as unknown as TaskContext;
}

describe('skip-policy', () => {
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
});
