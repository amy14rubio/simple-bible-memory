import { test, expect, type Browser, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { addCard, createDeck } from './helpers';

/**
 * Signing in backs up decks, cards and study schedules to the account, and brings them to other devices. The browser
 * tests use a stand-in for the cloud, kept in localStorage; a second "device" is a second browser profile, and the
 * cloud is carried between them by copying that localStorage entry.
 */
const KEY = 'sbm-fake-account';
const account = (page: Page) => page.evaluate((k) => localStorage.getItem(k), KEY);
const setFake = (page: Page, patch: Record<string, unknown>) => page.evaluate((p) => { const s = JSON.parse(localStorage.getItem('sbm-fake-cloud') ?? '{}'); localStorage.setItem('sbm-fake-cloud', JSON.stringify({ ...s, ...p })); }, patch);
const itemKeys = (page: Page, uid = 'fake-user') => page.evaluate(([k, u]) => Object.keys((JSON.parse(localStorage.getItem(k!) ?? '{}').items ?? {})[u!] ?? {}), [KEY, uid]);

async function signInFromSettings(page: Page) {
  await page.goto('/#/settings');
  await page.getByRole('button', { name: 'Sign in with Google' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'backed up' })).toBeVisible();
}

async function newDevice(browser: Browser) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 800 } });
  return { ctx, page: await ctx.newPage() };
}

test('signing in backs up decks, cards and the study schedule, and says so', async ({ page }) => {
  const id = await createDeck(page, 'Psalms');
  await addCard(page, id, 'John 3:16', 'For God so loved the world.');
  await page.goto(`/#/decks/${id}/study/flashcard`);
  await page.getByRole('button', { name: 'Show answer' }).click();
  await page.getByRole('button', { name: /Good/ }).click(); // one review: a schedule now exists
  await page.waitForTimeout(300);

  await signInFromSettings(page);
  const keys = await itemKeys(page);
  expect(keys.some((k) => k.startsWith('deck~'))).toBe(true);
  expect(keys.some((k) => k.startsWith('card~'))).toBe(true);
  expect(keys.some((k) => k.startsWith('schedule~'))).toBe(true);
  expect(keys.some((k) => k.startsWith('setting~theme'))).toBe(false); // looks are not backed up

  // the backup message comes first in Account, above the buttons
  const section = page.getByRole('region', { name: 'Account' });
  const message = (await section.getByRole('status').boundingBox())!.y;
  expect(message).toBeLessThan((await section.getByRole('button', { name: 'Export data' }).boundingBox())!.y);
  expect(message).toBeLessThan((await section.getByRole('button', { name: 'Sign out' }).boundingBox())!.y);
});

test('a second device that signs in gets the decks, and later changes arrive by themselves', async ({ browser }) => {
  const a = await newDevice(browser);
  const id = await createDeck(a.page, 'Psalms');
  await addCard(a.page, id, 'John 3:16', 'For God so loved the world.');
  await signInFromSettings(a.page);
  const cloud = await account(a.page);

  const b = await newDevice(browser);
  await b.page.goto('/');
  await b.page.evaluate(([k, v]) => localStorage.setItem(k!, v!), [KEY, cloud!]);
  await signInFromSettings(b.page);
  await b.page.goto('/');
  await expect(b.page.getByText('Psalms', { exact: true })).toBeVisible();
  await b.page.goto(`/#/decks/${id}/cards`);
  await expect(b.page.getByRole('row', { name: /John 3:16/ })).toBeVisible();

  // a card added on B reaches A while A is looking at the list
  await a.page.goto(`/#/decks/${id}/cards`);
  await addCard(b.page, id, 'Psalm 23:1', 'The Lord is my shepherd.');
  await expect(b.page.getByRole('row', { name: /Psalm 23:1/ })).toBeVisible();
  await b.page.goto('/#/settings');
  await expect(b.page.getByRole('status').filter({ hasText: 'backed up' })).toBeVisible();
  await a.page.evaluate(([k, v]) => localStorage.setItem(k!, v!), [KEY, (await account(b.page))!]);
  await expect(a.page.getByRole('row', { name: /Psalm 23:1/ })).toBeVisible({ timeout: 10_000 });
  await a.ctx.close(); await b.ctx.close();
});

test.describe('signing in with a different account on a device that has decks', () => {
  async function ready(page: Page) {
    await createDeck(page, 'Psalms');
    await signInFromSettings(page); // account one
    await page.getByRole('button', { name: 'Sign out' }).click();
    await setFake(page, { nextUid: 'other' });
    await page.getByRole('button', { name: 'Sign in with Google' }).click();
    await expect(page.getByRole('dialog', { name: 'Different account' })).toBeVisible();
  }

  test('Add keeps the decks and puts them in the new account', async ({ page }) => {
    await ready(page);
    await page.getByRole('button', { name: 'Add them to this account' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'backed up' })).toBeVisible();
    expect((await itemKeys(page, 'other')).some((k) => k.startsWith('deck~'))).toBe(true);
    await page.goto('/');
    await expect(page.getByText('Psalms', { exact: true })).toBeVisible();
  });

  test('Replace asks again, then swaps the decks for the account\'s (here, none)', async ({ page }) => {
    await ready(page);
    await page.getByRole('button', { name: "Replace them with this account's decks" }).click();
    await expect(page.getByRole('dialog', { name: 'Replace the decks on this device?' })).toBeVisible();
    await page.getByRole('button', { name: 'Replace the decks' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'backed up' })).toBeVisible();
    await page.goto('/');
    await expect(page.getByText('No decks yet')).toBeVisible();
  });

  test('Cancel signs out again and changes nothing', async ({ page }) => {
    await ready(page);
    await page.getByRole('button', { name: 'Cancel and sign out' }).click();
    await expect(page.getByRole('button', { name: 'Sign in with Google' })).toBeVisible();
    expect(await itemKeys(page, 'other')).toEqual([]);
    await page.goto('/');
    await expect(page.getByText('Psalms', { exact: true })).toBeVisible();
  });

  test('the question has no accessibility violations', async ({ page }) => {
    await ready(page);
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });
});

test('deleting the account removes the backup but keeps the decks on the device', async ({ page }) => {
  await createDeck(page, 'Psalms');
  await signInFromSettings(page);
  expect((await itemKeys(page)).length).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Delete my account' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete my account' }).click();
  await expect(page.getByRole('button', { name: 'Sign in with Google' })).toBeVisible();
  expect(await itemKeys(page)).toEqual([]);
  await page.goto('/');
  await expect(page.getByText('Psalms', { exact: true })).toBeVisible();
});

test.describe('privacy note', () => {
  test('is a Settings page that says what is stored, and has no accessibility violations', async ({ page }) => {
    await page.goto('/#/settings');
    await page.getByRole('link', { name: 'Privacy & data' }).click();
    await expect(page.getByRole('heading', { name: 'Privacy', level: 1 })).toBeVisible();
    for (const h of ['On your device', 'If you sign in', 'Public decks', 'Deleting your data', 'Other services']) await expect(page.getByRole('heading', { name: h })).toBeVisible();
    await expect(page.getByText('Your review history, theme, font and language are not copied.')).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });

  test.describe('in Spanish', () => {
    test.use({ locale: 'es-ES' });
    test('the page and the sign-in status are in Spanish', async ({ page }) => {
      await page.goto('/#/settings');
      await page.getByRole('link', { name: 'Privacidad y datos' }).click();
      await expect(page.getByRole('heading', { name: 'Si inicias sesión' })).toBeVisible();
    });
  });
});
