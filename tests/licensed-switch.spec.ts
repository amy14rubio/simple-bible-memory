import { test, expect, type Page } from '@playwright/test';
import { createDeck } from './helpers';

/** The off switch for licensed translations (config/licensedTranslations in Firestore); here the fake cloud holds it. */
const setSwitch = (page: Page, value: unknown) => page.evaluate((v) => {
  const s = JSON.parse(localStorage.getItem('sbm-fake-cloud') ?? '{}');
  s.licensedSwitch = v;
  localStorage.setItem('sbm-fake-cloud', JSON.stringify(s));
}, value);

async function deckWithLicensedCard(page: Page) {
  const id = await createDeck(page, 'Switch');
  await page.goto(`/#/cards/new?collection=${id}`);
  await page.getByRole('switch', { name: 'Autofill' }).click();
  await page.getByRole('button', { name: /^Translation: / }).click();
  await page.getByRole('dialog', { name: 'Choose a translation' }).getByRole('button', { name: /New American Standard Bible 2020/ }).click();
  await page.getByLabel('Verse(s)').fill('John 3:16');
  await expect(page.getByLabel('Passage', { exact: true })).toHaveValue('Fake NASB2020 text of John 3:16.');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('John 3:16 added')).toBeVisible();
  return id;
}

test('switching a translation off empties its text on the device, hides it, and turning it on brings the text back', async ({ page }) => {
  const id = await deckWithLicensedCard(page);
  await page.goto(`/#/collections/${id}/cards`);
  await expect(page.getByText('Fake NASB2020 text of John 3:16.')).toBeVisible();

  await setSwitch(page, { off: ['NASB2020'] });
  await page.reload(); // the app reads the switch when it opens
  await expect(page.getByText('John 3:16', { exact: true })).toBeVisible(); // the card (reference) is still there
  await expect(page.getByText('Fake NASB2020 text of John 3:16.')).toHaveCount(0); // its text is gone

  // it is no longer offered in the picker, and a card that uses it says so
  await page.goto(`/#/cards/new?collection=${id}`);
  await page.getByRole('switch', { name: 'Autofill' }).click();
  await page.getByRole('button', { name: /^Translation: / }).click();
  const dialog = page.getByRole('dialog', { name: 'Choose a translation' });
  await expect(dialog.getByRole('button', { name: /New American Standard Bible 2020/ })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: /New American Standard Bible 1995/ })).toBeVisible(); // only the one that was switched off
  await page.keyboard.press('Escape');

  await setSwitch(page, null); // switched on again
  await page.reload();
  await page.goto(`/#/collections/${id}/cards`);
  await expect(page.getByText('Fake NASB2020 text of John 3:16.')).toBeVisible(); // fetched again
});

test('"all" turns every licensed translation off, and an open one keeps its text', async ({ page }) => {
  const id = await deckWithLicensedCard(page); // (the form is still open, with autofill on, ready for the next card)
  await page.getByRole('button', { name: /^Translation: / }).click();
  await page.getByRole('dialog', { name: 'Choose a translation' }).getByRole('button', { name: /World English Bible/ }).click(); // an open one
  await page.getByLabel('Verse(s)').fill('John 1:1');
  await expect(page.getByLabel('Passage', { exact: true })).toHaveValue('Fake WEB text of John 1:1.');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('John 1:1 added')).toBeVisible();

  await setSwitch(page, { all: true });
  await page.reload();
  await page.goto(`/#/collections/${id}/cards`);
  await expect(page.getByText('Fake WEB text of John 1:1.')).toBeVisible();
  await expect(page.getByText('Fake NASB2020 text of John 3:16.')).toHaveCount(0);
});

test('a card that uses a switched-off translation says why its text is missing when it is opened', async ({ page }) => {
  const id = await deckWithLicensedCard(page);
  await setSwitch(page, { off: ['NASB2020'] });
  await page.reload();
  await page.goto(`/#/collections/${id}/cards`);
  await page.getByText('John 3:16', { exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Edit card' })).toBeVisible();
  await expect(page.getByText(/New American Standard Bible 2020 is turned off for now/)).toBeVisible();
});
