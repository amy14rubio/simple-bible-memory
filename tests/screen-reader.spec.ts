import { test, expect, type Page } from '@playwright/test';
import { addCard, createDeck, setCardKinds, tapFirstBankWord, wordBankOpen } from './helpers';

/**
 * What a screen reader needs, checked through what it reads: names, focus and headings. (These are the things an
 * automated check can prove; how it sounds is checked by listening with VoiceOver and TalkBack.)
 */
const focused = (page: Page) => page.evaluate(() => {
  const a = document.activeElement as HTMLElement | null;
  return a ? { tag: a.tagName.toLowerCase(), role: a.getAttribute('role'), name: a.getAttribute('aria-label') ?? a.textContent?.trim() ?? '' } : null;
});

async function deckWithCard(page: Page, kinds: 'Recall the passage' | 'Identify the verse' = 'Recall the passage') {
  const id = await createDeck(page, 'Psalms');
  await addCard(page, id, 'John 3:16', 'For God so loved the world that he gave his only Son.');
  await addCard(page, id, 'Psalm 23:1', 'The Lord is my shepherd; I shall not want.'); // (identify choices need other verses)
  await addCard(page, id, 'Psalm 1:1', 'Blessed is the man that walketh not.');
  await addCard(page, id, 'Psalm 2:1', 'Why do the heathen rage.');
  await setCardKinds(page, kinds);
  return id;
}

test.describe('moving between screens', () => {
  test('each screen names the tab, and focus moves to its heading', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle('Simple Bible Memory');
    await page.getByRole('link', { name: 'Settings' }).click();
    await expect(page).toHaveTitle('Settings · Simple Bible Memory');
    expect(await focused(page)).toMatchObject({ tag: 'h1', name: 'Settings' });

    await page.getByRole('link', { name: /^Language/ }).click();
    await expect(page).toHaveTitle('Language · Simple Bible Memory');
    expect(await focused(page)).toMatchObject({ tag: 'h1' });

    await page.getByRole('link', { name: 'Back' }).click();
    await expect(page).toHaveTitle('Settings · Simple Bible Memory');
  });

  test('a screen that puts the cursor in a field keeps it there, and the first screen is left alone', async ({ page }) => {
    await page.goto('/#/decks/new');
    await expect(page).toHaveTitle('New deck · Simple Bible Memory');
    expect(await focused(page)).toMatchObject({ tag: 'input' });
  });

  test('screens that load their data are still named and announced', async ({ page }) => {
    const id = await createDeck(page, 'Psalms');
    await page.goto('/');
    await page.getByRole('link', { name: /Psalms/ }).click();
    await expect(page).toHaveTitle('Psalms · Simple Bible Memory');
    expect(await focused(page)).toMatchObject({ tag: 'h1', name: 'Psalms' });
    await page.getByRole('button', { name: 'Deck actions' }).click();
    await page.getByRole('link', { name: 'Browse cards' }).click();
    await expect(page).toHaveTitle('Cards in Psalms · Simple Bible Memory');
    expect(id).toBeTruthy();
  });

  test.describe('in Spanish', () => {
    test.use({ locale: 'es-ES' });
    test('the tab title is in Spanish too', async ({ page }) => {
      await page.goto('/');
      await expect(page).toHaveTitle('Memoria Bíblica Simple');
      await page.getByRole('link', { name: 'Ajustes' }).click();
      await expect(page).toHaveTitle('Ajustes · Memoria Bíblica Simple');
    });
  });
});

