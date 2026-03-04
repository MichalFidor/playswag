/**
 * Playswag — Playwright API coverage tracking against Swagger/OpenAPI specifications.
 *
 * @example
 * ```ts
 * // In your test files — replace @playwright/test with @michalfidor/playswag:
 * import { test, expect } from '@michalfidor/playswag';
 *
 * test('GET /users', async ({ request }) => {
 *   const res = await request.get('/api/users');
 *   expect(res.ok()).toBeTruthy();
 * });
 * ```
 *
 * @example
 * ```ts
 * // In playwright.config.ts:
 * reporter: [['@michalfidor/playswag/reporter', { specs: './openapi.yaml' }]]
 * ```
 */
export { test, expect, ATTACHMENT_NAME } from './fixture.js';
export type { PlayswagFixtures } from './fixture.js';

export type {
  PlayswagConfig,
  PlayswagFixtureOptions,
  CoverageResult,
  OperationCoverage,
  EndpointHit,
  CoverageSummary,
  CoverageSummaryItem,
  StatusCodeCoverage,
  ParamCoverage,
  BodyPropertyCoverage,
  ThresholdConfig,
  ThresholdEntry,
  ConsoleOutputConfig,
  JsonOutputConfig,
  NormalizedSpec,
  NormalizedOperation,
} from './types.js';

export type { ThresholdViolation } from './output/console.js';
