# Changelog

All notable changes to `@michalfidor/playswag` are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[1.5.0]: https://github.com/MichalFidor/playswag/releases/tag/v1.5.0
[1.4.0]: https://github.com/MichalFidor/playswag/releases/tag/v1.4.0
[1.3.1]: https://github.com/MichalFidor/playswag/releases/tag/v1.3.1
[1.3.0]: https://github.com/MichalFidor/playswag/releases/tag/v1.3.0
[1.2.0]: https://github.com/MichalFidor/playswag/releases/tag/v1.2.0
[1.1.0]: https://github.com/MichalFidor/playswag/releases/tag/v1.1.0
[1.0.0]: https://github.com/MichalFidor/playswag/releases/tag/v1.0.0
