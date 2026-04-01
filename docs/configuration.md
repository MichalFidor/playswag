# Configuration reference

All options are passed as the second element of the reporter tuple in `playwright.config.ts`:

```ts
reporter: [
  ['@michalfidor/playswag/reporter', { /* PlayswagConfiguration */ }],
],
```

## Full config interface

```ts
interface PlayswagConfiguration {
  /**
   * OpenAPI / Swagger spec source(s).
   * Accepts local file paths (.yaml / .json), remote URLs, or an array of both.
   * Supports Swagger 2.0 and OpenAPI 3.0 / 3.1.
   */
  specs: string | string[];

  /** Output directory for generated files. @default './playswag-coverage' */
  outputDir?: string;

  /** Which output formats to produce. @default ['console', 'json'] */
  outputFormats?: Array<'console' | 'json' | 'html' | 'badge' | 'junit' | 'markdown'>;

  /**
   * Base URL of the API under test.
   * Auto-detected from playwright.config.ts `use.baseURL` if not provided.
   */
  baseURL?: string;

  /** Only track API calls whose paths match these glob patterns. */
  includePatterns?: string[];

  /** Ignore API calls whose paths match these glob patterns. */
  excludePatterns?: string[];

  /**
   * Declare external or auxiliary services whose unmatched calls should be
   * silently acknowledged rather than listed in the unmatched-hits warning.
   *
   * Matching is done against the full recorded URL using picomatch.
   *
   * @example
   * acknowledgedServices: [
   *   { pattern: '**\/auth-service\/**', label: 'auth-service' },
   *   { pattern: 'https://analytics.internal/**' },
   * ]
   */
  acknowledgedServices?: Array<{ pattern: string; label?: string }>;

  /**
   * Only include spec operations with at least one of these OAS tags.
   * Supports picomatch glob patterns. Operations with no tags are excluded.
   */
  includeTags?: string[];

  /** Exclude spec operations that carry any of these OAS tags. Supports picomatch globs. */
  excludeTags?: string[];

  /**
   * When true, only required parameters count towards parameter coverage.
   * Optional parameters are ignored. @default false
   */
  requiredParamsOnly?: boolean;

  /**
   * Suppress specific coverage dimensions from the console output, thresholds, and step summary.
   * Useful when a dimension is not applicable to your API (e.g. no request bodies).
   */
  excludeDimensions?: CoverageDimension[];

  /**
   * Weight applied to response property coverage when calculating the per-operation score.
   * Response properties are an observation signal (API returned them) rather than a
   * send signal (test exercised them), so they are weighted lower by default.
   * Set to 0 to exclude response properties from per-operation scores.
   * @default 0.5
   */
  responsePropertiesWeight?: number;

  consoleOutput?: ConsoleOutputConfig;
  jsonOutput?: JsonOutputConfig;
  htmlOutput?: HtmlOutputConfig;
  badge?: BadgeConfig;
  history?: HistoryConfig;
  junitOutput?: JUnitOutputConfig;
  markdownOutput?: MarkdownOutputConfig;
  githubActionsOutput?: GitHubActionsOutputConfig;
  threshold?: ThresholdConfig;

  /**
   * When true, the test run is marked as failed if any threshold is not met.
   * @default false — thresholds are informational only by default
   */
  failOnThreshold?: boolean;
}
```

## Console output options

```ts
consoleOutput?: {
  enabled?: boolean;                   // @default true
  showUncoveredOnly?: boolean;         // @default false
  showOperations?: boolean;            // @default true — per-operation table
  showParams?: boolean;                // @default false
  showBodyProperties?: boolean;        // @default false
  showResponseProperties?: boolean;    // @default false — expand response body fields per status code
  showTags?: boolean;                  // @default false — per-tag summary table
  showOperationId?: boolean;           // @default false — append operationId after path in ops table
  showStatusCodeBreakdown?: boolean;   // @default false — breakdown table of covered/total per HTTP status code
  showUnmatchedHits?: boolean;         // @default true  — calls that matched no spec operation
};
```

## JSON output options

```ts
jsonOutput?: {
  enabled?: boolean;    // @default true
  fileName?: string;    // @default 'playswag-coverage.json'
  pretty?: boolean;     // @default true
};
```

## HTML output options

```ts
htmlOutput?: {
  enabled?: boolean;  // @default true
  fileName?: string;  // @default 'playswag-coverage.html'
  title?: string;     // @default 'API Coverage Report'
};
```

## Badge options

```ts
badge?: {
  enabled?: boolean;                                                        // @default true
  fileName?: string;                                                        // @default 'playswag-badge.svg'
  /** Which coverage dimension drives the badge percentage. */
  dimension?: 'endpoints' | 'statusCodes' | 'parameters' | 'bodyProperties'; // @default 'endpoints'
  label?: string;                                                           // @default 'API Coverage'
};
```

## History options

See [Coverage history](./coverage-history.md) for full details.

```ts
history?: {
  enabled?: boolean;    // @default true when the key is present
  fileName?: string;    // @default 'playswag-history.json'
  maxEntries?: number;  // @default 50
};
```

## JUnit output options

```ts
junitOutput?: {
  enabled?: boolean;  // @default true
  fileName?: string;  // @default 'playswag-junit.xml'
};
```

## Markdown output options

```ts
markdownOutput?: {
  enabled?: boolean;                    // @default true
  fileName?: string;                    // @default 'playswag-coverage.md'
  title?: string;                       // @default 'API Coverage Report'
  showUncoveredOperations?: boolean;    // @default true
};
```

## GitHub Actions output options

See [CI integration](./ci-integration.md) for full details.

```ts
githubActionsOutput?: {
  showUncoveredOperations?: boolean; // @default false
  showUnmatchedHits?: boolean;       // @default false
};
```

## Threshold configuration

```ts
threshold?: {
  endpoints?:          number | { min: number; fail?: boolean };
  statusCodes?:        number | { min: number; fail?: boolean };
  parameters?:         number | { min: number; fail?: boolean };
  bodyProperties?:     number | { min: number; fail?: boolean };
  responseProperties?: number | { min: number; fail?: boolean };
};

/**
 * When true, the test run is marked as failed if any threshold is not met.
 * @default false — thresholds are informational only by default
 */
failOnThreshold?: boolean;
```

A plain number sets the minimum percentage and respects the top-level `failOnThreshold`.
The object form `{ min, fail }` overrides `failOnThreshold` for that specific dimension:

```ts
threshold: {
  endpoints: 80,                          // uses global failOnThreshold
  statusCodes: { min: 70, fail: true },   // always fails the run
  parameters: { min: 50, fail: false },   // always warn-only
},
failOnThreshold: false,
```
