import { defineConfig } from '@playwright/test';

/** Records the tutorial clips (see scripts/clips/tutorial.spec.ts). Run with `npm run clips`. Not part of the test suite. */
export default defineConfig({
  testDir: 'scripts/clips',
  timeout: 120_000,
  workers: 1,
  webServer: { command: 'npm run dev -- --port 5300', url: 'http://localhost:5300', reuseExistingServer: true, env: { VITE_GOOGLE_FONTS_API_KEY: 'test-key', VITE_SHARING_BACKEND: 'fake', VITE_SKIP_ONBOARDING: 'true', VITE_SKIP_ENCOURAGEMENT: 'true', VITE_FAKE_NOTIFICATIONS: 'true', VITE_FAKE_VOICE: 'true', VITE_FAKE_YOUVERSION: 'true', VITE_STABLE_ORDER: 'true' } },
  use: { baseURL: 'http://localhost:5300' },
});
