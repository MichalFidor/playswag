/**
 * Vitest configuration for the examples runner.
 *
 * Key differences from vitest.config.ts (unit tests):
 * - Extended testTimeout to accommodate Playwright sub-process spawns
 * - pool: 'forks' with maxForks: 1 ensures all tests run sequentially,
 *   which is required because each scenario starts a mock HTTP server on
 *   the same port (3457)
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['tests/examples/runner.test.ts'],
    testTimeout: 90_000,
    hookTimeout: 30_000,
    pool: 'forks',
    maxForks: 1,
    minForks: 1,
  },
  resolve: {
    extensionAlias: {
      '.js': ['.ts', '.js'],
    },
  },
});
