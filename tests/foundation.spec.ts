import { test, expect } from '@playwright/test';

const theme = (page: import('@playwright/test').Page, name: string) =>
  page.getByRole('group', { name: 'Theme' }).getByRole('button', { name, exact: true });

test('theme preference persists and applies', async ({ page }) => {
  await page.goto('/#/settings');
  await theme(page, 'Dark').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(theme(page, 'Dark')).toHaveAttribute('aria-pressed', 'true');
  // Wait until the choice has been written, then reload.
  await expect(async () => {
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark', { timeout: 1000 });
    await expect(theme(page, 'Dark')).toHaveAttribute('aria-pressed', 'true', { timeout: 1000 });
  }).toPass({ timeout: 8000 });
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
  await page.goto('/#/settings');
  await theme(page, 'Light').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await ctx.close();
});
