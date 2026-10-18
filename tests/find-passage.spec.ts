import { test, expect, type Page } from '@playwright/test';
import { createDeck, deckIdFromUrl } from './helpers';

async function newCardForm(page: Page) {
  const id = await createDeck(page, 'Gateway deck');
  await page.goto(`/#/cards/new?deck=${id}`);
}
const helper = (page: Page) => page.getByRole('button', { name: /Find passage/ });
const reference = (page: Page) => page.getByLabel('Verse(s)');
const passage = (page: Page) => page.getByLabel('Passage', { exact: true });

test('the helper only appears for a valid Bible reference', async ({ page }) => {
  await newCardForm(page);
  const ref = reference(page);
  await expect(helper(page)).toHaveCount(0); // empty
  await ref.fill('Example 1:1');
  await expect(helper(page)).toHaveCount(0); // not a book
  await ref.fill('John 3:');
  await expect(helper(page)).toHaveCount(0); // incomplete
  await ref.fill('Psalm 130:1');
  await expect(helper(page)).toBeVisible();
  await ref.fill('1 cor 13:4-7');
  await expect(helper(page)).toBeVisible();
  await ref.fill('John 3:16&version=x');
  await expect(helper(page)).toHaveCount(0); // junk after a valid reference
});

test('Cancel closes the dialog and opens nothing', async ({ page, context }) => {
  await newCardForm(page);
  const opened: string[] = [];
  context.on('page', (p) => opened.push(p.url()));
  await reference(page).fill('John 3:16');
  await helper(page).click();

  const dialog = page.getByRole('dialog', { name: 'Find a Bible passage' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Explore different translations and compare them on these sites.');
  await expect(dialog).toContainText('Copy the passage there and paste it into your card.');
  await dialog.getByRole('button', { name: 'Cancel' }).dispatchEvent('click');
  await expect(dialog).toBeHidden();
  await page.waitForTimeout(300);
  expect(opened).toEqual([]);
  await expect(reference(page)).toHaveValue('John 3:16'); // form untouched
});

test('Open Bible Gateway opens it in a separate tab, with the encoded reference', async ({ page, context }) => {
  await context.route('https://www.biblegateway.com/**', (route) => route.fulfill({ contentType: 'text/html', body: '<p>stub</p>' }));
  await newCardForm(page);
  await reference(page).fill('psalm 130:1');
  await helper(page).click();
  const popupPromise = context.waitForEvent('page');
  await page.getByRole('dialog').getByRole('button', { name: /Open Bible Gateway/ }).click();
  const popup = await popupPromise;
  expect(popup.url()).toBe('https://www.biblegateway.com/passage/?search=Psalm+130%3A1');
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(reference(page)).toHaveValue('psalm 130:1'); // we're still in the app, form intact
});

test('the form stays fully usable offline, with or without a valid reference', async ({ page, context }) => {
  await newCardForm(page);
  await context.setOffline(true);
  await reference(page).fill('John 3:16');
  await helper(page).click();
  await expect(page.getByRole('dialog').getByText(/appear to be offline/)).toBeVisible(); // honest heads-up
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).dispatchEvent('click');
  await passage(page).fill('Typed by the user while offline.');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('John 3:16 added')).toBeVisible(); // saved locally
});

test('the helper also appears when editing an existing card', async ({ page }) => {
  await newCardForm(page);
  await reference(page).fill('John 3:16');
  await passage(page).fill('Typed by the user.');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('John 3:16 added')).toBeVisible();
  await page.goto(`/#/decks/${deckIdFromUrl(page)}/cards`);
  await page.getByRole('link', { name: /John 3:16/ }).click();
  await expect(helper(page)).toBeVisible();
});

test('saving still works without the helper (free-text reference, manual entry)', async ({ page }) => {
  await newCardForm(page);
  await reference(page).fill('My own label');
  await passage(page).fill('Typed by the user.');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('My own label added')).toBeVisible();
});

