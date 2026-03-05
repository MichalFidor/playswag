/**
 * Example: SVG badge targeting a specific coverage dimension.
 *
 * `dimension: 'statusCodes'` makes the badge value reflect status-code coverage
 * rather than the default endpoint coverage.
 * `label` overrides the left-hand text on the Shields.io-style badge.
 * `fileName` sets the output file name inside `outputDir`.
 *
 * Verified by runner.test.ts:
 *   ✓ exit code 0
 *   ✓ status-badge.svg exists (custom fileName)
 *   ✓ SVG content contains the label text
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
        outputDir: resolve(examplesDir, 'output/badge-options'),
        outputFormats: ['badge'],
        baseURL: 'http://localhost:3457',
        badge: {
          dimension: 'statusCodes',
          label: 'Status Coverage',
          fileName: 'status-badge.svg',
        },
      },
    ],
  ],
  use: {
    baseURL: 'http://localhost:3457',
  },
});
