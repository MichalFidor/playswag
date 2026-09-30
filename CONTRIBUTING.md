# Contributing to playswag

Thank you for considering contributing! This document covers everything you need to know to get started.

---

## Table of Contents

- [Development setup](#development-setup)
- [Making changes](#making-changes)
- [Commit conventions](#commit-conventions)
- [Versioning strategy](#versioning-strategy)
- [Releasing a new version](#releasing-a-new-version)
- [Code style & conventions](#code-style--conventions)
- [Project architecture](#project-architecture)

---

## Development setup

```bash
# Clone the repo
git clone https://github.com/MichalFidor/playswag.git
cd playswag

# Use Node 24 for development, then install locked dependencies
npm ci

# Run the same full validation as CI
npm run validate

# Or run just unit tests (builds the package first)
npm test

# Type-check (no emitting)
npm run typecheck

# Build ESM + CJS + type declarations
npm run build
```

### Testing the build locally against a consumer project

The repo ships a helper script, `dev-link.sh`, that rebuilds the package and
installs it directly into a consumer project via `npm pack` + `npm install`.
This avoids the duplicate-module problems (`@playwright/test` loaded twice) that
`npm link` causes with peer dependencies.

```bash
# Rebuild playswag and install it into your consumer project
./dev-link.sh /path/to/your-test-project
```

The script will:
1. Run `npm run build` to produce a fresh `dist/`.
2. Call `npm pack` to create a local `.tgz` tarball (automatically cleaned up).
3. Run `npm install file:<tarball>` in the consumer project so Node resolves all
   peer dependencies (`@playwright/test`, etc.) from the consumer's own
   `node_modules` — not from playswag's.

> **Note:** You need to re-run the script every time you change source files.
> The `.tgz` artefact is gitignored via `*.tgz` so it will never be committed.

---

## Making changes

1. Fork the repository and create a feature branch off `main`:
   ```bash
   git checkout -b feat/my-feature
   ```
2. Make your changes, keeping the [coding conventions](#code-style--conventions) in mind.
3. Add or update **unit tests** in `tests/unit/`. Every new exported function must have test coverage.
4. Ensure `npm run validate` and `npm audit --audit-level=high` pass. Validation checks source, test and config types, lint, V8 coverage, integration/examples and an isolated npm tarball consumer. CLI tests run the built CLI without downloading a runner.
5. Open a pull request against `main` with a clear description of *what* changed and *why*.

---

## Commit conventions

Commits are written in [Conventional Commits](https://www.conventionalcommits.org/) format:

```
<type>(<scope>): <short description>

[optional body]

[optional footer]
```

| Type       | When to use |
|------------|-------------|
| `feat`     | A new user-facing feature |
| `fix`      | A bug fix |
| `perf`     | A performance improvement with no API change |
| `refactor` | Code restructure with no behaviour change |
| `test`     | Adding or updating tests only |
| `docs`     | Documentation changes only |
| `chore`    | Build scripts, CI, deps — nothing user-facing |
| `ci`       | Changes to GitHub Actions workflows |

**Breaking changes** must add a `!` after the type and include `BREAKING CHANGE:` in the footer:

```
feat!: remove serverBasePath from NormalizedSpec

BREAKING CHANGE: NormalizedSpec no longer exposes serverBasePath.
Use op.serverBasePath on each NormalizedOperation instead.
```

---

## Versioning strategy

`playswag` follows [Semantic Versioning](https://semver.org/) (`MAJOR.MINOR.PATCH`):

| Version component | Increment when… | Example |
|---|---|---|
| **MAJOR** (`x.0.0`) | A breaking change is introduced — any public API is removed, renamed, or its contract changes in an incompatible way. Includes removing a field from `NormalizedSpec`, changing a function signature, or dropping Node version support. | `1.0.0 → 2.0.0` |
| **MINOR** (`1.x.0`) | A new backward-compatible feature is added — new config option, new output dimension, new exported function. | `1.0.0 → 1.1.0` |
| **PATCH** (`1.0.x`) | A backward-compatible bug fix — wrong percentage calculation, incorrect glob matching, a crash fix. | `1.0.0 → 1.0.1` |

### Quick cheat-sheet

```
Bug fix?           → bump PATCH  e.g. 1.0.0 → 1.0.1
New feature?       → bump MINOR  e.g. 1.0.1 → 1.1.0
Breaking change?   → bump MAJOR  e.g. 1.1.0 → 2.0.0
```

---

## Releasing a new version

Releases are fully automated via the [release workflow](.github/workflows/release.yml).  
A human only needs to:

The required order is **pull request → review and approval → merge into main → release tag**. Prepare the version and changelog in the pull request. Create the tag on the merged commit; publishing and recovery workflows reject commits that are not ancestors of `main`. A recovery dispatch must run on the same tag it publishes so provenance identifies that source.

1. **Decide the next version** using the table above.
2. **Update `package.json`**:
   ```bash
   npm version patch   # or: minor / major
   ```
   This bumps `package.json`, creates a git commit, and creates a local tag.
3. **Push the commit and tag**:
   ```bash
   git push && git push --tags
   ```
4. The workflow triggers automatically on any `v*.*.*` tag:
   - Reuses the complete CI validation, including the external examples pinned by commit and the Petstore image pinned by digest.
   - Tests the packed consumer with current and minimum supported Playwright; checks runtime imports on Node 20.0.0, 22 and 24.
   - Verifies that the tag matches `package.json` version.
   - Publishes to [npm](https://www.npmjs.com/package/@michalfidor/playswag) via **trusted publishing** (OIDC + `--provenance`).
   - Publishes the exact validated tarball and creates the GitHub Release only after npm publication succeeds. A matching changelog entry is required.

> **Before releasing**, configure npm **Trusted Publisher** for this repo  
> (`npmjs.com` → package `@michalfidor/playswag` → **Settings → Trusted Publisher** → GitHub Actions, workflow filename `release.yml`). Configure `republish-npm.yml` separately if recovery publishing is needed. See [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/). There is no automatic token fallback.
> Run recovery on that same tag, for example `gh workflow run republish-npm.yml --ref vX.Y.Z -f tag=vX.Y.Z`; mismatched dispatch and input refs are rejected so provenance identifies the published source. Recovery validates the selected tag with the same CI workflow and therefore requires that tag to contain the current validation scripts. Older tags fail validation instead of bypassing it.
> If a Release run passes validation but fails during publication, its retained `validated-package` artifact can be recovered without repeating validation. Dispatch `republish-npm.yml` on the release tag and pass both that tag and the failed run ID. The tag must contain recovery support and already be merged into `main`. The workflow verifies the run name, event, tag, commit SHA, conclusion and tarball version before publishing that exact artifact.

CI performs the full suite once on Node 24, followed by lightweight runtime checks on Node 20.0.0 and 22. V8 minimums are 85% lines/functions, 80% statements and 75% branches. CLI subprocess tests provide behavioral coverage; their lines are not instrumented by the parent V8 run.

When adopting this workflow, update required branch checks to `Validate package`; old `Test (Node …)` and `Smoke — playswag-examples repo` contexts no longer exist. Keep the separately configured CodeQL check enabled.

---

## Code style & conventions

See [.github/copilot-instructions.md](.github/copilot-instructions.md) for the full list.  
The highlights:

- **TypeScript strict mode** — `strict: true`. No `any` without a comment justifying it.
- **`.js` extensions in all local imports** — required for Node16 module resolution.
- **No silent `catch {}`** — always `console.warn('[playswag] ...')` when swallowing an error.
- **Prefix error messages with `[playswag]`** so users can grep their output.
- **Pure core functions** — `calculateCoverage`, `matchOperation`, `checkThresholds` etc. must remain pure (no I/O, no side effects). All I/O belongs in `reporter.ts`, `console.ts`, `json.ts`.
- **Glob matching** — use `picomatch.isMatch()`. Never hand-roll regex-based globs.
- **DRY counting** — use `countCoveredItems(selector)` in `calculator.ts` instead of ad-hoc loops.

---

## Project architecture

```
src/
  index.ts               – public API re-exports
  reporter.ts            – Playwright reporter (aggregates per-worker attachment data)
  fixture.ts             – trackRequest / request fixture wrapper
  coverage/
    calculator.ts        – pure: hits[] + NormalizedSpec → CoverageResult
    schema-analyzer.ts   – parameter / body-property coverage from a single hit
  openapi/
    matcher.ts           – URL + method → NormalizedOperation lookup
    parser.ts            – YAML/JSON spec → NormalizedSpec (OAS2 + OAS3)
  output/
    console.ts           – printConsoleReport + checkThresholds
    json.ts              – writeJsonReport
  types.ts               – all shared TypeScript interfaces

tests/
  unit/                  – vitest, with isolated filesystem and localhost transport regressions
  integration/           – full Playwright tests against a mock HTTP server
```

For the full design rationale, see [.github/copilot-instructions.md](.github/copilot-instructions.md).
