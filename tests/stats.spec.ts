import { test, expect } from '@playwright/test';
import { addCard, createDeck, setCardKinds, closeWithEscape } from './helpers';

const number = (page: import('@playwright/test').Page, label: string) =>
  page.getByRole('term').filter({ hasText: new RegExp(`^${label}$`) }).locator('xpath=preceding-sibling::dd[1]');

test('statistics: empty state before any deck exists', async ({ page }) => {
  await page.goto('/#/stats');
  await expect(page.getByText('Nothing to show yet')).toBeVisible();
});

test('statistics: totals, books progress and card counts, and the deck scope switcher', async ({ page }) => {
  const a = await createDeck(page, 'Alpha');
  await addCard(page, a, 'John 3:16', 'Sample text.');
  await addCard(page, a, 'Salmos 23:1', 'Sample text.');
  const b = await createDeck(page, 'Beta');
  await addCard(page, b, 'Genesis 1:1', 'Sample text.');

  // study one card with Easy so it graduates to Review
  await page.goto(`/#/decks/${a}/study/flashcard`);
  await page.getByRole('button', { name: 'Show answer' }).click();
  await page.getByRole('button', { name: /^Easy/ }).click();
  // The review is saved before the next card appears, so the counters moving on means it is stored.
  await expect(page.getByRole('list', { name: 'Cards remaining' })).toContainText('New: 3');

  await page.goto('/');
  await page.getByRole('link', { name: 'Statistics' }).click();
  await expect(page.getByRole('heading', { name: 'Statistics' })).toBeAttached();
  await expect(number(page, 'Total cards added')).toHaveText('3');
  await expect(number(page, 'Verses memorized')).toHaveText('0'); // both of a verse's cards must be learned
  await expect(number(page, 'Verses mastered')).toHaveText('0');
  await expect(number(page, 'Days since starting')).toHaveText('0');

  const books = page.getByRole('region', { name: 'Books progress' });
  await expect(books.getByText('Genesis')).toBeVisible();
  await expect(books.getByText('Psalm')).toBeVisible(); // "Salmos" is shown under its English name
  await expect(books.getByText('John')).toBeVisible();
  await expect(books.getByRole('img', { name: '0 of 1 memorized' }).first()).toBeVisible();

  // 3 verses x 2 cards = 6 study cards; one recall card was studied
  const counts = page.getByRole('img', { name: /Cards by stage: 5 new, 0 learning, 1 young, 0 mature/ });
  await expect(counts).toBeVisible();

  // the explanations live behind a small "i" next to the titles, in a drawer, not as small print on the page
  await expect(page.getByText('Not studied yet.')).toHaveCount(0);
  await expect(page.getByText('A verse counts as memorized once it graduates from learning.')).toHaveCount(0);
  await page.getByRole('button', { name: 'About Card counts' }).click();
  const drawer = page.getByRole('dialog', { name: 'Card counts' });
  for (const [stage, text] of [['New', 'Not studied yet.'], ['Learning', 'Still being learned, or forgotten and being learned again.'], ['Young', 'Remembered, and the next review is less than 3 weeks away.'], ['Mature', 'Remembered well, and the next review is 3 weeks or more away.']]) {
    await expect(drawer.getByRole('term').filter({ hasText: new RegExp(`^${stage}$`) })).toBeVisible();
    await expect(drawer.getByText(text!)).toBeVisible();
  }
  await drawer.getByRole('button', { name: 'Close' }).dispatchEvent('click');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'About Books progress' }).click();
  await expect(page.getByRole('dialog', { name: 'Books progress' }).getByText('A verse counts as memorized once it graduates from learning.')).toBeVisible();
  await closeWithEscape(page);
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // scope to a single deck
  await page.getByRole('button', { name: /^Show statistics for:/ }).click();
  await page.getByRole('dialog', { name: 'Select a deck' }).getByRole('button', { name: 'Beta' }).click();
  await expect(number(page, 'Total cards added')).toHaveText('1');
  await expect(number(page, 'Verses memorized')).toHaveText('0');
});

test('statistics: with only recall cards in use, one studied card makes a verse memorized', async ({ page }) => {
  const a = await createDeck(page, 'Alpha');
  await addCard(page, a, 'John 3:16', 'Sample text.');
  await setCardKinds(page, 'Recall the passage');
  await page.goto(`/#/decks/${a}/study/flashcard`);
  await page.getByRole('button', { name: 'Show answer' }).click();
  await page.getByRole('button', { name: /^Easy/ }).click();
  await expect(page.getByRole('heading', { name: 'Session complete' })).toBeVisible();
  await page.goto('/#/stats');
  await expect(number(page, 'Verses memorized')).toHaveText('1');
  await expect(page.getByRole('button', { name: 'About Card counts' })).toBeVisible(); // the stage explanations apply whichever cards you study
  await expect(page.getByRole('button', { name: 'About Books progress' })).toBeVisible();
});
