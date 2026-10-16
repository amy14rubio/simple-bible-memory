import { test, expect, type Page } from '@playwright/test';
import { addCard, createDeck, setCardKinds } from './helpers';

const reference = (page: Page) => page.getByLabel('Verse(s)');
const passage = (page: Page) => page.getByLabel('Passage', { exact: true });
const splitButton = (page: Page) => page.getByRole('button', { name: 'Split into separate verses' });

// Short stand-ins typed for the tests, not a real translation.
const EIGHT = '1 Example one first. 2 Example two second. 3 Example three third. 4 Example four fourth. 5 Example five fifth. 6 Example six sixth. 7 Example seven seventh. 8 Example eight eighth.';

test.describe('card browser', () => {
  test('clicking anywhere on a card row opens it for editing', async ({ page }) => {
    const id = await createDeck(page, 'Rows');
    await addCard(page, id, 'John 3:16', 'Example passage text for the row.');
    // the passage cell, not the reference link
    await page.getByText('Example passage text for the row.').click();
    await expect(page.getByRole('heading', { name: 'Edit card' })).toBeVisible();
  });

  test('the reference link in the row works too', async ({ page }) => {
    const id = await createDeck(page, 'Rows');
    await addCard(page, id, 'John 3:16', 'Example passage text.');
    await page.getByRole('link', { name: /John 3:16/ }).click();
    await expect(page.getByRole('heading', { name: 'Edit card' })).toBeVisible();
    await expect(page).toHaveURL(/\/cards\/[0-9a-f-]{36}\/edit/);
  });

  test('clicking outside the rows does nothing', async ({ page }) => {
    const id = await createDeck(page, 'Rows');
    await addCard(page, id, 'John 3:16', 'Example passage text.');
    const url = page.url();
    await page.setViewportSize({ width: 390, height: 800 });
    // the column headers, the empty space below the table, and the very bottom of the screen
    await page.getByRole('columnheader', { name: 'Verse' }).click();
    await page.getByRole('columnheader', { name: 'Passage' }).click();
    await page.mouse.click(200, 600);
    await page.mouse.click(30, 780);
    await page.mouse.click(380, 300);
    await expect(page).toHaveURL(url);
    await expect(page.getByRole('heading', { name: 'Edit card' })).toHaveCount(0);
  });

  test('each row opens its own card', async ({ page }) => {
    const id = await createDeck(page, 'Rows');
    await addCard(page, id, 'John 3:16', 'First passage.');
    await addCard(page, id, 'Psalm 23:1', 'Second passage.');
    await page.getByText('Second passage.').click();
    await expect(page.getByLabel('Verse(s)')).toHaveValue('Psalm 23:1');
  });
});

