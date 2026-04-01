/**
 * Playswag — Playwright API coverage tracking against Swagger/OpenAPI specifications.
 *
 * ## Quick start
 *
 * **1. Replace your `@playwright/test` import in test files:**
 * ```ts
 * import { test, expect } from '@michalfidor/playswag';
 *
 * test('GET /users', async ({ request }) => {
 *   const res = await request.get('/api/users');
 *   expect(res.ok()).toBeTruthy();
 * });
 * ```
 *
 * **2. Register the reporter in `playwright.config.ts`:**
 * ```ts
 * import type { PlayswagConfiguration } from '@michalfidor/playswag';
 *
 * const playswagConfig: PlayswagConfiguration = {
 *   specs: './openapi.yaml',          // local file, URL, or array of both
 *   outputDir: './playswag-coverage', // all output files go here
 *   outputFormats: ['console', 'json', 'html', 'badge'],
 *
 *   // Coverage thresholds (optional)
 *   threshold: {
 *     endpoints:   80,
 *     statusCodes: { min: 60, fail: true }, // this dimension fails the run
 *   },
 *   failOnThreshold: false, // default: only warn unless overridden per-dimension
 *
 *   // Console table options
 *   consoleOutput: {
 *     showOperations: true,
 *     showResponseProperties: true,  // per-op response property expand
 *     showTags: true,                // per-tag summary table
 *   },
 *
 *   // SVG badge (great for README)
 *   badge: { dimension: 'endpoints', label: 'API Coverage' },
 *
 *   // Keep a rolling history of runs
 *   history: { maxEntries: 30 },
 * };
 *
 * export default defineConfig({
 *   reporter: [['@michalfidor/playswag/reporter', playswagConfig]],
 * });
 * ```
 *
 * **3. Wrap custom contexts** (if you use `request.newContext()`):
 * ```ts
 * myContext: async ({ trackRequest }, use) => {
 *   const raw = await request.newContext({ baseURL: 'https://api.example.com' });
 *   await use(trackRequest(raw));
 * },
 * ```
 *
 * **4. Opt out per file** (e.g. files that don't hit your API):
 * ```ts
 * test.use({ playswagEnabled: false });
 * ```
 */
export { test, expect, ATTACHMENT_NAME, defineConfig } from './fixture.js';
export type { PlayswagFixtures } from './fixture.js';

export { mergeCoverageResults } from './merge.js';
export { calculateCoverage } from './coverage/calculator.js';
export { parseSpecs } from './openapi/parser.js';

export type {
  PlayswagConfiguration,
  PlayswagFixtureOptions,
  CoverageDimension,
  CoverageResult,
  OperationCoverage,
  EndpointHit,
  CoverageSummary,
  CoverageSummaryItem,
  StatusCodeCoverage,
  ParamCoverage,
  BodyPropertyCoverage,
  ResponsePropertyCoverage,
  ThresholdConfig,
  ThresholdEntry,
  ConsoleOutputConfig,
  JsonOutputConfig,
  HtmlOutputConfig,
  BadgeConfig,
  HistoryConfig,
  JUnitOutputConfig,
  MarkdownOutputConfig,
  GitHubActionsOutputConfig,
  AcknowledgedService,
  AcknowledgedServiceHits,
  NormalizedSpec,
} from './types.js';

export type { HistoryEntry, CoverageDelta } from './output/history.js';
