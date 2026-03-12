/**
 * Example: all console expansion options enabled simultaneously.
 *
 * - showUncoveredOnly: false  — show all operations, not just gaps
 * - showOperations: true      — include the per-operation table
 * - showParams: true          — expand query / path / header params per op
 * - showBodyProperties: true  — expand request body fields per op
 * - showResponseProperties: true — expand response body fields grouped by status code
 * - showTags: true            — append a per-tag summary table
 * - showStatusCodeBreakdown: true — append a per-HTTP-code coverage table
 *
 * Verified by runner.test.ts:
 *   ✓ exit code 0
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
        outputDir: resolve(examplesDir, 'output/console-options'),
        outputFormats: ['console'],
        baseURL: 'http://localhost:3457',
        consoleOutput: {
          showUncoveredOnly: false,
          showOperations: true,
          showParams: true,
          showBodyProperties: true,
          showResponseProperties: true,
          showTags: true,
          showStatusCodeBreakdown: true,
        },
      },
    ],
  ],
  use: {
    baseURL: 'http://localhost:3457',
  },
});
