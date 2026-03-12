/**
 * Example: excludeDimensions — hide dimensions from display and threshold checks.
 *
 * 'responseProperties' is excluded here, so it will not appear in the console
 * summary table, HTML summary cards, Markdown report, or JUnit test cases.
 * The overall coverage score (HTML) is the average of the four remaining dimensions.
 *
 * Raw data is still collected: the JSON report still contains
 * `summary.responseProperties` and per-operation `responseProperties` arrays.
 *
 * Verified by runner.test.ts:
 *   ✓ exit code 0
 *   ✓ JSON report still contains responseProperties data
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
        outputDir: resolve(examplesDir, 'output/exclude-dimensions'),
        outputFormats: ['json'],
        baseURL: 'http://localhost:3457',
        excludeDimensions: ['responseProperties'],
      },
    ],
  ],
  use: { baseURL: 'http://localhost:3457' },
});
