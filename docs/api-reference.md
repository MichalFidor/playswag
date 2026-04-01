# API reference

Everything exported from `@michalfidor/playswag`.

---

## Fixtures & helpers

| Export | Kind | Description |
|---|---|---|
| `test` | Playwright fixture | Drop-in replacement for `@playwright/test`. All `request` calls are auto-tracked. |
| `expect` | Playwright helper | Re-exported from `@playwright/test` for convenience — no differences. |
| `defineConfig` | function | Typed wrapper around Playwright's `defineConfig`. Needed when using `playswagSpecs` inside `use` blocks (per-project specs). |
| `trackRequest` | fixture | Wrap a manually-created `APIRequestContext` so its calls are recorded. See [Multi-project — Custom request contexts](./multi-project.md#tracking-custom-request-contexts). |
| `ATTACHMENT_NAME` | constant | The attachment key playswag uses to pass hit data between workers and the reporter. Useful for custom downstream reporters. |

---

## Functions

| Export | Kind | Description |
|---|---|---|
| `mergeCoverageResults(...results)` | function | Merge 2+ `CoverageResult` objects into one. See [CI integration — Merging reports](./ci-integration.md#merging-coverage-reports). |
| `calculateCoverage(hits, spec, options)` | function | Compute coverage from raw hits + a parsed spec. Useful for custom pipelines that bypass the reporter. |
| `parseSpecs(sources)` | async function | Parse one or more OpenAPI/Swagger spec files into a `NormalizedSpec`. |

---

## Config types

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
| `GitHubActionsOutputConfig` | `githubActionsOutput: { … }` sub-object |
| `ThresholdConfig` | `threshold: { … }` sub-object |
| `ThresholdEntry` | Individual `{ min, fail }` threshold entry inside `ThresholdConfig` |
| `CoverageDimension` | Union type: `'endpoints' \| 'statusCodes' \| 'parameters' \| 'bodyProperties' \| 'responseProperties'` |

---

## Coverage result types

Returned as part of the JSON report. Useful if you consume the JSON output programmatically.

| Export | Represents |
|---|---|
| `CoverageResult` | Root object of the JSON report |
| `CoverageSummary` | The five top-level `{ endpoints, statusCodes, … }` percentages |
| `CoverageSummaryItem` | A single `{ covered, total, percentage }` dimension entry |
| `OperationCoverage` | Per-operation breakdown (method, path, params, body props, …) |
| `StatusCodeCoverage` | Coverage of a single response status code for an operation |
| `ParamCoverage` | Coverage of a single query / path / header parameter |
| `BodyPropertyCoverage` | Coverage of a single request body property |
| `ResponsePropertyCoverage` | Coverage of a single response body property |
| `EndpointHit` | A single recorded API call (method, url, status, headers, body) |
| `NormalizedSpec` | Parsed spec shape — `{ sources, operations }`. Input to `calculateCoverage`. |
| `AcknowledgedService` | Config entry for silencing known external service unmatched hits |
| `AcknowledgedServiceHits` | Per-service summary of acknowledged hits in the result |

---

## History types

Useful if you read the `playswag-history.json` file from a script or dashboard.

| Export | Represents |
|---|---|
| `HistoryEntry` | A single run's summary snapshot appended to the history file |
| `CoverageDelta` | Difference between two consecutive `CoverageSummary` values (used for `↑ / ↓` indicators) |
