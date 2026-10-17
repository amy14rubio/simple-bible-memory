import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { addCard, createDeck } from './helpers';

/** A deck with three cards, opened on its card list. */
async function deckWithCards(page: Page, title = 'Psalms') {
  const id = await createDeck(page, title);
  await addCard(page, id, 'Psalm 1:1', 'one');
  await addCard(page, id, 'Psalm 1:2', 'two');
  await addCard(page, id, 'Psalm 1:3', 'three');
  await page.goto(`/#/decks/${id}/cards`);
  await expect(page.getByRole('row', { name: /Psalm 1:3/ })).toBeVisible();
  return id;
}

const row = (page: Page, reference: string) => page.getByRole('row', { name: new RegExp(reference) });

/** Press and hold, the way a thumb does. */
async function longPress(page: Page, reference: string) {
  const box = (await row(page, reference).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(650);
  await page.mouse.up();
}

test('press and hold selects a card; tapping adds or removes others; Select all; the X leaves', async ({ page }) => {
  await deckWithCards(page);
  await longPress(page, 'Psalm 1:2');
  await expect(page.getByRole('heading', { name: '1 selected' })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Select Psalm 1:2' })).toBeChecked();
  await expect(page).toHaveURL(/\/cards$/); // the press did not open the card

  await row(page, 'Psalm 1:3').click();
  await expect(page.getByRole('heading', { name: '2 selected' })).toBeVisible();
  await row(page, 'Psalm 1:2').click();
  await expect(page.getByRole('heading', { name: '1 selected' })).toBeVisible();

  await page.getByRole('button', { name: 'Select all' }).click();
  await expect(page.getByRole('heading', { name: '3 selected' })).toBeVisible();

  await page.getByRole('button', { name: 'Cancel selection' }).click();
  await expect(page.getByRole('checkbox')).toHaveCount(0);
  await row(page, 'Psalm 1:2').click(); // back to normal: a tap opens the card
  await expect(page.getByLabel('Verse(s)')).toHaveValue('Psalm 1:2');
});

test('the Back button leaves selection first, then the screen', async ({ page }) => {
  await deckWithCards(page);
  await longPress(page, 'Psalm 1:1');
  await expect(page.getByRole('checkbox').first()).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('checkbox')).toHaveCount(0);
  await expect(page).toHaveURL(/\/cards$/);
});

test('delete several cards: confirm, a toast names them, and Undo puts them back in place', async ({ page }) => {
  await deckWithCards(page);
  await longPress(page, 'Psalm 1:1');
  await row(page, 'Psalm 1:3').click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Delete 2 cards?');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('checkbox').first()).toBeVisible(); // cancelled: still selecting
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await dialog.getByRole('button', { name: 'Delete', exact: true }).click();

  await expect(page.getByRole('heading', { name: '2 cards deleted' })).toBeVisible();
  await expect(page.getByText('Psalm 1:1, Psalm 1:3')).toBeVisible();
  await expect(page.getByRole('row')).toHaveCount(2); // header + Psalm 1:2
  await expect(page.getByRole('checkbox')).toHaveCount(0); // selection ended

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('heading', { name: '2 cards restored' })).toBeVisible();
  const refs = page.getByRole('row').filter({ hasText: 'Psalm' }).locator('td').filter({ hasText: /^Psalm 1:\d$/ });
  await expect(refs).toHaveText(['Psalm 1:1', 'Psalm 1:2', 'Psalm 1:3']); // original order
});

test('deleting one card from its edit page also has an Undo', async ({ page }) => {
  const id = await deckWithCards(page);
  await row(page, 'Psalm 1:2').click();
  await page.getByRole('button', { name: 'Delete card' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete card' }).click();
  await expect(page.getByRole('heading', { name: 'Psalm 1:2 deleted' })).toBeVisible();
  await expect(page.getByRole('row')).toHaveCount(3);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('row')).toHaveCount(4);
  await expect(page).toHaveURL(new RegExp(`/decks/${id}/cards$`));
});

test('move cards to another deck', async ({ page }) => {
  const from = await deckWithCards(page, 'Psalms');
  const to = await createDeck(page, 'Proverbs');
  await page.goto(`/#/decks/${from}/cards`);
  await longPress(page, 'Psalm 1:1');
  await row(page, 'Psalm 1:3').click();
  await page.getByRole('button', { name: 'Move' }).click();
  const drawer = page.getByRole('dialog', { name: 'Move 2 cards to…' });
  await expect(drawer.getByRole('button', { name: 'Psalms' })).toHaveCount(0); // not the deck they are already in
  await drawer.getByRole('button', { name: 'Proverbs' }).click();
  await expect(page.getByRole('heading', { name: '2 cards moved to Proverbs' })).toBeVisible();
  await expect(page.getByRole('row')).toHaveCount(2);

  await page.getByRole('button', { name: 'Undo' }).click(); // tapped the wrong deck
  await expect(page.getByRole('heading', { name: '2 cards moved back' })).toBeVisible();
  await expect(page.getByRole('row')).toHaveCount(4);

  await page.waitForTimeout(300);
  await page.goto(`/#/decks/${to}/cards`);
  await expect(page.getByText('No cards yet')).toBeVisible();
});

test('a toast can be dismissed with its X', async ({ page }) => {
  await deckWithCards(page);
  await row(page, 'Psalm 1:1').click();
  await page.getByRole('button', { name: 'Delete card' }).click();
  await page.locator('dialog[open]').getByRole('button', { name: 'Delete card' }).click();
  await expect(page.getByRole('heading', { name: 'Psalm 1:1 deleted' })).toBeVisible();
  await page.getByRole('button', { name: 'Dismiss notification' }).click();
  await expect(page.getByRole('heading', { name: 'Psalm 1:1 deleted' })).toHaveCount(0);
});

test('the keyboard can start selecting, and the screen has no accessibility violations while selecting', async ({ page }) => {
  await deckWithCards(page);
  await page.getByRole('button', { name: 'Select cards' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: '0 selected' })).toBeVisible();
  await page.keyboard.press('Tab');
  await page.getByRole('checkbox', { name: 'Select Psalm 1:1' }).focus();
  await page.keyboard.press('Space');
  await expect(page.getByRole('heading', { name: '1 selected' })).toBeVisible();
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(results.violations.map((v) => `${v.id} ${v.nodes.map((n) => n.target.join(' ')).join('|')}`)).toEqual([]);
});

test('selecting, moving and deleting in Spanish', async ({ page }) => {
  const id = await deckWithCards(page);
  await page.goto('/#/settings/language');
  await page.getByRole('group', { name: /^(Language|Idioma)$/ }).getByRole('radio', { name: 'Español', exact: true }).click();
  await page.goto(`/#/decks/${id}/cards`);
  await page.getByRole('button', { name: 'Seleccionar tarjetas' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: '0 seleccionadas' })).toBeVisible();
  await page.getByRole('button', { name: 'Seleccionar todas' }).click();
  await expect(page.getByRole('heading', { name: '3 seleccionadas' })).toBeVisible();
  await page.getByRole('button', { name: 'Eliminar', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('¿Eliminar 3 tarjetas?');
  await page.getByRole('dialog').getByRole('button', { name: 'Eliminar', exact: true }).click();
  await expect(page.getByRole('heading', { name: '3 tarjetas eliminadas' })).toBeVisible();
  await page.getByRole('button', { name: 'Deshacer' }).click();
  await expect(page.getByRole('heading', { name: '3 tarjetas restauradas' })).toBeVisible();
});
