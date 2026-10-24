import { test, expect, type Page } from '@playwright/test';
import { addCard, createDeck, openDeck, setCardKinds } from './helpers';

/** The real order (not the fixed one the other tests use), the same for the whole day in every mode. */
test.beforeEach(async ({ page }) => { await page.addInitScript(() => { (window as unknown as { __randomOrder: boolean }).__randomOrder = true; }); });

const VERSES = ['John 3:16', 'Psalm 23:1', 'Romans 8:28', 'Genesis 1:1', 'Isaiah 53:6', 'Proverbs 3:5'];

async function deckOfVerses(page: Page, n = VERSES.length) {
  const id = await createDeck(page, 'Daily');
  for (const [i, ref] of VERSES.slice(0, n).entries()) await addCard(page, id, ref, `Passage number ${i + 1}.`);
  await setCardKinds(page, 'Recall the passage');
  return id;
}
const study = (page: Page, id: string, mode: string) => page.goto(`/#/decks/${id}/study/${mode}`);
/** The verse on the current card ("Card 2 of 5. John 3:16" is what a screen reader hears). */
const currentRef = async (page: Page) => (await page.locator('#card-prompt').innerText()).replace(/^Card \d+ of \d+\.\s*/, '').trim();
const setNewPerDay = async (page: Page, n: number) => { await page.goto('/#/settings'); await page.getByLabel('New cards per day').fill(String(n)); await page.getByRole('link', { name: 'Back to decks' }).click(); };

test('switching modes continues the same list, in the same order, where it left off', async ({ page }) => {
  const id = await deckOfVerses(page);
  await study(page, id, 'flashcard');
  const first = await currentRef(page); // the list's first card
  await page.getByRole('link', { name: 'Exit study' }).click(); // nothing rated: the list is untouched
  await openDeck(page, id);

  await study(page, id, 'type');
  expect(await currentRef(page)).toBe(first); // a different mode starts from the same place
  await page.getByLabel(/Type the verse from memory/).fill('anything');
  await page.getByRole('button', { name: 'Show answer' }).click();
  await page.getByRole('button', { name: /^Easy/ }).click();
  await expect.poll(() => currentRef(page)).not.toBe(first); // the screen moves on to the next card
  const second = await currentRef(page); // the next card of the same list
  await page.getByRole('link', { name: 'Exit study' }).click();

  await study(page, id, 'flashcard'); // back in the first mode: the finished card is gone, the next one is the one Type was about to show
  expect(await currentRef(page)).toBe(second);
});

test('lowering new cards per day after starting cards: the home list, the deck page and the session all agree at once', async ({ page }) => {
  const id = await deckOfVerses(page, 5);
  await study(page, id, 'flashcard');
  for (let i = 0; i < 5; i++) { // start all five: each is rated Again, so it is being learned
    await page.getByRole('button', { name: 'Show answer' }).click();
    await page.getByRole('button', { name: /^Again/ }).click();
  }
  await page.getByRole('link', { name: 'Exit study' }).click();
  await expect(page.getByText('5 cards to study today.')).toBeVisible(); // all five are still to be finished

  await setNewPerDay(page, 2);
  await expect(page.getByRole('link', { name: /Daily/ })).toContainText('2'); // the home list
  await page.getByRole('link', { name: /Daily/ }).click();
  await expect(page.getByText('2 cards to study today.')).toBeVisible(); // the deck page
  await study(page, id, 'flashcard');
  await expect(page.getByRole('list', { name: 'Cards remaining' })).toContainText('Learning: 2'); // and the session itself

  await setNewPerDay(page, 5); // raising it brings the postponed ones back, with their progress
  await page.getByRole('link', { name: /Daily/ }).click();
  await expect(page.getByText('5 cards to study today.')).toBeVisible();
});

test('"You\'re done for today!" says when the next review is, and Keep practicing opens extra practice', async ({ page }) => {
  const id = await createDeck(page, 'One verse');
  await addCard(page, id, 'John 3:16', 'For God so loved the world.');
  await setCardKinds(page, 'Recall the passage');
  await study(page, id, 'flashcard');
  await page.getByRole('button', { name: 'Show answer' }).click();
  await page.getByRole('button', { name: /^Easy/ }).click();

  await expect(page.getByRole('heading', { name: "You're done for today!" })).toBeVisible();
  await expect(page.getByText('1 card reviewed')).toBeVisible();
  await expect(page.getByText(/Your next review is in \d+(m|h|d|mo)/)).toBeVisible();
  await expect(page.getByText('See you tomorrow')).toHaveCount(0);

  await page.getByRole('link', { name: 'Back to deck' }).click(); // the deck page says the same, with the same two things
  await expect(page.getByRole('heading', { name: "You're done for today!" })).toBeVisible();
  await expect(page.getByText(/Your next review is in/)).toBeVisible();
  await page.getByRole('link', { name: 'Keep practicing' }).click();
  await expect(page.getByRole('heading', { name: 'Extra practice' })).toBeVisible(); // the existing Extra practice, the same feature
  await expect(page.getByRole('link', { name: /Flashcard/ })).toBeVisible();
});
