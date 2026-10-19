import { test, expect } from '@playwright/test';
import { addCard, createDeck, deckIdFromUrl, closeWithEscape } from './helpers';

test('empty state, then the full deck and card workflow persists across reload', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('No decks yet')).toBeVisible();

  // create a deck
  await page.getByRole('link', { name: 'Create your first deck' }).click();
  await page.getByLabel('Title').fill('Commute verses');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('heading', { name: 'Commute verses' })).toBeVisible();
  await expect(page.getByText('Nothing to study yet')).toBeVisible();

  // add a card from the empty deck (user-entered example text, not a real translation)
  await page.getByRole('link', { name: 'New card' }).click();
  await page.getByLabel('Verse(s)').fill('Example 1:1');
  await page.getByLabel('Passage', { exact: true }).fill('Example verse text typed by the user.');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Example 1:1 added')).toBeVisible(); // the form stays open; open the card list
  await page.goto(`/#/decks/${deckIdFromUrl(page)}/cards`);
  await page.reload();
  await expect(page.getByRole('link', { name: /Example 1:1/ })).toBeVisible();

  // edit the card
  await page.getByRole('link', { name: /Example 1:1/ }).click();
  await page.getByLabel('Verse(s)').fill('Example 1:2');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('link', { name: /Example 1:2/ })).toBeVisible();

  // rename the deck from its menu (Back from the card list goes home)
  await page.getByRole('link', { name: 'Back to decks' }).click();
  await expect(page).toHaveURL(/#\/$/);
  await page.getByRole('link', { name: /Commute verses/ }).click();
  await page.getByRole('button', { name: 'Deck actions' }).click();
  await page.getByRole('link', { name: 'Rename deck' }).click();
  await expect(page.getByLabel('Description')).toBeVisible();
  await page.getByLabel('Title').fill('Renamed');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('heading', { name: 'Renamed' })).toBeVisible();

  // everything survives a reload, and the home list shows the count
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Renamed' })).toBeVisible();
  await page.getByRole('link', { name: 'Back to decks' }).click();
  await expect(page.getByRole('link', { name: /Renamed/ })).toContainText('2 due'); // one verse = two study cards
});

test('deck menu: browse cards and the deck switcher', async ({ page }) => {
  const a = await createDeck(page, 'Alpha');
  await addCard(page, a, 'John 3:16', 'Alpha passage.');
  const b = await createDeck(page, 'Beta');
  await addCard(page, b, 'Psalm 23:1', 'Beta passage.');

  await page.goto(`/#/decks/${b}`);
  await page.getByRole('button', { name: 'Deck actions' }).click();
  await page.getByRole('link', { name: 'Browse cards' }).click();
  await expect(page.getByRole('link', { name: /Psalm 23:1/ })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Verse' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Passage' })).toBeVisible();

  await page.getByRole('button', { name: /^Deck:/ }).click();
  await page.getByRole('dialog', { name: 'Select a deck' }).getByRole('button', { name: 'Alpha' }).click();
  await expect(page.getByRole('link', { name: /John 3:16/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Psalm 23:1/ })).toHaveCount(0);
});

