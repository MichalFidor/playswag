/**
 * Represents a single recorded API call during a test.
 */
export interface EndpointHit {
  method: string;
  url: string;
  /** Resolved path template, e.g. /api/users/{id} — filled in by the matcher */
  pathTemplate?: string;
  statusCode: number;
  requestBody?: unknown;
  /** Parsed JSON response body, populated when captureResponseBody is enabled. */
  responseBody?: unknown;
  queryParams?: Record<string, string>;
  /** Path parameters extracted from the URL, e.g. { id: '123' } */
  pathParams?: Record<string, string>;
  headers?: Record<string, string>;
  testFile: string;
  testTitle: string;
  /**
   * Playwright project name this hit originated from.
   * Set automatically by the reporter — do not populate manually.
   */
  projectName?: string;
}

/**
 * Coverage result for a single status code on an operation.
 */
export interface StatusCodeCoverage {
  covered: boolean;
  testRefs: string[];
}

/**
 * Coverage result for a single parameter (query / path / header / cookie).
 */
export interface ParamCoverage {
  name: string;
  in: 'query' | 'path' | 'header' | 'cookie';
  required: boolean;
  covered: boolean;
}

/**
 * Coverage result for a single request body property.
 */
export interface BodyPropertyCoverage {
  name: string;
  required: boolean;
  covered: boolean;
}

/**
 * Coverage result for one OpenAPI operation (method + path).
 */
export interface OperationCoverage {
  path: string;
  method: string;
  operationId?: string;
  tags?: string[];
  /** Whether this operation is marked as deprecated in the spec. */
  deprecated?: boolean;
  covered: boolean;
  /** Defined response codes in spec vs whether they were exercised */
  statusCodes: Record<string, StatusCodeCoverage>;
  /** Defined parameters (query, path, header) and whether they were used */
  parameters: ParamCoverage[];
  /** Top-level request body schema properties and whether they were supplied */
  bodyProperties: BodyPropertyCoverage[];
  /** Response body schema properties per status code and whether they were observed */
  responseProperties: ResponsePropertyCoverage[];
  /** Test references that hit this operation */
  testRefs: string[];
}

/**
 * Summary statistics for one coverage dimension.
 */
export interface CoverageSummaryItem {
  total: number;
  covered: number;
  percentage: number;
}

/**
 * Top-level coverage summary.
 */
export interface CoverageSummary {
  endpoints: CoverageSummaryItem;
  statusCodes: CoverageSummaryItem;
  parameters: CoverageSummaryItem;
  bodyProperties: CoverageSummaryItem;
  /** Response body property coverage — only populated when specs define response schemas. */
  responseProperties: CoverageSummaryItem;
}

/**
 * The complete coverage result produced after a test run.
 */
export interface CoverageResult {
  specFiles: string[];
  timestamp: string;
  playwrightVersion: string;
  playswagVersion: string;
  totalTestCount: number;
  summary: CoverageSummary;
  /** Coverage aggregated per OpenAPI tag. Populated for all tags found in the spec. */
  tagCoverage: Record<string, CoverageSummary>;
  operations: OperationCoverage[];
  uncoveredOperations: OperationCoverage[];
  /**
   * Hits that were recorded but could not be matched to any spec operation.
   * Useful for discovering undocumented endpoints.
   */
  unmatchedHits: EndpointHit[];
  /**
   * Hits that matched an `acknowledgedServices` pattern and were intentionally
   * excluded from the unmatched-hits warning. One entry per configured service
   * (only services that actually received calls are included).
   */
  acknowledgedHits: AcknowledgedServiceHits[];
}

/**
 * A service whose unmatched calls have been explicitly acknowledged by the user.
 * Calls matching the pattern are excluded from the unmatched-hits warning and
 * instead shown as a brief informational note.
 */
export interface AcknowledgedService {
  /**
   * A picomatch glob or plain URL substring matched against the full recorded URL.
   * Examples: `'**\/auth-service\/**'` or `'https://auth.internal/**'`
   */
  pattern: string;
  /**
   * Human-readable name shown in console output.
   * Defaults to the pattern string when omitted.
   */
  label?: string;
}

/** Per-service summary of acknowledged (intentionally ignored) unmatched hits. */
export interface AcknowledgedServiceHits {
  /** The label resolved from `AcknowledgedService.label ?? AcknowledgedService.pattern`. */
  label: string;
  /** The original glob pattern. */
  pattern: string;
  /** Number of unmatched hits absorbed by this service entry. */
  count: number;
}

/**
 * A normalized representation of a single OpenAPI operation across Swagger 2.0 + OAS 3.x.
 */
