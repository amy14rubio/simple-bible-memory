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

test.describe('a filtered list does not jump when the search is cleared or closed', () => {
  const animatedRows = (page: import('@playwright/test').Page, selector: string) => page.evaluate((sel) => new Promise<{ rows: number; moving: number }>((resolve) => {
    requestAnimationFrame(() => {
      const rows = [...document.querySelectorAll(sel)];
      resolve({ rows: rows.length, moving: rows.filter((r) => r.getAnimations().some((a) => !(a instanceof CSSTransition))).length });
    });
  }), selector);

  test('home list: clearing with the X, and going back, bring the other collections in smoothly', async ({ page }) => {
    for (const name of ['Alpha', 'Beta', 'Gamma']) await createDeck(page, name);
    await page.goto('/#/');
    await expect(page.getByText('Gamma', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Search collections' }).click();
    const field = page.getByRole('searchbox', { name: 'Search collections' });
    await field.fill('Alpha');
    await expect(page.locator('main li')).toHaveCount(1);
    await page.waitForTimeout(400);

    // the X: the other two come back, fading and sliding in
    await page.getByRole('button', { name: 'Clear search' }).click();
    const afterClear = await animatedRows(page, 'main ul > li');
    expect(afterClear.rows).toBe(3);
    expect(afterClear.moving).toBeGreaterThanOrEqual(2);
    await page.waitForTimeout(400);

    // going back from a filtered list
    await field.fill('Beta');
    await expect(page.locator('main ul > li')).toHaveCount(1);
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: 'Close search' }).click();
    await expect.poll(() => page.locator('main ul > li').count()).toBe(3);
  });

  test('typing (rows leaving) only settles the rows that stay, quickly; the X brings rows back with the fuller motion', async ({ page }) => {
    for (const name of ['Alpha', 'Alpine', 'Beta', 'Gamma']) await createDeck(page, name);
    await page.goto('/#/');
    await expect(page.getByText('Gamma', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Search collections' }).click();
    const field = page.getByRole('searchbox', { name: 'Search collections' });
    await page.waitForTimeout(400);
    // narrowing: "Al" takes Beta and Gamma out of the list
    await field.fill('Al');
    const durations = await page.evaluate(() => new Promise<number[]>((resolve) => requestAnimationFrame(() => resolve(
      [...document.querySelectorAll('main ul > li')].flatMap((r) => r.getAnimations().filter((a) => !(a instanceof CSSTransition)).map((a) => Number(a.effect?.getTiming().duration))),
    ))));
    expect(durations.every((d) => d <= 120)).toBe(true); // short, light settles only (or none at all)
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: 'Clear search' }).click();
    const back = await page.evaluate(() => new Promise<number[]>((resolve) => requestAnimationFrame(() => resolve(
      [...document.querySelectorAll('main ul > li')].flatMap((r) => r.getAnimations().filter((a) => !(a instanceof CSSTransition)).map((a) => Number(a.effect?.getTiming().duration))),
    ))));
    expect(back.some((d) => d >= 240)).toBe(true); // the rows that come back keep the fuller motion
  });

  test('popup list: clearing the search brings the rest of the list in smoothly', async ({ page }) => {
    for (const name of ['Alpha', 'Beta', 'Gamma']) await createDeck(page, name);
    await page.goto('/#/stats');
    await page.getByRole('button', { name: /^Show statistics for:/ }).click();
    const dialog = page.locator('dialog[open]');
    await dialog.evaluate((el) => Promise.all(el.getAnimations().map((x) => x.finished)));
    await dialog.getByRole('button', { name: /^Search/ }).click();
    await dialog.getByRole('searchbox').fill('Alpha');
    await expect(dialog.locator('ul > li')).toHaveCount(1);
    await page.waitForTimeout(400);
    await dialog.getByRole('button', { name: 'Clear search' }).click();
    const after = await animatedRows(page, 'dialog[open] ul > li');
    expect(after.rows).toBeGreaterThanOrEqual(3);
    expect(after.moving).toBeGreaterThanOrEqual(2);
  });

  test('with reduced motion the list simply changes', async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    for (const name of ['Alpha', 'Beta']) await createDeck(page, name);
    await page.goto('/#/');
    await page.getByRole('button', { name: 'Search collections' }).click();
    await page.getByRole('searchbox', { name: 'Search collections' }).fill('Alpha');
    await expect(page.locator('main ul > li')).toHaveCount(1);
    await page.getByRole('button', { name: 'Clear search' }).click();
    const after = await animatedRows(page, 'main ul > li');
    expect(after.rows).toBe(2);
    expect(after.moving).toBe(0);
    await ctx.close();
  });
});

test('opening a dropdown does not slide its rows in from the top (only changes to the list are animated)', async ({ page }) => {
  for (const name of ['Alpha', 'Beta', 'Gamma']) await createDeck(page, name);
  await page.goto('/#/stats');
  await page.getByRole('button', { name: /^Show statistics for:/ }).click();
  const rows = await page.evaluate(() => new Promise<{ n: number; moving: number }>((resolve) => requestAnimationFrame(() => {
    const li = [...document.querySelectorAll('dialog[open] ul > li')];
    resolve({ n: li.length, moving: li.filter((r) => r.getAnimations().some((a) => !(a instanceof CSSTransition))).length });
  })));
  expect(rows.n).toBeGreaterThanOrEqual(3);
  expect(rows.moving).toBe(0);
});
