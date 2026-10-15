import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { addCard, tapFirstBankWord, wordBankOpen } from './helpers';

async function audit(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const summary = results.violations.map((v) => `${v.id}: ${v.help} -> ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`);
  expect(summary, `accessibility violations on ${label}`).toEqual([]);
}

for (const scheme of ['light', 'dark'] as const) {
  test(`no WCAG A/AA violations on any main screen (${scheme})`, async ({ browser }) => {
    test.setTimeout(90_000); // about 25 audits in one journey
    const ctx = await browser.newContext({ colorScheme: scheme, viewport: { width: 390, height: 800 } });
    const page = await ctx.newPage();

    await page.goto('/');
    await expect(page.getByText('No decks yet')).toBeVisible();
    await audit(page, 'empty home');
    await page.goto('/#/stats');
    await audit(page, 'empty statistics');

    await page.goto('/#/decks/new');
    await audit(page, 'new deck form');
    await page.getByLabel('Title').fill('Audit deck');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Nothing to study yet')).toBeVisible();
    await audit(page, 'empty deck');
    const id = page.url().match(/#\/decks\/([0-9a-f-]{36})$/)![1]!;

    await page.goto(`/#/cards/new?deck=${id}`);
    await page.getByLabel('Verse(s)').fill('John 3:16');
    await page.getByLabel('Passage', { exact: true }).fill('Example verse text typed by the user.');
    await audit(page, 'card form with Bible Gateway button');
    await page.getByRole('button', { name: /Find on Bible Gateway/ }).click();
    await expect(page.getByRole('dialog', { name: 'Find a Bible passage' })).toBeVisible();
    await audit(page, 'Bible Gateway dialog');
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
    await page.getByRole('button', { name: 'Save' }).click();
    await page.waitForURL(/\/cards$/);
    await addCard(page, id, 'Psalm 130:1', 'Another example passage.');
    await audit(page, 'card browse');
    await page.getByRole('button', { name: 'Search cards' }).click();
    await audit(page, 'card browse with search');

    await page.goto('/');
    await audit(page, 'home with a deck');
    await page.getByRole('button', { name: 'Add' }).click();
    await expect(page.getByRole('button', { name: 'New deck' })).toBeVisible();
    await audit(page, 'home with the add menu open');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Actions for Audit deck' }).click();
    await expect(page.getByRole('dialog', { name: 'Audit deck' })).toBeVisible();
    await audit(page, 'deck menu dialog');
    await page.keyboard.press('Escape');

    await page.goto(`/#/decks/${id}`);
    await expect(page.getByRole('link', { name: /Flashcard/ })).toBeVisible();
    await audit(page, 'open deck view');

    await page.getByRole('link', { name: /Flashcard/ }).click();
    await audit(page, 'flashcard front');
    await page.getByRole('button', { name: 'Show answer' }).click();
    await audit(page, 'flashcard back with ratings');
    await page.goto(`/#/decks/${id}`);
    await page.getByRole('link', { name: /Type/ }).click();
    await page.getByLabel('Type the verse from memory').fill('example verse test typed by user');
    await audit(page, 'type input');
    await page.getByRole('button', { name: 'Show answer' }).click();
    await audit(page, 'type feedback');
    await page.goto(`/#/decks/${id}`);
    await page.getByRole('link', { name: /Blanks/ }).click();
    await audit(page, 'blanks word bank');
    await tapFirstBankWord(page);
    await audit(page, 'blanks partly filled');
    while (await wordBankOpen(page)) await tapFirstBankWord(page);
    await audit(page, 'blanks result');

    // split into separate verses: the preview, and the explanation when it can't split
    await page.goto(`/#/cards/new?deck=${id}`);
    await page.getByLabel('Verse(s)').fill('Psalm 130:1-2');
    await page.getByLabel('Passage', { exact: true }).fill('1 Example one first. 2 Example two second.');
    await audit(page, 'card form with split and add-another buttons');
    await page.getByRole('button', { name: 'Split into separate verses' }).click();
    await expect(page.getByRole('dialog', { name: 'Split into separate verses' })).toContainText('This creates 2 cards');
    await audit(page, 'split preview dialog');
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
    await page.getByLabel('Passage', { exact: true }).fill('No verse numbers here.');
    await page.getByRole('button', { name: 'Split into separate verses' }).click();
    await expect(page.getByRole('dialog')).toContainText("couldn't find verse 2");
    await audit(page, 'split explanation dialog');
    await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();

    // the identify cards (see the passage, name the verse)
    await page.goto('/#/settings');
    await audit(page, 'settings with card kinds');
    await page.getByRole('radio', { name: /^Identify the verse/ }).check();
    await page.goto(`/#/decks/${id}/study/flashcard`);
    await expect(page.getByText('Which verse is this?')).toBeVisible();
    await audit(page, 'identify flashcard front');
    await page.getByRole('button', { name: 'Show answer' }).click();
    await audit(page, 'identify flashcard back');
    await page.goto(`/#/decks/${id}/study/type`);
    await page.getByLabel(/Type the verse/).fill('jn 3:16');
    await audit(page, 'identify type input');
    await page.getByRole('button', { name: 'Show answer' }).click();
    await audit(page, 'identify type result');
    await page.goto(`/#/decks/${id}/study/blanks`);
    await expect(page.getByRole('group', { name: 'Choose the verse' })).toBeVisible();
    await audit(page, 'identify multiple choice');
    await page.getByRole('group', { name: 'Choose the verse' }).getByRole('button').first().click();
    await audit(page, 'identify multiple choice answered');
    await page.goto(`/#/decks/${id}?practice=1`);
    await expect(page.getByRole('heading', { name: 'Extra practice' })).toBeVisible();
    await audit(page, 'extra practice');

    await page.goto('/#/stats');
    await expect(page.getByRole('heading', { name: 'Statistics' })).toBeAttached();
    await audit(page, 'statistics');
    await page.goto('/#/settings');
    await audit(page, 'settings');
    await ctx.close();
  });
}
