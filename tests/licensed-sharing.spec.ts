import { test, expect, type Page } from '@playwright/test';
import { createDeck, openDeck } from './helpers';

/**
 * A deck with licensed cards can be published and imported: only the reference and the translation travel; the publisher's text
 * is fetched again on the device that imports the deck. (The YouVersion service and the cloud are stand-ins here.)
 */
type Cloud = { decks: Record<string, { meta: { translation: string; language: string; v: number; cardCount: number }; cards: Record<string, { reference: string; verseText: string; translation?: string; v: number }> }> };
const cloud = (page: Page) => page.evaluate(() => (window as unknown as { __fakeCloud: () => unknown }).__fakeCloud()) as Promise<Cloud>;
const drawer = (page: Page) => page.getByRole('dialog', { name: /^(Publish deck|Published deck)$/ });
const rulesDrawer = (page: Page) => page.getByRole('dialog', { name: 'Community rules' });

async function addAutofilled(page: Page, deckId: string, translation: RegExp, references: string[]) {
  await page.goto('/');
  await page.goto(`/#/cards/new?deck=${deckId}`);
  await page.getByRole('switch', { name: 'Autofill' }).click();
  await page.getByRole('button', { name: /^Translation: / }).click();
  await page.getByRole('dialog', { name: 'Choose a translation' }).getByRole('button', { name: translation }).click();
  for (const reference of references) {
    await page.getByLabel('Verse(s)').fill(reference);
    await expect(page.getByLabel('Passage', { exact: true })).not.toHaveValue('');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText(`${reference} added`)).toBeVisible();
  }
}

async function publishDeck(page: Page, deckId: string) {
  await openDeck(page, deckId);
  await page.getByRole('button', { name: 'Deck actions' }).click();
  await page.getByRole('button', { name: 'Publish deck' }).click();
  await drawer(page).getByRole('button', { name: 'Continue with Google' }).click();
  await drawer(page).getByRole('button', { name: 'Publish', exact: true }).click();
  await expect(rulesDrawer(page).or(page.getByText('Deck published'))).toBeVisible();
  if (await rulesDrawer(page).isVisible()) await rulesDrawer(page).getByRole('button', { name: 'Agree and publish' }).click();
  await expect(page.getByText('Deck published')).toBeVisible();
}

test('a deck of licensed cards is published as references only, labelled with its translation', async ({ page }) => {
  test.setTimeout(90_000);
  const id = await createDeck(page, 'Lockman verses');
  await addAutofilled(page, id, /New American Standard Bible 2020/, ['John 3:16', 'Romans 8:28']);
  await publishDeck(page, id);

  const published = Object.values((await cloud(page)).decks);
  expect(published).toHaveLength(1);
  expect(published[0]!.meta).toMatchObject({ translation: 'NASB2020', language: 'en', cardCount: 2, v: 2 });
  const sent = Object.values(published[0]!.cards);
  expect(sent.map((c) => [c.reference, c.verseText, c.translation]).sort()).toEqual([['John 3:16', '', 'NASB2020'], ['Romans 8:28', '', 'NASB2020']]);
  expect(JSON.stringify(published)).not.toContain('Fake NASB2020 text'); // the publisher's text is nowhere in the cloud
});

