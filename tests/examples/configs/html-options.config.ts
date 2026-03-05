/**
 * Example: HTML report with a custom file name and custom page title.
 *
 * `fileName` overrides the default 'playswag-coverage.html'.
 * `title` sets the heading shown at the top of the report page.
 *
 * Verified by runner.test.ts:
 *   ✓ exit code 0
 *   ✓ my-report.html exists (not the default name)
 *   ✓ HTML content contains the custom title string
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
        outputDir: resolve(examplesDir, 'output/html-options'),
        outputFormats: ['html'],
        baseURL: 'http://localhost:3457',
        htmlOutput: {
          fileName: 'my-report.html',
          title: 'My Custom Title',
        },
      },
    ],
  ],
  use: {
    baseURL: 'http://localhost:3457',
  },
});
