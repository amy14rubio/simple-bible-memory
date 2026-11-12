import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { addCard, setCardKinds, tapFirstBankWord, wordBankOpen, closeWithEscape } from './helpers';

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
    await expect(page.getByText('No collections yet')).toBeVisible();
    await audit(page, 'empty home');
    await page.goto('/#/stats');
    await audit(page, 'empty statistics');

    await page.goto('/#/collections/new');
    await audit(page, 'new collection form');
    await page.getByLabel('Title').fill('Audit collection');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Nothing to study yet')).toBeVisible();
    await audit(page, 'empty collection');
    const id = page.url().match(/#\/collections\/([0-9a-f-]{36})$/)![1]!;

    await page.goto(`/#/cards/new?collection=${id}`);
    await page.getByLabel('Verse(s)').fill('John 3:16');
    await page.getByLabel('Passage', { exact: true }).fill('Example verse text typed by the user.');
    await audit(page, 'card form with the Find passage button');
    await page.getByRole('button', { name: /Find passage/ }).click();
    await expect(page.getByRole('dialog', { name: 'Find a Bible passage' })).toBeVisible();
    await audit(page, 'Find passage dialog');
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).dispatchEvent('click');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('John 3:16 added')).toBeVisible();
    await page.waitForTimeout(800); // let the toast finish sliding in
    await audit(page, 'card form with the toast');
    await addCard(page, id, 'Psalm 130:1', 'Another example passage.');
    await audit(page, 'card browse');
    await page.getByRole('button', { name: 'Search cards' }).click();
    await audit(page, 'card browse with search');

    await page.goto('/');
    await audit(page, 'home with a collection');
    await page.getByRole('button', { name: 'Add' }).click();
    await expect(page.getByRole('button', { name: 'New collection' })).toBeVisible();
    await audit(page, 'home with the add menu open');
    await closeWithEscape(page);
    await page.getByRole('button', { name: 'Actions for Audit collection' }).click();
    await expect(page.getByRole('dialog', { name: 'Audit collection' })).toBeVisible();
    await audit(page, 'collection menu dialog');
    await closeWithEscape(page);

    await page.goto(`/#/collections/${id}`);
    await expect(page.getByRole('link', { name: /Flashcard/ })).toBeVisible();
    await audit(page, 'open collection view');

    await page.getByRole('link', { name: /Flashcard/ }).click();
    await audit(page, 'flashcard front');
    await page.getByRole('button', { name: 'Show answer' }).click();
    await audit(page, 'flashcard back with ratings');
    await page.goto(`/#/collections/${id}`);
    await page.getByRole('link', { name: /Type/ }).click();
    await page.getByLabel('Type the verse from memory').fill('example verse test typed by user');
    await audit(page, 'type input');
    await page.getByRole('button', { name: 'Show answer' }).click();
    await audit(page, 'type feedback');
    await page.goto(`/#/collections/${id}`);
    await page.getByRole('link', { name: /Blanks/ }).click();
    await audit(page, 'blanks word bank');
    await tapFirstBankWord(page);
    await audit(page, 'blanks partly filled');
    while (await wordBankOpen(page)) await tapFirstBankWord(page);
    await audit(page, 'blanks result');

    // split into separate verses: the preview, and the explanation when it can't split
    await page.goto(`/#/cards/new?collection=${id}`);
    await page.getByLabel('Verse(s)').fill('Psalm 130:1-2');
    await page.getByLabel('Passage', { exact: true }).fill('1 Example one first. 2 Example two second.');
    await audit(page, 'card form with split and add-another buttons');
    await page.getByRole('button', { name: 'Split into separate verses' }).click();
    await expect(page.getByRole('dialog', { name: 'Split into separate verses' })).toContainText('This creates 2 cards');
    await audit(page, 'split preview dialog');
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).dispatchEvent('click');
    await page.getByLabel('Passage', { exact: true }).fill('No verse numbers here.');
    await page.getByRole('button', { name: 'Split into separate verses' }).click();
    await expect(page.getByRole('dialog')).toContainText("couldn't find verse 2");
    await audit(page, 'split explanation dialog');
    await page.getByRole('dialog').getByRole('button', { name: 'Close' }).dispatchEvent('click');

    // the identify cards (see the passage, name the verse)
    await page.goto('/#/settings');
    await audit(page, 'settings with card kinds');
    await setCardKinds(page, 'Identify the verse');
    await page.goto(`/#/collections/${id}/study/flashcard`);
    await expect(page.getByRole('button', { name: 'Show answer' })).toBeVisible();
    await audit(page, 'identify flashcard front');
    await page.getByRole('button', { name: 'Show answer' }).click();
    await audit(page, 'identify flashcard back');
    await page.goto(`/#/collections/${id}/study/type`);
    await page.getByLabel(/Type the verse/).fill('jn 3:16');
    await audit(page, 'identify type input');
    await page.getByRole('button', { name: 'Show answer' }).click();
    await audit(page, 'identify type result');
    await page.goto(`/#/collections/${id}/study/blanks`);
    await expect(page.getByRole('group', { name: 'Choose the verse' })).toBeVisible();
    await audit(page, 'identify multiple choice');
    await page.getByRole('group', { name: 'Choose the verse' }).getByRole('button').first().click();
    await audit(page, 'identify multiple choice answered');
    await page.goto(`/#/collections/${id}?practice=1`);
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
