import { readFileSync } from 'node:fs';
import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { closeWithEscape, createDeck, openDeck } from './helpers';
import { parseExportFile } from '../src/domain/exchange/format';

/** The YouVersion service is a stand-in here (VITE_FAKE_YOUVERSION): it makes up "Fake NASB2020 text of John 3:16." and can be told to fail. */
type Fake = { asked: { code: string; reference: string }[]; failWith: string[]; delayMs: number };
const fake = (page: Page) => page.evaluate(() => (window as unknown as { __fakeYouVersion: Fake }).__fakeYouVersion);
const failNext = (page: Page, ...problems: string[]) => page.evaluate((p) => { (window as unknown as { __fakeYouVersion: Fake }).__fakeYouVersion.failWith.push(...p); }, problems);

async function newCardForm(page: Page, deckId: string) {
  await page.goto(`/#/cards/new?collection=${deckId}`);
  await expect(page.getByLabel('Verse(s)')).toBeVisible();
  await page.evaluate(() => { (window as unknown as { __fakeYouVersion: Fake }).__fakeYouVersion.asked.length = 0; });
}
const autofillSwitch = (page: Page) => page.getByRole('switch', { name: 'Autofill' });
const translationButton = (page: Page) => page.getByRole('button', { name: /^Translation: / });
async function chooseTranslation(page: Page, name: string, language?: string) {
  await translationButton(page).click();
  const dialog = page.getByRole('dialog', { name: 'Choose a translation' });
  if (language) {
    await dialog.getByRole('tab', { name: 'Language' }).click();
    await dialog.getByRole('button', { name: language }).click();
  }
  await dialog.getByRole('button', { name: new RegExp(name) }).click();
  await expect(dialog).toBeHidden();
}

test('autofill is off by default and turns on a translation picker', async ({ page }) => {
  const id = await createDeck(page, 'Verses');
  await newCardForm(page, id);
  await expect(autofillSwitch(page)).toHaveAttribute('aria-checked', 'false');
  await expect(translationButton(page)).toHaveCount(0);
  await autofillSwitch(page).click();
  await expect(autofillSwitch(page)).toHaveAttribute('aria-checked', 'true');
  await expect(translationButton(page)).toBeVisible();
  await expect(page.getByLabel('Passage', { exact: true })).toHaveAttribute('placeholder', /fills in/);
});

test('typing a reference fills in the passage from the chosen translation, and it stays editable for an open text', async ({ page }) => {
  const id = await createDeck(page, 'Verses');
  await newCardForm(page, id);
  await autofillSwitch(page).click();
  await page.getByLabel('Verse(s)').fill('John 3:16');
  const passage = page.getByLabel('Passage', { exact: true });
  await expect(passage).toHaveValue('Fake WEB text of John 3:16.');
  await expect(passage).toBeEditable(); // WEB is an open text
  await expect(page.locator('[data-attribution]')).toHaveCount(0);
  await passage.fill('Fake WEB text of John 3:16. (my own edit)');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('John 3:16 added')).toBeVisible();
  await expect(page.getByLabel('Verse(s)')).toHaveValue(''); // ready for the next card, autofill still on
  await expect(autofillSwitch(page)).toHaveAttribute('aria-checked', 'true');
});

test('turning autofill off and on again fills in the reference already written', async ({ page }) => {
  const id = await createDeck(page, 'Verses');
  await newCardForm(page, id);
  await autofillSwitch(page).click();
  await page.getByLabel('Verse(s)').fill('John 3:16');
  const passage = page.getByLabel('Passage', { exact: true });
  await expect(passage).toHaveValue('Fake WEB text of John 3:16.');
  await autofillSwitch(page).click();
  await passage.fill('my own words');
  await autofillSwitch(page).click();
  await expect(passage).toHaveValue('Fake WEB text of John 3:16.');
});