test('Spanish references work too, and always search with the English book name', async ({ page, context }) => {
  await context.route('https://www.biblegateway.com/**', (route) => route.fulfill({ contentType: 'text/html', body: '<p>stub</p>' }));
  await newCardForm(page);
  await reference(page).fill('Salmos 130:1');
  await helper(page).click();
  const popupPromise = context.waitForEvent('page');
  await page.getByRole('dialog').getByRole('button', { name: /Open Bible Gateway/ }).click();
  expect((await popupPromise).url()).toBe('https://www.biblegateway.com/passage/?search=Psalm+130%3A1');
});

test.describe('eBible, the second source', () => {
  test('the dialog offers both, and Open eBible opens the verse in the World English Bible', async ({ page, context }) => {
    await context.route('https://ebible.org/**', (route) => route.fulfill({ contentType: 'text/html', body: '<p>stub</p>' }));
    await newCardForm(page);
    await reference(page).fill('John 3:16');
    await helper(page).click();
    const dialog = page.getByRole('dialog', { name: 'Find a Bible passage' });
    await expect(dialog.getByRole('button', { name: /Open Bible Gateway/ })).toBeVisible();
    // both sources look the same, so neither is pushed: equal white buttons, nothing underneath
    const gatewayBox = (await dialog.getByRole('button', { name: /Open Bible Gateway/ }).boundingBox())!;
    const ebibleBox = (await dialog.getByRole('button', { name: /Open eBible/ }).boundingBox())!;
    expect(gatewayBox.width).toBe(ebibleBox.width);
    expect(gatewayBox.height).toBe(ebibleBox.height);
    for (const name of [/Open Bible Gateway/, /Open eBible/]) expect(await dialog.getByRole('button', { name }).evaluate((e) => getComputedStyle(e).backgroundColor)).toBe('rgb(255, 255, 255)'); // white
    const popup = context.waitForEvent('page');
    await dialog.getByRole('button', { name: /Open eBible/ }).click();
    expect((await popup).url()).toBe('https://ebible.org/study/?w1=bible&t1=local%3Aeng-web&v1=JN3_16');
    await expect(dialog).toBeHidden();
    await expect(reference(page)).toHaveValue('John 3:16'); // still in the app, form intact
  });

  test('numbered books, ranges and chapters open at the first verse', async ({ page, context }) => {
    await context.route('https://ebible.org/**', (route) => route.fulfill({ contentType: 'text/html', body: '<p>stub</p>' }));
    await newCardForm(page);
    for (const [typed, v1] of [['1 cor 13:4-7', 'C113_4'], ['Psalm 23', 'PS23_1'], ['Jude 3', 'JD1_3']] as const) {
      await reference(page).fill(typed);
      await helper(page).click();
      const popup = context.waitForEvent('page');
      await page.getByRole('dialog').getByRole('button', { name: /Open eBible/ }).click();
      expect(new URL((await popup).url()).searchParams.get('v1')).toBe(v1);
      await expect(page.getByRole('dialog')).toBeHidden();
    }
  });

  test('a Spanish deck opens Reina-Valera 1909', async ({ page, context }) => {
    await context.route('https://ebible.org/**', (route) => route.fulfill({ contentType: 'text/html', body: '<p>stub</p>' }));
    await page.goto('/#/decks/new');
    await page.getByLabel('Title').fill('Salmos');
    await page.getByRole('button', { name: /^Translation/ }).click();
    await page.getByRole('dialog', { name: 'Select a translation' }).getByRole('button', { name: /RV1909/ }).click();
    await page.getByRole('button', { name: 'Save' }).click();
    await page.waitForURL(/#\/decks\/[0-9a-f-]{36}$/);
    const id = page.url().match(/#\/decks\/([0-9a-f-]{36})$/)![1]!;
    await page.goto(`/#/cards/new?deck=${id}`);
    await reference(page).fill('Salmos 23:1');
    await helper(page).click();
    const popup = context.waitForEvent('page');
    await page.getByRole('dialog').getByRole('button', { name: /Open eBible/ }).click();
    expect((await popup).url()).toBe('https://ebible.org/study/?w1=bible&t1=local%3AspaRV1909&v1=PS23_1');
  });
});
