import { test, expect } from '@playwright/test';
import { addCard, createDeck, setCardKinds } from './helpers';

// The other study tests keep the cards in a fixed order (VITE_STABLE_ORDER); here the real order is switched back on.
test.beforeEach(async ({ page }) => { await page.addInitScript(() => { (window as unknown as { __randomOrder: boolean }).__randomOrder = true; }); });

const REFERENCES = ['John 3:16', 'Psalm 23:1', 'Romans 8:28', 'Genesis 1:1', 'Isaiah 53:6', 'Proverbs 3:5'];
const firstCard = async (page: import('@playwright/test').Page, deckId: string) => {
  await page.goto(`/#/collections/${deckId}/study/flashcard`);
  await expect(page.getByRole('button', { name: 'Show answer' })).toBeVisible();
  return (await page.locator('#card-prompt').innerText()).replace(/^Card \d+ of \d+\.\s*/, '').trim();
};

test('a collection\'s list for the day is random, not just the order the verses were added in', async ({ page }) => {
  // The same six verses in five decks: each deck has its own random list, so they do not all start with the first verse added.
  const firsts: string[] = [];
  for (let d = 0; d < 5; d++) {
    const id = await createDeck(page, `Deck ${d}`);
    for (const [i, ref] of REFERENCES.entries()) await addCard(page, id, ref, `Passage number ${i + 1}.`);
    await setCardKinds(page, 'Recall the passage');
    firsts.push(await firstCard(page, id));
  }
  expect(firsts.filter((f) => f !== REFERENCES[0]).length).toBeGreaterThan(0);
});

test('and it is the same list every time that collection is opened on the same day', async ({ page }) => {
  const id = await createDeck(page, 'Steady');
  for (const [i, ref] of REFERENCES.entries()) await addCard(page, id, ref, `Passage number ${i + 1}.`);
  await setCardKinds(page, 'Recall the passage');
  const first = await firstCard(page, id);
  for (let visit = 0; visit < 3; visit++) {
    await page.goto('/#/');
    expect(await firstCard(page, id)).toBe(first);
  }
});
