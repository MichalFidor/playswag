/**
 * Example: per-project spec overrides using `playswagSpecs`.
 *
 * Two Playwright projects target the same test suite but each declares its own
 * OpenAPI spec via `use: { playswagSpecs }`. The reporter produces isolated
 * coverage reports under `output/multi-project/<projectName>/`, so each service
 * is evaluated only against the operations it owns.
 *
 * Verified by runner.test.ts:
 *   ✓ exit code 0
 *   ✓ users-service report contains 4 operations (no /api/health)
 *   ✓ health-service report contains 1 operation (/api/health only)
 */
import { defineConfig } from '@playwright/test';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '../../..');
const examplesDir = resolve(__dirname, '..');

export default defineConfig({
  testDir: examplesDir,
  workers: 1,
  reporter: [
    [
      resolve(rootDir, 'src/reporter.ts'),
      {
        outputDir: resolve(examplesDir, 'output/multi-project'),
        outputFormats: ['json'],
      },
    ],
  ],
  projects: [
    {
      name: 'users-service',
      testMatch: ['**/api-calls.spec.ts'],
      use: {
        baseURL: 'http://localhost:3457',
        playswagSpecs: resolve(rootDir, 'tests/fixtures/users.yaml'),
      },
    },
    {
      name: 'health-service',
      testMatch: ['**/api-calls.spec.ts'],
      use: {
        baseURL: 'http://localhost:3457',
        playswagSpecs: resolve(rootDir, 'tests/fixtures/health.yaml'),
      },
    },
  ],
});
