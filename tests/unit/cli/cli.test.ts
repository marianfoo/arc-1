import { describe, expect, it } from 'vitest';
import { detectFilename } from '../../../ts-src/lint/lint.js';
import { VERSION } from '../../../ts-src/server/server.js';

describe('CLI', () => {
  it('has a valid version', () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('detectFilename works for CLI lint command', () => {
    expect(detectFilename('REPORT ztest.', 'ZTEST')).toBe('ztest.prog.abap');
    expect(detectFilename('CLASS zcl_test DEFINITION.', 'ZCL_TEST')).toBe('zcl_test.clas.abap');
  });
});
