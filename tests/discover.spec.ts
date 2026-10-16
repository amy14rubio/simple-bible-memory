import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { closeWithEscape } from './helpers';

const card = (id: string, position: number, reference: string, verseText: string) => ({ id, position, reference, verseText });
const deck = (title: string, translation: string, language: 'en' | 'es', createdAt: number, cards = 2) => ({
  ownerId: 'someone',
  createdAt,
  meta: { title, description: `About ${title}`, translation, language, cardCount: cards },
  cards: Object.fromEntries(Array.from({ length: cards }, (_, i) => [`${title}-${i}`, card(`${title}-${i}`, i, `John 3:${16 + i}`, `Verse text ${i} of ${title}.`)])),
});

/** Puts public decks into the stand-in cloud before the page loads. */
async function seed(page: Page, decks: Record<string, ReturnType<typeof deck>>) {
  await page.addInitScript((d) => { if (!localStorage.getItem('sbm-fake-cloud')) localStorage.setItem('sbm-fake-cloud', JSON.stringify({ user: null, decks: d, offline: false })); }, decks);
}

async function openDiscover(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Add' }).click();
  await page.getByRole('button', { name: 'Discover decks' }).click();
  await expect(page.getByRole('heading', { name: 'Newest' })).toBeVisible();
}

const seeded = { a: deck('Alpha', 'KJV', 'en', 3000), b: deck('Beta', 'RV1909', 'es', 2000), c: deck('Gamma', 'OWN', 'en', 1000) };

test('browse newest first, search, filter, then import a public deck', async ({ page }) => {
  await seed(page, seeded);
  await openDiscover(page);

  const links = page.locator('a[href*="/discover/"]');
  await expect(links.first()).toContainText('Alpha');
  await expect(links).toHaveCount(3);

  // search by the start of a title
  await page.getByRole('button', { name: 'Search public decks' }).click();
  await page.getByRole('searchbox').fill('be');
  await expect(links).toHaveCount(1);
  await expect(links.first()).toContainText('Beta');
  await page.getByRole('button', { name: 'Close search' }).click();
  await expect(links).toHaveCount(3);

  // filter by language
  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  const drawer = page.getByRole('dialog', { name: 'Filter' });
  await drawer.getByRole('button', { name: /^Language/ }).click();
  await page.getByRole('dialog', { name: 'Language' }).getByRole('button', { name: 'Español' }).click();
  await closeWithEscape(page);
  await expect(links).toHaveCount(1);
  await expect(links.first()).toContainText('Beta');
  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await closeWithEscape(page);
  await expect(links).toHaveCount(3);

  // open and import
  await links.first().click();
  await expect(page.getByRole('heading', { name: 'Alpha', exact: true })).toBeVisible();
  await expect(page.getByText('John 3:16')).toBeVisible();
  await page.getByRole('button', { name: 'Import deck' }).click();
  await page.waitForURL(/#\/decks\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { name: 'Alpha', exact: true })).toBeVisible();

  // the deck now remembers where it came from
  await page.goto('/#/discover');
  await page.locator('a[href*="/discover/"]').first().click();
  await expect(page.getByText('You already have a copy of this deck.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Import again' })).toBeVisible();
});

test('report a public deck without signing in', async ({ page }) => {
  await seed(page, seeded);
  await openDiscover(page);
  await page.locator('a[href*="/discover/"]').first().click();
  await page.getByRole('button', { name: 'Report', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Report this deck' });
  await dialog.getByRole('radio', { name: 'Inappropriate content' }).check();
  await dialog.getByLabel('Details').fill('Not suitable.');
  await dialog.getByRole('button', { name: 'Send report' }).click();
  await expect(page.getByText("Thanks, we'll take a look.")).toBeVisible();
  const reports = await page.evaluate(() => (window as unknown as { __fakeCloud: () => { reports: { reason: string; details: string }[] } }).__fakeCloud().reports);
  expect(reports).toEqual([expect.objectContaining({ reason: 'inappropriate', details: 'Not suitable.' })]);
});

test('empty and offline states, and Load more', async ({ page }) => {
  await openDiscover(page);
  await expect(page.getByText('No public decks yet.')).toBeVisible();

  const many = Object.fromEntries(Array.from({ length: 25 }, (_, i) => [`d${i}`, deck(`Deck ${String(i).padStart(2, '0')}`, 'KJV', 'en', 10_000 - i, 1)]));
  await page.evaluate((d) => localStorage.setItem('sbm-fake-cloud', JSON.stringify({ user: null, decks: d, offline: false })), many);
  await page.reload();
  const links = page.locator('a[href*="/discover/"]');
  await expect(links).toHaveCount(20);
  await page.getByRole('button', { name: 'Load more' }).click();
  await expect(links).toHaveCount(25);
  await expect(page.getByRole('button', { name: 'Load more' })).toHaveCount(0);

  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('sbm-fake-cloud')!); s.offline = true; localStorage.setItem('sbm-fake-cloud', JSON.stringify(s)); });
  await page.reload();
  await expect(page.getByText("Couldn't load public decks.")).toBeVisible();
});

test.describe('Spanish', () => {
  test.use({ locale: 'es-ES' });
  test('Spanish and accessibility', async ({ page }) => {
  await seed(page, seeded);
  await page.goto('/#/discover');
  await expect(page.getByRole('heading', { name: 'Más recientes' })).toBeVisible();
  await page.goto('/#/discover');
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);
});
});
