import { expect, type Page } from '@playwright/test';

/** Creates a deck through the UI and returns its id. */
export async function createDeck(page: Page, title = 'Test collection'): Promise<string> {
  await page.goto('/#/collections/new');
  await page.getByLabel('Title').fill(title);
  await page.getByRole('button', { name: 'Save' }).click();
  await page.waitForURL(/#\/collections\/[0-9a-f-]{36}$/);
  return page.url().match(/#\/collections\/([0-9a-f-]{36})$/)![1]!;
}

/** Adds a user-entered example card and waits until it appears in the deck's card list. */
export async function addCard(page: Page, deckId: string, reference: string, passage: string, source?: string) {
  await page.goto(`/#/cards/new?collection=${deckId}`);
  await page.getByLabel('Verse(s)').fill(reference);
  if (source) await page.getByLabel('Note', { exact: true }).fill(source);
  await page.getByLabel('Passage', { exact: true }).fill(passage);
  await page.getByRole('button', { name: 'Save' }).click();
  // Saving shows a toast and leaves a cleared form open. Then open the deck's card list, and reload so the
  // toast's text ("John 3:16 added") cannot be mistaken for the card itself by later checks.
  await expect(page.getByText(`${reference} added`)).toBeVisible();
  await page.goto(`/#/collections/${deckId}/cards`);
  await page.reload();
  await expect(page.getByText(reference, { exact: true })).toBeVisible();
}

const WORD_BANK = /^(Word bank|Banco de palabras)$/;

/** Is the word bank on screen? (False once every blank has been filled in.) */
export const wordBankOpen = (page: Page) => page.getByRole('group', { name: WORD_BANK }).isVisible();

/**
 * Taps the first word in the word bank, then waits until the screen has really moved on: the next blank is highlighted,
 * or the exercise is finished. (A fixed sleep here made tests flaky when the machine was busy.)
 */
export async function tapFirstBankWord(page: Page): Promise<void> {
  const bank = page.getByRole('group', { name: WORD_BANK });
  const current = page.locator('[aria-current="step"]');
  const before = await current.textContent();
  await bank.getByRole('button').first().click();
  await expect.poll(async () => ((await bank.isVisible()) ? await current.textContent() : 'finished')).not.toBe(before);
}

export const openDeck = (page: Page, deckId: string) => page.goto(`/#/collections/${deckId}`);

/** Chooses which study cards each verse gets (Settings > Cards for each verse). */
export async function setCardKinds(page: Page, kinds: 'Both' | 'Recall the passage' | 'Identify the verse') {
  await page.goto('/#/settings/card-kinds');
  const radio = page.getByRole('radio', { name: new RegExp(`^${kinds}`) });
  // The page loads the saved choice after it appears, which can undo a click made too early: retry until it sticks.
  await expect(async () => {
    await radio.check();
    await page.waitForTimeout(150);
    await expect(radio).toBeChecked({ timeout: 1000 });
  }).toPass({ timeout: 10_000 });
}

/** The fill-in-the-blanks difficulty lives only in Settings. */
export async function setBlankDifficulty(page: Page, level: 'Easy' | 'Medium' | 'Hard') {
  await page.goto('/#/settings/blanks');
  const radio = page.getByRole('radio', { name: level, exact: true });
  // The page loads the saved choice after it appears, which can undo a click made too early: retry until it sticks.
  await expect(async () => {
    await radio.check();
    await page.waitForTimeout(150);
    await expect(radio).toBeChecked({ timeout: 1000 });
  }).toPass({ timeout: 10_000 });
}

/** The deck id in a "New card" address (/#/cards/new?collection=...). */
export function deckIdFromUrl(page: Page): string {
  return new URL(page.url().split('#')[1]!, 'http://x').searchParams.get('collection')!;
}

/**
 * Presses Escape to close a popup, then lets its history clean-up finish. (Closing a popup removes the extra history
 * entry it added; a test that navigates within a few milliseconds would race that, which a person never does.)
 */
export async function closeWithEscape(page: Page) {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
}
