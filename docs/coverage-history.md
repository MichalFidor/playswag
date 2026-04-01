# Coverage history

Playswag can persist a summary after each run, enabling sparkline trend charts in the HTML report and `↑ / ↓` delta indicators in the console output.

---

## Setup

Add `history` to the reporter config:

```ts
history: {
  enabled: true,               // @default true when the key is present
  maxEntries: 50,              // keep the last N runs   @default 50
  fileName: 'playswag-history.json',  // written to outputDir  @default 'playswag-history.json'
}
```

Omitting the `history` key entirely disables the feature (no file is written).

---

## What it does

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

---

## Persisting the file across CI runs

The history file must survive between runs — if it's deleted or never committed, sparklines reset on every run.

### Option A — commit the file to git

Simplest for most projects:

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

### Option B — cache the file in CI

Avoids commit noise:

```yaml
- uses: actions/cache@v4
  with:
    path: playwright-report/playswag-history.json
    key: playswag-history-${{ github.ref }}
    restore-keys: playswag-history-
```

> Delete the history file at any time to reset the trend data.
