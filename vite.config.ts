/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { createReadStream, existsSync } from 'node:fs';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      // The UBS Spanish dictionaries live in web-data/ and are served by the website, not bundled in the app; the dev server serves them the same way.
      name: 'serve-web-data',
      configureServer(server) {
        server.middlewares.use('/ubs-es', (req, res, next) => {
          const file = path.join(__dirname, 'web-data/ubs-es', (req.url ?? '').split('?')[0]!);
          if (!file.startsWith(path.join(__dirname, 'web-data/ubs-es')) || !existsSync(file)) return next();
          res.setHeader('Content-Type', file.endsWith('.json') ? 'application/json' : 'text/plain');
          res.setHeader('Access-Control-Allow-Origin', '*');
          createReadStream(file).pipe(res);
        });
      },
    },
  ],
  // `@/` means `src/`, which is how shadcn components import each other.
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  // wa-sqlite loads its own .wasm file; pre-bundling would break the URL.
  optimizeDeps: { exclude: ['wa-sqlite'] },
  test: { include: ['src/**/*.test.ts'] },
});
