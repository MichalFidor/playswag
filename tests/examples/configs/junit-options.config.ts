/**
 * Example: JUnit XML report with a custom file name.
 *
 * JUnit format is understood by Jenkins, GitLab CI, and most CI dashboards.
 * `fileName` overrides the default 'playswag-junit.xml'.
 *
 * Verified by runner.test.ts:
 *   ✓ exit code 0
 *   ✓ ci-report.xml exists (custom fileName)
 *   ✓ XML content contains <testsuite element
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
        outputDir: resolve(examplesDir, 'output/junit-options'),
        outputFormats: ['junit'],
        baseURL: 'http://localhost:3457',
        junitOutput: {
          fileName: 'ci-report.xml',
        },
      },
    ],
  ],
  use: {
    baseURL: 'http://localhost:3457',
  },
});
