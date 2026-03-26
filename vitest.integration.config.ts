import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/integration/**/*.test.ts'],
    // SAP can be slow — allow 30s per test
    testTimeout: 30000,
    // Run integration tests sequentially to avoid SAP session conflicts
    sequence: {
      concurrent: false,
    },
  },
});