test.describe('adding cards: save, toast, and a cleared form', () => {
  test('the check mark saves the card, shows a toast, clears verse and passage, keeps the source, and stays on the form', async ({ page }) => {
    const id = await createDeck(page, 'Many');
    await page.goto(`/#/cards/new?deck=${id}`);
    await reference(page).fill('John 3:16');
    await page.getByLabel('Source').fill('Example translation');
    await passage(page).fill('First example passage.');
    await page.getByRole('button', { name: 'Save' }).click(); // the check mark in the header

    await expect(page.getByText('John 3:16 added')).toBeVisible(); // the toast
    await expect(page).toHaveURL(new RegExp(`#/cards/new\\?deck=${id}$`)); // still the same form
    await expect(reference(page)).toHaveValue('');
    await expect(passage(page)).toHaveValue('');
    await expect(page.getByLabel('Source')).toHaveValue('Example translation');
    await expect(reference(page)).toBeFocused();
    await expect(page.getByRole('button', { name: 'Add another card' })).toHaveCount(0); // the old button is gone

    await reference(page).fill('Psalm 23:1');
    await passage(page).fill('Second example passage.');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Psalm 23:1 added')).toBeVisible();

    await page.goto(`/#/decks/${id}/cards`);
    await expect(page.getByRole('link', { name: /John 3:16/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Psalm 23:1/ })).toBeVisible();
  });

  test('the toast is a floating banner near the bottom, with margins, and goes away by itself', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 700 });
    const id = await createDeck(page, 'Many');
    await page.goto(`/#/cards/new?deck=${id}`);
    await reference(page).fill('John 3:16');
    await passage(page).fill('Example.');
    await page.getByRole('button', { name: 'Save' }).click();
    const toast = page.getByText('John 3:16 added');
    await expect(toast).toBeVisible();
    await page.waitForTimeout(700); // let it finish sliding in
    const box = (await page.locator('[data-slot="toast"]').boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(12); // a margin on the left
    expect(390 - (box.x + box.width)).toBeGreaterThanOrEqual(12); // and on the right
    expect(700 - (box.y + box.height)).toBeGreaterThanOrEqual(12); // and below it
    expect(box.y).toBeGreaterThan(450); // towards the bottom
    await expect(toast).toHaveCount(0, { timeout: 12000 }); // gone by itself (after about 5 seconds)
  });

  test('the toast is announced to screen readers without taking focus', async ({ page }) => {
    const id = await createDeck(page, 'Many');
    await page.goto(`/#/cards/new?deck=${id}`);
    await reference(page).fill('John 3:16');
    await passage(page).fill('Example.');
    await page.getByRole('button', { name: 'Save' }).click();
    // a polite live region carries the text, so it is read out without moving focus away from the form
    await expect(page.locator('[aria-live="polite"]')).toContainText('John 3:16 added');
    await expect(reference(page)).toBeFocused();
  });

  test('shows an error and keeps what you typed when the card is incomplete (no toast)', async ({ page }) => {
    const id = await createDeck(page, 'Many');
    await page.goto(`/#/cards/new?deck=${id}`);
    await reference(page).fill('John 3:16');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('alert')).toContainText('Verse text is required');
    await expect(reference(page)).toHaveValue('John 3:16');
    await expect(page.getByText('John 3:16 added')).toHaveCount(0);
  });

  test('editing an existing card: Save goes back and shows "Changes saved"; there is no Split button', async ({ page }) => {
    const id = await createDeck(page, 'Many');
    await addCard(page, id, 'John 3:16', 'Example.');
    await page.getByRole('link', { name: /John 3:16/ }).click();
    await expect(splitButton(page)).toHaveCount(0);
    await reference(page).fill('John 3:17');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Changes saved')).toBeVisible();
    await expect(page.getByRole('link', { name: /John 3:17/ })).toBeVisible(); // back on the card list
  });
});

