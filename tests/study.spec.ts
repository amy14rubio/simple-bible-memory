import { test, expect } from '@playwright/test';
import { addCard, createDeck, openDeck, setBlankDifficulty, setCardKinds, tapFirstBankWord, wordBankOpen } from './helpers';

const study = (page: import('@playwright/test').Page, deckId: string, mode: 'flashcard' | 'type' | 'blanks') => page.goto(`/#/decks/${deckId}/study/${mode}`);

test('an empty deck has nothing to study yet', async ({ page }) => {
  const id = await createDeck(page, 'Empty');
  await expect(page.getByText('Nothing to study yet')).toBeVisible();
  await expect(page.getByRole('link', { name: /Flashcard/ })).toHaveCount(0);
  expect(id).toBeTruthy();
});

test('open deck view shows the study tiles and only the number of cards due', async ({ page }) => {
  const id = await createDeck(page, 'Tiles');
  await addCard(page, id, 'Example 1:1', 'Example text.');
  await openDeck(page, id);
  for (const name of ['Flashcard', 'Type', 'Blanks']) await expect(page.getByRole('link', { name })).toBeVisible();
  await expect(page.getByText('Speak')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Speak' })).toHaveCount(0); // not available yet, so not a link
  await expect(page.getByText('2 cards to study today.')).toBeVisible(); // one verse, two study cards
  // none of the detailed counts are on this screen (they live in Statistics)
  await expect(page.getByText(/^(New|Young|Learning|Mature|Total cards)$/)).toHaveCount(0);
  await expect(page.getByRole('term')).toHaveCount(0);
});

test('flashcard: reveal, rate Easy, finish; the review is recorded', async ({ page }) => {
  const id = await createDeck(page);
  await addCard(page, id, 'Example 1:1', 'Example verse text typed by the user.');
  await setCardKinds(page, 'Recall the passage'); // these tests are about the recall card
  await study(page, id, 'flashcard');
  await expect(page.getByText('Example 1:1')).toBeVisible();
  await expect(page.getByText('Example verse text typed by the user.')).toHaveCount(0); // hidden until reveal
  await page.getByRole('button', { name: 'Show answer' }).click();
  await expect(page.getByText('Example verse text typed by the user.')).toBeVisible();
  await page.getByRole('button', { name: /^Easy/ }).click();
  await expect(page.getByRole('heading', { name: 'Session complete' })).toBeVisible();
  await expect(page.getByText('1 card reviewed')).toBeVisible();
});

test('flashcard: keyboard rating with key 1 records Again and the card comes back', async ({ page }) => {
  const id = await createDeck(page);
  await addCard(page, id, 'Example 1:1', 'Some text here.');
  await setCardKinds(page, 'Recall the passage'); // these tests are about the recall card
  await study(page, id, 'flashcard');
  await page.getByRole('button', { name: 'Show answer' }).click();
  await page.keyboard.press('1');
  await expect(page.getByRole('list', { name: 'Cards remaining' })).toContainText('Learning: 1'); // due again in 1 minute
  await expect(page.getByRole('button', { name: 'Show answer' })).toBeVisible();
});

test('type: one "Show answer" button; a forgiving match suggests Good; mistakes are highlighted', async ({ page }) => {
  const id = await createDeck(page);
  await addCard(page, id, 'Example 1:1', "For example, it's a test; typed by you.");
  await addCard(page, id, 'Example 1:2', "For example, it's a test; typed by you.");
  await setCardKinds(page, 'Recall the passage'); // these tests are about the recall card
  await study(page, id, 'type');

  // exactly one action button, always called "Show answer"
  await expect(page.getByRole('button', { name: 'Show answer' })).toHaveCount(1);
  await expect(page.getByRole('button', { name: /check answer|don't remember/i })).toHaveCount(0);

  await page.getByLabel('Type the verse from memory').fill('FOR EXAMPLE its a test typed by you');
  await page.getByRole('button', { name: 'Show answer' }).click();
  // everything right: only the verse, in green. No second copy, no word counts, no legend
  await expect(page.getByRole('group', { name: /^Every word matched\./ })).toContainText("For example, it's a test; typed by you.");
  await expect(page.getByRole('region', { name: 'Your answer' })).toHaveCount(0);
  await expect(page.getByText(/words matched|Underlined/)).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Good.*suggested/ })).toBeVisible();
  await page.getByRole('button', { name: /^Good/ }).click();

  // second card
  await page.getByLabel('Type the verse from memory').fill('for example its a quiz typed by you');
  await page.getByRole('button', { name: 'Show answer' }).click();
  const mine = page.getByRole('region', { name: 'Your answer' });
  const correct = page.getByRole('region', { name: 'Correct verse' });
  await expect(mine.locator('del')).toHaveText(/quiz/); // my wrong word, red, only in my answer
  await expect(mine.locator('mark')).toHaveCount(0);
  await expect(correct.locator('mark')).toHaveText(/test/); // the word I should have typed, red, only in the correct verse
  await expect(correct.locator('del')).toHaveCount(0);
  // right words are green and wrong ones red: text color only, no background
  await expect(mine.locator('span').first()).toHaveCSS('color', 'rgb(21, 128, 61)');
  await expect(mine.locator('del')).toHaveCSS('color', 'rgb(198, 40, 40)');
  await expect(mine.locator('del')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(correct.locator('mark')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(page.getByRole('button', { name: /^Again.*suggested/ })).toBeVisible(); // 7/8 = 87.5%, below the 90% line for Hard
});

test('type: skipped words leave a red gap so a partly-right answer does not look right', async ({ page }) => {
  const id = await createDeck(page);
  await addCard(page, id, 'Example 1:3', 'Blessed are the poor in spirit.');
  await setCardKinds(page, 'Recall the passage');
  await study(page, id, 'type');
  await page.getByLabel('Type the verse from memory').fill('blessed are in spirit');
  await page.getByRole('button', { name: 'Show answer' }).click();
  const mine = page.getByRole('region', { name: 'Your answer' });
  await expect(mine.locator('mark')).toHaveCount(1); // one gap, where "the poor" was skipped
  await expect(mine.locator('mark')).toContainText('missing words');
  await expect(mine.locator('mark')).toHaveCSS('color', 'rgb(198, 40, 40)');
  await expect(page.getByRole('region', { name: 'Correct verse' }).locator('mark')).toHaveText(['the', 'poor']);
});

test('type: Show answer with nothing typed reveals the verse and suggests Again', async ({ page }) => {
  const id = await createDeck(page);
  await addCard(page, id, 'Example 1:1', 'Hidden words here.');
  await setCardKinds(page, 'Recall the passage'); // these tests are about the recall card
  await study(page, id, 'type');
  await page.getByRole('button', { name: 'Show answer' }).click();
  await expect(page.getByRole('region', { name: 'Correct verse' })).toContainText('Hidden words here.');
  await expect(page.getByRole('button', { name: /^Again.*suggested/ })).toBeVisible();
});

const RED_LIGHT = 'rgb(198, 40, 40)';
const INK_LIGHT = 'rgb(23, 23, 26)';

test.describe('blanks with a word bank', () => {
  test('a right tap just fills the word in; a wrong tap fills in the correct word in red', async ({ page }) => {
    const id = await createDeck(page);
    await addCard(page, id, 'Example 2:1', 'Amen.');
    await addCard(page, id, 'Example 2:2', 'Alleluia.');
    await setCardKinds(page, 'Recall the passage');
    await study(page, id, 'blanks');

    // card 1: the bank holds the answer plus a decoy from the other verse
    const bank = page.getByRole('group', { name: 'Word bank' });
    await expect(bank.getByRole('button')).toHaveText(['Amen', 'Alleluia'], { useInnerText: true }).catch(() => undefined);
    expect(await bank.getByRole('button').allInnerTexts().then((t) => t.sort())).toEqual(['Alleluia', 'Amen']);
    await expect(page.locator('[aria-current="step"]')).toHaveCount(1); // the blank to fill is highlighted
    await bank.getByRole('button', { name: 'Amen' }).click();
    const verse = page.locator('p.scripture');
    await expect(verse.getByText('Amen')).toHaveCSS('color', INK_LIGHT); // plain: no green, no highlight
    await expect(verse.getByText('Amen')).not.toHaveCSS('text-decoration-line', 'underline');
    await expect(bank).toHaveCount(0); // finished: the bank gives way to the rating buttons
    await expect(page.getByRole('button', { name: /^Good.*suggested/ })).toBeVisible();
    await page.getByRole('button', { name: /^Good/ }).click();

    // card 2: tap the decoy on purpose
    await page.getByRole('group', { name: 'Word bank' }).getByRole('button', { name: 'Amen' }).click();
    await expect(verse.getByText('Alleluia')).toHaveCSS('color', RED_LIGHT); // the CORRECT word, in red
    await expect(verse.getByText('Alleluia')).toHaveCSS('text-decoration-line', 'underline'); // not colour alone
    await expect(page.getByRole('button', { name: /^Again.*suggested/ })).toBeVisible();
  });

  test('blanks are filled one at a time, in order; the bank always has 8 words and is reshuffled each time', async ({ page }) => {
    const id = await createDeck(page);
    await addCard(page, id, 'Example 3:1', 'Alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima.');
    await setCardKinds(page, 'Recall the passage');
    await setBlankDifficulty(page, 'Hard');
    await study(page, id, 'blanks');

    const bank = page.getByRole('group', { name: 'Word bank' });
    await expect(bank).toBeVisible();
    const banks: string[][] = [];
    while (await wordBankOpen(page)) {
      await expect(page.locator('[aria-current="step"]')).toHaveCount(1); // always exactly one highlighted blank
      const words = await bank.getByRole('button').allInnerTexts();
      expect(words).toHaveLength(8); // never shrinks: nothing is used up
      expect(new Set(words).size).toBe(8); // all different
      banks.push(words);
      await tapFirstBankWord(page);
    }
    expect(banks.length).toBeGreaterThanOrEqual(3);
    // reshuffled: the arrangement changes between blanks
    expect(new Set(banks.map((b) => b.join('|'))).size).toBeGreaterThan(1);
    // and words from earlier banks come back (the same few verse words keep appearing)
    const first = new Set(banks[0]);
    expect(banks[1]!.some((w) => first.has(w))).toBe(true);
    await expect(page.getByRole('button', { name: /^Again/ })).toBeVisible(); // rating buttons appear once every blank is done
  });

  test('there is no typing and no difficulty switcher on the study screen', async ({ page }) => {
    const id = await createDeck(page);
    await addCard(page, id, 'Example 3:1', 'Alpha bravo charlie delta echo foxtrot.');
    await setCardKinds(page, 'Recall the passage');
    await study(page, id, 'blanks');
    await expect(page.getByRole('group', { name: 'Word bank' })).toBeVisible();
    await expect(page.getByRole('textbox')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Check answers' })).toHaveCount(0);
    await expect(page.getByRole('group', { name: 'Difficulty' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^(Easy|Medium|Hard)$/ })).toHaveCount(0);
  });

  test('the difficulty set in Settings changes how many words are hidden, not the size of the bank', async ({ page }) => {
    const id = await createDeck(page);
    await addCard(page, id, 'Example 4:1', 'Glorious wonderful majestic eternal faithful gracious righteous merciful holy mighty.');
    await setCardKinds(page, 'Recall the passage');

    const blanksAt = async (level: 'Easy' | 'Hard') => {
      await setBlankDifficulty(page, level);
      await study(page, id, 'blanks');
      const bank = page.getByRole('group', { name: 'Word bank' });
      await expect(bank).toBeVisible();
      expect(await bank.getByRole('button').count()).toBe(8); // the same at every difficulty
      let taps = 0;
      while (await wordBankOpen(page)) { await tapFirstBankWord(page); taps++; }
      return taps;
    };
    const easy = await blanksAt('Easy');
    // finishing a card re-queues it (Again/Hard) or ends the session; start a fresh deck for the second level
    const id2 = await createDeck(page, 'Second');
    await addCard(page, id2, 'Example 4:2', 'Glorious wonderful majestic eternal faithful gracious righteous merciful holy mighty.');
    await setBlankDifficulty(page, 'Hard');
    await study(page, id2, 'blanks');
    const bank = page.getByRole('group', { name: 'Word bank' });
    await expect(bank).toBeVisible();
    let hard = 0;
    while (await wordBankOpen(page)) { await tapFirstBankWord(page); hard++; }
    expect(hard).toBeGreaterThan(easy);
  });
});

test('the counters and the (screen-reader) progress track the session', async ({ page }) => {
  const id = await createDeck(page);
  await addCard(page, id, 'Example 1:1', 'One.');
  await addCard(page, id, 'Example 1:2', 'Two.');
  await setCardKinds(page, 'Recall the passage'); // these tests are about the recall card
  await study(page, id, 'flashcard');
  await expect(page.getByRole('progressbar', { name: 'Session progress' })).toHaveJSProperty('value', 0);
  await expect(page.getByRole('list', { name: 'Cards remaining' })).toContainText('New: 2');
  await page.getByRole('button', { name: 'Show answer' }).click();
  await page.getByRole('button', { name: /^Easy/ }).click();
  await expect(page.getByRole('progressbar', { name: 'Session progress' })).toHaveJSProperty('value', 1);
  await expect(page.getByRole('list', { name: 'Cards remaining' })).toContainText('New: 1');
});

test('regular study never mentions practice', async ({ page }) => {
  const id = await createDeck(page);
  await addCard(page, id, 'Example 1:1', 'One.');
  await openDeck(page, id);
  // only what is visible: the closed deck menu keeps its "Extra practice" link in the page, hidden
  const visiblePractice = () => page.getByText(/practice/i).filter({ visible: true });
  await expect(visiblePractice()).toHaveCount(0);
  await study(page, id, 'flashcard');
  await expect(visiblePractice()).toHaveCount(0);
});
