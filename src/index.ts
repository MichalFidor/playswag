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
  HtmlOutputConfig,
  BadgeConfig,
  HistoryConfig,
  JUnitOutputConfig,
  NormalizedSpec,
  NormalizedOperation,
} from './types.js';

export type { ThresholdViolation } from './output/console.js';
export { generateHtmlReport } from './output/html.js';
export { generateBadgeSvg } from './output/badge.js';
export { writeJUnitReport } from './output/junit.js';
export type { HistoryEntry, CoverageDelta } from './output/history.js';
export { compareCoverage, appendToHistory, loadLastEntry, loadAllEntries } from './output/history.js';
export { isGitHubActions, emitAnnotations, writeStepSummary } from './output/github-actions.js';
