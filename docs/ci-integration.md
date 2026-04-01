# CI integration

Playswag has built-in support for GitHub Actions and a CLI for merging coverage reports from parallelized CI runs.

---

## GitHub Actions

When `GITHUB_ACTIONS=true` playswag automatically:

1. **Emits annotations** — threshold violations appear as warning annotations on the summary page.
2. **Writes a step summary** — a Markdown table with coverage results is appended to `$GITHUB_STEP_SUMMARY` and shown in the Actions UI. Includes `↑ / ↓` delta indicators when [history](./coverage-history.md) is enabled.

No configuration required. Both features activate only inside GitHub Actions.

### Step summary extras

```ts
githubActionsOutput: {
  showUncoveredOperations: true,  // collapsible section listing uncovered operations
  showUnmatchedHits: true,        // collapsible section listing unmatched API calls
},
```

---

## Merging coverage reports

When your CI runs tests across multiple jobs — whether by **project-based splitting**, **sharding**, or **matrix strategies** — each job produces its own JSON report. The `playswag merge` CLI combines them into a single unified report.

### CLI usage

```bash
# Merge two or more JSON reports
npx @michalfidor/playswag merge report-a.json report-b.json -o combined.json

# Merge with glob (shell expands the pattern)
npx @michalfidor/playswag merge reports/*.json -o combined.json

# Print a summary table + write HTML report
npx @michalfidor/playswag merge reports/*.json --console --html -o combined.json

# All output formats at once
npx @michalfidor/playswag merge reports/*.json --console --html --badge --markdown -o combined.json
```

| Option | Default | Description |
|---|---|---|
| `-o, --output <path>` | `merged-coverage.json` | Output JSON file path |
| `--console` | `false` | Print coverage summary table to the terminal |
| `--html` | `false` | Write a self-contained HTML report next to the output file |
| `--badge` | `false` | Write an SVG coverage badge next to the output file |
| `--markdown` | `false` | Write a Markdown coverage report next to the output file |
| `--no-pretty` | `false` | Write minified JSON |
| `-h, --help` | | Show help |

When running inside **GitHub Actions** (`GITHUB_ACTIONS=true`), the merge command automatically writes a step summary to `$GITHUB_STEP_SUMMARY` — no extra flags needed.

### Programmatic usage

```ts
import { mergeCoverageResults } from '@michalfidor/playswag';
import type { CoverageResult } from '@michalfidor/playswag';
import { readFileSync } from 'node:fs';

const users: CoverageResult = JSON.parse(readFileSync('users-coverage.json', 'utf8'));
const payments: CoverageResult = JSON.parse(readFileSync('payments-coverage.json', 'utf8'));

const combined = mergeCoverageResults(users, payments);
```

### How merging works

- Operations are matched by **method + path** across all inputs
- Coverage flags are **OR-unioned** — if any input marks an item as covered, it stays covered
- `testRefs` are deduplicated across inputs
- Summary statistics and tag coverage are **recomputed** from the merged operations
- `totalTestCount` is **summed** across all inputs
- `unmatchedHits` are deduplicated; `acknowledgedHits` counts are summed per pattern
- At least **2 results** are required; passing fewer throws an error

---

## CI workflow patterns

### Pattern 1: Project-based splitting

The most common setup — each Playwright project targets a different service, and each project runs in its own CI job via `package.json` scripts.

**`playwright.config.ts`** — each project has its own spec:

```ts
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
      testMatch: /users\..*\.spec\.ts/,
      use: {
        baseURL: 'http://localhost:3000',
        playswagSpecs: './specs/users.yaml',
      },
    },
    {
      name: 'payments-service',
      testMatch: /payments\..*\.spec\.ts/,
      use: {
        baseURL: 'http://localhost:3001',
        playswagSpecs: './specs/payments.yaml',
      },
    },
  ],
});
```

**`package.json`** — separate scripts per project:

```json
{
  "scripts": {
    "test:users": "playwright test --project=users-service",
    "test:payments": "playwright test --project=payments-service",
    "test:all": "playwright test"
  }
}
```

**`.github/workflows/test.yml`**:

```yaml
jobs:
  test:
    strategy:
      matrix:
        project: [users-service, payments-service]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npx playwright test --project=${{ matrix.project }}
      - uses: actions/upload-artifact@v4
        with:
          name: coverage-${{ matrix.project }}
          path: coverage/${{ matrix.project }}/playswag-coverage.json

  merge:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - uses: actions/download-artifact@v4
        with:
          pattern: coverage-*
          merge-multiple: true
          path: reports/
      - run: npx @michalfidor/playswag merge reports/*.json --console --html -o combined-coverage.json
      - uses: actions/upload-artifact@v4
        with:
          name: combined-coverage
          path: |
            combined-coverage.json
            playswag-coverage.html
```

### Pattern 2: Shard-based splitting

Playwright's built-in `--shard` flag distributes tests across parallel runners. All shards hit the same API but exercise different tests.

```yaml
jobs:
  test:
    strategy:
      matrix:
        shard: [1, 2, 3]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npx playwright test --shard=${{ matrix.shard }}/3
      - uses: actions/upload-artifact@v4
        with:
          name: coverage-shard-${{ matrix.shard }}
          path: playswag-coverage/playswag-coverage.json

  merge:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - uses: actions/download-artifact@v4
        with:
          pattern: coverage-shard-*
          merge-multiple: true
          path: shards/
      - run: npx @michalfidor/playswag merge shards/*.json --console -o combined-coverage.json
```

### Pattern 3: Mixed (projects + shards)

Combine both approaches when you have multiple services and want to shard within each:

```yaml
jobs:
  test:
    strategy:
      matrix:
        project: [users-service, payments-service]
        shard: [1, 2]
    steps:
      - run: npx playwright test --project=${{ matrix.project }} --shard=${{ matrix.shard }}/2
      - uses: actions/upload-artifact@v4
        with:
          name: coverage-${{ matrix.project }}-shard-${{ matrix.shard }}
          path: coverage/${{ matrix.project }}/playswag-coverage.json

  merge:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/download-artifact@v4
        with:
          pattern: coverage-*
          merge-multiple: true
          path: reports/
      - run: npx @michalfidor/playswag merge reports/*.json --console -o combined-coverage.json
```

---

## Best practices

1. **Always use `outputFormats: ['json']`** in CI — the JSON file is the input for merging. Console output is nice for logs but isn't machine-readable.

2. **Use unique artifact names** — include the matrix variable in the artifact name (`coverage-${{ matrix.project }}`) to avoid upload collisions.

3. **Merge as a separate job** — keep the merge step in its own job with `needs: test` so it only runs after all test jobs succeed.

4. **Apply thresholds on the merged result** — rather than setting thresholds on individual project reports, apply thresholds when consuming the merged output (e.g. in a script that reads the combined JSON).

5. **Combine with history** — run history tracking on the merged report to get meaningful trend data across all projects:

   ```bash
   # In the merge job, after merging
   npx @michalfidor/playswag merge reports/*.json -o combined-coverage.json
   # Then use the combined JSON as input to your next full run or dashboard
   ```

6. **Keep per-project specs in version control** — store specs alongside the code in `specs/` or `openapi/` so they stay in sync with the API.

7. **Upload the merged report** — save the combined JSON as an artifact for debugging or downstream consumption (dashboards, badges, etc.).
