import { chromium, type FullConfig } from '@playwright/test';

/**
 * Warms up the dev server once before the tests start. The first visit makes Vite transform and optimize every module
 * (and the lazily loaded chart), which can take several seconds. Without this, whichever tests ran first sometimes
 * timed out waiting for the page, and then passed on a re-run.
 */
export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]!.use.baseURL!;
  const browser = await chromium.launch();
  const page = await browser.newPage();
  for (const route of ['/', '/#/settings', '/#/stats', '/#/decks/new', '/#/cards/new']) {
    await page.goto(`${baseURL}${route}`);
    await page.getByRole('heading').first().waitFor({ timeout: 60_000 });
  }
  await browser.close();
}