test.describe('split into separate verses', () => {
  test('the button only appears when it can be used, and is centred, with no explanation under it', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    const id = await createDeck(page, 'Split');
    await page.goto(`/#/cards/new?deck=${id}`);
    await expect(splitButton(page)).toHaveCount(0); // nothing typed
    await reference(page).fill('John 3:16'); // a single verse
    await passage(page).fill('16 Example sixteen.');
    await expect(splitButton(page)).toHaveCount(0);
    await reference(page).fill('Psalm 130:1-2');
    await expect(splitButton(page)).toBeVisible();
    await expect(page.getByText(/To split, enter a chapter/)).toHaveCount(0); // no hint text
    const form = (await page.locator('form').boundingBox())!;
    const button = (await splitButton(page).boundingBox())!;
    expect(Math.abs(button.x + button.width / 2 - (form.x + form.width / 2))).toBeLessThan(2); // centred
    await passage(page).fill('');
    await expect(splitButton(page)).toHaveCount(0); // nothing to split
  });

  test('a whole chapter (Psalm 130) becomes one card per verse: 8 cards, 16 study cards', async ({ page }) => {
    const id = await createDeck(page, 'Split');
    await page.goto(`/#/cards/new?deck=${id}`);
    await reference(page).fill('Psalm 130');
    await page.getByLabel('Source').fill('Example translation');
    await passage(page).fill(EIGHT);
    await splitButton(page).click();

    const dialog = page.getByRole('dialog', { name: 'Split into separate verses' });
    await expect(dialog).toContainText('This creates 8 cards, one per verse.');
    await expect(dialog).toContainText('so you will have 16 study cards');
    await expect(dialog.getByRole('list', { name: 'Cards to create' }).getByRole('listitem')).toHaveCount(8);
    await expect(dialog).toContainText('Psalm 130:1');
    await expect(dialog).toContainText('Psalm 130:8');
    await dialog.getByRole('button', { name: 'Create 8 cards' }).click();

    // same as a normal add: a toast, and the form stays open with the verse and passage cleared
    await expect(page.getByText('8 verses added')).toBeVisible();
    await expect(reference(page)).toHaveValue('');
    await expect(passage(page)).toHaveValue('');
    await expect(page.getByLabel('Source')).toHaveValue('Example translation');
    await page.goto(`/#/decks/${id}/cards`);
    await expect(page.getByRole('row')).toHaveCount(9); // header + 8
    await expect(page.getByRole('link', { name: 'Psalm 130:1', exact: true })).toBeVisible();
    await expect(page.getByText('Example eight eighth.')).toBeVisible();
    // each card has its own passage and keeps the source
    await page.getByText('Example three third.').click();
    await expect(reference(page)).toHaveValue('Psalm 130:3');
    await expect(passage(page)).toHaveValue('Example three third.');
    await expect(page.getByLabel('Source')).toHaveValue('Example translation');
  });

  test('a verse range (Psalm 130:1-2) becomes 2 cards: 4 study cards', async ({ page }) => {
    const id = await createDeck(page, 'Split');
    await page.goto(`/#/cards/new?deck=${id}`);
    await reference(page).fill('Psalm 130:1-2');
    await passage(page).fill('1 Example one first. 2 Example two second.');
    await splitButton(page).click();
    const dialog = page.getByRole('dialog', { name: 'Split into separate verses' });
    await expect(dialog).toContainText('This creates 2 cards');
    await expect(dialog).toContainText('so you will have 4 study cards');
    await dialog.getByRole('button', { name: 'Create 2 cards' }).click();
    await expect(page.getByText('2 verses added')).toBeVisible();
    await page.goto(`/#/decks/${id}/cards`);
    await expect(page.getByRole('row')).toHaveCount(3);

    // and the study queue really has 4 cards (2 verses x recall + identify)
    await page.goto(`/#/decks/${id}`);
    await expect(page.getByText('4 cards to study today.')).toBeVisible();
  });

  test('with only one kind of card in use, the preview says so', async ({ page }) => {
    const id = await createDeck(page, 'Split');
    await setCardKinds(page, 'Recall the passage');
    await page.goto(`/#/cards/new?deck=${id}`);
    await reference(page).fill('Psalm 130:1-2');
    await passage(page).fill('1 Example one first. 2 Example two second.');
    await splitButton(page).click();
    const dialog = page.getByRole('dialog', { name: 'Split into separate verses' });
    await expect(dialog).toContainText('This creates 2 cards, one per verse.');
    await expect(dialog).not.toContainText('study cards');
  });

  test('Spanish references keep their style', async ({ page }) => {
    const id = await createDeck(page, 'Split');
    await page.goto(`/#/cards/new?deck=${id}`);
    await reference(page).fill('Salmos 130:1-2');
    await passage(page).fill('1 Texto de ejemplo uno. 2 Texto de ejemplo dos.');
    await splitButton(page).click();
    const dialog = page.getByRole('dialog', { name: 'Split into separate verses' });
    await expect(dialog).toContainText('Salmos 130:1');
    await expect(dialog).toContainText('Salmos 130:2');
  });

  test('Cancel saves nothing and keeps what you typed', async ({ page }) => {
    const id = await createDeck(page, 'Split');
    await page.goto(`/#/cards/new?deck=${id}`);
    await reference(page).fill('Psalm 130:1-2');
    await passage(page).fill('1 Example one first. 2 Example two second.');
    await splitButton(page).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).dispatchEvent('click');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(reference(page)).toHaveValue('Psalm 130:1-2');
    await expect(passage(page)).toHaveValue('1 Example one first. 2 Example two second.');
    await page.goto(`/#/decks/${id}/cards`);
    await expect(page.getByText('No cards yet')).toBeVisible();
  });

  test('explains the problem when verse numbers are missing, and keeps the text', async ({ page }) => {
    const id = await createDeck(page, 'Split');
    await page.goto(`/#/cards/new?deck=${id}`);
    await reference(page).fill('Psalm 130');
    await passage(page).fill('A paragraph with no verse numbers at all.');
    await splitButton(page).click();
    const dialog = page.getByRole('dialog', { name: 'Split into separate verses' });
    await expect(dialog).toContainText("couldn't find the verse numbers");
    await expect(dialog.getByRole('button', { name: /Create/ })).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Close' }).dispatchEvent('click');
    await expect(passage(page)).toHaveValue('A paragraph with no verse numbers at all.');
  });

  test('names the verse that is missing from a range', async ({ page }) => {
    const id = await createDeck(page, 'Split');
    await page.goto(`/#/cards/new?deck=${id}`);
    await reference(page).fill('Psalm 130:1-3');
    await passage(page).fill('1 Example one first. 3 Example three third.');
    await splitButton(page).click();
    await expect(page.getByRole('dialog')).toContainText("couldn't find verse 2");
  });
});

