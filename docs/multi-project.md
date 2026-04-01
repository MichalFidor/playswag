# Multi-project setup

Playswag supports Playwright configs with multiple projects targeting different services, as well as custom request contexts and per-file opt-out.

---

## Per-project spec and base URL

When your config has multiple projects targeting different services, point each project at its own OpenAPI spec. The reporter runs a separate coverage calculation per project and writes each report to `outputDir/<projectName>/`.

```ts
// playwright.config.ts
import { defineConfig } from '@michalfidor/playswag';

export default defineConfig({
  reporter: [
    ['@michalfidor/playswag/reporter', {
      outputDir: './coverage',
      outputFormats: ['json'],
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

> Projects that do **not** declare `playswagSpecs` fall back to the reporter-level `specs` and their hits are grouped together in the root `outputDir`.

---

## Per-project acknowledged services

When a project talks to services outside its own spec (e.g. an auth provider), you can acknowledge those per-project to avoid noise in unmatched hits:

```ts
projects: [
  {
    name: 'users-service',
    use: {
      baseURL: 'http://localhost:3000',
      playswagSpecs: './specs/users.yaml',
      playswagAcknowledgedServices: [
        { pattern: 'https://auth.internal/**', label: 'auth-service' },
      ],
    },
  },
],
```

Per-project entries are merged with the global `acknowledgedServices` list.

---

## Per-project / per-file opt-out

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

---

## Tracking custom request contexts

The built-in `request` fixture is wrapped automatically. If your tests use **additional `APIRequestContext` instances** — created with `request.newContext()` or returned by a custom fixture — use the `trackRequest` fixture to wrap them:

```ts
import { test, expect } from '@michalfidor/playswag';

test('uses a second context', async ({ request, trackRequest }) => {
  const adminCtx = trackRequest(
    await request.newContext({ extraHTTPHeaders: { 'x-role': 'admin' } })
  );
  const res = await adminCtx.get('/api/admin/stats');
  expect(res.ok()).toBeTruthy();
});
```

`trackRequest` is most useful inside **custom fixtures**:

```ts
import { test as base } from '@michalfidor/playswag';

const test = base.extend<{ adminRequest: import('@playwright/test').APIRequestContext }>({
  adminRequest: async ({ trackRequest }, use) => {
    const raw = await ContextFactory.getContextByUserAccessToken('admin');
    await use(trackRequest(raw));
  },
});

export { test };
```

All calls made through any `trackRequest`-wrapped context are recorded alongside calls from the main `request` fixture and contribute to the coverage report.

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
