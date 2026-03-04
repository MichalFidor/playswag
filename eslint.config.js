import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // ── ignore patterns ────────────────────────────────────────────────────────
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**'],
  },

  // ── base JS rules ──────────────────────────────────────────────────────────
  js.configs.recommended,

  // ── TypeScript rules ───────────────────────────────────────────────────────
  ...tseslint.configs.recommended,

  // ── project overrides ──────────────────────────────────────────────────────
  {
    files: ['src/**/*.ts', 'tests/**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.eslint.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Enforce `import type` for type-only imports — keeps runtime bundle clean
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],

      // Disallow `any` — use `unknown` and narrow instead
      '@typescript-eslint/no-explicit-any': 'error',

      // Unused variables are bugs; prefix with _ to opt out intentionally
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],

      // Prefer `??` over `||` for nullish coalescing
      '@typescript-eslint/prefer-nullish-coalescing': 'warn',

      // Prefer `?.` over manual checks
      '@typescript-eslint/prefer-optional-chain': 'warn',

      // No floating (unhandled) promises
      '@typescript-eslint/no-floating-promises': 'error',

      // Console is used intentionally for reporter output — allow all methods
      'no-console': 'off',
    },
  },

  // ── test-specific relaxations ─────────────────────────────────────────────
  {
    files: ['tests/**/*.ts'],
    rules: {
      // Test files may use non-null assertions freely
      '@typescript-eslint/no-non-null-assertion': 'off',
      // Test helpers often have looser types
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  }
);
