import { test, expect, type Page } from '@playwright/test';
import { createDeck } from './helpers';

async function newCardForm(page: Page) {
  const id = await createDeck(page, 'Gateway deck');
  await page.goto(`/#/cards/new?deck=${id}`);
}
const helper = (page: Page) => page.getByRole('button', { name: /Find on Bible Gateway/ });
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
  await expect(dialog).toContainText("Bible Gateway will open in your device's web browser.");
  await expect(dialog).toContainText("This app doesn't automatically retrieve or copy Bible text from Bible Gateway.");
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
  await page.waitForTimeout(300);
  expect(opened).toEqual([]);
  await expect(reference(page)).toHaveValue('John 3:16'); // form untouched
});

test('Continue opens Bible Gateway in a separate tab, with the encoded reference', async ({ page, context }) => {
  await context.route('https://www.biblegateway.com/**', (route) => route.fulfill({ contentType: 'text/html', body: '<p>stub</p>' }));
  await newCardForm(page);
  await reference(page).fill('psalm 130:1');
  await helper(page).click();
  const popupPromise = context.waitForEvent('page');
  await page.getByRole('dialog').getByRole('button', { name: /Continue to Bible Gateway/ }).click();
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
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
  await passage(page).fill('Typed by the user while offline.');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('link', { name: /John 3:16/ })).toBeVisible(); // saved locally
});

test('the helper also appears when editing an existing card', async ({ page }) => {
  await newCardForm(page);
  await reference(page).fill('John 3:16');
  await passage(page).fill('Typed by the user.');
  await page.getByRole('button', { name: 'Save' }).click();
  await page.getByRole('link', { name: /John 3:16/ }).click();
  await expect(helper(page)).toBeVisible();
});

test('saving still works without the helper (free-text reference, manual entry)', async ({ page }) => {
  await newCardForm(page);
  await reference(page).fill('My own label');
  await passage(page).fill('Typed by the user.');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('link', { name: /My own label/ })).toBeVisible();
});

test('Spanish references work too, and always search with the English book name', async ({ page, context }) => {
  await context.route('https://www.biblegateway.com/**', (route) => route.fulfill({ contentType: 'text/html', body: '<p>stub</p>' }));
  await newCardForm(page);
  await reference(page).fill('Salmos 130:1');
  await helper(page).click();
  const popupPromise = context.waitForEvent('page');
  await page.getByRole('dialog').getByRole('button', { name: /Continue to Bible Gateway/ }).click();
  expect((await popupPromise).url()).toBe('https://www.biblegateway.com/passage/?search=Psalm+130%3A1');
});
