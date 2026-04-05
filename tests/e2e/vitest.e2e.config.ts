import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globalSetup: ['tests/e2e/global-setup.ts'],
    include: ['tests/e2e/**/*.e2e.test.ts'],
    // SAP can be slow — allow 60s per test
    testTimeout: 60_000,
    // Hook timeout — setup/teardown may create objects on SAP
    hookTimeout: 120_000,
    // Run E2E tests sequentially — one SAP system, avoid session conflicts
    sequence: {
      concurrent: false,
    },
    // Reporters: console + JUnit XML for GH Actions artifact
    reporters: [
      'default',
      [
        'junit',
        {
          outputFile: process.env.E2E_LOG_DIR
            ? `${process.env.E2E_LOG_DIR}/junit-results.xml`
            : '/tmp/arc1-e2e-logs/junit-results.xml',
        },
      ],
    ],
  },
});
