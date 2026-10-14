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

test.describe('add another card', () => {
  test('saves the card, clears verse and passage, keeps the source, and says what was saved', async ({ page }) => {
    const id = await createDeck(page, 'Many');
    await page.goto(`/#/cards/new?deck=${id}`);
    await reference(page).fill('John 3:16');
    await page.getByLabel('Source').fill('Example translation');
    await passage(page).fill('First example passage.');
    await page.getByRole('button', { name: 'Add another card' }).click();

    await expect(page.getByRole('status')).toContainText('Saved John 3:16');
    await expect(reference(page)).toHaveValue('');
    await expect(passage(page)).toHaveValue('');
    await expect(page.getByLabel('Source')).toHaveValue('Example translation');
    await expect(reference(page)).toBeFocused();

    await reference(page).fill('Psalm 23:1');
    await passage(page).fill('Second example passage.');
    await page.getByRole('button', { name: 'Save' }).click(); // the check mark in the header
    await page.waitForURL(/\/cards$/);
    await expect(page.getByRole('link', { name: /John 3:16/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Psalm 23:1/ })).toBeVisible();
  });

  test('shows an error and keeps what you typed when the card is incomplete', async ({ page }) => {
    const id = await createDeck(page, 'Many');
    await page.goto(`/#/cards/new?deck=${id}`);
    await reference(page).fill('John 3:16');
    await page.getByRole('button', { name: 'Add another card' }).click();
    await expect(page.getByRole('alert')).toContainText('Verse text is required');
    await expect(reference(page)).toHaveValue('John 3:16');
  });

  test('is not offered when editing an existing card', async ({ page }) => {
    const id = await createDeck(page, 'Many');
    await addCard(page, id, 'John 3:16', 'Example.');
    await page.getByRole('link', { name: /John 3:16/ }).click();
    await expect(page.getByRole('button', { name: 'Add another card' })).toHaveCount(0);
    await expect(splitButton(page)).toHaveCount(0);
  });
});

test.describe('split into separate verses', () => {
  test('is disabled until the reference is a chapter or several verses and there is a passage', async ({ page }) => {
    const id = await createDeck(page, 'Split');
    await page.goto(`/#/cards/new?deck=${id}`);
    await expect(splitButton(page)).toBeDisabled();
    await reference(page).fill('John 3:16'); // a single verse
    await passage(page).fill('16 Example sixteen.');
    await expect(splitButton(page)).toBeDisabled();
    await reference(page).fill('Psalm 130:1-2');
    await expect(splitButton(page)).toBeEnabled();
    await passage(page).fill('');
    await expect(splitButton(page)).toBeDisabled();
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

    await page.waitForURL(/\/cards$/);
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
    await page.waitForURL(/\/cards$/);
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
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
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
    await dialog.getByRole('button', { name: 'Close' }).click();
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
