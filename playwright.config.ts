import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests',
  globalSetup: './tests/global-setup.ts',
  // A little patience: the first screens after a cold start are slower than a warm run.
  expect: { timeout: 10_000 },
  webServer: { command: 'npm run dev -- --port 5199', url: 'http://localhost:5199', reuseExistingServer: true },
  use: { baseURL: 'http://localhost:5199' },
});