export interface NormalizedOperation {
  pathTemplate: string;
  method: string;
  operationId?: string;
  tags?: string[];
  /** Whether this operation is marked as deprecated in the spec. */
  deprecated?: boolean;
  parameters: NormalizedParameter[];
  requestBodySchema?: NormalizedSchema;
  responses: Record<string, NormalizedResponse>;
  /**
   * The base path prefix extracted from this operation's source spec server definition.
   * E.g. `/modeling-service` or `/dmn-service`. Stripped from recorded URLs before matching.
   */
  serverBasePath?: string;
}

export interface NormalizedParameter {
  name: string;
  in: 'query' | 'path' | 'header' | 'cookie';
  required: boolean;
  schema?: NormalizedSchema;
}

export interface NormalizedResponse {
  description?: string;
  /**
   * Top-level schema for this response code (if defined in the spec).
   * Used to track response body property coverage.
   */
  schema?: NormalizedSchema;
}

/**
 * Coverage result for a single response body property.
 */
export interface ResponsePropertyCoverage {
  /** The HTTP status code this property belongs to, e.g. '200'. */
  statusCode: string;
  name: string;
  required: boolean;
  covered: boolean;
}

export interface NormalizedSchema {
  type?: string;
  properties?: Record<string, NormalizedSchema>;
  required?: string[];
  items?: NormalizedSchema;
  allOf?: NormalizedSchema[];
  anyOf?: NormalizedSchema[];
  oneOf?: NormalizedSchema[];
}

/**
 * Result of parsing one or more spec files, merged into a single flat list.
 */
export interface NormalizedSpec {
  /** Original source paths / URLs */
  sources: string[];
  operations: NormalizedOperation[];
}

/**
 * Per-dimension threshold entry. Can be a plain number (minimum %) or a full object
 * that additionally controls whether failing to meet the threshold fails the run.
 *
 * @example
 * ```ts
 * threshold: {
 *   endpoints: 80,                          // shorthand
 *   statusCodes: { min: 70, fail: true },   // fail the run on this dimension only
 *   parameters: { min: 50, fail: false },   // warn only, never fails the run
 * }
 * ```
 */
export interface ThresholdEntry {
  /** Minimum coverage percentage required (0–100). */
  min: number;
  /**
   * Fail the test run when this dimension falls below `min`.
   * Overrides the top-level `failOnThreshold` setting for this dimension.
   * @default inherited from PlayswagConfig.failOnThreshold
   */
  fail?: boolean;
}

/**
 * A single coverage dimension tracked by playswag.
 * Used in {@link PlayswagConfig.excludeDimensions} to opt out of specific dimensions.
 */
export type CoverageDimension = 'endpoints' | 'statusCodes' | 'parameters' | 'bodyProperties' | 'responseProperties';

/**
 * Threshold configuration for coverage dimensions.
 * Each key accepts either a plain number (minimum %) or a {@link ThresholdEntry} for
 * fine-grained per-dimension fail control.
 */
export interface ThresholdConfig {
  /** Minimum endpoint coverage percentage, or a {@link ThresholdEntry} */
  endpoints?: number | ThresholdEntry;
  /** Minimum status code coverage percentage, or a {@link ThresholdEntry} */
  statusCodes?: number | ThresholdEntry;
  /** Minimum parameter coverage percentage, or a {@link ThresholdEntry} */
  parameters?: number | ThresholdEntry;
  /** Minimum request body property coverage percentage, or a {@link ThresholdEntry} */
  bodyProperties?: number | ThresholdEntry;
  /** Minimum response body property coverage percentage, or a {@link ThresholdEntry} */
  responseProperties?: number | ThresholdEntry;
}

/**
 * Console output configuration.
 *
 * Controls the summary table, per-operation breakdown, and optional per-dimension
 * expand rows printed to stdout at the end of a test run.
 *
 * @example
 * ```ts
 * consoleOutput: {
 *   showUncoveredOnly: true,   // focus on gaps
 *   showOperations: true,
 *   showParams: true,          // expand query/path/header params per op
 *   showBodyProperties: true,  // expand request body fields per op
 *   showResponseProperties: true, // expand response body fields per op, grouped by status code
 *   showTags: true,            // print a per-tag summary table
 * }
 * ```
 */
