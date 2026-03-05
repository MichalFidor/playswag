/**
 * Example: excludePatterns — drop paths matching a glob from coverage.
 *
 * Hits to '/api/health' are filtered out before coverage is calculated,
 * so GET /api/health will be listed as an uncovered endpoint even though
 * the test makes that request.
 *
 * Verified by runner.test.ts:
 *   ✓ exit code 0
 *   ✓ JSON report: GET /api/health is NOT covered
 *   ✓ JSON report: summary.endpoints.covered === 4  (all ops except health)
 */
import { defineConfig } from '@playwright/test';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '../../..');
const examplesDir = resolve(__dirname, '..');

export default defineConfig({
  testDir: examplesDir,
  testMatch: ['**/api-calls.spec.ts'],
  reporter: [
    [
      resolve(rootDir, 'src/reporter.ts'),
      {
        specs: resolve(rootDir, 'tests/fixtures/sample-openapi.yaml'),
        outputDir: resolve(examplesDir, 'output/filter-exclude'),
        outputFormats: ['json'],
        baseURL: 'http://localhost:3457',
        excludePatterns: ['/api/health'],
      },
    ],
  ],
  use: {
    baseURL: 'http://localhost:3457',
  },
});
