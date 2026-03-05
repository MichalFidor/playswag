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
import { defineConfig } from '@playwright/test';

export default defineConfig({
  reporter: [
    ['list'],
    ['@michalfidor/playswag/reporter', {
      // Required: one or more spec sources (file paths or URLs)
      specs: ['./openapi.yaml'],

      // Optional
      outputDir: './playswag-coverage',
      outputFormats: ['console', 'json'],   // also: 'html', 'badge'

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
  outputFormats?: Array<'console' | 'json' | 'html' | 'badge'>;

  /**
   * Base URL of the API under test.
   * Auto-detected from playwright.config.ts `use.baseURL` if not provided.
   */
  baseURL?: string;

  /** Only track API calls whose paths match these glob patterns. */
  includePatterns?: string[];

  /** Ignore API calls whose paths match these glob patterns. */
  excludePatterns?: string[];

  consoleOutput?: {
    enabled?: boolean;            // @default true
    showUncoveredOnly?: boolean;  // @default false
    showOperations?: boolean;     // @default true — per-operation table
    showParams?: boolean;         // @default false
    showBodyProperties?: boolean; // @default false
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

  threshold?: {
    // Plain number: informational warning only (respects failOnThreshold globally)
    endpoints?: number | { min: number; fail?: boolean };
    statusCodes?: number | { min: number; fail?: boolean };
    parameters?: number | { min: number; fail?: boolean };
    bodyProperties?: number | { min: number; fail?: boolean };
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

## Console output example

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
