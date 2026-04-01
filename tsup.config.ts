import { defineConfig } from 'tsup';

export default defineConfig([
  // ESM build
  {
    entry: {
      index: 'src/index.ts',
      reporter: 'src/reporter.ts',
      cli: 'src/cli.ts',
    },
    outDir: 'dist/esm',
    format: ['esm'],
    dts: false,
    sourcemap: true,
    clean: true,
    external: ['@playwright/test'],
    target: 'node18',
    splitting: false,
    treeshake: true,
  },
  // CJS build
  {
    entry: {
      index: 'src/index.ts',
      reporter: 'src/reporter.ts',
    },
    outDir: 'dist/cjs',
    format: ['cjs'],
    dts: false,
    sourcemap: true,
    external: ['@playwright/test'],
    target: 'node18',
    splitting: false,
    treeshake: true,
  },
  // Type declarations — ESM (.d.ts)
  {
    entry: {
      index: 'src/index.ts',
      reporter: 'src/reporter.ts',
    },
    outDir: 'dist/types',
    format: ['esm'],
    dts: { only: true },
    external: ['@playwright/test'],
  },
  // Type declarations — CJS (.d.cts)
  {
    entry: {
      index: 'src/index.ts',
      reporter: 'src/reporter.ts',
    },
    outDir: 'dist/types',
    format: ['cjs'],
    dts: { only: true },
    external: ['@playwright/test'],
  },
]);
