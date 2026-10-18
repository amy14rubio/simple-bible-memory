import { test, expect, type Page } from '@playwright/test';
import { addCard, createDeck, openDeck, setCardKinds } from './helpers';

test('new card shows interval hints; Good brings it back soon (learning); Easy graduates it', async ({ page }) => {
  const id = await createDeck(page, 'Scheduled deck');
  await addCard(page, id, 'Example 1:1', 'Example verse text.');
  await setCardKinds(page, 'Recall the passage');
  await openDeck(page, id);
  await expect(page.getByText('1 card to study today.')).toBeVisible();
  await page.getByRole('link', { name: /Flashcard/ }).click();

  // first pass: hints come from the scheduler (documented default learning steps: 1m / 10m)
  await page.getByRole('button', { name: 'Show answer' }).click();
  await expect(page.getByRole('button', { name: /^Again\s+1 minute$/ })).toContainText('1m'); // said as words, drawn short
  await expect(page.getByRole('button', { name: /^Good\s+10 minutes$/ })).toContainText('10m');
  await page.getByRole('button', { name: /^Good/ }).click();

  // due in 10 minutes -> shown again in this session (learning step)
  await expect(page.getByRole('list', { name: 'Cards remaining' })).toContainText('Learning: 1');
  await page.getByRole('button', { name: 'Show answer' }).click();
  await page.getByRole('button', { name: /^Easy/ }).click();

  await expect(page.getByRole('heading', { name: 'Session complete' })).toBeVisible();
  await expect(page.getByText('1 card reviewed')).toBeVisible();

  // open-deck view: nothing due now, and it says when the next review is
  await page.getByRole('link', { name: 'Back to deck' }).click();
  await expect(page.getByRole('heading', { name: "You're all caught up" })).toBeVisible();
  await expect(page.getByText(/Your next review is in \d+(m|h|d|mo)/)).toBeVisible();
  await expect(page.getByRole('link', { name: /Flashcard/ })).toHaveCount(0); // nothing to study right now
});

test('reviews persist across a reload', async ({ page }) => {
  const id = await createDeck(page, 'Persist');
  await addCard(page, id, 'Example 1:1', 'Persist me.');
  await setCardKinds(page, 'Recall the passage');
  await openDeck(page, id);
  await page.getByRole('link', { name: /Flashcard/ }).click();
  await page.getByRole('button', { name: 'Show answer' }).click();
  await page.getByRole('button', { name: /^Easy/ }).click();
  await expect(page.getByRole('heading', { name: 'Session complete' })).toBeVisible();
  await page.getByRole('link', { name: 'Back to deck' }).click();
  await expect(page.getByRole('heading', { name: "You're all caught up" })).toBeVisible();

  await page.reload(); // the review was awaited before the session ended, so it is already saved
  await expect(page.getByRole('heading', { name: "You're all caught up" })).toBeVisible();
  await expect(page.getByText(/Your next review is in/)).toBeVisible();
});

test('the home list shows only how many cards are due, and it updates after studying', async ({ page }) => {
  const id = await createDeck(page, 'Due list');
  await addCard(page, id, 'Example 1:1', 'One.');
  await setCardKinds(page, 'Recall the passage');
  await page.goto('/');
  const row = page.getByRole('link', { name: /Due list/ });
  await expect(row).toContainText('1 due');
  await expect(row).not.toContainText(/card/); // no total count any more

  await page.goto(`/#/decks/${id}/study/flashcard`);
  await page.getByRole('button', { name: 'Show answer' }).click();
  await page.getByRole('button', { name: /^Easy/ }).click();
  await expect(page.getByRole('heading', { name: 'Session complete' })).toBeVisible();
  await page.goto('/');
  await expect(page.getByRole('link', { name: /Due list/ })).toContainText('0 due');
});

/** The page fills the box with the saved value a moment after it appears, which can undo typing: retry until it sticks. */
async function setNewPerDay(page: Page, value: string) {
  const box = page.getByLabel('New cards per day', { exact: true });
  await expect(async () => {
    await box.fill(value);
    await page.waitForTimeout(250);
    await expect(box).toHaveValue(value, { timeout: 1000 });
  }).toPass({ timeout: 10_000 });
}

test('"New cards per day" limits how many new cards are introduced', async ({ page }) => {
  const id = await createDeck(page, 'Scheduled deck');
  for (const [i, t] of ['One.', 'Two.', 'Three.'].entries()) await addCard(page, id, `Example ${i + 1}:1`, t);

  await page.goto('/#/settings');
  await setNewPerDay(page, '2');
  await page.getByRole('link', { name: 'Back to decks' }).click();
  await page.getByRole('link', { name: /Scheduled deck/ }).click();
  await expect(page.getByText('2 cards to study today.')).toBeVisible();

  await page.goto('/#/settings');
  await setNewPerDay(page, '0');
  await page.getByRole('link', { name: 'Back to decks' }).click();
  await page.getByRole('link', { name: /Scheduled deck/ }).click();
  await expect(page.getByText("You've reached today's limit for new cards.")).toBeVisible();
});
