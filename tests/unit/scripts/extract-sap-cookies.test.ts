import { describe, expect, it } from 'vitest';
import { planExtraction } from '../../../scripts/extract-sap-cookies.ts';

describe('extract-sap-cookies planExtraction', () => {
  it('refuses to run when SAP_PP_ENABLED=true', () => {
    expect(() =>
      planExtraction({
        args: ['--url', 'http://sapdev:50000'],
        env: { SAP_PP_ENABLED: 'true' },
        cwd: process.cwd(),
        platform: process.platform,
      }),
    ).toThrow('SAP_PP_ENABLED=true');
  });
});
