import { test, expect } from '@playwright/test';
import { addCard, createDeck, openDeck, setCardKinds } from './helpers';

const study = (page: import('@playwright/test').Page, id: string, mode: 'flashcard' | 'type' | 'blanks') => page.goto(`/#/decks/${id}/study/${mode}`);

test('Settings lets you choose which cards each verse gets, and it changes how many cards are due', async ({ page }) => {
  const id = await createDeck(page, 'Kinds');
  await addCard(page, id, 'John 3:16', 'Sample text.');
  await openDeck(page, id);
  await expect(page.getByText('2 cards to study today.')).toBeVisible(); // default: both

  await setCardKinds(page, 'Recall the passage');
  await openDeck(page, id);
  await expect(page.getByText('1 card to study today.')).toBeVisible();

  await setCardKinds(page, 'Identify the verse');
  await openDeck(page, id);
  await expect(page.getByText('1 card to study today.')).toBeVisible();

  await page.goto('/#/settings/card-kinds');
  await expect(page.getByRole('radio', { name: /^Identify the verse/ })).toBeChecked(); // remembered
});

test('identify card, Flashcard: shows the passage first, then the verse', async ({ page }) => {
  const id = await createDeck(page);
  await addCard(page, id, 'John 3:16', 'Example passage text typed by the user.');
  await setCardKinds(page, 'Identify the verse');
  await study(page, id, 'flashcard');
  await expect(page.getByText('Example passage text typed by the user.')).toBeVisible();
  await expect(page.getByText('John 3:16', { exact: true })).toHaveCount(0); // hidden until reveal
  await page.getByRole('button', { name: 'Show answer' }).click();
  await expect(page.getByText('John 3:16', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /^Easy/ }).click();
  await expect(page.getByRole('heading', { name: "You're done for today!" })).toBeVisible();
});

test('recall card, Flashcard: shows the verse first, then the passage', async ({ page }) => {
  const id = await createDeck(page);
  await addCard(page, id, 'John 3:16', 'Example passage text typed by the user.');
  await setCardKinds(page, 'Recall the passage');
  await study(page, id, 'flashcard');
  await expect(page.getByText('John 3:16', { exact: true })).toBeVisible();
  await expect(page.getByText('Example passage text typed by the user.')).toHaveCount(0);
  await page.getByRole('button', { name: 'Show answer' }).click();
  await expect(page.getByText('Example passage text typed by the user.')).toBeVisible();
});

test('identify card, Type: abbreviations are accepted; wrong and empty answers are handled; one button', async ({ page }) => {
  const id = await createDeck(page);
  await addCard(page, id, 'John 3:16', 'First example passage.');
  await addCard(page, id, 'Psalm 23:1', 'Second example passage.');
  await addCard(page, id, 'Romans 8:28', 'Third example passage.');
  await setCardKinds(page, 'Identify the verse');
  await study(page, id, 'type');

  await expect(page.getByRole('button', { name: 'Show answer' })).toHaveCount(1);
  await page.getByLabel(/Type the verse/).fill('jn 3:16');
  await page.getByRole('button', { name: 'Show answer' }).click();
  const right = page.getByRole('group', { name: /^Correct\. John 3:16$/ });
  await expect(right).toHaveText('John 3:16'); // right: just the reference, in green
  await expect(right.locator('span')).toHaveCSS('color', 'rgb(21, 128, 61)');
  await expect(page.getByRole('button', { name: /^Good.*suggested/ })).toBeVisible();
  await page.getByRole('button', { name: /^Good/ }).click();

  await page.getByLabel(/Type the verse/).fill('Psalm 24:1');
  await page.getByRole('button', { name: 'Show answer' }).click();
  const wrong = page.getByRole('group', { name: /^Not quite\. You typed / });
  const mine = wrong.locator('div.space-y-1').filter({ hasText: 'Your answer' });
  await expect(mine).toContainText(/Psalm.*24.*:1/); // what I typed, with the wrong number in red (and marked in words)
  await expect(mine.locator('del')).toHaveText('24');
  await expect(wrong.locator('mark')).toHaveText('23');
  await expect(wrong).toContainText(/Psalm.*23.*:1/); // the right verse is shown too
  await expect(page.getByRole('button', { name: /^Again.*suggested/ })).toBeVisible();
  await page.getByRole('button', { name: /^Again/ }).click();

  await page.getByRole('button', { name: 'Show answer' }).click(); // nothing typed: just reveal
  await expect(page.getByText('Romans 8:28', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Again.*suggested/ })).toBeVisible();
});