test('the picker has a Translation tab and a Language tab', async ({ page }) => {
  const id = await createDeck(page, 'Verses');
  await newCardForm(page, id);
  await autofillSwitch(page).click();
  await translationButton(page).click();
  const dialog = page.getByRole('dialog', { name: 'Choose a translation' });
  await expect(dialog.getByRole('tab', { name: 'Translation' })).toHaveAttribute('aria-selected', 'true');
  await expect(dialog.getByRole('button', { name: /New American Standard Bible 2020/ })).toBeVisible();
  await expect(dialog.getByRole('button', { name: /La Biblia de las Américas/ })).toHaveCount(0); // English only, to start with
  await dialog.getByRole('tab', { name: 'Language' }).click();
  await dialog.getByRole('button', { name: /^Spanish/ }).click();
  await expect(dialog.getByRole('tab', { name: 'Translation' })).toHaveAttribute('aria-selected', 'true'); // choosing a language goes back to its translations
  await expect(dialog.getByRole('button', { name: /Nueva Biblia de las Américas/ })).toBeVisible();
  await expect(dialog.getByRole('button', { name: /American Standard/ })).toHaveCount(0);
});

test('the search looks through whatever the open tab lists: translations on one tab, languages on the other', async ({ page }) => {
  const id = await createDeck(page, 'Verses');
  await newCardForm(page, id);
  await autofillSwitch(page).click();
  await translationButton(page).click();
  const dialog = page.getByRole('dialog', { name: 'Choose a translation' });
  // on the Language tab, the search finds languages (and says so)
  await dialog.getByRole('tab', { name: 'Language' }).click();
  await dialog.getByRole('button', { name: 'Search languages' }).click();
  await dialog.getByRole('searchbox').fill('kaqchi');
  await expect(dialog.getByRole('tabpanel').getByRole('button')).toHaveText(['Kaqchikel']);
  await dialog.getByRole('searchbox').fill('zzzz');
  await expect(dialog.getByText('Nothing matches "zzzz".')).toBeVisible();
  await dialog.getByRole('searchbox').fill('fren');
  await dialog.getByRole('button', { name: 'French', exact: true }).click(); // ("fren" also finds the creoles) choosing a language goes to its translations, and the search is over
  await expect(dialog.getByRole('tab', { name: 'Translation' })).toHaveAttribute('aria-selected', 'true');
  await expect(dialog.getByRole('button', { name: /Bible Segond 1910/ })).toBeVisible();
  // on the Translation tab, the search finds translations (of any language)
  await dialog.getByRole('button', { name: 'Search translations' }).click();
  await dialog.getByRole('searchbox').fill('berean');
  await expect(dialog.getByRole('button', { name: /Berean Standard Bible/ })).toBeVisible();
  await expect(dialog.getByRole('button', { name: /Segond/ })).toHaveCount(0);
  // switching tabs starts the search over, so a word for one list never hides the other
  await dialog.getByRole('tab', { name: 'Language' }).click();
  await expect(dialog.getByRole('searchbox')).toHaveValue('');
  await expect(dialog.getByRole('tabpanel').getByRole('button').first()).toHaveText('English');
});

test('every language the platform has translations in is offered, except Biblica\'s and The Passion Translation', async ({ page }) => {
  const id = await createDeck(page, 'Verses');
  await newCardForm(page, id);
  await autofillSwitch(page).click();
  await translationButton(page).click();
  const dialog = page.getByRole('dialog', { name: 'Choose a translation' });
  await dialog.getByRole('tab', { name: 'Language' }).click();
  const names = await dialog.getByRole('tabpanel').getByRole('button').allInnerTexts();
  expect(names[0]).toMatch(/^English/); // English and Spanish first
  expect(names[1]).toMatch(/^Spanish/);
  expect(names.join(' | ')).toMatch(/French/);
  expect(names.join(' | ')).toMatch(/Portuguese/);
  expect(names.join(' | ')).toMatch(/Greek/);
  expect(names.join(' | ')).toMatch(/Kaqchikel/); // a language the phone has no name for still has a plain one, not a code like "cak"
  expect(names.filter((n) => /^[a-z]{3}$/.test(n.trim()))).toEqual([]); // no row is only a code
  await dialog.getByRole('button', { name: /^French/ }).click();
  await expect(dialog.getByRole('button', { name: /Bible Segond 1910/ })).toBeVisible();
  await expect(dialog.getByRole('button', { name: /Semeur/ })).toHaveCount(0); // Biblica's: not offered
  await dialog.getByRole('button', { name: 'Search translations' }).click();
  await dialog.getByRole('searchbox').fill('international version');
  await expect(dialog.getByText('Nothing matches')).toBeVisible(); // the NIV: not offered
  await dialog.getByRole('searchbox').fill('segond');
  await dialog.getByRole('button', { name: /Bible Segond 1910/ }).click();

  await page.getByLabel('Verse(s)').fill('John 3:16');
  const passage = page.getByLabel('Passage', { exact: true });
  await expect(passage).toHaveValue('Fake YV93 text of John 3:16.');
  await expect(passage).not.toBeEditable(); // licensed like the rest
  const notice = page.locator('[data-attribution="YV93"]');
  await expect(notice).toContainText('Copyright of version 93'); // the publisher\'s own notice, asked for once
  await expect(notice.getByRole('link')).toHaveAttribute('href', 'https://www.bible.com/versions/93');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('John 3:16 added')).toBeVisible();
});

