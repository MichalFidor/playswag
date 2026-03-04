import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json'],
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts'],
    },
  },
  resolve: {
    // Allow TypeScript path imports with .js extension (Node16 moduleResolution)
    extensionAlias: {
      '.js': ['.ts', '.js'],
    },
  },
});
