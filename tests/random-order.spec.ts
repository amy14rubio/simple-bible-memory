import { test, expect } from '@playwright/test';
import { addCard, createDeck, setCardKinds } from './helpers';

// The other study tests keep the cards in a fixed order (VITE_STABLE_ORDER); here real shuffling is switched back on.
test.beforeEach(async ({ page }) => { await page.addInitScript(() => { (window as unknown as { __randomOrder: boolean }).__randomOrder = true; }); });

const REFERENCES = ['John 3:16', 'Psalm 23:1', 'Romans 8:28', 'Genesis 1:1', 'Isaiah 53:6', 'Proverbs 3:5', 'Matthew 5:3', 'Acts 2:38'];

test('a session starts with a different card each time, not always the first one added', async ({ page }) => {
  const id = await createDeck(page);
  for (const [i, ref] of REFERENCES.entries()) await addCard(page, id, ref, `Passage number ${i + 1}.`);
  await setCardKinds(page, 'Recall the passage');
  const firsts = new Set<string>();
  for (let i = 0; i < 8; i++) {
    await page.goto('/#/'); // (leave the study screen, so each visit builds a new session)
    await page.goto(`/#/decks/${id}/study/flashcard`);
    await expect(page.getByRole('button', { name: 'Show answer' })).toBeVisible();
    firsts.add((await page.locator('p.font-serif').first().innerText()).trim());
  }
  expect([...firsts], 'first cards seen').not.toHaveLength(1);
});