test.describe('rating colors: only the text is colored', () => {
  // Light theme uses deeper shades so the text is readable on the page; dark theme uses the brighter ones.
  const COLORS = {
    light: { again: 'rgb(198, 40, 40)', hard: 'rgb(180, 83, 9)', good: 'rgb(21, 128, 61)', easy: 'rgb(3, 105, 161)', page: 'rgb(248, 248, 246)' },
    dark: { again: 'rgb(242, 131, 125)', hard: 'rgb(245, 160, 58)', good: 'rgb(91, 196, 138)', easy: 'rgb(124, 198, 242)', page: 'rgb(19, 19, 18)' },
  } as const;

  for (const scheme of ['light', 'dark'] as const) {
    test(`labels are red / orange / green / blue and the buttons themselves are not filled (${scheme})`, async ({ browser }) => {
      const c = COLORS[scheme];
      const ctx = await browser.newContext({ colorScheme: scheme });
      const page = await ctx.newPage();
      const id = await createDeck(page, 'Colors');
      await addCard(page, id, 'John 3:16', 'Example passage.');
      await setCardKinds(page, 'Recall the passage');
      await page.goto(`/#/decks/${id}/study/flashcard`);
      await page.getByRole('button', { name: 'Show answer' }).click();
      for (const [name, color] of [['Again', c.again], ['Hard', c.hard], ['Good', c.good], ['Easy', c.easy]] as const) {
        const button = page.getByRole('button', { name: new RegExp(`^${name}`) });
        await expect(button.getByText(name, { exact: true })).toHaveCSS('color', color);
        await expect(button).toHaveCSS('background-color', c.page); // same as the page: no colored fill
      }
      await ctx.close();
    });

    test(`the counters at the top left use the same text colors, with no fill (${scheme})`, async ({ browser }) => {
      const c = COLORS[scheme];
      const ctx = await browser.newContext({ colorScheme: scheme });
      const page = await ctx.newPage();
      const id = await createDeck(page, 'Colors');
      await addCard(page, id, 'John 3:16', 'Example passage.');
      await setCardKinds(page, 'Recall the passage');
      await page.goto(`/#/decks/${id}/study/flashcard`);
      const items = page.getByRole('list', { name: 'Cards remaining' }).getByRole('listitem');
      await expect(items.nth(0)).toHaveCSS('color', c.easy); // new
      await expect(items.nth(1)).toHaveCSS('color', c.again); // learning
      await expect(items.nth(2)).toHaveCSS('color', c.good); // to review
      for (const i of [0, 1, 2]) await expect(items.nth(i)).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      await ctx.close();
    });
  }
});

test('the Passage field starts as one line, grows as you type, and has no box', async ({ page }) => {
  const id = await createDeck(page, 'Grow');
  await page.goto(`/#/cards/new?deck=${id}`);
  const field = page.getByLabel('Passage', { exact: true });
  const height = async () => (await field.boundingBox())!.height;
  const start = await height();
  expect(start).toBeLessThan(60); // one line, not a tall box
  await expect(field).toHaveCSS('border-top-width', '0px'); // underline only
  await expect(field).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');

  await field.fill(Array.from({ length: 12 }, (_, i) => `${i + 1} A fairly long line of verse text number ${i + 1} that wraps.`).join('\n'));
  const grown = await height();
  expect(grown).toBeGreaterThan(start * 4); // it expanded to fit, instead of scrolling inside a box

  await field.fill('');
  expect(await height()).toBeLessThan(60); // and shrinks back
});

test('the Deck row in the card form opens the same popup as the other deck pickers', async ({ page }) => {
  const a = await createDeck(page, 'Alpha');
  await createDeck(page, 'Beta');
  await page.goto(`/#/cards/new?deck=${a}`);
  await expect(page.locator('select')).toHaveCount(0); // no system dropdown
  await expect(page.getByLabel('Source')).toHaveAttribute('placeholder', 'Optional');

  const row = page.getByRole('button', { name: 'Deck: Alpha' });
  await expect(row).toBeVisible();
  await row.click();
  const popup = page.getByRole('dialog', { name: 'Select a deck' });
  await expect(popup.getByRole('button', { name: /^(Alpha|Beta)$/ })).toHaveText(['Alpha', 'Beta']); // just decks: no "All decks" here
  await popup.getByRole('button', { name: 'Beta' }).click();
  await expect(page.getByRole('button', { name: 'Deck: Beta' })).toBeVisible();

  // the card goes into the chosen deck
  await reference(page).fill('John 3:16');
  await passage(page).fill('Example.');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('John 3:16 added')).toBeVisible();
  await page.goto(`/#/decks/${a}/cards`);
  await expect(page.getByText('No cards yet')).toBeVisible();
});
