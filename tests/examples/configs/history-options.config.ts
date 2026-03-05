/**
 * Example: coverage history tracking.
 *
 * `history.maxEntries` caps how many runs are stored in the history file.
 * `history.fileName` overrides the default 'playswag-history.json'.
 * After a run the delta indicators (↑ / ↓) appear in the console table and
 * the HTML report renders a sparkline from the stored entries.
 *
 * Verified by runner.test.ts:
 *   ✓ exit code 0
 *   ✓ coverage-history.json exists
 *   ✓ history file contains exactly 1 entry (first-ever run)
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
        outputDir: resolve(examplesDir, 'output/history-options'),
        outputFormats: ['json'],
        baseURL: 'http://localhost:3457',
        history: {
          maxEntries: 3,
          fileName: 'coverage-history.json',
        },
      },
    ],
  ],
  use: {
    baseURL: 'http://localhost:3457',
  },
});