test('a deck labelled with a licensed translation in the Publish screen is published as references only', async ({ page }) => {
  test.setTimeout(90_000);
  const id = await createDeck(page, 'My NASB verses');
  await page.goto(`/#/cards/new?deck=${id}`);
  await page.getByLabel('Verse(s)').fill('John 3:16');
  await page.getByLabel('Passage', { exact: true }).fill('typed from my own Bible');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('John 3:16 added')).toBeVisible();
  await openDeck(page, id);
  await page.getByRole('button', { name: 'Deck actions' }).click();
  await page.getByRole('button', { name: 'Publish deck' }).click();
  await drawer(page).getByRole('button', { name: 'Continue with Google' }).click();
  await drawer(page).getByRole('button', { name: /^Translation:/ }).click();
  const list = page.getByRole('dialog', { name: 'Choose a translation' });
  await expect(list.getByRole('listitem').first()).toHaveText(/My own words/); // the two choices for a deck's own text come first
  await expect(list.getByRole('listitem').nth(1)).toHaveText(/Another translation/);
  await list.getByRole('button', { name: /New American Standard Bible 2020/ }).click();
  await drawer(page).getByRole('button', { name: 'Publish', exact: true }).click();
  await expect(rulesDrawer(page).or(page.getByText('Deck published'))).toBeVisible();
  if (await rulesDrawer(page).isVisible()) await rulesDrawer(page).getByRole('button', { name: 'Agree and publish' }).click();
  await expect(page.getByText('Deck published')).toBeVisible();

  const [deck] = Object.values((await cloud(page)).decks);
  expect(deck!.meta).toMatchObject({ translation: 'NASB2020', language: 'en' });
  expect(Object.values(deck!.cards).map((c) => [c.reference, c.verseText, c.translation])).toEqual([['John 3:16', '', 'NASB2020']]);
  expect(JSON.stringify(deck)).not.toContain('typed from my own Bible');
});

test('a deck with licensed and open cards is published as MIXED, with the open text and the licensed references', async ({ page }) => {
  test.setTimeout(90_000);
  const id = await createDeck(page, 'Both');
  await addAutofilled(page, id, /World English Bible/, ['John 1:1']);
  await addAutofilled(page, id, /Amplified Bible/, ['John 1:2']);
  await publishDeck(page, id);
  const [deck] = Object.values((await cloud(page)).decks);
  expect(deck!.meta).toMatchObject({ translation: 'MIXED', language: 'en' });
  const sent = Object.values(deck!.cards).sort((a, b) => a.reference.localeCompare(b.reference));
  expect(sent.map((c) => [c.reference, c.verseText, c.translation])).toEqual([['John 1:1', 'Fake WEB text of John 1:1.', 'WEB'], ['John 1:2', '', 'AMP']]);
});

test('Discover shows such a deck without the text, and importing it brings the cards, which fetch their text', async ({ page, browser }) => {
  test.setTimeout(120_000);
  const id = await createDeck(page, 'Lockman verses');
  await addAutofilled(page, id, /New American Standard Bible 2020/, ['John 3:16', 'Romans 8:28']);
  await publishDeck(page, id);
  const state = JSON.stringify({ ...(await cloud(page)), user: null }); // the public catalogue, as another person sees it

  // another person, on their own device, with nothing of the author's
  const other = await browser.newContext();
  const reader = await other.newPage();
  await reader.addInitScript((s) => { if (!localStorage.getItem('sbm-fake-cloud')) localStorage.setItem('sbm-fake-cloud', s); }, state);
  await reader.goto('/#/discover');
  await expect(reader.getByRole('link', { name: /Lockman verses/ })).toContainText('NASB 2020 · English');
  await reader.getByRole('link', { name: /Lockman verses/ }).click();
  await expect(reader.getByText('John 3:16', { exact: true })).toBeVisible();
  await expect(reader.getByText(/Fake NASB2020 text/)).toHaveCount(0); // not in the preview
  await expect(reader.getByText('The text of this translation appears once you import the deck.').first()).toBeVisible();
  await expect(reader.getByRole('link', { name: 'NASB 2020' }).first()).toHaveAttribute('href', 'https://www.lockman.org');

  await reader.getByRole('button', { name: /^Import/ }).click();
  await reader.waitForURL(/#\/decks\/[0-9a-f-]{36}$/);
  await reader.goto('/#/decks/all/cards');
  await expect(reader.getByText('Fake NASB2020 text of John 3:16.')).toBeVisible(); // fetched to this device after the import
  await expect(reader.getByText('Fake NASB2020 text of Romans 8:28.')).toBeVisible();
  await other.close();
});
