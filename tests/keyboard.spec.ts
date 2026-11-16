import { test, expect, type Page } from '@playwright/test';
import { addCard, createDeck, setCardKinds } from './helpers';

/**
 * An iPhone or iPad leaves the page as tall as it was and covers its bottom with the keyboard; only the visual viewport shrinks.
 * A browser has no keyboard to open, so a stand-in visual viewport is told how much is covered.
 */
async function fakeKeyboard(page: Page) {
  await page.addInitScript(() => {
    const target = new EventTarget();
    const vv = Object.assign(target, { height: window.innerHeight, offsetTop: 0, scale: 1 });
    Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true });
    (window as unknown as { __keyboard: (px: number) => void }).__keyboard = (px) => {
      vv.height = window.innerHeight - px;
      target.dispatchEvent(new Event('resize'));
    };
  });
}
const keyboard = (page: Page, px: number) => page.evaluate((n) => (window as unknown as { __keyboard: (px: number) => void }).__keyboard(n), px);

test('while the keyboard is up, the Show answer bar sits above it, not under it', async ({ page }) => {
  await fakeKeyboard(page);
  await page.setViewportSize({ width: 390, height: 844 });
  const id = await createDeck(page);
  await addCard(page, id, 'Example 1:1', 'Example verse text typed by the user.');
  await setCardKinds(page, 'Recall the passage');
  await page.goto(`/#/collections/${id}/study/type`);
  const button = page.getByRole('button', { name: 'Show answer' });
  await expect(button).toBeVisible();
  const resting = (await button.boundingBox())!;
  expect(resting.y + resting.height).toBeGreaterThan(844 - 60); // at the bottom of the screen

  await keyboard(page, 300);
  await expect.poll(async () => { const b = (await button.boundingBox())!; return b.y + b.height; }).toBeLessThanOrEqual(844 - 300);
  await expect(page.locator('html')).toHaveAttribute('data-keyboard', '');

  await keyboard(page, 0); // the keyboard goes away: back to the bottom
  await expect.poll(async () => { const b = (await button.boundingBox())!; return b.y + b.height; }).toBeGreaterThan(844 - 60);
  await expect(page.locator('html')).not.toHaveAttribute('data-keyboard', '');
});

test('in the Android app the page keeps no keyboard bookkeeping: the system already made room, and a half-updated reading (the page and the visible area a few milliseconds apart) must never throw the bar up the screen', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('sbm-fake-android', '1')); // the stand-in for the Android app
  await fakeKeyboard(page);
  await page.setViewportSize({ width: 390, height: 844 });
  const id = await createDeck(page);
  await addCard(page, id, 'Example 1:1', 'Example verse text typed by the user.');
  await setCardKinds(page, 'Recall the passage');
  await page.goto(`/#/collections/${id}/study/type`);
  const button = page.getByRole('button', { name: 'Show answer' });
  await expect(button).toBeVisible();
  const resting = (await button.boundingBox())!;
  await keyboard(page, 314); // the visible area alone shrinks, as it does for a few frames while the keyboard slides in on the phone
  await page.waitForTimeout(300);
  const during = (await button.boundingBox())!;
  expect(during.y).toBe(resting.y); // the bar did not move
  await expect(page.locator('html')).not.toHaveAttribute('data-keyboard', '');
  expect(await page.evaluate(() => document.documentElement.style.getPropertyValue('--keyboard-inset'))).toBe('');
});
