# Changelog

All notable changes to `@michalfidor/playswag` are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.8.2] — 2026-03-23

**Theme:** Parameter coverage parity — capture query params from URL-string calls.

### Fixed
- **Query parameters invisible when using URL string concatenation** — when tests used string-concatenated query parameters (e.g. `request.get(\`/users?limit=${n}\`)`) instead of Playwright's `{ params: {} }` option object, playswag recorded zero query-param coverage because only `options.params` was inspected. The fixture now also parses query parameters from `response.url()` (the resolved final URL) via `new URL(...).searchParams`, merging them with any explicit `options.params` (explicit params take precedence on key conflicts). This is a pure-fix with no config changes required.

---

## [1.8.1] — 2026-03-23

**Theme:** Reliability & performance — eliminate a post-run hang when fetching remote specs, deduplicate spec parsing in multi-project runs, and acknowledge known out-of-spec services.

### Added
- **`acknowledgedServices`** — new `PlayswagConfig` option that accepts an array of `{ pattern, label? }` entries. Unmatched API calls whose URL matches a declared pattern are silently removed from the yellow unmatched-hits warning and replaced with a brief informational note (e.g. `ℹ  12 call(s) to "auth-service" (**\/auth-service\/**) — excluded from tracking`). Useful when auxiliary services (auth, analytics, telemetry) are deliberately out of scope but would otherwise pollute the report. `AcknowledgedService` and `AcknowledgedServiceHits` are exported from the package entry point. The `acknowledgedHits` array is included in `CoverageResult` for use in custom output consumers.

### Fixed
- **Post-reporter hang when specs are fetched over HTTP** — after `SwaggerParser.dereference()` fetched a remote spec, Node.js's built-in `fetch` (undici) kept a keep-alive connection pool timer alive, preventing the event loop from draining. Depending on the spec server's `Keep-Alive` timeout this could delay Playwright's exit by up to ~120 s. Fixed by closing the undici global dispatcher (releasing all pooled connections) at the end of `onEnd()` and replacing it with a fresh `Agent` so subsequent `fetch` calls from other reporters continue to work. The fix is a no-op when specs are file-based or when undici's global dispatcher is not present.

### Performance
- **Spec-parse caching in multi-project mode** — `parseOne()` now caches its result by resolved URL/path. When multiple Playwright projects reference the same spec file or URL, `SwaggerParser.dereference()` is called only once per process instead of once per project.

---

## [1.8.0] — 2026-03-16

**Theme:** Visibility parity — surface more signal in every output format and suppress noise when needed.

### Added
- **Markdown delta indicators** — the Markdown report now includes a `Change` column showing `↑ / ↓` delta percentages when coverage history is enabled. `generateMarkdownReport` and `writeMarkdownReport` accept an optional `delta` parameter.
- **`consoleOutput.showUnmatchedHits`** — new boolean option (`@default true`) in `ConsoleOutputConfig`. Set to `false` to suppress the "N recorded API call(s) did not match any spec operation" section, useful when known out-of-spec calls are expected.
- **`githubActionsOutput.showUnmatchedHits`** — new boolean option (`@default false`) in `GitHubActionsOutputConfig`. When enabled, appends a collapsible `<details>` block to the step summary listing all unmatched API calls with their method, URL, and status code.
- **`githubActionsOutput.showUncoveredOperations`** — new boolean option (`@default false`) in `GitHubActionsOutputConfig`. Appends a collapsible uncovered operations section to the step summary.
- **`excludeDimensions` + `responsePropertiesWeight`** — documented in README config reference (introduced in v1.7.0 but undocumented).
- **`GitHubActionsOutputConfig`** — exported from the package entry point so consumers can type the `githubActionsOutput` sub-object.

### Fixed
- **Console unmatched hits unreachable** — the unmatched hits block was silently skipped when the operations list was empty or `showOperations: false`. It is now shown in all code paths.

### Changed
- README config reference updated: `consoleOutput` snippet now documents `showStatusCodeBreakdown`, `showOperationId`, and `showUnmatchedHits`; `githubActionsOutput` block added; `GitHubActionsOutputConfig` added to the exported types table.

---

## [1.7.0] — 2026-03-12

**Theme:** Signal quality — distinguish observed response properties from actively sent request fields, surface coverage confidence, and tighten the public API surface.

### Added
- **Progress indicator** — a styled `[playswag] ⠼  Calculating coverage…` spinner (cyan tag,
  dim frame — matching all other log output) is shown between test completion and the coverage
  report. On CI / non-TTY / `NO_COLOR` environments it degrades to plain lines.
