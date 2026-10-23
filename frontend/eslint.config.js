import js from '@eslint/js'
import { defineConfig } from 'eslint/config'
import tseslint from 'typescript-eslint'

// El código generado y las dependencias no forman parte del análisis del proyecto.
export default defineConfig([
  { ignores: ['dist/**', 'node_modules/**'] },
  {
    files: ['tests/**/*.mjs', 'scripts/**/*.mjs', 'eslint.config.js'],
    extends: [js.configs.recommended],
    languageOptions: {
      globals: { process: 'readonly', console: 'readonly', Buffer: 'readonly', Response: 'readonly', Headers: 'readonly', setImmediate: 'readonly' },
    },
  },
  {
    files: ['src/**/*.{ts,tsx}', 'vite.config.ts'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
])

