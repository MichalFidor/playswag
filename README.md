# Playswag 

![playswag logo](assets/logo.png)

> Playwright API coverage tracking against Swagger / OpenAPI specifications.

`playswag` transparently wraps Playwright's built-in `request` fixture to record every API call made during your tests, then compares the results against your OpenAPI spec(s) to report coverage across four dimensions:

| Dimension | What it measures |
|-----------|------------------|
| **Endpoints** | Which path + method combinations were called at all |
| **Status codes** | Which response codes defined in the spec were actually exercised |
| **Parameters** | Which query/path/header params were supplied |
| **Body properties** | Which request body fields were provided |

Works with **multiple workers** out of the box — per-worker data is collected via test attachments and aggregated in the reporter process after all tests complete.

---

## Installation

```bash
npm install --save-dev @michalfidor/playswag
```

`@playwright/test >=1.20.0` is a required peer dependency.

---

## Quick start

### 1. Replace your import

```diff
-import { test, expect } from '@playwright/test';
+import { test, expect } from '@michalfidor/playswag';
```

That's it. The `request` fixture is transparently wrapped — existing tests need no other changes.

### 2. Add the reporter to `playwright.config.ts`

```ts
import { defineConfig } from '@michalfidor/playswag'; // typed wrapper — accepts playswagSpecs etc.

export default defineConfig({
  reporter: [
    ['list'],
    ['@michalfidor/playswag/reporter', {
      // Required: one or more spec sources (file paths or URLs)
      specs: ['./openapi.yaml'],

      // Optional
      outputDir: './playswag-coverage',
      outputFormats: ['console', 'json'],   // also: 'html', 'badge', 'junit'

      threshold: {
        endpoints: 80,         // warn / fail if < 80% of endpoints are hit
        statusCodes: 60,
      },
      failOnThreshold: false,  // set true to fail the run when thresholds aren't met
    }],
  ],
  use: {
    baseURL: 'https://api.example.com',  // auto-detected by the reporter
  },
});
```

### 3. Run your tests

```bash
npx playwright test
```

Coverage is printed to the terminal and written to `./playswag-coverage/playswag-coverage.json`.
To also get an interactive HTML report, add `'html'` to `outputFormats` — the reporter will print a
clickable `file://` link at the end of the run (suppressed when `CI=true`).

---

## Configuration reference