- **Response property observation tier** — response body properties are now visually
  distinguished from request fields in both the HTML report (yellow badges instead of green)
  and the console legend. A pill labelled "observed" appears on the "Response Properties"
  section header, and a legend (`● sent / ● observed / ● missing`) is printed below the
  console summary table.
- **Coverage confidence legend** — the HTML report now includes a legend block above the
  operations list explaining the `sent` / `observed` / `missing` badge tiers.
- **`responsePropertiesWeight`** — new `PlayswagConfiguration` option (`number`, `@default 0.5`).
  Controls how much weight response-property coverage contributes to the per-operation score
  shown in the HTML mini progress bar. Set to `0` to exclude response properties from the
  score; set to `1` to weight them equally with request dimensions.
- **`excludeDimensions`** — new `PlayswagConfiguration` option
  (`Array<'statusCodes' | 'parameters' | 'bodyProperties' | 'responseProperties'>`).
  Hides the specified dimensions from the console summary table, HTML summary cards, Markdown
  report, and JUnit test cases, and skips them when evaluating `threshold`. Raw data is still
  collected; `summary` and per-operation arrays in the JSON report are unaffected.
- **Public API reference** — new section in README documenting every export with its purpose
  and the context in which it is used.

### Fixed
- **HTML report log link** — the post-run log line now prints the relative path
  (`HTML report written to test-results/…/playswag-coverage.html`) instead of an absolute
  `file://` URL. Relative paths are auto-linked by VS Code's terminal; `file://` URLs are not.

### Removed
- **`badge.enabled`** — removed from `BadgeConfig`. Use `outputFormats: ['badge']` to generate
  the badge (consistent with every other output format).
- **`PlayswagConfig`** — removed export alias. Use `PlayswagConfiguration` in
  `playwright.config.ts`. The underlying interface shape is unchanged.
- **Internal exports** — the following were never part of the intended public API and have been
  removed from the package entry point: `generateHtmlReport`, `generateBadgeSvg`,
  `writeJUnitReport`, `generateMarkdownReport`, `writeMarkdownReport`, `compareCoverage`,
  `appendToHistory`, `loadLastEntry`, `loadAllEntries`, `isGitHubActions`, `emitAnnotations`,
  `writeStepSummary`, `NormalizedSpec`, `NormalizedOperation`, `ThresholdViolation`.

---

## [1.6.0] — 2026-03-09

**Theme:** Spec fidelity — surface spec information previously silently ignored.

### Added
- **Deprecated operation visibility** — `deprecated?: boolean` carried through `NormalizedOperation`
  → `OperationCoverage`; console ops table shows a dim `[deprecated]` suffix; HTML report shows an
  amber `deprecated` badge and strikethrough styling.
- **Cookie parameter coverage** — `case 'cookie'` in `schema-analyzer.ts` parses the `Cookie`
  request header (`name1=val1; name2=val2`) and marks parameters covered by name.
- **Markdown output format** — `outputFormats: ['markdown']` writes `playswag-coverage.md`;
  five-dimension summary table + per-tag breakdown + uncovered operations list.
  Configurable via `markdownOutput: { title, fileName, showUncoveredOperations }`.
- **Tag-based operation filtering** — `includeTags`/`excludeTags` in `PlayswagConfig` filter the
  spec operations counted in coverage; supports picomatch glob patterns (e.g. `'internal*'`).
- **Server URL variable substitution** — OAS3 `servers[0].url` entries with `{variable}`
  placeholders are now resolved using `servers[0].variables[name].default` before extracting the
  base path. If a variable has no `default`, a warning is emitted and the literal placeholder is
  kept.
- **`consoleOutput.showOperationId`** — when `true`, the `operationId` is appended (dimmed) after
  the path in the operations table, making it easy to correlate console rows with spec definitions.
  `@default false`.
- **`requiredParamsOnly`** — new top-level `PlayswagConfig` option; when `true`, only
  `required: true` parameters are tracked in the parameters coverage dimension, reducing noise
  from optional query parameters that are rarely supplied. `@default false`.
- **Nested body property tracking** — request and response body property coverage now recurses
  up to **3 levels deep** into nested objects. Sub-properties are reported with dot-notation names
  (e.g. `address.street`, `address.street.number`). Top-level-only schemas are unaffected.
- **HTML report visual refresh** — the HTML report now closely mirrors the look and feel of the
  Swagger UI: cleaner typography, tighter spacing, a colour palette aligned with the Swagger colour
  scheme, and an operation-detail layout that matches the familiar Swagger accordion style.
- **11 new unit tests** across `parser`, `calculator`, `schema-analyzer`, and `console` suites.
  Total: **344 tests**.

---

## [1.5.4] — 2026-03-05

**Theme:** HTML report redesign + version display bug fix.