test('the picker can be searched, across every translation, like the font picker', async ({ page }) => {
  const id = await createDeck(page, 'Verses');
  await newCardForm(page, id);
  await autofillSwitch(page).click();
  await translationButton(page).click();
  const dialog = page.getByRole('dialog', { name: 'Choose a translation' });
  await dialog.getByRole('button', { name: 'Search translations' }).click();
  await dialog.getByRole('searchbox').fill('reina');
  await expect(dialog.getByRole('button', { name: /Reina-Valera 1909/ })).toBeVisible(); // a Spanish one, though the tab was English
  await expect(dialog.getByRole('button', { name: /World English Bible/ })).toHaveCount(0);
  await dialog.getByRole('searchbox').fill('nasb');
  await expect(dialog.getByRole('button', { name: /2020/ })).toBeVisible();
  await expect(dialog.getByRole('button', { name: /1995/ })).toBeVisible();
  await dialog.getByRole('searchbox').fill('zzz');
  await expect(dialog.getByText('Nothing matches "zzz".')).toBeVisible();
  await dialog.getByRole('searchbox').fill('berean');
  await dialog.getByRole('button', { name: /Berean Standard Bible/ }).click();
  await expect(translationButton(page)).toContainText('Berean Standard Bible');
  await page.getByLabel('Verse(s)').fill('John 3:16');
  await expect(page.getByLabel('Passage', { exact: true })).toHaveValue('Fake BSB text of John 3:16.');
});

test('a licensed translation: the text cannot be edited, the publisher\'s notice and link are shown, and the card keeps it', async ({ page }) => {
  const id = await createDeck(page, 'Verses');
  await newCardForm(page, id);
  await autofillSwitch(page).click();
  await chooseTranslation(page, 'New American Standard Bible 2020');
  await page.getByLabel('Verse(s)').fill('Philippians 4:6-7');
  const passage = page.getByLabel('Passage', { exact: true });
  await expect(passage).toHaveValue('Fake NASB2020 text of Philippians 4:6-7.');
  await expect(passage).not.toBeEditable();
  await expect(page.getByText('cannot be edited')).toBeVisible();
  const notice = page.locator('[data-attribution="NASB2020"]');
  await expect(notice).toContainText('The Lockman Foundation');
  await expect(notice.getByRole('link', { name: 'www.lockman.org' })).toHaveAttribute('href', 'https://www.lockman.org');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Philippians 4:6-7 added')).toBeVisible();

  await page.goto(`/#/collections/${id}/cards`);
  await expect(page.getByText('Fake NASB2020 text of Philippians 4:6-7.')).toBeVisible();
});

