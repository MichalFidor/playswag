/**
 * Example: all five output formats enabled.
 *
 * Demonstrates that enabling console + json + html + badge + junit all together
 * produces one file per format in the output directory.
 *
 * Verified by runner.test.ts:
 *   ✓ exit code 0
 *   ✓ playswag-coverage.json exists
 *   ✓ playswag-coverage.html exists
 *   ✓ playswag-badge.svg exists
 *   ✓ playswag-junit.xml exists
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
    ['list'],
    [
      resolve(rootDir, 'src/reporter.ts'),
      {
        specs: resolve(rootDir, 'tests/fixtures/sample-openapi.yaml'),
        outputDir: resolve(examplesDir, 'output/output-formats'),
        outputFormats: ['console', 'json', 'html', 'badge', 'junit'],
        baseURL: 'http://localhost:3457',
      },
    ],
  ],
  use: {
    baseURL: 'http://localhost:3457',
  },
});