All options are passed as the second element of the reporter tuple in `playwright.config.ts`.

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

  consoleOutput?: {
    enabled?: boolean;                  // @default true
    showUncoveredOnly?: boolean;        // @default false
    showOperations?: boolean;           // @default true — per-operation table
    showParams?: boolean;               // @default false
    showBodyProperties?: boolean;       // @default false
    showResponseProperties?: boolean;   // @default false — expand response body fields per status code
    showTags?: boolean;                 // @default false — per-tag summary table
    showOperationId?: boolean;          // @default false — append operationId after path in ops table
  };

  jsonOutput?: {
    enabled?: boolean;    // @default true
    fileName?: string;    // @default 'playswag-coverage.json'
    pretty?: boolean;     // @default true
  };

  /**
   * Options for the standalone HTML coverage report.
   * Enable by adding 'html' to outputFormats.
   */
  htmlOutput?: {
    enabled?: boolean;  // @default true
    fileName?: string;  // @default 'playswag-coverage.html'
    title?: string;     // @default 'API Coverage Report'
  };

  /**
   * Options for the SVG coverage badge.
   * Enable by adding 'badge' to outputFormats.
   */
  badge?: {
    enabled?: boolean;                                                        // @default true
    fileName?: string;                                                        // @default 'playswag-badge.svg'
    /** Which coverage dimension drives the badge percentage. */
    dimension?: 'endpoints' | 'statusCodes' | 'parameters' | 'bodyProperties'; // @default 'endpoints'
    label?: string;                                                           // @default 'API Coverage'
  };

  /**
   * Coverage history options.
   * Each run appends a summary entry. The HTML report shows a sparkline;
   * the console report shows ↑/↓ delta indicators.
   */
  history?: {
    enabled?: boolean;    // @default true
    fileName?: string;    // @default 'playswag-history.json'
    maxEntries?: number;  // @default 50
  };

  /**
   * JUnit XML output options.
   * Enable by adding 'junit' to outputFormats.
   */
  junitOutput?: {
    enabled?: boolean;  // @default true
    fileName?: string;  // @default 'playswag-junit.xml'
  };

  /**
   * Markdown report options.
   * Enable by adding 'markdown' to outputFormats.
   */
  markdownOutput?: {
    enabled?: boolean;              // @default true
    fileName?: string;              // @default 'playswag-coverage.md'
    title?: string;                 // @default 'API Coverage Report'
    showUncoveredOperations?: boolean; // @default true
  };

  threshold?: {
    // Plain number: informational warning only (respects failOnThreshold globally)
    endpoints?:         number | { min: number; fail?: boolean };
    statusCodes?:       number | { min: number; fail?: boolean };
    parameters?:        number | { min: number; fail?: boolean };
    bodyProperties?:    number | { min: number; fail?: boolean };
    responseProperties?:number | { min: number; fail?: boolean };
  };

  /**
   * When true, the test run is marked as failed if any threshold is not met.
   * @default false — thresholds are informational only by default
   */
  failOnThreshold?: boolean;
}
```

### Per-project / per-file opt-out

```ts
// In playwright.config.ts — disable coverage for a specific project
projects: [
  {
    name: 'no-coverage',
    use: { playswagEnabled: false },
  },
]

// Or inside a test file
test.use({ playswagEnabled: false });
```

### Per-project spec and base URL

When your Playwright config has multiple projects targeting different services, you can
point each project at its own OpenAPI spec. The reporter then runs a separate coverage
calculation per project and writes each report to `outputDir/<projectName>/`.

```ts
// playwright.config.ts
import { defineConfig } from '@michalfidor/playswag';  // typed: accepts playswagSpecs in use blocks

export default defineConfig({
  reporter: [
    ['@michalfidor/playswag/reporter', {
      outputDir: './coverage',
      outputFormats: ['json'],
      // no global `specs` needed when every project declares its own
    }],
  ],
  projects: [
    {
      name: 'users-service',
      use: {
        baseURL: 'http://localhost:3000',
        playswagSpecs: './specs/users.yaml',
      },
    },
    {
      name: 'payments-service',
      use: {
        baseURL: 'http://localhost:3001',
        playswagSpecs: './specs/payments.yaml',
      },
    },
  ],
});
```

Output structure:
```
coverage/
  users-service/
    playswag-coverage.json
  payments-service/
    playswag-coverage.json
```

> Projects that do **not** declare `playswagSpecs` fall back to the reporter-level `specs`
> and their hits are grouped together in the root `outputDir`.

## Tracking custom request contexts

The built-in `request` fixture is wrapped automatically. If your tests use **additional
`APIRequestContext` instances** — for example contexts created with `request.newContext()`
or returned by a custom fixture — use the `trackRequest` fixture to wrap them:

```ts
import { test, expect } from '@michalfidor/playswag';

// request.newContext()
test('uses a second context', async ({ request, trackRequest }) => {
  const adminCtx = trackRequest(await request.newContext({ extraHTTPHeaders: { 'x-role': 'admin' } }));
  const res = await adminCtx.get('/api/admin/stats');
  expect(res.ok()).toBeTruthy();
});
```

`trackRequest` is most useful inside **custom fixtures** that create their own contexts:

```ts
import { test as base } from '@michalfidor/playswag';

const test = base.extend<{ adminRequest: import('@playwright/test').APIRequestContext }>({
  adminRequest: async ({ trackRequest }, use) => {
    const raw = await ContextFactory.getContextByUserAccessToken('admin');
    await use(trackRequest(raw));
  },
});

