/**
 * Example: fixture-level options — playswagEnabled and captureResponseBody.
 *
 * Uses fixture-options.spec.ts which exercises both fixture options with
 * test.use() overrides and a control-group test with full tracking.
 *
 * Expected coverage outcomes (verified by runner.test.ts):
 *   - GET /api/users  → NOT covered  (test used playswagEnabled: false)
 *   - POST /api/users → NOT covered  (test used playswagEnabled: false)
 *   - GET /api/users/{id} → covered (captureResponseBody: false, but hit recorded)
 *   - GET /api/health →     covered (normal tracking)
 *
 * Verified by runner.test.ts:
 *   ✓ exit code 0
 *   ✓ summary.endpoints.covered === 2  (users/{id} + health)
 *   ✓ GET /api/users/{id} has 0 covered response properties
 */
import { defineConfig } from '@playwright/test';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '../../..');
const examplesDir = resolve(__dirname, '..');

export default defineConfig({
  testDir: examplesDir,
  testMatch: ['**/fixture-options.spec.ts'],
  reporter: [
    [
      resolve(rootDir, 'src/reporter.ts'),
      {
        specs: resolve(rootDir, 'tests/fixtures/sample-openapi.yaml'),
        outputDir: resolve(examplesDir, 'output/fixture-options'),
        outputFormats: ['json'],
        baseURL: 'http://localhost:3457',
      },
    ],
  ],
  use: {
    baseURL: 'http://localhost:3457',
  },
});
