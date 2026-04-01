# Playswag 

![playswag logo](assets/logo.png)

> Playwright API coverage tracking against Swagger / OpenAPI specifications.

`playswag` transparently wraps Playwright's built-in `request` fixture to record every API call made during your tests, then compares the results against your OpenAPI spec(s) to report coverage across five dimensions:

| Dimension | What it measures |
|-----------|------------------|
| **Endpoints** | Which path + method combinations were called |
| **Status codes** | Which response codes defined in the spec were exercised |
| **Parameters** | Which query/path/header params were supplied |
| **Body properties** | Which request body fields were provided |
| **Response properties** | Which response body fields were observed |

Works with **multiple workers** out of the box — per-worker data is collected via test attachments and aggregated in the reporter process.

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
import { defineConfig } from '@michalfidor/playswag';

export default defineConfig({
  reporter: [
    ['list'],
    ['@michalfidor/playswag/reporter', {
      specs: ['./openapi.yaml'],
      outputDir: './playswag-coverage',
      outputFormats: ['console', 'json'],
      threshold: { endpoints: 80, statusCodes: 60 },
    }],
  ],
  use: {
    baseURL: 'https://api.example.com',
  },
});
```

### 3. Run your tests

```bash
npx playwright test
```

Coverage is printed to the terminal and written to `./playswag-coverage/playswag-coverage.json`.

---

## Documentation

| Guide | Description |
|-------|-------------|
| [Configuration](docs/configuration.md) | Full config reference — all reporter options, thresholds, console/JSON/HTML/badge/JUnit/markdown settings |
| [Output formats](docs/output-formats.md) | Console, HTML, JSON, SVG badge, JUnit XML, and Markdown output details |
| [Multi-project setup](docs/multi-project.md) | Per-project specs, per-file opt-out, custom request contexts, multiple spec files |
| [CI integration](docs/ci-integration.md) | GitHub Actions auto-detection, merging reports from parallel jobs (project-based, sharded, mixed), best practices |
| [Coverage history](docs/coverage-history.md) | Sparkline trends, delta indicators, persisting history across CI runs |
| [API reference](docs/api-reference.md) | All public exports — fixtures, functions, config types, result types |

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
                                     calculate 5-dimension coverage
                                     print console report
                                     write output files
```

Data flows from each worker to the reporter via Playwright's built-in test attachment IPC — no temp files, no shared state, no locking required. Works correctly with any number of parallel workers.

---

## License

MIT
