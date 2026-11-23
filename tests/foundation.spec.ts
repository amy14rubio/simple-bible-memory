import { test, expect } from '@playwright/test';

const theme = (page: import('@playwright/test').Page, name: string) =>
  page.getByRole('group', { name: 'Theme' }).getByRole('radio', { name, exact: true });

test('theme preference persists and applies', async ({ page }) => {
  await page.goto('/#/settings/theme');
  await theme(page, 'Dark').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(theme(page, 'Dark')).toBeChecked();
  // The choice is written to the database a moment after the click, and a reload in that moment throws the write away
  // (the page shows Dark from a quick cache, so only the radio gives it away). Give the write time, then reload.
  await page.waitForTimeout(500);
  await expect(async () => {
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark', { timeout: 1000 });
    await expect(theme(page, 'Dark')).toBeChecked({ timeout: 1000 });
  }).toPass({ timeout: 8000, intervals: [1000] });
});

test('follows the OS theme by default', async ({ browser }) => {
  const ctx = await browser.newContext({ colorScheme: 'dark' });
  const page = await ctx.newPage();
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await ctx.close();
});

test('switching back to Light overrides a dark OS', async ({ browser }) => {
  const ctx = await browser.newContext({ colorScheme: 'dark' });
  const page = await ctx.newPage();
  await page.goto('/#/settings/theme');
  await theme(page, 'Light').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await ctx.close();
});
