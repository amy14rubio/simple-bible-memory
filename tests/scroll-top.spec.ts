import { test, expect } from '@playwright/test';

/** A new screen starts at the top: opening Privacy from the bottom of Settings must not leave it scrolled to the bottom. */
test.use({ viewport: { width: 390, height: 700 } });

test('a screen opened from the bottom of Settings starts at the top; Back leaves Settings where it was', async ({ page }) => {
  await page.goto('/#/settings');
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).first().click({ timeout: 1500 }).catch(() => {}); // the first-visit guide, if it is up
  const privacy = page.getByRole('link', { name: /Privacy/ });
  await privacy.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.getElementById('app-scroll')!.scrollTop)).toBeGreaterThan(100); // Settings is long: this is the bottom of it
  await privacy.click();
  await expect(page).toHaveURL(/#\/settings\/privacy$/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.getElementById('app-scroll')!.scrollTop)).toBe(0);
});

test('changes that keep the same screen do not scroll to the top', async ({ page }) => {
  await page.goto('/#/settings');
  await page.getByRole('button', { name: 'Close' }).first().click({ timeout: 1500 }).catch(() => {});
  await page.getByRole('link', { name: /Privacy/ }).scrollIntoViewIfNeeded();
  const before = await page.evaluate(() => document.getElementById('app-scroll')!.scrollTop);
  await page.getByRole('button', { name: 'Export data' }).click(); // a drawer: the screen behind it stays where it was
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await page.evaluate(() => document.getElementById('app-scroll')!.scrollTop)).toBeGreaterThanOrEqual(before - 2);
});

test('going Back returns to where the screen was scrolled; a screen opened new still starts at the top', async ({ page }) => {
  await page.goto('/#/settings');
  await page.getByRole('button', { name: 'Close' }).first().click({ timeout: 1500 }).catch(() => {});
  const privacy = page.getByRole('link', { name: /Privacy/ });
  await privacy.scrollIntoViewIfNeeded();
  const before = await page.evaluate(() => document.getElementById('app-scroll')!.scrollTop);
  expect(before).toBeGreaterThan(100);
  await privacy.click();
  await expect(page).toHaveURL(/#\/settings\/privacy$/);
  await expect.poll(() => page.evaluate(() => document.getElementById('app-scroll')!.scrollTop)).toBe(0); // new: at the top
  await page.getByRole('link', { name: 'Back', exact: true }).click();
  await expect(page).toHaveURL(/#\/settings$/);
  await expect.poll(() => page.evaluate(() => document.getElementById('app-scroll')!.scrollTop), { timeout: 3000 }).toBeGreaterThan(before - 4); // back: where it was
});
