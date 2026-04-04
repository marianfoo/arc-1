import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/evals/**/*.test.ts'],
    // LLM calls can be slow, especially with local models
    testTimeout: 120_000,
    // Run sequentially — avoid overwhelming Ollama with concurrent requests
    sequence: {
      concurrent: false,
    },
    // Reporters: console + JSON for parsing results
    reporters: ['default'],
  },
});
