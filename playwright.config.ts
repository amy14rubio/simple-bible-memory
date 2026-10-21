import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests',
  globalSetup: './tests/global-setup.ts',
  // A little patience: the first screens after a cold start are slower than a warm run.
  expect: { timeout: 10_000 },
  // A fake key turns the full-catalogue code path on; every Google request is answered by the tests, never sent.
  webServer: { command: 'npm run dev -- --port 5199', url: 'http://localhost:5199', reuseExistingServer: true, env: { VITE_GOOGLE_FONTS_API_KEY: 'test-key', VITE_SHARING_BACKEND: 'fake', VITE_SKIP_ONBOARDING: 'true', VITE_SKIP_ENCOURAGEMENT: 'true', VITE_FAKE_NOTIFICATIONS: 'true', VITE_FAKE_VOICE: 'true' } },
  use: { baseURL: 'http://localhost:5199' },
});
