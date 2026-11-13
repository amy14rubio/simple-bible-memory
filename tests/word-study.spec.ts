import { test, expect, type Page } from '@playwright/test';
import { addCard, createDeck, setCardKinds } from './helpers';

// John 3:16, three of its Greek words (the real data has all of them). The glosses are what the Berean text puts for each.
const word = (pos: number, text: string, transliteration: string, parsingFull: string, strongs: string, gloss: string) =>
  ({ pos, bsbPos: pos, language: 'greek', text, transliteration, parsingFull, strongs, gloss });
const CHAPTER = { chapter: { content: [{ verse: 16, words: [
  word(1, 'Οὕτως', 'Houtōs', 'Adverb', 'G3779', 'so'),
  word(2, 'ἠγάπησεν', 'ēgapēsen', 'Verb - Aorist Indicative Active - 3rd Person Singular', 'G0025', 'loved'),
  word(3, 'κόσμον', 'kosmon', 'Noun - Accusative Masculine Singular', 'G2889', 'world'),
] }] } };
const ENTRY = { entry: { id: 'G0025', language: 'greek', senses: [{ lemma: 'ἀγαπάω', transliteration: 'agapaō', partOfSpeech: 'V', gloss: 'to love', definition: 'to love, wish well to' }] } };
const cors = { 'access-control-allow-origin': '*' };

async function mockApi(page: Page, chapter: unknown = CHAPTER) {
  await page.route('**/bible.helloao.org/api/d/bsb-interlinear/JHN/3.json', (r) => r.fulfill({ json: chapter, headers: cors }));
  await page.route('**/bible.helloao.org/api/spa_r09/JHN/3.json', (r) => r.fulfill({ json: { chapter: { content: [{ type: 'verse', number: 16, content: ['Porque de tal manera amó Dios al mundo.'] }] } }, headers: cors }));
  await page.route('**/bible.helloao.org/api/BSB/JHN/3.json', (r) => r.fulfill({ json: { chapter: { content: [{ type: 'verse', number: 16, content: ['For God so loved the world that He gave His one and only', { noteId: 1 }, 'Son.'] }] } }, headers: cors }));
  await page.route('**/bible.helloao.org/api/d/stepbible-lexicon/lexicon/*.json', (r) => r.fulfill({ json: ENTRY, headers: cors }));
}

