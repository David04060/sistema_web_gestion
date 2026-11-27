/** Archivo: Define las comprobaciones del servidor y sus pruebas y omite dependencias y archivos generados.
 */
import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

// Los parámetros HTTP con prefijo _ se conservan cuando Express requiere su posición.
export default defineConfig([
  { ignores: ['dist/**', 'node_modules/**', '.npm-cache/**'] },
  {
    files: ['tests/**/*.mjs', 'scripts/**/*.mjs', 'eslint.config.js'],
    extends: [js.configs.recommended],
    languageOptions: {
      globals: { process: 'readonly', console: 'readonly', fetch: 'readonly' },
    },
  },
  {
    files: ['src/**/*.ts'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
]);