export interface ConsoleOutputConfig {
  /** @default true */
  enabled?: boolean;
  /** Show only uncovered / partially covered operations @default false */
  showUncoveredOnly?: boolean;
  /**
   * Show the per-operation breakdown table below the summary.
   * Set to `false` to print the summary table only.
   * @default true
   */
  showOperations?: boolean;
  /**
   * Expand parameter-level coverage (query, path, header) per operation.
   * Required parameters are marked with `*`.
   * @default false
   */
  showParams?: boolean;
  /**
   * Expand request body property coverage per operation.
   * Required properties are marked with `*`.
   * @default false
   */
  showBodyProperties?: boolean;
  /**
   * Expand response body property coverage per operation, grouped by status code.
   * Required properties are marked with `*`.
   * @default false
   */
  showResponseProperties?: boolean;
  /**
   * Print a per-tag summary table after the overall summary, showing coverage
   * percentages for each OpenAPI tag across all five dimensions.
   * @default false
   */
  showTags?: boolean;
  /**
   * Append the `operationId` after the path in the operations table.
   * Useful for quickly correlating coverage rows with spec definitions.
   * @default false
   */
  showOperationId?: boolean;
  /**
   * Print a per-status-code breakdown table below the summary, showing how many
   * operations in the spec define and cover each HTTP status code.
   * @default false
   */
  showStatusCodeBreakdown?: boolean;
  /**
   * Show the unmatched hits section (calls that did not match any spec operation).
   * Set to `false` to suppress when there are known intentional out-of-spec calls.
   * @default true
   */
  showUnmatchedHits?: boolean;
}

/**
 * JSON file output configuration.
 *
 * The JSON report contains the full {@link CoverageResult} and can be consumed
 * by external dashboards or CI tooling.
 */
export interface JsonOutputConfig {
  /** @default true */
  enabled?: boolean;
  /**
   * Output file name inside `outputDir`.
   * @default 'playswag-coverage.json'
   */
  fileName?: string;
  /**
   * Pretty-print the JSON with 2-space indentation.
   * Set to `false` for smaller files in CI.
   * @default true
   */
  pretty?: boolean;
}

/**
 * HTML report output configuration.
 *
 * Produces a self-contained single-file HTML report with:
 * - A 5-dimension summary card row with progress bars
 * - An expandable per-operation detail panel
 * - Per-tag coverage aggregation
 * - A coverage history sparkline (when history is enabled)
 */
export interface HtmlOutputConfig {
  /** @default true */
  enabled?: boolean;
  /**
   * Output file name inside `outputDir`.
   * @default 'playswag-coverage.html'
   */
  fileName?: string;
  /**
   * Custom title shown at the top of the HTML report.
   * @default 'API Coverage Report'
   */
  title?: string;
}

/**
 * Coverage history configuration.
 *
 * When enabled, each run appends a {@link HistoryEntry} to a JSON file. The HTML
 * report renders a sparkline for each dimension from the last N entries. The console
 * report shows `↑ / ↓` delta indicators next to each percentage.
 */
export interface HistoryConfig {
  /** @default true */
  enabled?: boolean;
  /**
   * File name for the history JSON file inside `outputDir`.
   * @default 'playswag-history.json'
   */
  fileName?: string;
  /**
   * Maximum number of historical entries to retain.
   * Older entries are dropped once this limit is exceeded.
   * @default 50
   */
  maxEntries?: number;
}

/**
 * JUnit XML output configuration.
 *
 * Produces a JUnit XML report with one `<testcase>` per coverage dimension.
 * Compatible with Jenkins, GitLab CI, and other JUnit-aware CI systems.
 */
export interface JUnitOutputConfig {
  /** @default true */
  enabled?: boolean;
  /**
   * Output file name inside `outputDir`.
   * @default 'playswag-junit.xml'
   */
  fileName?: string;
}

/**
 * GitHub Actions step summary and annotations configuration.
 *
 * Controls what appears in the GitHub Actions job summary when running under
 * `GITHUB_ACTIONS=true`. Annotations (errors/warnings for threshold violations)
 * are always emitted; only the step summary is configurable.
 */
export interface GitHubActionsOutputConfig {
  /**
   * Append a collapsible section listing uncovered operations to the step summary.
   * @default false
   */
  showUncoveredOperations?: boolean;
  /**
   * Append a collapsible section listing unmatched hits (calls not matched to any spec operation).
   * @default false
   */
  showUnmatchedHits?: boolean;
}

/**
 * Markdown file output configuration.
 *
 * Produces a `playswag-coverage.md` file containing a 5-dimension summary
 * table, an optional per-tag breakdown, and a list of uncovered operations.
 * Suitable for committing alongside code, posting as a GitHub PR comment, or
 * embedding in a non-GitHub CI summary.
 */
