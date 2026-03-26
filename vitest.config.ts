import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    exclude: ['tests/integration/**'],
    testTimeout: 10000,
    // Ensure clean module state between tests
    isolate: true,
  },
});
