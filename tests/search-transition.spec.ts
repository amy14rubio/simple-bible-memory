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

test.describe('the search inside a dropdown popup moves like the search on a page', () => {
  const openPopupSearch = async (page: import('@playwright/test').Page) => {
    await createDeck(page, 'Alpha');
    await page.goto('/#/stats');
    await page.getByRole('button', { name: /^Show statistics for:/ }).click();
    const dialog = page.locator('dialog[open]');
    await expect(dialog).toBeVisible();
    await dialog.evaluate((el) => Promise.all(el.getAnimations().map((x) => x.finished))); // the popup itself has come in
    return dialog;
  };
  const running = (el: import('@playwright/test').Locator) => el.evaluate((e) => e.getAnimations().filter((a) => !(a instanceof CSSTransition)).length);

  test('the field grows in, and folds away when it closes, and the title eases back', async ({ page }) => {
    const dialog = await openPopupSearch(page);
    await dialog.getByRole('button', { name: /^Search/ }).click();
    const field = dialog.getByRole('searchbox');
    const early = await field.evaluate((el) => new Promise<number>((resolve) => requestAnimationFrame(() => resolve(el.getAnimations().filter((a) => !(a instanceof CSSTransition)).length))));
    expect(early).toBeGreaterThan(0);
    await expect.poll(() => running(field)).toBe(0); // settled

    // typing makes the clear button pop in
    await field.fill('Al');
    expect(await running(dialog.getByRole('button', { name: 'Clear search' }))).toBeGreaterThan(0);

    // going back: the field folds first, and then the title (not the field) is there, easing in
    const eased = await page.evaluate(() => new Promise<boolean>((resolve) => {
      const open = document.querySelector('dialog[open]')!;
      const back = [...open.querySelectorAll('button')].find((b) => /^Close search/.test(b.getAttribute('aria-label') ?? ''))!;
      back.click();
      const started = performance.now();
      const look = () => {
        const title = open.querySelector('h2');
        if (title && title.getAnimations().some((a) => !(a instanceof CSSTransition))) resolve(true);
        else if (performance.now() - started > 1500) resolve(false);
        else requestAnimationFrame(look);
      };
      look();
    }));
    expect(eased).toBe(true);
    await expect(dialog.getByRole('searchbox')).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: /^Search/ })).toBeVisible();
  });

  test('the translation picker has the same motion', async ({ page }) => {
    const id = await createDeck(page, 'Alpha');
    await page.goto(`/#/collections/${id}/edit`);
    await page.getByRole('button', { name: /^Translation:/ }).click();
    const dialog = page.locator('dialog[open]');
    await expect(dialog).toBeVisible();
    await dialog.evaluate((el) => Promise.all(el.getAnimations().map((x) => x.finished)));
    await dialog.getByRole('button', { name: /^Search/ }).click();
    const early = await dialog.getByRole('searchbox').evaluate((el) => new Promise<number>((resolve) => requestAnimationFrame(() => resolve(el.getAnimations().filter((a) => !(a instanceof CSSTransition)).length))));
    expect(early).toBeGreaterThan(0);
  });

  test('with reduced motion nothing moves, and the search still opens and closes', async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    const dialog = await openPopupSearch(page);
    await dialog.getByRole('button', { name: /^Search/ }).click();
    expect(await running(dialog.getByRole('searchbox'))).toBe(0);
    await dialog.getByRole('button', { name: /^Close search/ }).click();
    await expect(dialog.getByRole('searchbox')).toHaveCount(0);
    await ctx.close();
  });
});