export interface MarkdownOutputConfig {
  /** @default true */
  enabled?: boolean;
  /**
   * Output file name inside `outputDir`.
   * @default 'playswag-coverage.md'
   */
  fileName?: string;
  /**
   * Heading text at the top of the report.
   * @default 'API Coverage Report'
   */
  title?: string;
  /**
   * Append a table of uncovered operations at the end of the report.
   * @default true
   */
  showUncoveredOperations?: boolean;
}

/**
 * SVG badge configuration.
 *
 * Generates a Shields.io-compatible flat SVG badge showing the coverage percentage
 * for a chosen dimension. Useful for README badges.
 *
 * @example
 * ```ts
 * badge: {
 *   dimension: 'endpoints',
 *   label: 'API Coverage',
 *   fileName: 'coverage-badge.svg',
 * }
 * ```
 */
export interface BadgeConfig {
  /**
   * Output file name inside `outputDir`.
   * @default 'playswag-badge.svg'
   */
  fileName?: string;
  /**
   * Which coverage dimension to reflect in the badge value.
   * @default 'endpoints'
   */
  dimension?: 'endpoints' | 'statusCodes' | 'parameters' | 'bodyProperties' | 'responseProperties';
  /**
   * Label text on the left side of the badge.
   * @default 'API Coverage'
   */
  label?: string;
}

/**
 * Main configuration object for the Playswag reporter.
 * Pass this as the second argument in the reporter tuple in `playwright.config.ts`.
 *
 * You can import this type for full intellisense:
 * ```ts
 * import type { PlayswagConfiguration } from '@michalfidor/playswag';
 *
 * const playswagConfig: PlayswagConfiguration = {
 *   specs: './openapi.yaml',
 *   outputDir: './playswag-coverage',
 *   outputFormats: ['console', 'json', 'html'],
 *
 *   threshold: {
 *     endpoints: 80,
 *     statusCodes: { min: 60, fail: true },
 *   },
 *   failOnThreshold: true,
 *
 *   consoleOutput: {
 *     showUncoveredOnly: false,
 *     showOperations: true,
 *     showParams: true,
 *     showBodyProperties: true,
 *     showResponseProperties: true,
 *     showTags: true,
 *   },
 *
 *   badge: { dimension: 'endpoints', label: 'API Coverage' },
 *   history: { maxEntries: 30 },
 * };
 *
 * export default defineConfig({
 *   reporter: [['@michalfidor/playswag/reporter', playswagConfig]],
 * });
 * ```
 */
export interface PlayswagConfig {
  /**
   * OpenAPI / Swagger spec sources. Can be:
   * - A local file path (relative to cwd or absolute): './openapi.yaml'
   * - A remote URL: 'https://api.example.com/swagger.json'
   * - An array of any combination of the above
   */
  specs: string | string[];

  /**
   * Directory to write output files into.
   * @default './playswag-coverage'
   */
  outputDir?: string;

  /**
   * Which output formats to produce.
   * @default ['console', 'json']
   */
  outputFormats?: Array<'console' | 'json' | 'html' | 'badge' | 'junit' | 'markdown'>;

  /**
   * Base URL of the API under test. Used to strip the host portion when
   * matching recorded URLs to OpenAPI path templates.
   * Auto-detected from playwright.config.ts `use.baseURL` if not provided.
   */
  baseURL?: string;

  /**
   * Only track API calls whose paths match at least one of these glob patterns.
   * Defaults to tracking everything.
   */
  includePatterns?: string[];

  /**
   * Ignore API calls whose paths match any of these glob patterns.
   */
  excludePatterns?: string[];

  /**
   * Declare external or auxiliary services whose unmatched calls should be
   * silently acknowledged rather than listed in the unmatched-hits warning.
   *
   * Matching is done against the **full recorded URL** using picomatch.
   * Acknowledged hits are excluded from the yellow-warning block and
   * shown only as a brief informational note per service.
   *
   * @example
   * acknowledgedServices: [
   *   { pattern: '**\/auth-service\/**', label: 'auth-service' },
   *   { pattern: 'https://analytics.internal/**' },
   * ]
   */
  acknowledgedServices?: AcknowledgedService[];

  /**
   * Only include spec operations that carry at least one of these OAS tags in
   * coverage calculations. Supports picomatch glob patterns (e.g. `'user*'`).
   * Operations with no tags are excluded when this option is set.
   */
  includeTags?: string[];

  /**
   * Exclude spec operations that carry any of these OAS tags from coverage
   * calculations. Supports picomatch glob patterns (e.g. `'internal*'`).
   */
  excludeTags?: string[];

  /**
   * When `true`, only required parameters are counted towards the parameters
   * coverage dimension. Optional parameters are ignored.
   * @default false
   */
  requiredParamsOnly?: boolean;

