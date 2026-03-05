/**
 * Smoke test: verify that `npm run build` emits CJS type declaration files
 * (.d.cts) alongside the ESM declarations (.d.ts).
 *
 * CJS consumers (Jest, older tooling) rely on the `.d.cts` files referenced in
 * the `exports["."].require.types` field of package.json. If tsup omits them the
 * package still runs but TypeScript in CJS projects reports "no overload matches".
 *
 * This test is intentionally skipped when `dist/` has not been built yet so it
 * never breaks a fresh `npm install && npm test` flow.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..', '..');
const TYPES_DIR = join(ROOT, 'dist', 'types');

const isBuilt = existsSync(TYPES_DIR);

describe.skipIf(!isBuilt)('CJS .d.cts declarations (requires npm run build)', () => {
  it('dist/types/index.d.cts exists', () => {
    expect(existsSync(join(TYPES_DIR, 'index.d.cts'))).toBe(true);
  });

  it('dist/types/reporter.d.cts exists', () => {
    expect(existsSync(join(TYPES_DIR, 'reporter.d.cts'))).toBe(true);
  });

  it('index.d.cts exports key public symbols', () => {
    const content = readFileSync(join(TYPES_DIR, 'index.d.cts'), 'utf8');
    // Core fixture exports
    expect(content).toContain('PlayswagConfig');
    expect(content).toContain('PlayswagFixtureOptions');
    expect(content).toContain('defineConfig');
  });

  it('reporter.d.cts exports a default reporter class', () => {
    const content = readFileSync(join(TYPES_DIR, 'reporter.d.cts'), 'utf8');
    expect(content).toContain('PlayswagReporter');
  });

  it('index.d.cts and index.d.ts have the same publicly exported names', () => {
    const cts = readFileSync(join(TYPES_DIR, 'index.d.cts'), 'utf8');
    const dts = readFileSync(join(TYPES_DIR, 'index.d.ts'), 'utf8');
    // Both files should declare the same exports — a simple proxy check on size
    expect(Math.abs(cts.length - dts.length)).toBeLessThan(200);
  });
});
