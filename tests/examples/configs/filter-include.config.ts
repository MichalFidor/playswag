/**
 * Example: includePatterns — track only paths matching a glob.
 *
 * Only requests whose pathname matches '/api/health' are counted.
 * All other hits (users endpoints) are discarded before coverage is calculated.
 *
 * Verified by runner.test.ts:
 *   ✓ exit code 0
 *   ✓ JSON report: summary.endpoints.covered === 1  (only GET /api/health)
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
        outputDir: resolve(examplesDir, 'output/filter-include'),
        outputFormats: ['json'],
        baseURL: 'http://localhost:3457',
        includePatterns: ['/api/health'],
      },
    ],
  ],
  use: {
    baseURL: 'http://localhost:3457',
  },
});