  /**
   * Weight applied to the response-properties dimension when computing per-operation
   * coverage percentages in the HTML report. A value of `1.0` treats response
   * properties the same as request body properties; `0` excludes them from the
   * per-operation score entirely. Use values between `0` and `1` to indicate
   * that response properties represent weaker coverage signal than sent fields.
   * @default 0.5
   */
  responsePropertiesWeight?: number;

  /**
   * Dimensions to exclude from the summary display and threshold checks.
   * Raw data for excluded dimensions is still collected and present in the JSON
   * output — only the display rows and threshold evaluations are suppressed.
   *
   * `'endpoints'` cannot be excluded (it is the core metric).
   *
   * @example
   * // Array-returning endpoints make responseProperties structurally uncoverable:
   * excludeDimensions: ['responseProperties']
   */
  excludeDimensions?: Exclude<CoverageDimension, 'endpoints'>[];

  /** Console output options */
  consoleOutput?: ConsoleOutputConfig;

  /** JSON file output options */
  jsonOutput?: JsonOutputConfig;

  /** HTML report output options */
  htmlOutput?: HtmlOutputConfig;

  /** SVG badge options */
  badge?: BadgeConfig;

  /** Coverage history options */
  history?: HistoryConfig;

  /** JUnit XML output options */
  junitOutput?: JUnitOutputConfig;

  /** Markdown file output options */
  markdownOutput?: MarkdownOutputConfig;

  /** GitHub Actions step summary and annotations configuration */
  githubActionsOutput?: GitHubActionsOutputConfig;

  /**
   * Coverage thresholds. When set and `failOnThreshold` is true the
   * reporter will signal a failed run if any threshold is not met.
   */
  threshold?: ThresholdConfig;

  /**
   * Whether to fail the test run when coverage falls below a threshold.
   * @default false — thresholds are informational only
   */
  failOnThreshold?: boolean;
}

/**
 * Alias for {@link PlayswagConfig}. Preferred name for use in `playwright.config.ts`
 * since it avoids collision with Playwright's own `Config` type.
 *
 * @example
 * ```ts
 * import type { PlayswagConfiguration } from '@michalfidor/playswag';
 *
 * const playswagConfig: PlayswagConfiguration = {
 *   specs: './openapi.yaml',
 *   outputFormats: ['console', 'html', 'json'],
 *   threshold: { endpoints: 80, statusCodes: { min: 60, fail: true } },
 *   failOnThreshold: true,
 *   consoleOutput: { showResponseProperties: true, showTags: true },
 * };
 *
 * export default defineConfig({
 *   reporter: [['@michalfidor/playswag/reporter', playswagConfig]],
 * });
 * ```
 */
export type PlayswagConfiguration = PlayswagConfig;

/**
 * Per-test / per-project fixture options that can be overridden via `test.use()`.
 *
 * @example
 * ```ts
 * // Disable tracking for a specific test file:
 * test.use({ playswagEnabled: false });
 *
 * // Opt out of response body capture for files with large binary payloads:
 * test.use({ captureResponseBody: false });
 * ```
 */
export interface PlayswagFixtureOptions {
  /**
   * Set to false to disable coverage tracking for this project / file.
   * @default true
   */
  playswagEnabled: boolean;
  /**
   * Set to false to opt out of response body capture (useful for large binary payloads).
   * When true, playswag will call response.json() and record the parsed body to enable
   * response property coverage.
   * @default true
   */
  captureResponseBody: boolean;
  /**
   * Per-project OpenAPI / Swagger spec override.
   *
   * When set in a project's `use` block, hits from that project are evaluated against
   * these spec(s) instead of the global `specs` reporter config. Accepts the same values
   * as `PlayswagConfig.specs` (file path, URL, or array of either).
   *
   * @example
   * ```ts
   * projects: [
   *   {
   *     name: 'users-service',
   *     use: { playswagSpecs: './specs/users.yaml', baseURL: 'http://localhost:4001' },
   *   },
   *   {
   *     name: 'orders-service',
   *     use: { playswagSpecs: './specs/orders.yaml', baseURL: 'http://localhost:4002' },
   *   },
   * ]
   * ```
   */
  playswagSpecs?: string | string[];
  /**
   * Per-project base URL override.
   *
   * When set in a project's `use` block, overrides the global `baseURL` reporter config
   * for hits originating from that project. Useful when different projects target different
   * service hosts.
   *
   * Falls back to the project's own `baseURL` if not set, then to the global reporter config.
   */
  playswagBaseURL?: string;
}
