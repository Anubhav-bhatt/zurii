import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
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
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],

      // Two regressions this project has already shipped once, encoded as
      // rules so they fail `npm run lint` instead of reaching production
      // again. Both are mechanical, which is exactly what a linter is for —
      // neither needs a running browser to detect.
      'no-restricted-syntax': [
        'error',
        {
          // A second, hardcoded timeout is how services/bookingsApi.js stayed
          // at 10s after services/apiClient.js moved to 30s, and how the CRM
          // ended up with three fetches at 30s and one at 10s. On a suspended
          // Render instance the first request after a quiet spell takes ~18.5s,
          // so a 10s ceiling aborts a request that was going to succeed — the
          // visitor sees a failure and the enquiry is lost.
          selector:
            "CallExpression[callee.object.name='AbortSignal'][callee.property.name='timeout'] > Literal",
          message:
            'Do not hardcode a request timeout. Import API_TIMEOUT_MS from services/apiClient so every call site moves together.',
        },
        {
          // `<a href="/packages">` inside a React Router app is a full document
          // load: the bundle is re-parsed, React remounts, and every piece of
          // in-memory state is discarded — including the admin access token,
          // which lives only in module memory in services/adminApi.js.
          selector: "JSXAttribute[name.name='href'] > Literal[value=/^\\/($|[^/])/]",
          message:
            'Internal links must use react-router <Link to="…">. A raw href triggers a full page reload and discards in-memory state.',
        },
      ],
    },
  },
])