/** Holds the mouse on the start of a piece of text for a moment. */
async function hold(page: Page, text: string, from = 'start') {
  const box = (await page.getByText(text, { exact: false }).first().boundingBox())!;
  await page.mouse.move(from === 'start' ? box.x + 12 : box.x + box.width - 12, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(700);
  await page.mouse.up();
}

async function openFlashcard(page: Page, passage: string) {
  const id = await createDeck(page);
  await addCard(page, id, 'John 3:16', passage);
  await setCardKinds(page, 'Recall the passage');
  await page.goto(`/#/collections/${id}/study/flashcard`);
  await page.getByRole('button', { name: 'Show answer' }).click();
}

// the drawer is named for the English word ("loved"), or for the verse when no single word is known
const drawer = (page: Page) => page.getByRole('dialog', { name: /^(loved|text|John 3)/ });

test('on a card that is not Berean, holding the verse opens a drawer with the page and the two ways to read on; the page is a table of every word', async ({ page }) => {
  await mockApi(page);
  await openFlashcard(page, 'For God so loved the world.');
  await hold(page, 'For God so loved the world.');
  await expect(drawer(page)).toBeVisible();
  await expect(drawer(page).getByText('ἀγαπάω')).toHaveCount(0); // no word known, so no definition
  await expect(drawer(page).getByText('Study the original Greek or Hebrew behind this verse.')).toBeVisible();
  await expect(drawer(page).getByRole('link', { name: 'Explore in Blue Letter Bible' })).toHaveAttribute('href', 'https://www.blueletterbible.org/kjv/jhn/3/16/');
  await expect(drawer(page).getByRole('link', { name: 'Explore commentaries in Bible Hub' })).toHaveAttribute('href', 'https://biblehub.com/commentaries/john/3-16.htm');
  await drawer(page).getByRole('button', { name: 'See every word of this verse' }).click();

  await expect(page).toHaveURL(/#\/word-study\?ref=John%203%3A16/);
  const row = page.getByRole('row', { name: /ἠγάπησεν/ });
  await expect(row).toContainText('ēgapēsen');
  await expect(row).toContainText('loved');
  await expect(row).toContainText('G25');
  await expect(page.getByRole('heading', { name: 'Interlinear' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'John 3:16' })).toBeVisible(); // the passage is spelled out at the top, in the Berean text the words are matched to
  await expect(page.getByText('For God so loved the world that He gave His one and only Son.')).toBeVisible();
  await expect(page.getByRole('columnheader', { name: /Grammar/ })).toHaveCount(0);
  // tapping a word of the passage shades its row in the table
  await page.getByRole('button', { name: 'loved', exact: true }).click();
  await expect(page.locator('#word-16-2')).toHaveClass(/bg-surface/);
  await page.getByRole('button', { name: /ἠγάπησεν/ }).click();
  await expect(drawer(page).getByText('to love, wish well to')).toBeVisible();
  await expect(drawer(page).getByRole('heading', { name: 'Definition' })).toBeVisible();
  await expect(drawer(page).getByText('Sounds like')).toBeVisible();
  await expect(drawer(page).getByText('G25')).toBeVisible();
  await expect(drawer(page).getByText('Verb - Aorist Indicative Active - 3rd Person Singular')).toBeVisible();
  // on the table page the drawer is only the word and its definition: no buttons to go on, no reference under the title
  await expect(drawer(page).getByRole('link')).toHaveCount(0);
  await expect(drawer(page).getByRole('button', { name: 'See every word of this verse' })).toHaveCount(0);
});

test('holding the reference does nothing, and a quick tap on the verse does nothing', async ({ page }) => {
  await mockApi(page);
  await openFlashcard(page, 'For God so loved the world.');
  await page.getByText('For God so loved the world.').first().click();
  await expect(drawer(page)).toHaveCount(0);
  const ref = (await page.getByText('John 3:16', { exact: true }).first().boundingBox())!;
  await page.mouse.move(ref.x + 8, ref.y + ref.height / 2);
  await page.mouse.down(); await page.waitForTimeout(700); await page.mouse.up();
  await expect(drawer(page)).toHaveCount(0);
});

test('a reference that is not a verse or a few in a chapter says so instead of guessing', async ({ page }) => {
  await mockApi(page);
  const id = await createDeck(page);
  await addCard(page, id, 'John 3', 'A whole chapter typed in.');
  await setCardKinds(page, 'Recall the passage');
  await page.goto(`/#/collections/${id}/study/flashcard`);
  await page.getByRole('button', { name: 'Show answer' }).click();
  await hold(page, 'A whole chapter typed in.');
  await expect(drawer(page).getByText(/a verse or a few verses in one chapter/)).toBeVisible();
  await expect(drawer(page).getByRole('button', { name: 'See every word of this verse' })).toHaveCount(0);
});

test('a Berean card is treated like any other: holding a word opens the same drawer for the verse, with no word looked up', async ({ page }) => {
  // The test version of the text is "Fake BSB text of John 3:16." so the glosses are made to match some of those words.
  await mockApi(page, { chapter: { content: [{ verse: 16, words: [
    word(1, 'λόγος', 'logos', 'Noun', 'G3056', 'text'),
    word(2, 'Ἰωάννης', 'Iōannēs', 'Noun', 'G2491', 'John'),
  ] }] } });
  const id = await createDeck(page, 'Berean');
  await page.goto(`/#/cards/new?collection=${id}`);
  await page.getByRole('switch', { name: 'Autofill' }).click();
  await page.getByRole('button', { name: /^Translation: / }).click();
  const dialog = page.getByRole('dialog', { name: 'Choose a translation' });
  await dialog.getByRole('button', { name: 'Search translations' }).click();
  await dialog.getByRole('searchbox').fill('berean');
  await dialog.getByRole('button', { name: /Berean Standard Bible/ }).click();
  await page.getByLabel('Verse(s)').fill('John 3:16');
  await expect(page.getByLabel('Passage', { exact: true })).toHaveValue('Fake BSB text of John 3:16.');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('John 3:16 added')).toBeVisible();
  await setCardKinds(page, 'Recall the passage');
  await page.goto(`/#/collections/${id}/study/flashcard`);
  await page.getByRole('button', { name: 'Show answer' }).click();

  // Holding any word (here "text", which has an original word in the mocked data) does not look the word up: the drawer is the verse's, with its buttons
  const at = await page.evaluate(() => {
    const node = document.querySelector('p.scripture')!.firstChild as Text;
    const i = node.data.indexOf(' text ') + 1;
    const r = document.createRange();
    r.setStart(node, i); r.setEnd(node, i + 4);
    const b = r.getBoundingClientRect();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  });
  await page.mouse.move(at.x, at.y); await page.mouse.down(); await page.waitForTimeout(700); await page.mouse.up();
  await expect(drawer(page)).toBeVisible();
  await expect(drawer(page).getByText('Study the original Greek or Hebrew behind this verse.')).toBeVisible();
  await expect(drawer(page).getByText('to love, wish well to')).toHaveCount(0); // no definition: no word was matched
  await expect(page.locator('p.scripture span.underline')).toHaveCount(0);
  await drawer(page).getByRole('button', { name: 'See every word of this verse' }).click();
  await expect(page).toHaveURL(/#\/word-study\?ref=John%203%3A16$/); // no word to bring into view
});

test('in Spanish the Interlinear page shows the verse in Reina-Valera 1909 and keeps the English text the table follows, with the definitions left in English', async ({ browser }) => {
  const context = await browser.newContext({ locale: 'es-ES' });
  const page = await context.newPage();
  await mockApi(page);
  await page.goto('/#/word-study?ref=Juan%203%3A16');
  await expect(page.getByRole('heading', { name: 'Interlineal' })).toBeVisible();
  await expect(page.getByText('Porque de tal manera amó Dios al mundo.')).toBeVisible();
  await expect(page.getByText('Reina-Valera 1909')).toBeVisible();
  await expect(page.getByText('For God so loved the world that He gave His one and only Son.')).toBeVisible();
  await expect(page.getByText(/La tabla sigue este texto/)).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Palabra original' })).toBeVisible();
  await page.getByRole('button', { name: 'loved', exact: true }).click();
  await expect(page.locator('#word-16-2')).toHaveClass(/bg-surface/);
  await context.close();
});

test('in Spanish a Greek word is defined by the United Bible Societies\' own Spanish entry, with the credit and the license; a word without one keeps the English', async ({ browser }) => {
  const context = await browser.newContext({ locale: 'es-ES' });
  const page = await context.newPage();
  await mockApi(page);
  await page.route('**/ubs-es/greek.json', (r) => r.fulfill({ json: { entries: { G0025: { l: 'ἀγαπάω', s: [{ g: ['amar', 'mirar con afecto'], d: 'tener amor por alguien o algo', c: 'Una nota del diccionario.' }], n: ['Una nota al pie.'] } } }, headers: cors }));
  await page.goto('/#/word-study?ref=Juan%203%3A16');
  await page.getByRole('button', { name: /ἠγάπησεν/ }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByText('amar, mirar con afecto')).toBeVisible();
  await expect(sheet.getByText('tener amor por alguien o algo')).toBeVisible();
  await expect(sheet.getByText('[1] Una nota al pie.')).toBeVisible();
  await expect(sheet.getByText('to love, wish well to')).toHaveCount(0); // not the English one
  await expect(sheet.getByText(/© Sociedades Bíblicas Unidas 2023/)).toBeVisible();
  await expect(sheet.getByRole('link', { name: 'CC BY-SA 4.0' })).toHaveAttribute('href', 'https://creativecommons.org/licenses/by-sa/4.0/');
  await page.keyboard.press('Escape');
  // a word the Spanish dictionary does not have: the English entry, and it says so
  await page.getByRole('button', { name: /κόσμον/ }).click();
  await expect(page.getByRole('dialog').getByText(/Definición en inglés/)).toBeVisible();
  await expect(page.getByRole('dialog').getByText('to love, wish well to')).toBeVisible(); // (the mocked English entry is the same for every word)
  await context.close();
});

test('on the card that shows the verse first, holding a word works only once the reference has been shown', async ({ page }) => {
  await mockApi(page);
  const id = await createDeck(page);
  await addCard(page, id, 'John 3:16', 'For God so loved the world.');
  await setCardKinds(page, 'Identify the verse');
  await page.goto(`/#/collections/${id}/study/flashcard`);
  const verse = page.getByText('For God so loved the world.');
  await expect(verse).toBeVisible();
  await hold(page, 'For God so loved the world.'); // the drawer would show "John 3:16", which is the answer
  await expect(drawer(page)).toHaveCount(0);
  await page.getByRole('button', { name: 'Show answer' }).click();
  await expect(page.getByText('John 3:16', { exact: true })).toBeVisible();
  await hold(page, 'For God so loved the world.');
  await expect(drawer(page)).toBeVisible();
  await expect(drawer(page).getByRole('link', { name: 'Explore in Blue Letter Bible' })).toBeVisible();
});

