import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'coverage', '.claude/**', 'test-results', 'playwright-report', 'blob-report']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs['recommended-latest'],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    plugins: { reactHooks, reactRefresh },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
      "react-hooks/rules-of-hooks": "error", 
      "react-hooks/exhaustive-deps": "warn"
    },
  },
  {
    // Test helpers mix components and functions; fast refresh never loads them.
    files: ['src/**/_tests_/**'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
  {
    // Playwright specs, helpers and config run in Node; page.evaluate code runs in the browser.
    files: ['e2e/**', 'playwright.config.js'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: {
      'react-hooks/rules-of-hooks': 'off',
      'react-hooks/exhaustive-deps': 'off',
      'react-refresh/only-export-components': 'off',
      'no-restricted-properties': [
        'error',
        { object: 'page', property: 'waitForTimeout', message: 'Use web-first assertions or route-driven waits.' },
      ],
    },
  },
])
