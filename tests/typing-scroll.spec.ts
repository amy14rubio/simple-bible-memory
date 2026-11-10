import { test, expect } from '@playwright/test';
import { addCard, createDeck } from './helpers';

test.use({ viewport: { width: 360, height: 520 } });

/** Where the screen is scrolled to: the page and every scrolling box on it, added up. */
const scrolled = (page: import('@playwright/test').Page) => page.evaluate(() => [...document.querySelectorAll('*')].reduce((sum, e) => sum + e.scrollTop, 0) + window.scrollY);

test('typing a long verse does not make the screen jump back up', async ({ page }) => {
  const id = await createDeck(page, 'Long');
  await addCard(page, id, 'Example 1:1', 'A verse.');
  await page.goto(`/#/decks/${id}/study/type`);
  const box = page.getByLabel('Type the verse from memory');
  await box.fill(Array.from({ length: 40 }, (_, i) => `line ${i} of a long verse typed from memory`).join('\n'));
  await box.focus();
  await page.keyboard.press('Control+End');
  await page.evaluate(() => { document.querySelectorAll('*').forEach((e) => { e.scrollTop = e.scrollHeight; }); window.scrollTo(0, document.body.scrollHeight); });
  const before = await scrolled(page);
  expect(before, 'the verse is long enough that the screen scrolls').toBeGreaterThan(50);
  for (const ch of 'and more words') {
    await page.keyboard.type(ch);
    expect(await scrolled(page), `after typing "${ch}"`).toBeGreaterThanOrEqual(before - 2);
  }
});