test('the back arrow on the card list goes to the home page', async ({ page }) => {
  const id = await createDeck(page, 'Home bound');
  await addCard(page, id, 'John 3:16', 'Sample.');
  await page.getByRole('link', { name: 'Back to decks' }).click();
  await expect(page).toHaveURL(/#\/$/);
  await expect(page.getByRole('link', { name: /Home bound/ })).toBeVisible();
});

test('searching decks and cards filters the lists', async ({ page }) => {
  const a = await createDeck(page, 'Gospel verses');
  await addCard(page, a, 'John 3:16', 'Sample alpha text.');
  await addCard(page, a, 'Mark 1:15', 'Sample beta text.');
  await createDeck(page, 'Psalms');

  await page.goto('/');
  await page.getByRole('button', { name: 'Search decks' }).click();
  await page.getByLabel('Search decks', { exact: true }).fill('psal');
  await expect(page.getByRole('link', { name: /Psalms/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Gospel verses/ })).toHaveCount(0);
  await page.getByLabel('Search decks', { exact: true }).fill('zzz');
  await expect(page.getByText('No decks match')).toBeVisible();

  await page.goto(`/#/decks/${a}/cards`);
  await page.getByRole('button', { name: 'Search cards' }).click();
  await page.getByLabel('Search cards', { exact: true }).fill('beta');
  await expect(page.getByRole('link', { name: /Mark 1:15/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /John 3:16/ })).toHaveCount(0);
});

test('the + button opens the create drawer, and choosing New deck goes to the new deck form', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Add' }).click();
  const drawer = page.getByRole('dialog', { name: 'Create new' });
  await expect(drawer).toBeVisible();
  await drawer.getByRole('button', { name: /New deck/ }).click();
  await expect(page.getByRole('heading', { name: 'New deck' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('delete card and delete deck both ask for confirmation', async ({ page }) => {
  const id = await createDeck(page, 'Temp');
  await addCard(page, id, 'X 1:1', 'x');

  await page.getByRole('link', { name: /X 1:1/ }).click();
  await page.getByRole('button', { name: 'Delete card' }).click();
  const dialog = page.locator('dialog[open]');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByLabel('Verse(s)')).toHaveValue('X 1:1'); // cancelled: still editing
  await page.getByRole('button', { name: 'Delete card' }).first().click();
  await dialog.getByRole('button', { name: 'Delete card' }).click();
  await expect(page.getByText('No cards yet')).toBeVisible();

  await page.goto(`/#/decks/${id}`);
  await page.getByRole('button', { name: 'Deck actions' }).click();
  await page.getByRole('button', { name: 'Delete deck' }).click();
  await expect(dialog).toContainText('permanently deleted');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('button', { name: 'Deck actions' }).click();
  await page.getByRole('button', { name: 'Delete deck' }).click();
  await dialog.getByRole('button', { name: 'Delete deck' }).click();
  await expect(page.getByText('No decks yet')).toBeVisible();
});

test('deleting a deck from the home list works too', async ({ page }) => {
  await createDeck(page, 'Short-lived');
  await page.goto('/');
  await page.getByRole('button', { name: 'Actions for Short-lived' }).click();
  await page.getByRole('button', { name: 'Delete deck' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete deck' }).click();
  await expect(page.getByText('No decks yet')).toBeVisible();
});

test('adding a card with no decks prompts to create one', async ({ page }) => {
  await page.goto('/#/cards/new');
  await expect(page.getByText('Create a deck first')).toBeVisible();
});

test('search works like Anki: the top bar becomes the search field, with a back arrow on the left', async ({ page }) => {
  await createDeck(page, 'Psalms');
  await createDeck(page, 'Romans');
  await page.goto('/');
  await expect(page.getByText('Psalms')).toBeVisible();

  await page.getByRole('button', { name: 'Search decks' }).click();
  const input = page.getByLabel('Search decks', { exact: true });
  await expect(input).toBeFocused(); // the keyboard opens straight away
  await expect(page.getByRole('button', { name: 'Search decks' })).toHaveCount(0); // the search icon is gone
  await expect(page.getByRole('link', { name: 'Settings' })).toBeVisible(); // the other icons stay, like Anki
  const back = page.getByRole('button', { name: 'Close search' });
  await expect(back).toBeVisible();
  const bar = (await page.locator('header').first().boundingBox())!;
  expect((await back.boundingBox())!.x - bar.x).toBeLessThan(20); // far left of the bar
  await expect(page.getByRole('button', { name: 'Clear search' })).toHaveCount(0); // nothing to clear yet

  await input.fill('rom');
  await expect(page.getByText('Psalms')).toHaveCount(0);
  await expect(page.getByText('Romans')).toBeVisible();
  await page.getByRole('button', { name: 'Clear search' }).click();
  await expect(input).toHaveValue('');
  await expect(input).toBeFocused(); // keeps the keyboard open
  await expect(page.getByText('Psalms')).toBeVisible();

  await input.fill('psa');
  await back.click(); // leaves search and clears the filter
  await expect(page.getByRole('button', { name: 'Search decks' })).toBeVisible();
  await expect(page.getByText('Romans')).toBeVisible();
  await expect(page.getByText('Psalms')).toBeVisible();

  await page.getByRole('button', { name: 'Search decks' }).click();
  await closeWithEscape(page); // Escape leaves search too
  await expect(page.getByRole('button', { name: 'Search decks' })).toBeVisible();
});

test('the deck picker is a popup: title, search and + on top, the deck list, and Cancel', async ({ page }) => {
  const a = await createDeck(page, 'Alpha');
  await createDeck(page, 'Beta');
  await createDeck(page, 'Gamma');
  await page.goto(`/#/decks/${a}/cards`);
  await expect(page.locator('select')).toHaveCount(0); // no plain dropdown any more

  await page.getByRole('button', { name: /^Deck:/ }).click();
  const popup = page.getByRole('dialog', { name: 'Select a deck' });
  await expect(popup.getByRole('heading', { name: 'Select a deck' })).toBeVisible();
  await expect(popup.getByRole('button', { name: 'Search decks' })).toBeVisible();
  await expect(popup.getByRole('button', { name: 'New deck' })).toBeVisible();
  await expect(popup.getByRole('button', { name: /^(Alpha|Beta|Gamma)$/ })).toHaveCount(3);

  // search turns the popup's header into a search field, with a back arrow; + stays
  await popup.getByRole('button', { name: 'Search decks' }).click();
  const input = popup.getByLabel('Search decks', { exact: true });
  await expect(input).toBeFocused();
  await expect(popup.getByRole('heading', { name: 'Select a deck' })).toHaveCount(0);
  await expect(popup.getByRole('button', { name: 'New deck' })).toBeVisible();
  await input.fill('gam');
  await expect(popup.getByRole('button', { name: /^(Alpha|Beta|Gamma)$/ })).toHaveText(['Gamma']);
  await input.fill('zzz');
  await expect(popup.getByText('No decks match "zzz".')).toBeVisible();
  await popup.getByRole('button', { name: 'Close search' }).click();
  await expect(popup.getByRole('heading', { name: 'Select a deck' })).toBeVisible();

  // Cancel closes it without changing anything
  await popup.getByRole('button', { name: 'Cancel' }).dispatchEvent('click');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Deck: Alpha' })).toBeVisible();

  // choosing a deck goes to its cards; + goes to the New deck form
  await page.getByRole('button', { name: /^Deck:/ }).click();
  await page.getByRole('dialog', { name: 'Select a deck' }).getByRole('button', { name: 'Beta' }).click();
  await expect(page.getByRole('button', { name: 'Deck: Beta' })).toBeVisible();
  await page.getByRole('button', { name: /^Deck:/ }).click();
  await page.getByRole('dialog', { name: 'Select a deck' }).getByRole('button', { name: 'New deck' }).click();
  await expect(page).toHaveURL(/#\/decks\/new$/);
});

test('the card browser has an All decks view that lists every card', async ({ page }) => {
  const a = await createDeck(page, 'Alpha');
  const b = await createDeck(page, 'Beta');
  await addCard(page, a, 'John 3:16', 'Alpha passage.');
  await addCard(page, b, 'Psalm 23:1', 'Beta passage.');
  await page.goto(`/#/decks/${a}/cards`);
  await expect(page.getByRole('link', { name: /Psalm 23:1/ })).toHaveCount(0); // one deck: only its cards

  await page.getByRole('button', { name: /^Deck:/ }).click();
  const popup = page.getByRole('dialog', { name: 'Select a deck' });
  await expect(popup.getByRole('button').filter({ hasText: /^(All decks|Alpha|Beta)$/ })).toHaveText(['All decks', 'Alpha', 'Beta']); // All decks first
  await popup.getByRole('button', { name: 'All decks', exact: true }).click();

  await expect(page).toHaveURL(/#\/decks\/all\/cards$/);
  await expect(page.getByRole('button', { name: 'Deck: All decks' })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Cards in all decks' })).toBeVisible();
  await expect(page.getByRole('link', { name: /John 3:16/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Psalm 23:1/ })).toBeVisible();

  // search works across all decks, and + opens the New card form with no deck chosen
  await page.getByRole('button', { name: 'Search cards' }).click();
  await page.getByLabel('Search cards', { exact: true }).fill('beta');
  await expect(page.getByRole('link', { name: /John 3:16/ })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /Psalm 23:1/ })).toBeVisible();
  await page.getByRole('button', { name: 'Close search' }).click();
  await page.getByRole('link', { name: 'New card' }).click();
  await expect(page).toHaveURL(/#\/cards\/new$/);

  // opening a card from All decks works, and Back returns to All decks
  await page.goto('/#/decks/all/cards');
  await page.getByRole('link', { name: /Psalm 23:1/ }).click();
  await expect(page).toHaveURL(/#\/cards\/.+\/edit$/);
  await page.goBack();
  await expect(page).toHaveURL(/#\/decks\/all\/cards$/);
});

test('switching deck in the card browser keeps Back simple: one Back returns to the previous deck view', async ({ page }) => {
  const a = await createDeck(page, 'Alpha');
  const b = await createDeck(page, 'Beta');
  await addCard(page, a, 'John 3:16', 'Alpha passage.');
  await page.goto(`/#/decks/${a}/cards`);
  await page.getByRole('button', { name: /^Deck:/ }).click();
  await page.getByRole('dialog', { name: 'Select a deck' }).getByRole('button', { name: 'Beta' }).click();
  await expect(page).toHaveURL(new RegExp(`#/decks/${b}/cards$`));
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`#/decks/${a}/cards$`)); // not a leftover popup entry
});

test('the deck menu has "Add card", first, on the home list and on the deck page', async ({ page }) => {
  const id = await createDeck(page, 'Psalms');
  // from the home list
  await page.goto('/');
  await page.getByRole('button', { name: 'Actions for Psalms' }).click();
  const links = page.getByRole('navigation', { name: 'Deck actions' }).getByRole('link');
  await expect(links.first()).toHaveText('Add card');
  await links.first().click();
  await expect(page).toHaveURL(new RegExp(`#/cards/new\\?deck=${id}$`));
  await expect(page.getByRole('heading', { name: 'Add card', level: 1 })).toBeVisible();

  // from the deck page
  await page.goto(`/#/decks/${id}`);
  await page.getByRole('button', { name: 'Deck actions' }).click();
  await page.getByRole('navigation', { name: 'Deck actions' }).getByRole('link', { name: 'Add card' }).click();
  await expect(page).toHaveURL(new RegExp(`#/cards/new\\?deck=${id}$`));
});

test('the deck form is Title, then Translation, then a Description that grows as you type', async ({ page }) => {
  await page.goto('/#/decks/new');
  const title = (await page.getByLabel('Title').boundingBox())!.y;
  const translation = (await page.getByRole('button', { name: /^Translation/ }).boundingBox())!.y;
  const description = page.getByLabel('Description');
  expect(title).toBeLessThan(translation);
  expect(translation).toBeLessThan((await description.boundingBox())!.y);
  expect(await description.evaluate((e) => e.tagName)).toBe('TEXTAREA');

  const oneLine = (await description.boundingBox())!.height;
  await description.fill('Verses for the morning commute.\nA second line.\nAnd a third.\nA fourth.');
  expect((await description.boundingBox())!.height).toBeGreaterThan(oneLine * 2); // it grew; no inner scrollbar
  await page.getByLabel('Title').fill('Commute');
  await page.getByRole('button', { name: 'Save' }).click();
  await page.waitForURL(/#\/decks\/[0-9a-f-]{36}$/);

  // the line breaks are kept
  await page.getByRole('button', { name: 'Deck actions' }).click();
  await page.getByRole('link', { name: 'Rename deck' }).click();
  await expect(page.getByLabel('Description')).toHaveValue('Verses for the morning commute.\nA second line.\nAnd a third.\nA fourth.');
});