test('identify card, Blanks: choose the verse from several options', async ({ page }) => {
  const id = await createDeck(page);
  await addCard(page, id, 'John 3:16', 'First example passage.');
  await addCard(page, id, 'Psalm 23:1', 'Second example passage.');
  await addCard(page, id, 'Romans 8:28', 'Third example passage.');
  await setCardKinds(page, 'Identify the verse');
  await study(page, id, 'blanks');

  const group = page.getByRole('group', { name: 'Choose the verse' });
  await expect(group.getByRole('button')).toHaveCount(4);
  await expect(group.getByRole('button', { name: /John 3:16/ })).toHaveCount(1); // the right one is among the options
  await expect(page.getByRole('button', { name: /^Good/ })).toHaveCount(0); // no rating until you answer

  await expect(page.getByText(/which verse/i)).toHaveCount(0);
  await expect(page.getByRole('status')).toHaveCount(0); // no empty box: the blank is obvious
  await group.getByRole('button', { name: /John 3:16/ }).click();
  const right = group.getByRole('button', { name: /John 3:16/ });
  await expect(right).toHaveCSS('border-top-color', 'rgb(21, 128, 61)'); // green when right (no white, no icons)
  await expect(right).toHaveCSS('color', 'rgb(21, 128, 61)');
  await expect(group.locator('svg')).toHaveCount(0);
  await expect(group.getByText('Correct')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Good.*suggested/ })).toBeVisible();
  await page.getByRole('button', { name: /^Good/ }).click();

  // second card: pick a wrong option on purpose (wait until the next card has replaced the answered one)
  await expect(page.getByRole('button', { name: /^Good/ })).toHaveCount(0);
  await expect(group.getByText('Correct')).toHaveCount(0);
  const options = await group.getByRole('button').allInnerTexts();
  const wrong = options.map((o) => o.split('\n')[0]!).find((o) => o !== 'Psalm 23:1')!;
  await group.getByRole('button', { name: wrong }).first().click();
  await expect(group.getByRole('button', { name: wrong }).first()).toHaveCSS('border-top-color', 'rgb(198, 40, 40)'); // my wrong pick is red
  await expect(group.getByRole('button', { name: /Psalm 23:1/ })).toHaveCSS('border-top-color', 'rgb(21, 128, 61)'); // the right one is green
  await expect(group.getByText('Your answer')).toBeVisible();
  await expect(group.getByText('Correct')).toBeVisible(); // the right one is revealed too
  await expect(page.getByRole('button', { name: /^Again.*suggested/ })).toBeVisible();
});

test('identify card, Blanks: falls back to typing when there are not enough options', async ({ page }) => {
  const id = await createDeck(page);
  await addCard(page, id, 'My own label', 'Only card, and not a Bible reference.');
  await setCardKinds(page, 'Identify the verse');
  await study(page, id, 'blanks');
  await expect(page.getByRole('group', { name: 'Choose the verse' })).toHaveCount(0);
  await expect(page.getByLabel(/Type the verse/)).toBeVisible();
});

test('both kinds: a verse\'s two cards can come up in the same session, recall first', async ({ page }) => {
  const id = await createDeck(page);
  await addCard(page, id, 'John 3:16', 'First example passage.');
  await addCard(page, id, 'Psalm 23:1', 'Second example passage.');
  await openDeck(page, id);
  await expect(page.getByText('4 cards to study today.')).toBeVisible(); // 2 verses x 2 cards
  await study(page, id, 'flashcard');
  await expect(page.getByText('John 3:16', { exact: true })).toBeVisible(); // recall shows the verse first
  await expect(page.getByText('First example passage.')).toHaveCount(0); // the passage is hidden on the recall card
  await page.getByRole('button', { name: 'Show answer' }).click();
  await page.getByRole('button', { name: /^Easy/ }).click();
  await expect(page.getByText('First example passage.')).toBeVisible(); // the same verse's identify card, same day
});

test('extra practice: from the deck menu, covers every card, and changes nothing', async ({ page }) => {
  const id = await createDeck(page);
  await addCard(page, id, 'John 3:16', 'First example passage.');
  await openDeck(page, id);
  await page.getByRole('button', { name: 'Deck actions' }).click();
  await expect(page.getByRole('link', { name: 'Extra practice', exact: true })).toBeVisible(); // just the label, no small print under it
  await expect(page.getByText("Doesn't count toward your progress")).toHaveCount(0);
  await page.getByRole('link', { name: /Extra practice/ }).click();

  await expect(page.getByRole('heading', { name: 'Extra practice' })).toBeVisible();
  await expect(page.getByText(/Nothing you do here counts toward your schedule or statistics/)).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0); // the menu closed
  await page.getByRole('link', { name: /Flashcard/ }).click();
  await expect(page.getByRole('heading', { name: 'Extra practice' })).toBeVisible(); // the title next to the back arrow, no small print
  await expect(page.getByText(/schedule and statistics/)).toHaveCount(0);
  // both card types are included (recall and identify), in some order
  await page.getByRole('button', { name: 'Show answer' }).click();
  await expect(page.getByRole('button', { name: /^Easy/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Easy.*\d+(m|h|d)/ })).toHaveCount(0); // no interval hints: nothing is scheduled
  await page.getByRole('button', { name: /^Easy/ }).click();
  await page.getByRole('button', { name: 'Show answer' }).click();
  await page.getByRole('button', { name: /^Easy/ }).click();
  // the finished screen: just the title, the count and two stacked buttons
  await expect(page.getByRole('heading', { name: 'Session complete' })).toBeVisible();
  await expect(page.getByText('2 cards reviewed')).toBeVisible();
  await expect(page.getByText(/schedule and statistics/)).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'View cards' })).toHaveCount(0);
  const again = page.getByRole('button', { name: 'Practice again' });
  const back = page.getByRole('link', { name: 'Back to deck' });
  const [a, b] = [await again.boundingBox(), await back.boundingBox()];
  expect(b!.y).toBeGreaterThan(a!.y + a!.height - 1); // stacked, not side by side

  await page.getByRole('link', { name: 'Back to deck' }).click();
  await expect(page.getByText('2 cards to study today.')).toBeVisible(); // nothing was recorded, so both cards are still waiting
  await page.goto('/#/stats');
  await expect(page.getByRole('term').filter({ hasText: /^Days since starting$/ }).locator('xpath=preceding-sibling::dd[1]')).toHaveText('0');
});
