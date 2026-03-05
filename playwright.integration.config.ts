import { defineConfig } from '@playwright/test';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  testDir: './tests/integration',
  testMatch: '**/*.spec.ts',
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
        baseURL: 'http://localhost:3456',
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
    baseURL: 'http://localhost:3456',
  },
});