### Added
- **HTML report redesign** — collapsible tag-group rows (operations grouped by
  their first OpenAPI tag; tagless operations under "General"); mini per-operation
  progress bar + ✓/✗ icon in the Coverage column; accent gradient strip at the
  top of the page; auto-fill summary card grid; larger 64 × 64 logo in the
  header; dark-mode aware card hover animation.
- **Separated meta-bar** — date/time, spec file names, and test count pills now
  live in a slim bar below the sticky header rather than inside it, keeping the
  header clean.
- **`npm run demo` script** — builds the project and generates a rich
  self-contained `demo-report.html` with 18 operations across 5 tag groups,
  realistic coverage data, and 6 mocked history entries so sparklines are
  always visible.
- **Coverage history README section** expanded — documents the JSON file format,
  the 2-entry threshold for sparklines/delta indicators, and two CI persistence
  strategies (commit-to-git and Actions cache).

### Fixed
- **`vunknown` footer bug** — `readPlayswagVersion()` in the Playwright reporter
  resolved `../package.json` relative to the built `dist/esm/reporter.js`,
  pointing at the non-existent `dist/package.json`. Both the `readFileSync` and
  `createRequire` fallback paths now correctly use `../../package.json`.

---

## [1.5.3] — 2026-03-05

Re-release of 1.5.0 — no code changes. See [1.5.0] for full release notes.

## [1.5.0] — 2026-03-05

**Theme:** DX, quality & URL support — friction reduction for real-world
integrations plus internal health improvements.

### Added
- **`defineConfig` export** — typed wrapper around Playwright's `defineConfig`
  that makes `playswagSpecs` and `playswagBaseURL` first-class fixture options;
  import from `@michalfidor/playswag` instead of `@playwright/test` to get
  full IntelliSense in project `use` blocks.
- **Colored log output** (`src/log.ts`) — `log.info` (cyan `✓`), `log.warn`
  (yellow `⚠` + optional dim hint), `log.error` (red `✖`). Respects the
  `NO_COLOR` / `FORCE_COLOR` environment conventions and `isTTY`. All
  user-facing messages across every reporter module now use this logger.
- **Schemeless URL spec support** — spec sources that look like bare
  `hostname.tld/path` URLs (no `https://`) are automatically resolved to
  `https://…` with a colored warning and an actionable hint line. Prevents
  silent ENOENT when environment variables omit the scheme.
- **CJS `.d.cts` declarations** — tsup now emits `dist/types/index.d.cts` and
  `dist/types/reporter.d.cts` alongside the ESM `.d.ts` files so CommonJS
  consumers (Jest, older tooling) get correct TypeScript types.
- **Operation index for the matcher** — `buildOperationIndex` pre-groups
  operations by `METHOD:firstLiteralSegment`. `matchOperation` accepts an
  optional `OperationIndex`; `calculateCoverage` builds one per run so each hit
  resolves in O(candidates) rather than O(all operations). Significant speedup
  for specs with 100+ operations.
- 16 new unit tests (11 matcher index + 5 CJS smoke). Total: **279 tests**.

### Changed
- **`runOutputsForGroup` decomposed** — extracted five single-responsibility
  private helpers: `emitJsonOutput`, `emitHtmlOutput`, `emitBadgeOutput`,
  `emitJUnitOutput`, `saveHistoryData`. The orchestrator method is now ~30 lines.
- **README refreshed** — added coverage history, JUnit XML, GitHub Actions step
  summary, and `showResponseProperties` / `showTags` sections; updated
  `defineConfig` import examples; added per-dimension `{ min, fail }` threshold
  syntax to the config reference.

### Removed
- **`captureResponseBody` from `PlayswagConfig`** — this field was dead code; it
  had been superseded by the fixture-level `PlayswagFixtureOptions.captureResponseBody`
  option. Removing it eliminates a confusing duplicate. Use `test.use({ captureResponseBody: false })` instead.

### Fixed
- `console.warn/error/log` calls that leaked raw `[playswag]` strings to plain
  process output are now routed through the new colored logger.

---

## [1.4.0] — 2026-02-15

**Theme:** Multi-project support and developer experience.

### Added
- **Per-project spec and base URL** — set `playswagSpecs` and `playswagBaseURL`
  in a Playwright project's `use` block to run isolated coverage per service.
  The reporter writes each project's output to `outputDir/<projectName>/`.
- **`PlayswagConfiguration` type alias** — preferred public name for
  `PlayswagConfig`; avoids collision with Playwright's own `Config` type.
- **Comprehensive JSDoc** on all config interfaces (`ConsoleOutputConfig`,
  `HtmlOutputConfig`, `BadgeConfig`, `HistoryConfig`, `JUnitOutputConfig`,
  `ThresholdConfig`, `PlayswagFixtureOptions`).
