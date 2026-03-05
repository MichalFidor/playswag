# GitHub Copilot Instructions for `playswag`

## Project Overview

`playswag` is a zero-config Playwright API coverage tracker. It wraps Playwright's `request` fixture
to record every outgoing HTTP call during a test run, then compares the recorded calls against one or
more OpenAPI/Swagger specs to produce a four-dimension coverage report:

| Dimension | Description |
|-----------|-------------|
| Endpoints | Which `method + path` combos were exercised |
| Status codes | Which response codes defined in the spec were returned |
| Parameters | Which query/path/header params were supplied |
| Body properties | Which request body fields were populated |

---

## Repository Layout

```
src/
  index.ts               – public API re-exports
  reporter.ts            – Playwright reporter (aggregates per-worker attachment data)
  fixture.ts             – `trackRequest` / `request` fixture wrapper
  coverage/
    calculator.ts        – pure function: hits[] + NormalizedSpec → CoverageResult
    schema-analyzer.ts   – parameter / body-property coverage from a single hit
  openapi/
    matcher.ts           – URL + method → NormalizedOperation lookup
    parser.ts            – YAML/JSON spec → NormalizedSpec (OAS2 + OAS3)
  output/
    console.ts           – printConsoleReport + checkThresholds
    json.ts              – writeJsonReport
  types.ts               – all shared TypeScript interfaces

tests/
  unit/                  – vitest unit tests (no Playwright, no network)
  integration/           – full Playwright tests run against a mock HTTP server
  examples/              – one config per scenario + E2E runner (npm run test:examples)

dist/                    – tsup output (ESM + CJS + .d.ts), gitignored
```

---

## Architecture & Key Design Decisions

### Multi-worker safety
Each Playwright worker runs independently. The `fixture.ts` proxy records hits **per worker** and
attaches them as a JSON attachment named `playswag-hits` to each test. The Playwright `reporter.ts`
picks up those attachments in `onTestEnd` (runs in the main process) and aggregates before writing output.

### Per-operation `serverBasePath`
Every `NormalizedOperation` carries its own `serverBasePath` (extracted from OAS3 `servers[0].url`
or OAS2 `basePath`). The matcher strips this prefix from recorded URLs before comparing. This means a
single reporter instance can track coverage across multiple services with different base paths — each
operation knows its own prefix.  
**Do not add a top-level `serverBasePath` to `NormalizedSpec`** — that field was removed as YAGNI.

### `NormalizedSpec` is immutable after parsing
`parseSpecs()` returns a frozen shape. The calculator only reads from it; mutations go into `opMap`
(a local `Map<string, OperationCoverage>` keyed by `method:path`).

### Pure core, async shell
`calculateCoverage`, `matchOperation`, `checkThresholds`, `analyzeParameters`, `analyzeBodyProperties`
are all pure synchronous functions — easy to unit-test. All I/O (file reads, network, stdout) lives at
the edges (`reporter.ts`, `console.ts`, `json.ts`).

### Build: dual ESM + CJS via tsup
`tsup.config.ts` produces:
- `dist/esm/` — native ESM (`.js`)
- `dist/cjs/` — CJS (`.cjs`)
- `dist/types/` — `.d.ts` + `.d.cts` declarations

The source is always ESM (`"type": "module"` in `package.json`). tsup handles transpilation.
Target runtime: **Node ≥ 18** (`"engines": { "node": ">=18.0.0" }`).

---

## Coding Conventions

- **TypeScript strict mode** — `strict: true`, `exactOptionalPropertyTypes: false`.
- **ES2022 target** — `tsconfig.json` targets ES2022; use `Array.at()`, `Object.hasOwn()`,
  class static blocks, top-level `await` where appropriate.
- **No default exports from library modules** (except `reporter.ts` which Playwright requires).
- **Named exports only** in `index.ts`; keep the public surface small.
- **File extensions in imports** — always use `.js` extension in imports even for `.ts` source files
  (Node16 module resolution requirement).
- **Error messages** — prefix with `[playswag]` so users can grep their logs.
- **No silent catch blocks** — always `console.warn(...)` when swallowing an error.
- **DRY counting** — use `countCoveredItems(selector)` helper in `calculator.ts` instead of ad-hoc
  loops over each dimension.
- **Glob matching** — use `picomatch.isMatch(path, pattern)` (imported as default from `picomatch`).
  Never hand-roll regex-based glob substitution.

---

## Testing Guidelines

