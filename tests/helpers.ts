import { expect, type Page } from '@playwright/test';

/** Creates a deck through the UI and returns its id. */
export async function createDeck(page: Page, title = 'Test deck'): Promise<string> {
  await page.goto('/#/decks/new');
  await page.getByLabel('Title').fill(title);
  await page.getByRole('button', { name: 'Save' }).click();
  await page.waitForURL(/#\/decks\/[0-9a-f-]{36}$/);
  return page.url().match(/#\/decks\/([0-9a-f-]{36})$/)![1]!;
}

/** Adds a user-entered example card and waits until it appears in the deck's card list. */
export async function addCard(page: Page, deckId: string, reference: string, passage: string, source?: string) {
  await page.goto(`/#/cards/new?deck=${deckId}`);
  await page.getByLabel('Verse(s)').fill(reference);
  if (source) await page.getByLabel('Source').fill(source);
  await page.getByLabel('Passage', { exact: true }).fill(passage);
  await page.getByRole('button', { name: 'Save' }).click();
  await page.waitForURL(/\/cards$/);
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

export const openDeck = (page: Page, deckId: string) => page.goto(`/#/decks/${deckId}`);

/** Chooses which study cards each verse gets (Settings > Cards for each verse). */
export async function setCardKinds(page: Page, kinds: 'Both' | 'Recall the passage' | 'Identify the verse') {
  await page.goto('/#/settings');
  await page.getByRole('radio', { name: new RegExp(`^${kinds}`) }).check();
  await expect(page.getByRole('radio', { name: new RegExp(`^${kinds}`) })).toBeChecked();
}

/** The fill-in-the-blanks difficulty lives only in Settings. */
export async function setBlankDifficulty(page: Page, level: 'Easy' | 'Medium' | 'Hard') {
  await page.goto('/#/settings');
  const button = page.getByRole('group', { name: 'Blanks difficulty' }).getByRole('button', { name: level, exact: true });
  await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'true');
}
