import { readFileSync } from 'node:fs';
import { test, expect, type Page, type Download } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { addCard, closeWithEscape, createDeck, openDeck } from './helpers';
import { parseExportFile, type ExportFile } from '../src/domain/exchange/format';

const readDownload = async (d: Download) => readFileSync((await d.path())!, 'utf8');
const exportDrawer = (page: Page) => page.getByRole('dialog', { name: /^Export (deck|everything)$/ });

async function exportDeck(page: Page, deckId: string, { progress = false } = {}) {
  await openDeck(page, deckId);
  await page.getByRole('button', { name: 'Deck actions' }).click();
  await page.getByRole('button', { name: 'Export deck' }).click();
  const drawer = exportDrawer(page);
  await expect(drawer).toBeVisible();
  const sw = drawer.getByRole('switch', { name: 'Include my progress' });
  if ((await sw.getAttribute('aria-checked')) === 'true' !== progress) await sw.click();
  const [download] = await Promise.all([page.waitForEvent('download'), drawer.getByRole('button', { name: 'Export' }).click()]);
  const text = await readDownload(download);
  const parsed = parseExportFile(text);
  expect(parsed.ok).toBe(true);
  await expect(page.getByRole('dialog', { name: /^Export (deck|everything)$/ })).toHaveCount(0);
  await page.waitForTimeout(250); // the drawer's history clean-up, before the test goes anywhere else
  return { download, file: (parsed as { ok: true; file: ExportFile }).file };
}

const chooseFile = (page: Page, name: string, content: string, mimeType = 'application/json') =>
  page.locator('input[type=file]').setInputFiles({ name, mimeType, buffer: Buffer.from(content) });

async function twoVerseDeck(page: Page, title = 'My Psalms') {
  const id = await createDeck(page, title);
  await addCard(page, id, 'Psalm 23:1', 'The Lord is my shepherd; I shall not want.');
  await addCard(page, id, 'Psalm 23:2', 'He maketh me to lie down in green pastures.');
  return id;
}
const study = async (page: Page, id: string) => {
  await page.goto(`/#/decks/${id}/study/flashcard`);
  await page.getByRole('button', { name: 'Show answer' }).click();
  await page.getByRole('button', { name: /^Easy/ }).click();
  await expect(page.getByRole('progressbar', { name: 'Session progress' })).toHaveJSProperty('value', 1); // the review is saved before the next card appears
};

