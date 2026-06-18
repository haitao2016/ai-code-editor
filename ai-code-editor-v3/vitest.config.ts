import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      // Stub monaco-editor to avoid CSS import errors in node environment
      'monaco-editor': resolve(__dirname, 'tests/__mocks__/monaco-editor.ts'),
      // Stub y-monaco since it depends on monaco-editor
      'y-monaco': resolve(__dirname, 'tests/__mocks__/y-monaco.ts'),
    },
  },
  test: {
    globals: true,
    setupFiles: ['./tests/setup.ts'],
  },
});
