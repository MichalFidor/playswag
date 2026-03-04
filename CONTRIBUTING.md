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

# Install dependencies
npm install

# Run unit tests
npm test

# Type-check (no emitting)
npx tsc --noEmit

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
4. Ensure `npm test` and `npx tsc --noEmit` both pass with no errors.
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
| **MINOR** (`0.x.0`) | A new backward-compatible feature is added — new config option, new output dimension, new exported function. | `0.1.0 → 0.2.0` |
| **PATCH** (`0.0.x`) | A backward-compatible bug fix — wrong percentage calculation, incorrect glob matching, a crash fix. | `0.1.0 → 0.1.1` |

> **Note:** While the version is `0.x.y` (pre-`1.0.0`) the package is considered unstable.  
> Minor increments (`0.x`) may include breaking changes — this is normal pre-stable behaviour.  
> GitHub Releases for `0.x.y` tags are automatically marked as **pre-release**.

### Quick cheat-sheet

```
Bug fix?           → bump PATCH  e.g. 0.1.0 → 0.1.1
New feature?       → bump MINOR  e.g. 0.1.1 → 0.2.0
Breaking change?   → bump MAJOR  e.g. 0.2.0 → 1.0.0
```

---

## Releasing a new version

Releases are fully automated via the [release workflow](.github/workflows/release.yml).  
A human only needs to:

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
   - Runs type-check, unit tests, and build.
   - Verifies that the tag matches `package.json` version.
   - Publishes to [npm](https://www.npmjs.com/package/playswag).
   - Creates a GitHub Release with an auto-generated changelog.

> **Before releasing**, make sure you have `NPMJS_TOKEN` set as a repository secret  
> (`Settings → Secrets and variables → Actions → New repository secret`).

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
  unit/                  – vitest (no Playwright, no network)
  integration/           – full Playwright tests against a mock HTTP server
```

For the full design rationale, see [.github/copilot-instructions.md](.github/copilot-instructions.md).