export { test };

// Then in tests:
test('admin can list users', async ({ adminRequest }) => {
  const res = await adminRequest.get('/api/admin/users');
  expect(res.ok()).toBeTruthy();
});
```

All calls made through any `trackRequest`-wrapped context are recorded alongside
calls from the main `request` fixture. They all end up in the same per-test
attachment and contribute to the coverage report.

---

## Multiple spec files

```ts
specs: [
  './specs/users.yaml',
  './specs/orders.yaml',
  'https://api.example.com/openapi.json',
]
```

Duplicate `method + path` entries across files are de-duplicated (last one wins, with a console warning).

---

---

## HTML report

Add `'html'` to `outputFormats` to generate a self-contained, zero-dependency HTML file alongside
the JSON report:

```ts
outputFormats: ['console', 'json', 'html'],
htmlOutput: {
  fileName: 'playswag-coverage.html', // written to outputDir
  title: 'My API Coverage',
},
```

After the run, the reporter prints a clickable link:

```
[playswag] HTML report → file:///path/to/playswag-coverage/playswag-coverage.html
```

(On CI the `file://` link is omitted; only the relative path is logged.)

The report includes:
- Summary cards with progress bars for all four dimensions
- Operations table with **All / Covered / Uncovered** filter buttons and per-tag filtering
- Click any row to expand status codes, parameters, body properties, and the tests that hit it
- Unmatched hits section (calls that matched no spec operation)
- Dark / light theme toggle (persisted to `localStorage`)
- Visual style closely inspired by Swagger UI — familiar colour palette, accordion layout, and typography for teams already using Swagger documentation

---

## SVG badge

Add `'badge'` to `outputFormats` to write a shields.io-style SVG badge:

```ts
outputFormats: ['console', 'json', 'badge'],
badge: {
  dimension: 'endpoints', // the percentage shown on the badge
  label: 'API coverage',
  fileName: 'playswag-badge.svg',
},
```

Commit the badge and embed it in your README:

```markdown
![API coverage](./playswag-coverage/playswag-badge.svg)
```

Colour thresholds: **green** ≥ 80 % · **orange** ≥ 50 % · **red** < 50 %.

---

## Coverage history

Add `history` to the reporter config to persist a summary after each run:

```ts
history: {
  enabled: true,               // @default true when the key is present
  maxEntries: 50,              // keep the last N runs   @default 50
  fileName: 'playswag-history.json',  // written to outputDir  @default 'playswag-history.json'
}
```

omitting the `history` key entirely disables the feature (no file is written).

### What it does

After every run playswag appends a slim entry to the history file:

```json
[
  {
    "timestamp": "2026-03-05T10:00:00.000Z",
    "specFiles": ["./openapi.yaml"],
    "summary": {
      "endpoints":          { "total": 18, "covered": 14, "percentage": 77.8 },
      "statusCodes":        { "total": 42, "covered": 29, "percentage": 69.0 },
      "parameters":         { "total": 31, "covered": 22, "percentage": 71.0 },
      "bodyProperties":     { "total": 24, "covered": 19, "percentage": 79.2 },
      "responseProperties": { "total": 16, "covered":  9, "percentage": 56.3 }
    }
  }
]
```

The file is trimmed to `maxEntries` automatically. With at least **2 entries** the HTML report renders a sparkline trend chart inside each summary card and the console report shows ↑ / ↓ delta indicators next to each percentage.

### Persisting the file across CI runs

The history file must survive between runs — if it is deleted or never committed, sparklines reset on every run.

**Option A — commit the file to git** (simplest for most projects):

```yaml
# .github/workflows/test.yml  (after your test step)
- name: Commit coverage history
  run: |
    git config user.name  "github-actions[bot]"
    git config user.email "github-actions[bot]@users.noreply.github.com"
    git add playwright-report/playswag-history.json
    git diff --cached --quiet || git commit -m "chore: update playswag history"
    git push
```

