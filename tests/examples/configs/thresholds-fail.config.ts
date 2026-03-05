/**
 * Example: thresholds deliberately set to 100 % to force a failure.
 *
 * The sample spec defines 10 status codes across all operations.
 * api-calls.spec.ts does not trigger the 400 response on GET /api/users or
 * POST /api/users (mock server never returns 400), so status-code coverage
 * peaks at 80 %, breaching the 100 % threshold.
 *
 * `failOnThreshold: true` promotes that violation into a process exit code 1.
 *
 * Verified by runner.test.ts:
 *   ✓ exit code 1  (threshold violated → reporter returns status: 'failed')
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
        outputDir: resolve(examplesDir, 'output/thresholds-fail'),
        outputFormats: ['json'],
        baseURL: 'http://localhost:3457',
        threshold: {
          statusCodes: 100,
        },
        failOnThreshold: true,
      },
    ],
  ],
  use: {
    baseURL: 'http://localhost:3457',
  },
});
