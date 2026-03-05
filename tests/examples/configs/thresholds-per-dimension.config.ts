/**
 * Example: per-dimension threshold control using the full ThresholdEntry form.
 *
 * Each dimension can use either a plain number (shorthand for minimum %) or a
 * `{ min, fail }` object that independently controls whether that dimension
 * causes the run to fail.
 *
 * Here `endpoints` and `statusCodes` use lenient minimums that will pass,
 * while `parameters` uses the shorthand form. All dimensions are satisfied
 * by api-calls.spec.ts so the overall exit code is 0.
 *
 * Verified by runner.test.ts:
 *   ✓ exit code 0
 *   ✓ JSON report summary.endpoints.percentage > threshold minimum
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
        outputDir: resolve(examplesDir, 'output/thresholds-per-dimension'),
        outputFormats: ['json'],
        baseURL: 'http://localhost:3457',
        failOnThreshold: false,
        threshold: {
          endpoints: 80,
          statusCodes: { min: 70, fail: true },
          parameters: { min: 50, fail: false },
          bodyProperties: 50,
          responseProperties: { min: 1, fail: false },
        },
      },
    ],
  ],
  use: {
    baseURL: 'http://localhost:3457',
  },
});
