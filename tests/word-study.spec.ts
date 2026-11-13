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

const drawer = (page: Page) => page.getByRole('dialog', { name: 'Original words' });

test('on a card that is not Berean, holding the verse opens a drawer with the page and the two ways to read on; the page is a table of every word', async ({ page }) => {
  await mockApi(page);
  await openFlashcard(page, 'For God so loved the world.');
  await hold(page, 'For God so loved the world.');
  await expect(drawer(page)).toBeVisible();
  await expect(drawer(page).getByText('ἀγαπάω')).toHaveCount(0); // no word known, so no definition
  await expect(drawer(page).getByRole('link', { name: 'Explore in Blue Letter Bible' })).toHaveAttribute('href', 'https://www.blueletterbible.org/kjv/jhn/3/16/');
  await expect(drawer(page).getByRole('link', { name: 'Read verse commentaries' })).toHaveAttribute('href', 'https://www.studylight.org/commentary/john/3-16.html');
  await drawer(page).getByRole('button', { name: 'See every word of this verse' }).click();

  await expect(page).toHaveURL(/#\/word-study\?ref=John%203%3A16/);
  const row = page.getByRole('row', { name: /ἠγάπησεν/ });
  await expect(row).toContainText('ēgapēsen');
  await expect(row).toContainText('loved');
  await expect(row).toContainText('G25');
  await expect(row).toContainText('Aorist Indicative Active');
  await page.getByRole('button', { name: /ἠγάπησεν/ }).click();
  await expect(drawer(page).getByText('to love, wish well to')).toBeVisible();
  await expect(drawer(page).getByRole('link', { name: 'Explore in Blue Letter Bible' })).toHaveAttribute('href', 'https://www.blueletterbible.org/lexicon/g25/kjv/tr/0-1/');
  await expect(drawer(page).getByRole('button', { name: 'See every word of this verse' })).toHaveCount(0); // already on that page
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

test('in the Berean text a word with an original word opens its definition, and one without underlines the words that have one', async ({ page }) => {
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

  // The middle of a word of the verse, found from where the browser drew it.
  const holdOn = async (target: string) => {
    const at = await page.evaluate((w) => {
      // (while some words are underlined the verse is in pieces, so look through every piece)
      const walker = document.createTreeWalker(document.querySelector('p.scripture')!, NodeFilter.SHOW_TEXT);
      let node = walker.nextNode() as Text, i = -1;
      for (; node; node = walker.nextNode() as Text) {
        i = node.data === w ? 0 : node.data.indexOf(` ${w} `) + 1 || -1;
        if (i >= 0) break;
      }
      const r = document.createRange();
      r.setStart(node, i); r.setEnd(node, i + w.length);
      const b = r.getBoundingClientRect();
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    }, target);
    await page.mouse.move(at.x, at.y); await page.mouse.down(); await page.waitForTimeout(700); await page.mouse.up();
  };
  const verse = page.locator('p.scripture');
  // "of" has no original word: nothing opens; "text" and "John" are underlined for a moment
  await holdOn('of');
  await expect(drawer(page)).toHaveCount(0);
  await expect(verse.locator('span.underline')).toHaveCount(2);

  // "text" has one: its definition opens at once
  await holdOn('text');
  await expect(drawer(page).getByText('to love, wish well to')).toBeVisible();
});
