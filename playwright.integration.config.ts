import { defineConfig } from '@playwright/test';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getIntegrationTestPort } from './tests/integration/test-port.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = getIntegrationTestPort();
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './tests/integration',
  testMatch: '**/*.spec.ts',
  globalTeardown: './tests/integration/global-teardown.ts',
  fullyParallel: false,
  workers: 1,
  reporter: [
    ['list'],
    [
      './src/reporter.ts',
      {
        specs: join(__dirname, 'tests/fixtures/sample-openapi.yaml'),
        outputDir: join(__dirname, 'tests/integration/output'),
        outputFormats: ['console', 'json'],
        baseURL,
        consoleOutput: {
          showOperations: true,
          showParams: true,
        },
        threshold: {
          endpoints: 50,
        },
        failOnThreshold: false,
      },
    ],
  ],
  use: {
    baseURL,
  },
});
