import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const ID = '068c781d-0ff3-4a10-8c1a-6ccd8099fc55';
const SHARE_URL = `https://simple-bible-memory.web.app/d/${ID}`;

const publicDeck = {
  ownerId: 'someone', createdAt: 1000,
  meta: { title: 'Family & Relationships', description: 'About family', translation: 'KJV', language: 'en', cardCount: 1 },
  cards: { c0: { id: 'c0', position: 0, reference: 'John 3:16', verseText: 'For God so loved the world.' } },
};
async function seed(page: Page) {
  await page.addInitScript(([id, d]) => { if (!localStorage.getItem('sbm-fake-cloud')) localStorage.setItem('sbm-fake-cloud', JSON.stringify({ user: null, decks: { [id as string]: d }, offline: false })); }, [ID, publicDeck] as const);
}

test.describe('the Share button on a public deck', () => {
  test.beforeEach(async ({ page }) => { await seed(page); });

  test('in a browser it copies the link and says so, even where the browser has its own share menu', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.addInitScript(() => { (window as unknown as { __shared: number }).__shared = 0; Object.defineProperty(navigator, 'share', { value: () => { (window as unknown as { __shared: number }).__shared++; return Promise.resolve(); }, configurable: true }); });
    await page.goto(`/#/discover/${ID}`);
    const flag = page.getByRole('button', { name: 'Report this deck' });
    const share = page.getByRole('button', { name: 'Share this deck' });
    await expect(share).toBeVisible();
    expect((await share.boundingBox())!.x).toBeLessThan((await flag.boundingBox())!.x); // next to the flag, on its left
    await share.click();
    await expect(page.getByText('Link copied')).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(SHARE_URL);
    expect(await page.evaluate(() => (window as unknown as { __shared: number }).__shared)).toBe(0); // the browser's share menu (drawn off in a corner by Safari) is not used
  });

  test.describe('in Spanish', () => {
    test.use({ locale: 'es-ES' });
    test('the button and the message are in Spanish', async ({ page, context }) => {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      await page.goto(`/#/discover/${ID}`);
      await page.getByRole('button', { name: 'Compartir esta carpeta' }).click();
      await expect(page.getByText('Enlace copiado')).toBeVisible();
    });
  });
});

test.describe('the page a shared link opens', () => {
  const firestore = (page: Page, body: unknown, status = 200) => page.route('https://firestore.googleapis.com/**', (r) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) }));
  const deckDoc = { fields: { title: { stringValue: 'Family & Relationships' }, description: { stringValue: 'Verses for families.\nMemorize them together.' }, cardCount: { integerValue: '13' } } };

  test('on a computer: the deck name, open on the web, and the store', async ({ page }) => {
    await firestore(page, deckDoc);
    await page.goto(`/deck-link.html?id=${ID}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Family & Relationships');
    await expect(page.getByText('Verses for families.')).toBeVisible(); // the deck's description, not a card count
    await expect(page.getByText('13 cards')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Open in your browser' })).toHaveAttribute('href', `/app#/discover/${ID}`);
    await expect(page.getByRole('link', { name: 'Get it on Google Play' })).toHaveAttribute('href', /play\.google\.com.*app\.simplebiblememory/);
    await expect(page.getByRole('link', { name: 'Download on the App Store' })).toHaveAttribute('href', 'https://apps.apple.com/us/app/simple-bible-memory/id6827304569');
  });

  test.describe('on a phone', () => {
    test.use({ userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36' });
    test('"Open in the app" is not offered until the apps that understand it are released (APP_LINKS_READY)', async ({ page }) => {
      await firestore(page, deckDoc);
      await page.goto(`/deck-link.html?id=${ID}`);
      await expect(page.getByRole('link', { name: 'Open in your browser' })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Open in the app' })).toBeHidden();
    });
  });

  test('a deck that is gone says so, and offers nothing to open', async ({ page }) => {
    await firestore(page, { error: { code: 404 } }, 404);
    await page.goto(`/deck-link.html?id=${ID}`);
    await expect(page.getByText('This deck can’t be found. It may have been removed.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Open in your browser' })).toBeHidden();
  });

  test('a deck hidden after a report is treated as gone', async ({ page }) => {
    await firestore(page, { fields: { title: { stringValue: 'X' }, hidden: { booleanValue: true } } });
    await page.goto(`/deck-link.html?id=${ID}`);
    await expect(page.getByText('This deck can’t be found. It may have been removed.')).toBeVisible();
  });

  test('if the catalogue cannot be reached the page still works', async ({ page }) => {
    await page.route('https://firestore.googleapis.com/**', (r) => r.abort());
    await page.goto(`/deck-link.html?id=${ID}`);
    await expect(page.getByRole('link', { name: 'Open in your browser' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('A Bible memory deck');
  });

  test('a made-up id is not trusted', async ({ page }) => {
    await page.goto('/deck-link.html?id=../../etc');
    await expect(page.getByText('This deck can’t be found. It may have been removed.')).toBeVisible();
  });

  test.describe('in Spanish', () => {
    test.use({ locale: 'es-ES' });
    test('it is in Spanish', async ({ page }) => {
      await firestore(page, deckDoc);
      await page.goto(`/deck-link.html?id=${ID}`);
      await expect(page.getByText('Verses for families.')).toBeVisible();
      await expect(page.getByRole('link', { name: 'Abrir en tu navegador' })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Disponible en Google Play' })).toBeVisible();
    });
  });

  for (const scheme of ['light', 'dark'] as const) {
    test(`no accessibility violations (${scheme})`, async ({ browser }) => {
      const ctx = await browser.newContext({ colorScheme: scheme, viewport: { width: 360, height: 700 } });
      const page = await ctx.newPage();
      await firestore(page, deckDoc);
      await page.goto(`/deck-link.html?id=${ID}`);
      await expect(page.getByText('Verses for families.')).toBeVisible();
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice']).analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
      await ctx.close();
    });
  }
});
