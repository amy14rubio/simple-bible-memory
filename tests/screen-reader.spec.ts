import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
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

test.describe('the medium fixes', () => {
  test('M1: selecting cards is announced, comes first for a screen reader, and keeps focus sensible', async ({ page }) => {
    const id = await deckWithCard(page);
    await page.goto(`/#/decks/${id}/cards`);
    // the way in is before the list, not after every card
    const before = await page.getByRole('button', { name: 'Select cards' }).evaluate((b) => !!(b.compareDocumentPosition(document.querySelector('table')!) & Node.DOCUMENT_POSITION_FOLLOWING));
    expect(before).toBe(true);

    await page.getByRole('button', { name: 'Select cards' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('status').filter({ hasText: 'Selecting cards. 0 selected.' })).toBeAttached();
    await expect(page.getByRole('checkbox').first()).toBeFocused(); // the cursor goes into the list
    await page.keyboard.press('Space');
    await expect(page.getByRole('status').filter({ hasText: 'Selecting cards. 1 selected.' })).toBeAttached();
    await page.getByRole('button', { name: 'Cancel selection' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Selection ended.' })).toBeAttached();
    expect(await focused(page)).toMatchObject({ tag: 'h1' });
  });

  test('M2: the Undo toast says Undo is there, and stays long enough to find it', async ({ page }) => {
    const id = await deckWithCard(page);
    await page.goto(`/#/decks/${id}/cards`);
    await page.getByRole('row', { name: /Psalm 1:1/ }).click();
    await page.getByRole('button', { name: 'Delete card' }).click();
    await page.locator('dialog[open]').getByRole('button', { name: 'Delete card' }).click();
    const toast = page.getByRole('region', { name: 'Notifications' });
    await expect(toast).toContainText('Psalm 1:1 deleted');
    await expect(toast).toContainText('Undo is available in the Notifications region.');
    await page.waitForTimeout(11_000); // the old time limit
    await expect(toast.getByRole('button', { name: 'Undo' })).toBeVisible();
  });

  test('M3: after a blank is filled, the announcement says which blank is next', async ({ page }) => {
    const id = await deckWithCard(page);
    await page.goto(`/#/decks/${id}/study/blanks`);
    await page.getByRole('group', { name: 'Word bank' }).getByRole('button').first().click();
    await expect(page.getByRole('status').filter({ hasText: /Blank 2, the one to fill in now/ })).toBeAttached();
  });

  test('M4: verses carry their own language, even when the app is in another', async ({ page }) => {
    await page.goto('/#/decks/new');
    await page.getByLabel('Title').fill('Salmos');
    await page.getByRole('button', { name: /^Translation/ }).click();
    await page.getByRole('dialog', { name: 'Select a translation' }).getByRole('button', { name: /RV1909/ }).click();
    await page.getByRole('button', { name: 'Save' }).click();
    await page.waitForURL(/#\/decks\/[0-9a-f-]{36}$/);
    const id = page.url().match(/#\/decks\/([0-9a-f-]{36})$/)![1]!;
    await addCard(page, id, 'Salmo 23:1', 'Jehová es mi pastor; nada me faltará.');
    await page.goto(`/#/decks/${id}/cards`);
    await expect(page.locator('td [lang="es"]').first()).toBeAttached();
    await setCardKinds(page, 'Recall the passage');
    await page.goto(`/#/decks/${id}/study/flashcard`);
    await page.getByRole('button', { name: 'Show answer' }).click();
    await expect(page.locator('p[lang="es"]').filter({ hasText: 'Jehová' })).toBeAttached();
  });

  test('M5: a form error names the field, marks it invalid and puts the cursor in it', async ({ page }) => {
    await page.goto('/#/decks/new');
    await page.getByRole('button', { name: 'Save' }).click();
    const title = page.getByLabel('Title');
    await expect(title).toHaveAttribute('aria-invalid', 'true');
    await expect(title).toHaveAttribute('aria-describedby', 'form-error');
    await expect(title).toBeFocused();
    await expect(page.locator('#form-error')).toBeVisible();
    await title.fill('x');
    await expect(title).not.toHaveAttribute('aria-invalid', 'true'); // fixing it clears the mark

    const id = await createDeck(page, 'Psalms');
    await page.goto(`/#/cards/new?deck=${id}`);
    await page.getByLabel('Passage', { exact: true }).fill('Some text');
    await page.getByRole('button', { name: 'Save' }).click();
    const verse = page.getByLabel('Verse(s)');
    await expect(verse).toHaveAttribute('aria-invalid', 'true');
    await expect(verse).toBeFocused();
  });

  test('M6: the 1 to 4 keys rate only when focus is on the answer or the ratings, and never with Cmd/Ctrl', async ({ page }) => {
    const id = await deckWithCard(page);
    await page.goto(`/#/decks/${id}/study/flashcard`);
    await page.getByRole('button', { name: 'Show answer' }).click();
    await expect(page.getByRole('group', { name: /^Answer: / })).toBeFocused();
    const remaining = () => page.getByRole('list', { name: 'Cards remaining' }).innerText();
    const before = await remaining();
    await page.keyboard.press('Control+3');
    await page.keyboard.press('Meta+3');
    expect(await remaining()).toBe(before); // modifier keys are the browser's
    await page.getByRole('link', { name: 'Exit study' }).focus();
    await page.keyboard.press('3');
    expect(await remaining()).toBe(before); // focus is on something else: the key means nothing here
    await page.getByRole('group', { name: /^Answer: / }).focus();
    await page.keyboard.press('3'); // on the answer: Good
    await expect(page.getByRole('button', { name: 'Show answer' })).toBeVisible(); // the next card
  });

  test('M7: a custom theme with unreadable text says so, out loud', async ({ page }) => {
    await page.goto('/#/settings/theme');
    await page.getByRole('radio', { name: 'Custom' }).check();
    const hex = page.getByLabel('Text, hex code');
    await hex.fill('#f0f0ee'); // almost the same as the light background
    await expect(page.getByRole('status').filter({ hasText: /Low contrast: this text colour/ })).toBeVisible();
    await hex.fill('#17171a');
    await expect(page.getByText(/Low contrast: this text colour/)).toHaveCount(0);
  });
});

test.describe('the small fixes', () => {
  test('L1: no two landmarks share a name on Settings (best-practice check)', async ({ page }) => {
    await page.goto('/#/settings');
    await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(['best-practice']).analyze();
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });

  test('L2: rating buttons say their wait in words ("10 minutes"), not "10m"', async ({ page }) => {
    const id = await deckWithCard(page);
    await page.goto(`/#/decks/${id}/study/flashcard`);
    await page.getByRole('button', { name: 'Show answer' }).click();
    const good = page.getByRole('group', { name: 'How well did you remember it?' }).getByRole('button', { name: /^Good/ });
    await expect(good).toHaveAccessibleName(/^Good\s+\d+ (minutes?|hours?|days?)/);
    await expect(good).toContainText(/\d+(m|h|d)/); // the short form is still what is drawn
  });

  test('L4: the chart legend buttons are at least 44px tall', async ({ page }) => {
    await deckWithCard(page);
    await page.goto('/#/stats');
    const legend = page.getByRole('group', { name: 'Highlight a stage in the chart' }).getByRole('button').first();
    expect((await legend.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  });
});