- **Response properties column** in the console per-operation table (`Resp Props`)
  and `showResponseProperties` expand option.
- **Examples directory** (`tests/examples/`) — one runnable Playwright config
  per configuration scenario, plus a vitest E2E runner (`runner.test.ts`) that
  spawns real Playwright sub-processes and asserts exit codes and output files.
- E2E example tests added to the CI workflow.
- `playswagBaseURL` fixture option for per-project base URL overrides.

---

## [1.3.1] — 2026-01-30

### Fixed
- Response body capture: replaced `response.json()` with
  `response.body() + JSON.parse()` to avoid Playwright's "body already consumed"
  error when tests inspect the response after the fixture does.

---

## [1.3.0] — 2026-01-28

**Theme:** Five-dimension coverage — track what came back, not just what was sent.

### Added
- **Response body / schema coverage** as the 5th dimension (`responseProperties`).
  The fixture now captures `response.body()` when `captureResponseBody: true`
  (the default). Top-level schema properties defined in `responses[code].content`
  are pre-seeded and marked covered when observed in the actual response.
- `analyzeResponseProperties` in `schema-analyzer.ts`.
- `responseProperties` in `CoverageSummary`, `OperationCoverage`, `ThresholdConfig`,
  and `BadgeConfig.dimension`.
- `showResponseProperties` console output option.
- `captureResponseBody` fixture option (per-test opt-out for large binary payloads).
- OAS3 response schema extraction in the parser.

---

## [1.2.0] — 2026-01-10

**Theme:** CI integration and coverage history.

### Added
- **Coverage history** — each run appends a `HistoryEntry` to a JSON file.
  The HTML report renders sparklines; the console report shows `↑ / ↓` delta
  indicators. Configurable via `history: { enabled, maxEntries, fileName }`.
- **Per-tag coverage** — `tagCoverage` in `CoverageResult`; `showTags` console
  option prints a summary table per OpenAPI tag.
- **GitHub Actions annotations** — threshold violations emit `::warning::` annotations
  visible on the Actions summary page.
- **GitHub Actions step summary** — a Markdown coverage table is written to
  `$GITHUB_STEP_SUMMARY` automatically when `GITHUB_ACTIONS=true`.
- **JUnit XML output** — add `'junit'` to `outputFormats`. Each dimension becomes
  a `<testcase>`; violations produce `<failure>` elements. Compatible with Jenkins,
  GitLab CI, and other JUnit-aware systems.

---

## [1.1.0] — 2025-12-20

**Theme:** Visual reporting.

### Added
- **Standalone HTML report** — self-contained single-file, zero-CDN. Summary
  cards with progress bars, per-operation expandable detail, per-tag filter
  buttons, dark/light theme toggle persisted to `localStorage`.
- **SVG badge** — shields.io-compatible; configurable dimension, label, and
  file name. Colour thresholds: green ≥ 80 %, orange ≥ 50 %, red < 50 %.
- **Request body property pre-seeding** — all spec-defined body properties are
  now pre-seeded as `covered: false` so uncovered operations show what could be
  covered, rather than showing an empty list.

---

## [1.0.0] — 2025-12-01

Initial public release.

### Features
- Four-dimension API coverage: **endpoints**, **status codes**, **parameters**,
  **body properties**.
- Transparent `request` fixture wrapper — drop-in replacement with no test changes
  required.
- Multi-worker safe via Playwright test attachments (`playswag-hits`).
- Per-operation `serverBasePath` extracted from OAS3 `servers[0].url` /
  OAS2 `basePath`; enables multi-service specs in a single reporter.
- Swagger 2.0 and OpenAPI 3.0 / 3.1 support via `@apidevtools/swagger-parser`.
- Console report with progress bars, JSON report, threshold enforcement.
- `includePatterns` / `excludePatterns` glob filtering.
- `trackRequest` fixture for custom `APIRequestContext` instances.

[1.8.1]: https://github.com/MichalFidor/playswag/releases/tag/v1.8.1
[1.5.0]: https://github.com/MichalFidor/playswag/releases/tag/v1.5.0
[1.4.0]: https://github.com/MichalFidor/playswag/releases/tag/v1.4.0
[1.3.1]: https://github.com/MichalFidor/playswag/releases/tag/v1.3.1
[1.3.0]: https://github.com/MichalFidor/playswag/releases/tag/v1.3.0
[1.2.0]: https://github.com/MichalFidor/playswag/releases/tag/v1.2.0
[1.1.0]: https://github.com/MichalFidor/playswag/releases/tag/v1.1.0
[1.0.0]: https://github.com/MichalFidor/playswag/releases/tag/v1.0.0