test.describe('studying', () => {
  test('the study screen has a real heading', async ({ page }) => {
    const id = await deckWithCard(page);
    await page.goto(`/#/decks/${id}/study/flashcard`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Studying Psalms: Flashcard');
    await expect(page).toHaveTitle('Studying Psalms: Flashcard · Simple Bible Memory');
  });

  test('Flashcard: Show answer moves focus to the answer, which has the verse as its name', async ({ page }) => {
    const id = await deckWithCard(page);
    await page.goto(`/#/decks/${id}/study/flashcard`);
    await page.getByRole('button', { name: 'Show answer' }).click();
    const f = await focused(page);
    expect(f).toMatchObject({ tag: 'div', role: 'group' });
    expect(f!.name).toMatch(/^Answer: /);
    await expect(page.getByRole('group', { name: /^Answer: / })).toBeFocused();
    await page.keyboard.press('Tab'); // the next stop is the rating buttons
    await expect(page.getByRole('group', { name: 'How well did you remember it?' }).getByRole('button').first()).toBeFocused();
  });

  test('Type: the result says how many words were wrong, and marks each run of wrong words in words', async ({ page }) => {
    const id = await deckWithCard(page);
    await page.goto(`/#/decks/${id}/study/type`);
    const card = (await page.locator('main p').filter({ hasText: /^(John 3:16|Psalm 23:1|Psalm 1:1|Psalm 2:1)$/ }).first().textContent())!;
    const typed = card === 'John 3:16' ? 'For God so hated the earth that he gave nothing' : 'Totally different words here';
    await page.getByRole('textbox').fill(typed);
    await page.getByRole('button', { name: 'Show answer' }).click();

    const group = page.getByRole('group', { name: /^Not every word matched\./ });
    await expect(group).toBeFocused();
    const text = (await group.textContent())!;
    expect(text).toContain('Extra words:');
    expect(text).toContain('Missed words:');
    expect(text).toContain('end.');
    // no tooltip-only information is left behind
    expect(await group.locator('[title]').count()).toBe(0);
  });

  test('Type: a perfect answer says so, and says the verse', async ({ page }) => {
    const id = await deckWithCard(page);
    await page.goto(`/#/decks/${id}/study/type`);
    const reference = (await page.locator('main p').filter({ hasText: /^(John 3:16|Psalm 23:1|Psalm 1:1|Psalm 2:1)$/ }).first().textContent())!;
    const verse = { 'John 3:16': 'For God so loved the world that he gave his only Son.', 'Psalm 23:1': 'The Lord is my shepherd; I shall not want.', 'Psalm 1:1': 'Blessed is the man that walketh not.', 'Psalm 2:1': 'Why do the heathen rage.' }[reference]!;
    await page.getByRole('textbox').fill(verse);
    await page.getByRole('button', { name: 'Show answer' }).click();
    const group = page.getByRole('group', { name: new RegExp(`^Every word matched\\. ${verse.slice(0, 12)}`) });
    await expect(group).toBeFocused();
  });

  test('Blanks: finishing the last blank moves focus to the result and says how many were right', async ({ page }) => {
    const id = await deckWithCard(page);
    await page.goto(`/#/decks/${id}/study/blanks`);
    await expect(page.getByRole('group', { name: 'Word bank' })).toBeVisible();
    while (await wordBankOpen(page)) await tapFirstBankWord(page);
    const done = page.getByRole('group', { name: /^All blanks filled: \d+ of \d+ right\.$/ });
    await expect(done).toBeFocused();
  });

  test('Choosing the verse: the choice is answered out loud, with the right verse', async ({ page }) => {
    const id = await deckWithCard(page, 'Identify the verse');
    await page.goto(`/#/decks/${id}/study/blanks`);
    await page.getByRole('group', { name: 'Choose the verse' }).getByRole('button').first().click();
    const answered = page.getByRole('group', { name: /^(Correct\.|Not quite\. The verse is )/ });
    await expect(answered).toBeFocused();
  });

  test('Identify, Flashcard: the revealed verse reference is the focused answer', async ({ page }) => {
    const id = await deckWithCard(page, 'Identify the verse');
    await page.goto(`/#/decks/${id}/study/flashcard`);
    await page.getByRole('button', { name: 'Show answer' }).click();
    await expect(page.getByRole('group', { name: /^Answer: / })).toBeFocused();
  });
});