test('changing the reference or the translation clears licensed text at once, so it never sits under the wrong verse', async ({ page }) => {
  const id = await createDeck(page, 'Verses');
  await newCardForm(page, id);
  await autofillSwitch(page).click();
  await chooseTranslation(page, 'New American Standard Bible 2020');
  await page.getByLabel('Verse(s)').fill('John 3:16');
  const passage = page.getByLabel('Passage', { exact: true });
  await expect(passage).toHaveValue('Fake NASB2020 text of John 3:16.');
  await failNext(page, 'offline');
  await page.getByLabel('Verse(s)').fill('John 3:17');
  await expect(passage).toHaveValue(''); // cleared at once, before anything is looked up
  await expect(page.getByText(/You're offline\. Save the card/)).toBeVisible(); // and the lookup then failed
  // turning autofill off drops the licensed text; the passage is then the person's own to type
  await page.getByLabel('Verse(s)').fill('John 3:16');
  await expect(passage).toHaveValue('Fake NASB2020 text of John 3:16.');
  await autofillSwitch(page).click();
  await expect(passage).toHaveValue('');
  await expect(passage).toBeEditable();
});

test('offline: a licensed card is saved without text and fills in by itself afterwards', async ({ page }) => {
  const id = await createDeck(page, 'Verses');
  await newCardForm(page, id);
  await autofillSwitch(page).click();
  await chooseTranslation(page, 'New American Standard Bible 2020');
  await failNext(page, 'offline');
  await page.getByLabel('Verse(s)').fill('Romans 8:28');
  await expect(page.getByText(/You're offline\. Save the card/)).toBeVisible();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Romans 8:28 added')).toBeVisible();
  await page.goto(`/#/collections/${id}/cards`);
  await expect(page.getByText('Fake NASB2020 text of Romans 8:28.')).toBeVisible(); // fetched in the background once it could be
});

test('an open translation needs a connection to autofill, and says so', async ({ page }) => {
  const id = await createDeck(page, 'Verses');
  await newCardForm(page, id);
  await autofillSwitch(page).click();
  await failNext(page, 'offline');
  await page.getByLabel('Verse(s)').fill('John 3:16');
  await expect(page.getByText(/You're offline, so we can't fill in the passage/)).toBeVisible();
});

test('a passage that cannot be found says so', async ({ page }) => {
  const id = await createDeck(page, 'Verses');
  await newCardForm(page, id);
  await autofillSwitch(page).click();
  await failNext(page, 'not-found');
  await page.getByLabel('Verse(s)').fill('John 99:1');
  await expect(page.getByText(/We couldn't find that passage in World English Bible/)).toBeVisible();
});

test('a licensed text is never in an exported collection file; the reference and translation are', async ({ page }) => {
  const id = await createDeck(page, 'Mixed');
  await newCardForm(page, id);
  await autofillSwitch(page).click();
  await chooseTranslation(page, 'Amplified Bible');
  await page.getByLabel('Verse(s)').fill('John 3:16');
  await expect(page.getByLabel('Passage', { exact: true })).toHaveValue('Fake AMP text of John 3:16.');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('John 3:16 added')).toBeVisible();

  await openDeck(page, id);
  await page.getByRole('button', { name: 'Collection actions' }).click();
  await page.getByRole('button', { name: 'Export collection' }).click();
  const drawer = page.getByRole('dialog', { name: /^Export (collection|data)$/ });
  const [download] = await Promise.all([page.waitForEvent('download'), drawer.getByRole('button', { name: 'Export' }).click()]);
  const text = readFileSync((await download.path())!, 'utf8');
  expect(text).not.toContain('Fake AMP text');
  const parsed = parseExportFile(text);
  expect(parsed.ok && parsed.file.decks[0]!.cards[0]).toMatchObject({ reference: 'John 3:16', verseText: '', translationCode: 'AMP' });
  await page.waitForTimeout(250);
});

test('editing a licensed card: the text stays read-only, and a changed reference is looked up again', async ({ page }) => {
  const id = await createDeck(page, 'Verses');
  await newCardForm(page, id);
  await autofillSwitch(page).click();
  await chooseTranslation(page, 'Amplified Bible');
  await page.getByLabel('Verse(s)').fill('John 3:16');
  await expect(page.getByLabel('Passage', { exact: true })).toHaveValue('Fake AMP text of John 3:16.');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('John 3:16 added')).toBeVisible();

  await page.goto(`/#/collections/${id}/cards`);
  await page.getByText('Fake AMP text of John 3:16.').click();
  await expect(page.getByRole('heading', { name: 'Edit card' })).toBeVisible();
  await expect(autofillSwitch(page)).toHaveAttribute('aria-checked', 'true');
  const passage = page.getByLabel('Passage', { exact: true });
  await expect(passage).toHaveValue('Fake AMP text of John 3:16.'); // not fetched again: it is already here
  await expect(passage).not.toBeEditable();
  await page.getByLabel('Verse(s)').fill('John 3:17');
  await expect(passage).toHaveValue('Fake AMP text of John 3:17.');
  await page.getByRole('button', { name: 'Save' }).click();
  await page.goto(`/#/collections/${id}/cards`);
  await expect(page.getByText('Fake AMP text of John 3:17.')).toBeVisible();
});

test('while studying, a licensed card shows the publisher\'s tag, and an ordinary one shows nothing', async ({ page }) => {
  const id = await createDeck(page, 'Mixed');
  await newCardForm(page, id);
  await autofillSwitch(page).click();
  await chooseTranslation(page, 'New American Standard Bible 2020');
  await page.getByLabel('Verse(s)').fill('John 3:16');
  await expect(page.getByLabel('Passage', { exact: true })).toHaveValue('Fake NASB2020 text of John 3:16.');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('John 3:16 added')).toBeVisible();
  await page.goto('/#/settings/card-kinds');
  await page.getByRole('radio', { name: /^Recall the passage/ }).check();
  await page.waitForTimeout(300);

  await page.goto(`/#/collections/${id}/study/flashcard`);
  await page.getByRole('button', { name: 'Show answer' }).click();
  await expect(page.getByText('Fake NASB2020 text of John 3:16.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'NASB 2020' })).toHaveAttribute('href', 'https://www.lockman.org');

  await page.goto(`/#/collections/${id}/cards`);
  await expect(page.getByRole('link', { name: 'NASB 2020' })).toBeVisible();
});

test('cards still waiting for their text are not offered for study', async ({ page }) => {
  const id = await createDeck(page, 'Waiting');
  await newCardForm(page, id);
  await autofillSwitch(page).click();
  await chooseTranslation(page, 'New American Standard Bible 2020');
  await failNext(page, 'offline', 'offline', 'offline'); // the passage never arrives, nor the retries
  await page.getByLabel('Verse(s)').fill('John 3:16');
  await expect(page.getByText(/You're offline\. Save the card/)).toBeVisible();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('John 3:16 added')).toBeVisible();
  await openDeck(page, id);
  await expect(page.getByText(/to study today/)).toHaveCount(0);
});

test.describe('Spanish', () => {
  test.use({ locale: 'es-ES' });
  test('the picker and the notice are in Spanish, and the form has no accessibility violations', async ({ page }) => {
    await page.goto('/#/collections/new');
    await page.getByLabel('Título').fill('Versículos');
    await page.getByRole('button', { name: 'Guardar' }).click();
    await page.waitForURL(/#\/collections\/[0-9a-f-]{36}$/);
    const id = page.url().match(/#\/collections\/([0-9a-f-]{36})$/)![1]!;
    await page.goto(`/#/cards/new?collection=${id}`);
    await page.getByRole('switch', { name: 'Autocompletar' }).click();
    await page.getByRole('button', { name: /^Traducción: / }).click();
    const dialog = page.getByRole('dialog', { name: 'Elige una traducción' });
    await expect(dialog.getByRole('tab', { name: 'Idioma' })).toBeVisible();
    await dialog.getByRole('button', { name: /Nueva Biblia de las Américas/ }).click();
    await page.getByLabel('Versículo(s)').fill('Juan 3:16');
    await expect(page.getByLabel('Pasaje', { exact: true })).toHaveValue('Fake NBLA text of Juan 3:16.');
    await expect(page.locator('[data-attribution="NBLA"]')).toContainText('Escrituras tomadas de la Nueva Biblia de las Américas');
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });
});

test('no accessibility violations: the form with autofill on, and the picker open', async ({ page }) => {
  const id = await createDeck(page, 'Verses');
  await newCardForm(page, id);
  await autofillSwitch(page).click();
  await page.getByLabel('Verse(s)').fill('John 3:16');
  await expect(page.getByLabel('Passage', { exact: true })).toHaveValue('Fake WEB text of John 3:16.');
  const problems = (r: Awaited<ReturnType<AxeBuilder['analyze']>>) => r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`);
  let results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(problems(results)).toEqual([]);
  await translationButton(page).click();
  await expect(page.getByRole('dialog', { name: 'Choose a translation' })).toBeVisible();
  await page.getByRole('dialog', { name: 'Choose a translation' }).evaluate((el) => Promise.all(el.getAnimations().map((x) => x.finished))); // fully in (colours are checked at their real values)
  results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(problems(results)).toEqual([]);
  await closeWithEscape(page);
  void fake;
});

test.describe('split into separate verses, with Autofill on', () => {
  const split = (page: Page) => page.getByRole('button', { name: 'Split into separate verses' });
  const dialog = (page: Page) => page.getByRole('dialog', { name: 'Split into separate verses' });

  test('a range is split by asking the translation for each verse, so no verse numbers are needed', async ({ page }) => {
    const id = await createDeck(page, 'Psalms');
    await newCardForm(page, id);
    await autofillSwitch(page).click();
    await page.getByLabel('Verse(s)').fill('Psalm 130:1-3');
    await expect(page.getByLabel('Passage', { exact: true })).toHaveValue('Fake WEB text of Psalm 130:1-3.'); // filled in as one block, with no verse numbers
    await expect(split(page)).toBeVisible(); // ...and the button is there anyway

    await split(page).click();
    const d = dialog(page);
    const items = d.getByRole('list', { name: 'Cards to create' }).getByRole('listitem');
    await expect(items).toHaveCount(3);
    for (const n of [1, 2, 3]) await expect(items.nth(n - 1)).toContainText(`Psalm 130:${n}Fake WEB text of Psalm 130:${n}.`);
    await d.getByRole('button', { name: 'Create 3 cards' }).click();
    await expect(page.getByText('3 verses added')).toBeVisible();

    await page.goto(`/#/collections/${id}/cards`);
    await expect(page.getByRole('link', { name: 'Psalm 130:2' })).toBeVisible();
    await expect(page.getByRole('row')).toHaveCount(4); // header + 3 cards, each its own verse
  });

  test('a whole chapter is split into as many verses as the chapter has', async ({ page }) => {
    const id = await createDeck(page, 'Psalms');
    await newCardForm(page, id);
    await page.evaluate(() => { (window as unknown as { __fakeYouVersion: { chapterVerses: number } }).__fakeYouVersion.chapterVerses = 4; });
    await autofillSwitch(page).click();
    await page.getByLabel('Verse(s)').fill('Psalm 130');
    await split(page).click();
    await expect(dialog(page).getByRole('list', { name: 'Cards to create' }).getByRole('listitem')).toHaveCount(4);
    await expect(dialog(page).getByRole('button', { name: 'Create 4 cards' })).toBeVisible();
  });

  test('the button is only there for a chapter or several verses', async ({ page }) => {
    const id = await createDeck(page, 'Psalms');
    await newCardForm(page, id);
    await autofillSwitch(page).click();
    await page.getByLabel('Verse(s)').fill('John 3:16');
    await expect(page.getByLabel('Passage', { exact: true })).toHaveValue('Fake WEB text of John 3:16.');
    await expect(split(page)).toHaveCount(0); // a single verse: nothing to split
    await page.getByLabel('Verse(s)').fill('John 3:16-18');
    await expect(split(page)).toBeVisible();
  });

  test('a licensed translation is split without fetching any text: the cards are saved with the reference and the translation only', async ({ page }) => {
    const id = await createDeck(page, 'Psalms');
    await newCardForm(page, id);
    await autofillSwitch(page).click();
    await chooseTranslation(page, 'NASB 2020');
    await page.getByLabel('Verse(s)').fill('Psalm 130:1-3');
    await expect(page.getByLabel('Passage', { exact: true })).toHaveValue('Fake NASB2020 text of Psalm 130:1-3.');
    const before = (await fake(page)).asked.length;
    await split(page).click();
    const d = dialog(page);
    await expect(d.getByRole('list', { name: 'Cards to create' }).getByRole('listitem')).toHaveCount(3);
    await expect(d.getByText('The text of each verse fills in on this device, from the publisher.')).toBeVisible();
    expect((await fake(page)).asked.length).toBe(before); // nothing was asked for: the publisher's text is not kept
    await d.getByRole('button', { name: 'Create 3 cards' }).click();
    await expect(page.getByText('3 verses added')).toBeVisible();
  });

  test('when the lookup fails it says so, and nothing is created', async ({ page }) => {
    const id = await createDeck(page, 'Psalms');
    await newCardForm(page, id);
    await autofillSwitch(page).click();
    await page.getByLabel('Verse(s)').fill('Psalm 130:1-3');
    await expect(page.getByLabel('Passage', { exact: true })).toHaveValue('Fake WEB text of Psalm 130:1-3.');
    await failNext(page, 'offline');
    await split(page).click();
    await expect(dialog(page)).toContainText("You're offline, so we can't look up the verses.");
    await expect(dialog(page).getByRole('button', { name: /^Create/ })).toHaveCount(0);
    await closeWithEscape(page);
    await page.goto(`/#/collections/${id}/cards`);
    await expect(page.getByRole('row')).toHaveCount(0); // no cards were made
  });
});

test.describe('split into separate verses, with Autofill on, in Spanish', () => {
  test.use({ locale: 'es-ES' });
  const deckEs = async (page: Page) => {
    await page.goto('/#/collections/new');
    await page.getByLabel('Título').fill('Salmos');
    await page.getByRole('button', { name: 'Guardar' }).click();
    await page.waitForURL(/#\/collections\/[0-9a-f-]{36}$/);
    return page.url().match(/#\/collections\/([0-9a-f-]{36})$/)![1]!;
  };

  test('"Separar en versículos" works on "Salmos 130:1-3", with the preview, the cards and the messages in Spanish', async ({ page }) => {
    const id = await deckEs(page);
    await page.goto(`/#/cards/new?collection=${id}`);
    await expect(page.getByLabel('Versículo(s)')).toBeVisible();
    await page.getByRole('switch', { name: 'Autocompletar' }).click();
    await page.getByLabel('Versículo(s)').fill('Salmos 130:1-3');
    await expect(page.getByLabel('Pasaje', { exact: true })).toHaveValue(/Fake \w+ text of Salmos 130:1-3\./);
    await page.getByRole('button', { name: 'Separar en versículos' }).click();
    const d = page.getByRole('dialog', { name: 'Separar en versículos' });
    const items = d.getByRole('list').getByRole('listitem');
    await expect(items).toHaveCount(3);
    await expect(items.nth(1)).toContainText('Salmos 130:2');
    await d.getByRole('button', { name: 'Crear 3 tarjetas' }).click();
    await expect(page.getByText(/3 versículos/)).toBeVisible();
    await page.goto(`/#/collections/${id}/cards`);
    await expect(page.getByRole('link', { name: 'Salmos 130:3' })).toBeVisible();
  });

  test('a failed lookup is explained in Spanish', async ({ page }) => {
    const id = await deckEs(page);
    await page.goto(`/#/cards/new?collection=${id}`);
    await expect(page.getByLabel('Versículo(s)')).toBeVisible();
    await page.getByRole('switch', { name: 'Autocompletar' }).click();
    await page.getByLabel('Versículo(s)').fill('Salmos 130:1-3');
    await expect(page.getByLabel('Pasaje', { exact: true })).toHaveValue(/Fake \w+ text of Salmos 130:1-3\./);
    await failNext(page, 'offline');
    await page.getByRole('button', { name: 'Separar en versículos' }).click();
    await expect(page.getByRole('dialog', { name: 'Separar en versículos' })).toContainText('Sin conexión, no podemos buscar los versículos.');
  });
});