**Option B — cache the file in CI** (avoids commit noise):

```yaml
# GitHub Actions
- uses: actions/cache@v4
  with:
    path: playwright-report/playswag-history.json
    key: playswag-history-${{ github.ref }}
    restore-keys: playswag-history-
```

> Delete the history file at any time to reset the trend data.

---

## JUnit XML output

Add `'junit'` to `outputFormats` to write a JUnit-compatible XML file:

```ts
outputFormats: ['console', 'json', 'junit'],
junitOutput: {
  fileName: 'playswag-junit.xml',  // written to outputDir
},
```

Each coverage dimension becomes a `<testcase>`. Threshold violations produce `<failure>` elements, making the report compatible with Jenkins, GitLab CI, and other JUnit-aware systems.

---

## Markdown output

Add `'markdown'` to `outputFormats` to write a GitHub-flavoured Markdown coverage report:

```ts
outputFormats: ['console', 'json', 'markdown'],
markdownOutput: {
  fileName: 'playswag-coverage.md',  // written to outputDir
  title: 'API Coverage Report',
  showUncoveredOperations: true,
},
```

The report contains a five-dimension summary table, a per-tag breakdown, and a list of uncovered
operations. It renders correctly in GitHub pull requests, wiki pages, and `$GITHUB_STEP_SUMMARY`.

---

## GitHub Actions

When `GITHUB_ACTIONS=true` playswag automatically:

1. **Emits annotations** — threshold violations appear as warning annotations on the summary page.
2. **Writes a step summary** — a Markdown table with four-dimension coverage results is appended to `$GITHUB_STEP_SUMMARY` and shown in the Actions UI.

No configuration required. Both features activate only inside GitHub Actions.

---


```
────────────────────────────────────────────────────────────────────────────────
  Playswag · API Coverage Report
  2026-03-04T12:00:00.000Z  ·  specs: openapi.yaml
────────────────────────────────────────────────────────────────────────────────
┌──────────────┬─────────┬───────┬──────────────────────┐
│ Dimension    │ Covered │ %     │ Progress             │
├──────────────┼─────────┼───────┼──────────────────────┤
│ Endpoints    │ 5/6     │ 83.3% │ ████████████████░░░░ │
│ Status Codes │ 7/11    │ 63.6% │ █████████████░░░░░░░ │
│ Parameters   │ 4/5     │ 80.0% │ ████████████████░░░░ │
│ Body Props   │ 2/3     │ 66.7% │ █████████████░░░░░░░ │
└──────────────┴─────────┴───────┴──────────────────────┘
```

---

## JSON output schema

```json
{
  "specFiles": ["./openapi.yaml"],
  "timestamp": "2026-03-04T12:00:00.000Z",
  "playwrightVersion": "1.50.0",
  "playswagVersion": "1.0.0",
  "totalTestCount": 12,
  "summary": {
    "endpoints":     { "total": 6, "covered": 5, "percentage": 83.3 },
    "statusCodes":   { "total": 11, "covered": 7, "percentage": 63.6 },
    "parameters":    { "total": 5, "covered": 4, "percentage": 80.0 },
    "bodyProperties":{ "total": 3, "covered": 2, "percentage": 66.7 }
  },
  "operations": [
    {
      "path": "/api/users",
      "method": "GET",
      "covered": true,
      "statusCodes": {
        "200": { "covered": true,  "testRefs": ["users.spec.ts > list users"] },
        "400": { "covered": false, "testRefs": [] }
      },
      "parameters": [
        { "name": "limit", "in": "query", "required": false, "covered": true }
      ],
      "bodyProperties": [],
      "testRefs": ["users.spec.ts > list users"]
    }
  ],
  "uncoveredOperations": [...],
  "unmatchedHits": [...]
}
```

---

## Public API reference

Everything exported from `@michalfidor/playswag`:

### Fixtures & helpers

