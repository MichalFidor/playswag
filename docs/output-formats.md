# Output formats

Control which output formats playswag produces via the `outputFormats` array:

```ts
outputFormats: ['console', 'json', 'html', 'badge', 'junit', 'markdown'],
```

Default: `['console', 'json']`.

---

## Console

Always enabled by default. Prints a summary table to the terminal after each run:

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

Use `consoleOutput` options to expand per-operation tables, tag breakdowns, and status code detail. See [Configuration](./configuration.md#console-output-options) for full options.

---

## JSON

Writes a structured JSON file (default: `playswag-coverage.json`) to `outputDir`.

```ts
jsonOutput: {
  fileName: 'playswag-coverage.json',
  pretty: true,
},
```

### Schema

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

The JSON output is the input format accepted by `playswag merge`. See [CI integration — Merging reports](./ci-integration.md#merging-coverage-reports).

---

## HTML

Add `'html'` to `outputFormats` to generate a self-contained, zero-dependency HTML file:

```ts
outputFormats: ['console', 'json', 'html'],
htmlOutput: {
  fileName: 'playswag-coverage.html',
  title: 'My API Coverage',
},
```

After the run, the reporter prints a clickable link (suppressed when `CI=true`):

```
[playswag] HTML report → file:///path/to/playswag-coverage/playswag-coverage.html
```

The report includes:
- Summary cards with progress bars for all dimensions
- Operations table with **All / Covered / Uncovered** filter buttons and per-tag filtering
- Click any row to expand status codes, parameters, body properties, and the tests that hit it
- Unmatched hits section (calls that matched no spec operation)
- Dark / light theme toggle (persisted to `localStorage`)
- Visual style inspired by Swagger UI

---

## SVG badge

Add `'badge'` to `outputFormats` to write a shields.io-style SVG badge:

```ts
outputFormats: ['console', 'json', 'badge'],
badge: {
  dimension: 'endpoints',
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

## JUnit XML

Add `'junit'` to `outputFormats` to write a JUnit-compatible XML file:

```ts
outputFormats: ['console', 'json', 'junit'],
junitOutput: {
  fileName: 'playswag-junit.xml',
},
```

Each coverage dimension becomes a `<testcase>`. Threshold violations produce `<failure>` elements, making the report compatible with Jenkins, GitLab CI, and other JUnit-aware systems.

---

## Markdown

Add `'markdown'` to `outputFormats` to write a GitHub-flavoured Markdown report:

```ts
outputFormats: ['console', 'json', 'markdown'],
markdownOutput: {
  fileName: 'playswag-coverage.md',
  title: 'API Coverage Report',
  showUncoveredOperations: true,
},
```

The report contains a five-dimension summary table (with `↑ / ↓` delta indicators when history is enabled), a per-tag breakdown, and a list of uncovered operations. It renders correctly in GitHub pull requests, wiki pages, and `$GITHUB_STEP_SUMMARY`.
