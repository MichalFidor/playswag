# Configuration reference

> **1.10 breaking change:** If `specs` is a remote `http(s)://` URL, you **must** set
> `allowedSpecHosts`. See [CI integration — Remote specs](./ci-integration.md#remote-specs-ssrf).

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
   * Supports picomatch glob patterns. Operations with no tags are excluded unless
   * `includeUntagged` is true.
   */
  includeTags?: string[];

  /** When `includeTags` is set, also include operations with no OAS tags. @default false */
  includeUntagged?: boolean;

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

  /** Fail when spec parsing fails or spec has zero operations. @default true when CI=true */
  failOnSpecError?: boolean;

  /** Fail when a configured output file cannot be written. @default false */
  failOnOutputError?: boolean;

  /** Required when `specs` is a URL — host allowlist for spec + HTTP $ref fetches. */
  allowedSpecHosts?: string[];

  /** Allow fetching specs from localhost/private networks. @default false */
  allowPrivateHosts?: boolean;

  /** Remote spec / $ref deadline including DNS, redirects and body in ms. @default 15000 */
  specFetchTimeoutMs?: number;

  /** Max bytes per remote spec / $ref response, both compressed and decoded. @default 5242880 */
  maxSpecBytes?: number;

  /** Max schema property depth, integer 1–10; non-finite values use 3. @default 3 */
  schemaDepth?: number;

  /** Max response body bytes retained for coverage. @default 262144 */
  maxResponseBodyBytes?: number;

  /** Header names redacted in recorded hits. */
  redactHeaders?: string[];

  /** Max bytes for playswag:hits attachments. @default 10485760 */
  maxAttachmentBytes?: number;

  /** Max HTTP calls recorded per test. @default 500 */
  maxHitsPerTest?: number;
}
```

## Schema coverage and resource limits

`schemaDepth` counts property nesting: `user` is depth 1 and `user.name` is depth 2. Arrays do not add a property level. An array of users exposes `[].id`; a `users` array inside an object exposes `users[].id`. Each property is covered when it is present in any matching array element, including later elements. Empty arrays and operations with no hits retain their schema properties as uncovered. Request coverage excludes `readOnly` fields; response coverage excludes `writeOnly` fields. Literal property names containing dots or brackets use JSON bracket notation, for example `["user.name"]` and `["items[]"]`, so they remain distinct from nested properties and array items.

Response status and property coverage resolve the same documented response in this order: the exact status (for example `201`), its class (`2XX`), then `default`. A hit covers only the selected definition. An exact response without a schema does not inherit a schema from `2XX` or `default`.

Shared schemas are memoized. Schema normalization permits up to 100,000 visits and 128 structural levels. Property analysis permits 100,000 visits, 128 structural levels and 10,000 unique properties per schema expansion; body inspection permits 1,000,000 visits per analysis. Exceeding a limit reports a spec/coverage error rather than publishing partial coverage. `failOnSpecError` controls whether these errors fail the run (enabled by default when `CI=true`).

For remote specs and HTTP references, `specFetchTimeoutMs` covers DNS resolution, all redirects and reading the response body. `maxSpecBytes` limits both wire bytes and decompressed bytes while streaming. A parser invocation permits at most 1,024 HTTP documents, 64 MiB of decoded HTTP content in total and eight simultaneous HTTP reads. These fixed limits are shared across the entire reference graph; exhausting a budget cancels active downloads and rejects queued references. Local file references do not consume this HTTP budget. Each HTTP reference is checked against `allowedSpecHosts`; references inside remote documents cannot read local files, even when the root spec is local.

## Disable without config changes

Set the environment variable **`PLAYSWAG_DISABLED=1`** (also `true`, `yes`, or `on`) to skip API hit tracking and coverage reporting for that Playwright run. The reporter entry in `playwright.config.ts` can stay registered.

```bash
PLAYSWAG_DISABLED=1 npx playwright test
```

This disables both the **fixture** (no `playswag:hits` attachments) and the **reporter** (no spec fetch, reports, or threshold failures). For a single file or project, use `test.use({ playswagEnabled: false })` instead.

---

## Fixture options (`test.use`)

```ts
test.use({
  playswagEnabled: true,
  captureResponseBody: true,
  captureHeaders: true,
  maxResponseBodyBytes: 262144,
  redactHeaders: ['authorization', 'cookie'],
  redactBody: true,
  redactBodyFields: ['password', 'token', 'secret'],
  maxHitsPerTest: 500,
});
```

With default redaction, URL credentials/fragments and all query values are removed from recorded hits. Query names and cookie names remain available for coverage; cookie values are hidden. JSON strings/Buffers are decoded before field redaction; opaque payload values are hidden. Request options are not mutated. The fixture retains at most 10 MiB of serialized hits per test (in addition to `maxHitsPerTest`), warning when excess hits are skipped. `maxAttachmentBytes` independently bounds reporter reads.

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

See [Coverage history](./coverage-history.md) for full details. `history.maxEntries` must be an integer from 1 to 10,000. Invalid or oversized history files are rejected with a warning.

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
  postPullRequestComment?: boolean;  // @default true on pull_request events
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