### Unit tests (`tests/unit/`)
- Use **vitest** only — no Playwright, no real network, no file system.
- One `describe` block per exported function. Cover the happy path, edge cases, and error paths.
- Mock `NormalizedSpec` inline — keep fixtures close to the tests that need them.
- The `makeResult(endpoints, statusCodes, parameters, bodyProperties)` helper in `console.test.ts`
  creates a minimal `CoverageResult` — reuse the pattern for other output tests.

### Integration tests (`tests/integration/`)
- Use `@playwright/test` with a local `MockServer` (defined in the same file).
- Reset mock server state before each test (`server.reset()` in `test.beforeEach`).
- Use the `request` fixture from `playswagFixtures` (not the raw Playwright one) so hits are tracked.

### Running tests
```bash
npm test              # vitest unit tests
npm run test:examples # vitest E2E examples runner
npm run build         # tsup build
npm run typecheck     # tsc --noEmit
```

---

## Examples (`tests/examples/`)

The examples directory serves two purposes simultaneously: it **documents** every reporter configuration option with a runnable Playwright config, and it **E2E-tests** those options via a vitest runner that spawns real Playwright sub-processes.

### Structure

```
tests/examples/
  api-calls.spec.ts          – shared spec: hits all 5 operations, all status codes, all params
  fixture-options.spec.ts    – demonstrates playswagEnabled / captureResponseBody via test.use()
  configs/                   – one *.config.ts per scenario (see table below)
  runner.test.ts             – vitest E2E runner: spawns playwright, asserts exit codes + files
  output/                    – generated by runner, gitignored

vitest.examples.config.ts    – sequential forks pool (maxForks: 1), 90 s per-test timeout
```

### Config scenarios

| Config file | What it demonstrates |
|---|---|
| `output-formats.config.ts` | All five output formats enabled simultaneously |
| `json-options.config.ts` | `jsonOutput.fileName`, `jsonOutput.pretty: false` |
| `html-options.config.ts` | `htmlOutput.fileName`, `htmlOutput.title` |
| `badge-options.config.ts` | `badge.dimension`, `badge.label`, `badge.fileName` |
| `junit-options.config.ts` | `junitOutput.fileName` |
| `thresholds-pass.config.ts` | `threshold` + `failOnThreshold: true` — all pass, exit 0 |
| `thresholds-fail.config.ts` | `threshold.statusCodes: 100` + `failOnThreshold: true` — violation, exit 1 |
| `thresholds-per-dimension.config.ts` | `{ min, fail }` per-dimension form |
| `filter-include.config.ts` | `includePatterns` — only matched paths counted |
| `filter-exclude.config.ts` | `excludePatterns` — matched paths dropped from coverage |
| `console-options.config.ts` | All `consoleOutput.showXxx` options |
| `history-options.config.ts` | `history.maxEntries`, `history.fileName` |
| `fixture-options.config.ts` | `playswagEnabled: false` + `captureResponseBody: false` |
| `multi-project.config.ts` | `playswagSpecs` per project — isolated coverage per service |

### Conventions

- **No inline `//` comments** in example files — the code should be self-evident. Explanations live in the file-level `/** ... */` JSDoc block.
- **One config per scenario** — each file in `configs/` is a complete, standalone `defineConfig()` that targets port 3457 and writes output to `tests/examples/output/<scenario>/`.
- **Runner isolation** — `runner.test.ts` calls `rmSync(OUTPUT_DIR)` in `beforeAll` so every run starts clean. Tests run sequentially (single fork) to avoid port 3457 conflicts.
- **Port 3457** is reserved exclusively for examples. Integration tests use port 3456.
- When adding a new config option, add a matching config file + at least one assertion in `runner.test.ts`.

---

## Common Pitfalls

| Mistake | Correct approach |
|---------|-----------------|
| Reading `spec.serverBasePath` | Read `op.serverBasePath` on each `NormalizedOperation` |
| Silent `catch {}` | Always `console.warn(...)` with a descriptive message |
| Using `Array.includes()` in a hot loop for dedup | Prefer `Set` for O(1) membership |
| Adding a CJS `require()` call | Use `import` — tsup converts to CJS for consumers |
| Glob with custom regex | `picomatch.isMatch(path, pattern)` |
| Forgetting `.js` in local imports | Node16 resolution requires explicit `.js` extension |

---

## Dependency Philosophy

- **Zero runtime deps** where possible.
- When adding a dep, prefer one already used by Playwright (e.g. `picomatch`).
- Avoid deps that don't ship ESM or don't have types.
- `chalk` is a lazy dynamic import (stdout-only, optional usage pattern).