test.describe('export', () => {
  test('Export deck is in the deck menu, opens a drawer with a progress switch (off), and saves a deck file', async ({ page }) => {
    const id = await twoVerseDeck(page);
    const { download, file } = await exportDeck(page, id);
    expect(download.suggestedFilename()).toBe('My-Psalms.json');
    expect(file.decks).toHaveLength(1);
    expect(file.decks[0]!.title).toBe('My Psalms');
    expect(file.decks[0]!.cards.map((c) => c.reference)).toEqual(['Psalm 23:1', 'Psalm 23:2']);
    expect(file.includesProgress).toBe(false);
    await expect(page.getByText('Exported My Psalms')).toBeVisible(); // the toast
    await expect(page.getByRole('dialog', { name: /^Export (deck|everything)$/ })).toHaveCount(0); // the drawer closed
  });

  test('"Include my progress" adds the study schedule and history', async ({ page }) => {
    const id = await twoVerseDeck(page);
    await study(page, id);
    await page.reload(); // clears the toast and anything else
    const { file } = await exportDeck(page, id, { progress: true });
    expect(file.includesProgress).toBe(true);
    const studied = file.decks[0]!.cards.find((c) => c.schedules?.length);
    expect(studied?.schedules?.[0]).toMatchObject({ kind: 'recall' });
    expect(studied?.reviews).toHaveLength(1);
  });

  test('the switch explains itself behind an "i"', async ({ page }) => {
    const id = await twoVerseDeck(page);
    await openDeck(page, id);
    await page.getByRole('button', { name: 'Deck actions' }).click();
    await page.getByRole('button', { name: 'Export deck' }).click();
    await exportDrawer(page).getByRole('button', { name: 'Include my progress' }).click(); // the label is also the info button
    await expect(page.getByRole('dialog', { name: 'Include my progress' })).toContainText('Leave it off when you share a deck');
  });

  test('an info drawer opened from the export drawer closes first: outside tap, Escape and Back each close only the top one', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    const id = await twoVerseDeck(page);
    const dialogs = () => page.evaluate(() => [...document.querySelectorAll('[role=dialog]')].filter((d) => getComputedStyle(d).display !== 'none' && d.getAttribute('data-slot') !== 'toast').length);
    const openBoth = async () => {
      await page.goto('/#/');
      await openDeck(page, id);
      await page.getByRole('button', { name: 'Deck actions' }).click();
      await page.getByRole('button', { name: 'Export deck' }).click();
      await exportDrawer(page).getByRole('button', { name: 'Include my progress' }).click();
      await expect(page.getByRole('dialog', { name: 'Include my progress' })).toBeVisible();
      await page.waitForTimeout(600);
      expect(await dialogs()).toBe(2);
    };
    const closeTopOnly = async (how: () => Promise<void>) => {
      await openBoth();
      await how();
      await expect.poll(dialogs).toBe(1); // the info drawer is gone, the export drawer is still there
      await expect(exportDrawer(page)).toBeVisible();
      await how();
      await expect.poll(dialogs).toBe(0); // now the export drawer closes too
    };
    await closeTopOnly(async () => { await page.mouse.click(195, 60); await page.waitForTimeout(500); });
    await closeTopOnly(async () => { await page.keyboard.press('Escape'); await page.waitForTimeout(500); });
    await closeTopOnly(async () => { await page.goBack(); await page.waitForTimeout(500); });
  });

  test('Settings > Backup: Export everything saves all decks, with progress on by default', async ({ page }) => {
    await twoVerseDeck(page, 'First');
    await twoVerseDeck(page, 'Second');
    await page.goto('/#/settings');
    await expect(page.getByText(/Backup and sync aren't available yet/)).toHaveCount(0); // the old "not available yet" note is gone
    await page.getByRole('button', { name: 'Export everything' }).click();
    const drawer = exportDrawer(page);
    await expect(drawer.getByRole('switch', { name: 'Include my progress' })).toHaveAttribute('aria-checked', 'true');
    const [download] = await Promise.all([page.waitForEvent('download'), drawer.getByRole('button', { name: 'Export' }).click()]);
    expect(download.suggestedFilename()).toBe('bible-memory-backup.json');
    const parsed = parseExportFile(await readDownload(download));
    expect(parsed.ok && parsed.file.decks.map((d) => d.title)).toEqual(['First', 'Second']);
    await expect(page.getByText('Exported everything')).toBeVisible();
  });
});

test.describe('import a deck file', () => {
  test('exporting then importing adds a NEW deck and leaves the original alone', async ({ page }) => {
    const id = await twoVerseDeck(page);
    const { file } = await exportDeck(page, id);
    await page.goto('/#/import');
    await chooseFile(page, 'My-Psalms.json', JSON.stringify(file));
    const contents = page.getByRole('region', { name: 'What will be added' });
    await expect(contents).toContainText('My Psalms');
    await expect(contents).toContainText('2 cards');
    await expect(page.getByRole('switch', { name: 'Import my progress too' })).toHaveCount(0); // the file has none
    await page.getByRole('button', { name: 'Import', exact: true }).click();
    await expect(page.getByText('Imported 1 deck')).toBeVisible();
    await expect(page).toHaveURL(/#\/decks\/[0-9a-f-]{36}$/);
    expect(page.url()).not.toContain(id); // a different deck
    await expect(page.getByRole('heading', { name: 'My Psalms', exact: true })).toBeVisible();

    await page.goto('/');
    await expect(page.getByRole('link', { name: /My Psalms/ })).toHaveCount(2); // the original and the copy
  });

  test('progress is imported only if the file has it and you leave the switch on', async ({ page }) => {
    await page.goto('/#/settings');
    await page.getByLabel('New cards per day', { exact: true }).fill('50'); // so the daily limit on new cards does not get in the way
    await page.waitForTimeout(300);
    const id = await twoVerseDeck(page);
    await study(page, id);
    await page.reload();
    const { file } = await exportDeck(page, id, { progress: true });
    await page.reload();

    // with progress: the studied card is not due again, so one fewer card is waiting than in a fresh copy
    await page.goto('/#/import');
    await chooseFile(page, 'a.json', JSON.stringify(file));
    const sw = page.getByRole('switch', { name: 'Import my progress too' });
    await expect(sw).toHaveAttribute('aria-checked', 'true');
    await page.getByRole('button', { name: 'Import', exact: true }).click();
    await expect(page.getByText('3 cards to study today.')).toBeVisible();

    // without: everything is new again
    await page.goto('/#/import');
    await chooseFile(page, 'a.json', JSON.stringify(file));
    await page.getByRole('switch', { name: 'Import my progress too' }).click();
    await page.getByRole('button', { name: 'Import', exact: true }).click();
    await expect(page.getByText('4 cards to study today.')).toBeVisible();
  });

  test('a whole backup brings back several decks at once', async ({ page }) => {
    await twoVerseDeck(page, 'First');
    await twoVerseDeck(page, 'Second');
    await page.goto('/#/settings');
    await page.getByRole('button', { name: 'Export everything' }).click();
    const [download] = await Promise.all([page.waitForEvent('download'), exportDrawer(page).getByRole('button', { name: 'Export' }).click()]);
    const backup = await readDownload(download);
    await expect(page.getByRole('dialog', { name: /^Export (deck|everything)$/ })).toHaveCount(0);
    await page.waitForTimeout(250);
    await page.reload();

    await page.getByRole('link', { name: 'Import' }).click(); // from Settings > Backup
    await expect(page).toHaveURL(/#\/import$/);
    await chooseFile(page, 'bible-memory-backup.json', backup);
    await expect(page.getByRole('region', { name: 'What will be added' }).getByRole('listitem')).toHaveCount(2);
    await page.getByRole('button', { name: 'Import', exact: true }).click();
    await expect(page.getByText('Imported 2 decks')).toBeVisible();
    await expect(page).toHaveURL(/#\/$/); // several decks: back to the list
    await expect(page.getByRole('link', { name: /First/ })).toHaveCount(2);
  });

  test('the + drawer has an Import deck row that opens the import page', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Add' }).click();
    await page.getByRole('dialog', { name: 'Create new' }).getByRole('button', { name: 'Import deck' }).click();
    await expect(page).toHaveURL(/#\/import$/);
    await expect(page.getByRole('heading', { name: 'Import deck' })).toBeVisible();
  });

  test('bad files get a clear message and nothing is added', async ({ page }) => {
    await page.goto('/#/import');
    const cases: [string, string, RegExp][] = [
      ['x.json', JSON.stringify({ hello: 'world' }), /isn't a deck file from this app/],
      ['x.json', JSON.stringify({ app: 'simple-bible-memory', format: 99, decks: [] }), /newer version of the app/],
      ['x.json', JSON.stringify({ app: 'simple-bible-memory', format: 1, decks: [{ title: 'T', cards: [{ reference: '', verseText: 'x' }] }] }), /damaged|isn't a valid deck file/],
      ['x.json', JSON.stringify({ app: 'simple-bible-memory', format: 1, decks: [] }), /doesn't contain any decks/],
      ['x.json', '{ not json', /damaged|isn't a valid deck file/],
      ['x.txt', '', /Couldn't find any cards/],
      ['x.txt', 'just one column of text', /at least two columns/],
    ];
    for (const [name, content, message] of cases) {
      await chooseFile(page, name, content, name.endsWith('.json') ? 'application/json' : 'text/plain');
      await expect(page.getByRole('alert')).toContainText(message);
      await expect(page.getByRole('button', { name: 'Import', exact: true })).toHaveCount(0);
    }
    await page.goto('/');
    await expect(page.getByText('No decks yet')).toBeVisible();
  });
});

test.describe('import from Anki', () => {
  const ANKI = '#separator:tab\n#html:true\n#columns:Front\tBack\tTags\nJohn 3:16\tFor God so loved the world<br>that he gave\tkjv\n\tno verse here\t\nPsalm 23:1\tThe Lord is my shepherd\tkjv\nRomans 8:28\t\tkjv\nPsalm 1:1\tBlessed is the man\tkids\n';

  test('reads the file, guesses the columns, shows a preview, and creates a deck', async ({ page }) => {
    await page.goto('/#/import');
    await chooseFile(page, 'Memory verses.txt', ANKI, 'text/plain');
    await expect(page.getByLabel('Deck name')).toHaveValue('Memory verses');
    await expect(page.getByRole('button', { name: /^Verse:/ })).toContainText('Front');
    await expect(page.getByRole('button', { name: /^Passage:/ })).toContainText('Back');
    await expect(page.getByRole('button', { name: /^Source:/ })).toContainText('None');
    const preview = page.getByRole('region', { name: 'What will be added' });
    await expect(preview).toContainText('John 3:16');
    await expect(preview).toContainText('For God so loved the world'); // the HTML <br> became a line break, not text
    await expect(preview).toContainText('3 cards ready to import.');
    await expect(preview).toContainText('2 rows left out (no verse or passage).');

    // choose the Tags column as the source
    await page.getByRole('button', { name: /^Source:/ }).click();
    await page.getByRole('dialog', { name: 'Select a column' }).getByRole('button', { name: /^Tags/ }).click();

    await page.getByRole('button', { name: 'Import', exact: true }).click();
    await expect(page.getByText('Imported 1 deck')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Memory verses' })).toBeVisible();

    await page.getByRole('button', { name: 'Deck actions' }).click();
    await page.getByRole('link', { name: 'Browse cards' }).click();
    await expect(page.getByRole('link', { name: 'John 3:16' })).toBeVisible();
    await expect(page.getByRole('row')).toHaveCount(4); // header + 3 cards
    await page.getByRole('link', { name: 'Psalm 1:1' }).click();
    await expect(page.getByLabel('Source')).toHaveValue('kids');
  });

  test('"First row is a header" skips the first row; the deck name can be changed', async ({ page }) => {
    await page.goto('/#/import');
    await chooseFile(page, 'plain.csv', 'Verse,Text\nJohn 3:16,For God so loved\nPsalm 23:1,The Lord is my shepherd\n', 'text/csv');
    await expect(page.getByRole('region', { name: 'What will be added' })).toContainText('3 cards ready'); // the header row counts as a card for now
    await page.getByRole('switch', { name: 'First row is a header' }).click();
    await expect(page.getByRole('region', { name: 'What will be added' })).toContainText('2 cards ready');
    await page.getByLabel('Deck name').fill('My Anki deck');
    await page.getByRole('button', { name: 'Import', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'My Anki deck' })).toBeVisible();
  });

  test('swapping the columns works; choosing the same column for both is refused', async ({ page }) => {
    await page.goto('/#/import');
    await chooseFile(page, 'a.txt', 'For God so loved\tJohn 3:16\n', 'text/plain');
    await page.getByRole('button', { name: /^Verse:/ }).click();
    await page.getByRole('dialog', { name: 'Select a column' }).getByRole('button', { name: /^Column 2/ }).click();
    await page.getByRole('button', { name: /^Passage:/ }).click();
    await page.getByRole('dialog', { name: 'Select a column' }).getByRole('button', { name: /^Column 1/ }).click();
    await expect(page.getByRole('region', { name: 'What will be added' })).toContainText('John 3:16');
    await expect(page.getByRole('button', { name: 'Import', exact: true })).toBeEnabled();

    await page.getByRole('button', { name: /^Passage:/ }).click();
    await page.getByRole('dialog', { name: 'Select a column' }).getByRole('button', { name: /^Column 2/ }).click();
    await expect(page.getByRole('alert')).toContainText('Choose a different column');
    await expect(page.getByRole('button', { name: 'Import', exact: true })).toBeDisabled();
  });
});

test.describe('in Spanish, and accessibility', () => {
  test('the export drawer and the import page are in Spanish', async ({ browser }) => {
    const ctx = await browser.newContext({ locale: 'es-ES' });
    const page = await ctx.newPage();
    await page.goto('/#/settings');
    await page.getByRole('button', { name: 'Exportar todo' }).click();
    await expect(page.getByRole('dialog', { name: 'Exportar todo' }).getByRole('switch', { name: 'Incluir mi progreso' })).toBeVisible();
    await closeWithEscape(page);
    await page.goto('/#/import');
    await expect(page.getByRole('heading', { name: 'Importar baraja' })).toBeVisible();
    await chooseFile(page, 'x.json', JSON.stringify({ hello: 1 }));
    await expect(page.getByRole('alert')).toContainText('no es un archivo de baraja de esta app');
    await ctx.close();
  });

  for (const scheme of ['light', 'dark'] as const) {
    test(`export drawer and import preview have no accessibility violations (${scheme})`, async ({ browser }) => {
      const ctx = await browser.newContext({ colorScheme: scheme });
      const page = await ctx.newPage();
      const audit = async () => {
        const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
        expect(r.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
      };
      const id = await twoVerseDeck(page);
      await openDeck(page, id);
      await page.getByRole('button', { name: 'Deck actions' }).click();
      await page.getByRole('button', { name: 'Export deck' }).click();
      await expect(exportDrawer(page)).toBeVisible();
      await page.waitForTimeout(700);
      await audit();
      await closeWithEscape(page);

      await page.goto('/#/import');
      await chooseFile(page, 'a.txt', '#separator:tab\n#columns:Front\tBack\nJohn 3:16\tFor God so loved\n', 'text/plain');
      await expect(page.getByRole('region', { name: 'What will be added' })).toBeVisible();
      await audit();
      await ctx.close();
    });
  }
});