| Export | Kind | When to use |
|---|---|---|
| `test` | Playwright fixture | Drop-in replacement for `@playwright/test`. All `request` calls are auto-tracked. |
| `expect` | Playwright helper | Re-exported from `@playwright/test` for convenience — no differences. |
| `defineConfig` | function | Typed wrapper around Playwright's `defineConfig`. Needed when using `playswagSpecs` inside `use` blocks (per-project specs). |
| `trackRequest` | fixture | Wrap a manually-created `APIRequestContext` so its calls are recorded too. See [Tracking custom request contexts](#tracking-custom-request-contexts). |
| `ATTACHMENT_NAME` | constant | The attachment key playswag uses to pass hit data between workers and the reporter. Useful if you write a custom downstream reporter that consumes playswag attachments. |

### Config types

| Export | Use in |
|---|---|
| `PlayswagConfiguration` | `playwright.config.ts` — the top-level reporter config object |
| `PlayswagFixtureOptions` | `test.use({ … })` — per-test fixture options (`playswagEnabled`, `captureResponseBody`) |
| `PlayswagFixtures` | Custom fixture type extension — extend this when building fixtures on top of playswag |
| `ConsoleOutputConfig` | `consoleOutput: { … }` sub-object |
| `JsonOutputConfig` | `jsonOutput: { … }` sub-object |
| `HtmlOutputConfig` | `htmlOutput: { … }` sub-object |
| `BadgeConfig` | `badge: { … }` sub-object |
| `HistoryConfig` | `history: { … }` sub-object |
| `JUnitOutputConfig` | `junitOutput: { … }` sub-object |
| `MarkdownOutputConfig` | `markdownOutput: { … }` sub-object |
| `ThresholdConfig` | `threshold: { … }` sub-object |
| `ThresholdEntry` | Individual `{ min, fail }` threshold entry inside `ThresholdConfig` |
| `CoverageDimension` | Union type of all five dimension keys: `'endpoints' \| 'statusCodes' \| 'parameters' \| 'bodyProperties' \| 'responseProperties'`. Useful when typing `excludeDimensions` arrays. |

### Coverage result types

Returned as part of the JSON report and the `CoverageResult` passed to `onEnd`. Useful if you consume the JSON output programmatically.

| Export | Represents |
|---|---|
| `CoverageResult` | Root object of the JSON report |
| `CoverageSummary` | The five top-level `{ endpoints, statusCodes, … }` percentages |
| `CoverageSummaryItem` | A single `{ covered, total, pct }` dimension entry |
| `OperationCoverage` | Per-operation breakdown (method, path, params, body props, …) |
| `StatusCodeCoverage` | Coverage of a single response status code for an operation |
| `ParamCoverage` | Coverage of a single query / path / header parameter |
| `BodyPropertyCoverage` | Coverage of a single request body property |
| `ResponsePropertyCoverage` | Coverage of a single response body property |
| `EndpointHit` | A single recorded API call (method, url, status, headers, body) |

### History types

Useful if you read the `playswag-history.json` file from a script or dashboard.

| Export | Represents |
|---|---|
| `HistoryEntry` | A single run's summary snapshot appended to the history file |
| `CoverageDelta` | Difference between two consecutive `CoverageSummary` values (used for `↑ / ↓` indicators) |

---

## How it works

```
Worker process                     Main process (Reporter)
──────────────────                 ──────────────────────
request.get('/api/users')
  ↓ Proxy intercepts
  records { method, url,
    status, body, params }
  ↓
testInfo.attach(                   onTestEnd():
  'playswag:hits', JSON             reads attachment
)                                   appends to aggregated list
                                   ↓
                                   onEnd():
                                     parse OpenAPI spec(s)
                                     match hits → path templates
                                     calculate 4-dimension coverage
                                     print console report
                                     write JSON file
```

Data flows from each worker to the reporter via Playwright's built-in test attachment IPC — no temp files, no shared state, no locking required. Works correctly with any number of parallel workers.

---

## License

MIT
