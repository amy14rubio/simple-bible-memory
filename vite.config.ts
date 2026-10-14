/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // wa-sqlite loads its own .wasm file; pre-bundling would break the URL.
  optimizeDeps: { exclude: ['wa-sqlite'] },
  test: { include: ['src/**/*.test.ts'] },
});
