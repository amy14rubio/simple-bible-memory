import { test, expect } from '@playwright/test';
import { createDeck } from './helpers';

test('the search field grows in when search opens, and folds away when it closes', async ({ page }) => {
  await createDeck(page, 'Alpha');
  await page.goto('/#/');
  await page.getByRole('button', { name: 'Search collections' }).click();
  const field = page.getByRole('searchbox', { name: 'Search collections' });
  // in the first frame it is still on its way in
  const early = await field.evaluate((el) => new Promise<{ opacity: number; running: number }>((resolve) => requestAnimationFrame(() => resolve({ opacity: Number(getComputedStyle(el).opacity), running: el.getAnimations().length }))));
  expect(early.running).toBeGreaterThan(0);
  await expect.poll(() => field.evaluate((el) => Number(getComputedStyle(el).opacity))).toBe(1);

  // closing: the field folds away, then the normal top bar is back
  await page.getByRole('button', { name: 'Close search' }).click();
  await expect(field).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Search collections' })).toBeVisible();
});

test('Escape closes search the same way, and typing makes the clear button pop in', async ({ page }) => {
  await createDeck(page, 'Alpha');
  await page.goto('/#/');
  await page.getByRole('button', { name: 'Search collections' }).click();
  const field = page.getByRole('searchbox', { name: 'Search collections' });
  await field.fill('Al');
  const clear = page.getByRole('button', { name: 'Clear search' });
  await expect(clear).toBeVisible();
  expect(await clear.evaluate((el) => el.getAnimations().length)).toBeGreaterThan(0);
  await page.keyboard.press('Escape');
  await expect(field).toHaveCount(0);
});

test('with reduced motion, search opens and closes at once', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await createDeck(page, 'Alpha');
  await page.goto('/#/');
  await page.getByRole('button', { name: 'Search collections' }).click();
  const field = page.getByRole('searchbox', { name: 'Search collections' });
  expect(await field.evaluate((el) => el.getAnimations().filter((a) => !(a instanceof CSSTransition)).length)).toBe(0); // (the focus ring's own tiny transition does not count)
  await page.getByRole('button', { name: 'Close search' }).click();
  await expect(field).toHaveCount(0);
  await ctx.close();
});

test('after search closes the top bar eases its title back in (no hard swap)', async ({ page }) => {
  await createDeck(page, 'Alpha');
  await page.goto('/#/');
  await page.getByRole('button', { name: 'Search collections' }).click();
  await page.waitForTimeout(400);
  const seen = await page.evaluate(() => new Promise<boolean>((resolve) => {
    const close = [...document.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === 'Close search')!;
    close.click();
    const started = performance.now();
    const look = () => {
      const bar = document.querySelector('header');
      const easing = !!bar && [...bar.children].some((c) => c.getAnimations().some((a) => !(a instanceof CSSTransition) && a.effect?.getTiming().duration === 240));
      if (easing) resolve(true);
      else if (performance.now() - started > 1500) resolve(false);
      else requestAnimationFrame(look);
    };
    look();
  }));
  expect(seen).toBe(true);
});
