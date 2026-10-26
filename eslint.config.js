import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores([
    '**/dist/**',
    '**/node_modules/**',
    'data/**',
    'apps/web/playwright-report/**',
    'apps/web/test-results/**',
  ]),

  js.configs.recommended,
  tseslint.configs.recommended,

  {
    languageOptions: { globals: globals.node },
    rules: {
      // An unused parameter is allowed when its name starts with "_" (Express error handlers need all four), and so is
      // a field taken out with `const { notes, ...rest } = form` to leave it out of `rest`.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', ignoreRestSiblings: true }],
    },
  },
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
  },

  // Boundary 1 (invariant 2): the rules engine and everything else in core/ knows nothing about HTTP.
  {
    files: ['apps/api/src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [{ name: 'express', message: 'core/ must not depend on HTTP. Keep Express in src/http/.' }],
          patterns: [
            {
              group: ['**/http', '**/http/**'],
              message: 'core/ must not import from src/http/. Pass plain values in, return plain values out.',
            },
          ],
        },
      ],
    },
  },

  // Boundary 2 (invariant 3): the web app talks to the API over HTTP only, and shares types via @pa/shared.
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/apps/api', '**/apps/api/**', '**/api/src/**', '@pa/api', '@pa/api/**'],
              message: 'apps/web may import only @pa/shared and its own files, never apps/api.',
            },
          ],
        },
      ],
    },
  },
]);
