/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // `@/` means `src/`, which is how shadcn components import each other.
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  // wa-sqlite loads its own .wasm file; pre-bundling would break the URL.
  optimizeDeps: { exclude: ['wa-sqlite'] },
  test: { include: ['src/**/*.test.ts'] },
});
