/**
 * Example: thresholds that are guaranteed to PASS.
 *
 * Setting `failOnThreshold: true` enables hard failures when any tolerance is breached.
 * Here all thresholds are set to 1 % minimum — well below the actual coverage from
 * api-calls.spec.ts — so the run completes successfully.
 *
 * Verified by runner.test.ts:
 *   ✓ exit code 0  (all thresholds satisfied)
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
        outputDir: resolve(examplesDir, 'output/thresholds-pass'),
        outputFormats: ['json'],
        baseURL: 'http://localhost:3457',
        threshold: {
          endpoints: 1,
          statusCodes: 1,
          parameters: 1,
          bodyProperties: 1,
          responseProperties: 1,
        },
        failOnThreshold: true,
      },
    ],
  ],
  use: {
    baseURL: 'http://localhost:3457',
  },
});
