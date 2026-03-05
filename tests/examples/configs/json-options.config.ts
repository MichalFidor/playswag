/**
 * Example: JSON output with a custom file name and minified formatting.
 *
 * `fileName` changes the output file name inside `outputDir`.
 * `pretty: false` produces a single-line JSON file instead of 2-space-indented output.
 * Useful in CI to reduce report file size.
 *
 * Verified by runner.test.ts:
 *   ✓ exit code 0
 *   ✓ custom.json exists (not the default playswag-coverage.json)
 *   ✓ content is single-line (no newlines)
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
        outputDir: resolve(examplesDir, 'output/json-options'),
        outputFormats: ['json'],
        baseURL: 'http://localhost:3457',
        jsonOutput: {
          fileName: 'custom.json',
          pretty: false,
        },
      },
    ],
  ],
  use: {
    baseURL: 'http://localhost:3457',
  },
});
