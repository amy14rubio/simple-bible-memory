import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createDeck } from './helpers';

/** The welcome tour. Every other test runs with it switched off; these switch it on. */
const forceTour = (page: Page) => page.addInitScript(() => localStorage.setItem('sbm-force-onboarding', '1'));
const heading = (page: Page) => page.getByRole('heading', { level: 1 });
const next = (page: Page) => page.getByRole('button', { name: 'Next' });

test.describe('first launch', () => {
  test.beforeEach(({ page }) => forceTour(page));

  test('a brand-new person lands on the tour, steps through it, and is not shown it again', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/#\/welcome$/);
    await expect(heading(page)).toHaveText('Welcome to Simple Bible Memory'); // a welcome first
    await expect(page.locator('h1 + p')).toHaveCount(0); // a title and nothing under it
    await expect(page.getByRole('button', { name: 'Skip' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Back' })).toHaveCount(0); // nothing to go back to yet

    for (const title of ['Decks and cards', 'Practice', 'Smart scheduling', 'Try the starter deck']) {
      await next(page).click();
      await expect(heading(page)).toHaveText(title);
    }
    await expect(next(page)).toHaveCount(0);
    await page.getByRole('button', { name: 'Get started' }).click();
    await expect(page).toHaveURL(/#\/$/);
    await expect(page.getByText('Starter deck!')).toBeVisible(); // the tour's last card promised it
    await expect(page.getByText('No decks yet')).toHaveCount(0);

    await page.reload();
    await expect(page).toHaveURL(/#\/$/); // seen: it does not come back, and the starter deck is not added again
    await expect(page.getByText('Starter deck!')).toHaveCount(1);
  });

  test('Skip counts as seeing it, and also gives the starter deck', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Skip' }).click();
    await expect(page).toHaveURL(/#\/$/);
    await expect(page.getByText('Starter deck!')).toBeVisible();
    await page.reload();
    await expect(page).toHaveURL(/#\/$/);
  });

  test('the starter deck is a normal deck: it has the verses, can be studied, and stays deleted once deleted', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Skip' }).click();
    await page.getByText('Starter deck!').click();
    await expect(page.getByText('5 cards to study today.')).toBeVisible(); // 26 study cards, the first 5 new ones for today
    await page.getByRole('button', { name: 'Deck actions' }).click();
    await page.getByRole('dialog').getByRole('link', { name: 'Browse cards' }).click();
    await expect(page.getByText('Romans 5:8')).toBeVisible();
    await page.goBack();
    await page.getByRole('button', { name: 'Deck actions' }).click();
    await page.getByRole('button', { name: 'Delete deck' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete deck' }).click();
    await expect(page.getByText('No decks yet')).toBeVisible();
    await page.reload();
    await expect(page.getByText('Starter deck!')).toHaveCount(0); // never comes back
    await expect(page.getByText('No decks yet')).toBeVisible();
  });

  test('Back, the arrow keys and a swipe all move between cards', async ({ page }) => {
    await page.goto('/');
    await next(page).click();
    await expect(heading(page)).toHaveText('Decks and cards');
    await page.getByRole('button', { name: 'Back' }).click();
    await expect(heading(page)).toHaveText('Welcome to Simple Bible Memory');

    await page.keyboard.press('ArrowRight');
    await expect(heading(page)).toHaveText('Decks and cards');
    await page.keyboard.press('ArrowLeft');
    await expect(heading(page)).toHaveText('Welcome to Simple Bible Memory');

    const card = page.getByRole('region', { name: 'Welcome' });
    const box = (await card.boundingBox())!;
    const y = box.y + box.height / 2;
    await page.mouse.move(box.x + box.width * 0.8, y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.2, y, { steps: 6 });
    await page.mouse.up();
    await expect(heading(page)).toHaveText('Decks and cards'); // swiped left: next
    await page.mouse.move(box.x + box.width * 0.2, y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.8, y, { steps: 6 });
    await page.mouse.up();
    await expect(heading(page)).toHaveText('Welcome to Simple Bible Memory'); // swiped right: back
  });

  test('someone who already has decks, or who opened a link, is never taken to it', async ({ page }) => {
    await page.goto('/#/stats'); // a deep link: no tour
    await expect(page.getByRole('heading', { name: 'Statistics', level: 1 })).toBeVisible();
    await createDeck(page, 'Psalms');
    await page.goto('/');
    await expect(page.getByText('Psalms', { exact: true })).toBeVisible();
    await expect(page).not.toHaveURL(/welcome/);
  });
});

test.describe('in Spanish', () => {
  test.use({ locale: 'es-ES' });
  test.beforeEach(({ page }) => forceTour(page));

  test('a Spanish phone gets the Spanish starter deck, with Reina-Valera 1909', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Omitir' }).click();
    await expect(page.getByText('¡Primera baraja!')).toBeVisible();
    await page.getByText('¡Primera baraja!').click();
    await page.getByRole('button', { name: 'Acciones de la baraja' }).click();
    await page.getByRole('link', { name: 'Ver tarjetas' }).click();
    await expect(page.getByText('Romanos 5:8')).toBeVisible();
  });
});

test.describe('opening it again', () => {
  test.beforeEach(({ page }) => forceTour(page));

  test('Settings > Help > Welcome tour opens it, and finishing returns home without a second starter deck', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Skip' }).click(); // the first time: the starter deck is added
    await expect(page.getByText('Starter deck!')).toHaveCount(1);
    await page.goto('/#/settings');
    await page.getByRole('link', { name: 'Welcome tour' }).click();
    await expect(page).toHaveURL(/#\/welcome$/);
    await expect(heading(page)).toHaveText('Welcome to Simple Bible Memory');
    await page.getByRole('button', { name: 'Skip' }).click();
    await expect(page).toHaveURL(/#\/$/);
    await expect(page.getByText('Starter deck!')).toHaveCount(1); // opened again from Settings: nothing more is added
  });
});

test.describe('for screen readers and small screens', () => {
  test.beforeEach(({ page }) => forceTour(page));

  test('each card is announced as its heading plus "Step n of N", and focus moves to it', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/^Welcome to Simple Bible Memory · /);
    await expect(heading(page)).toHaveAccessibleDescription('Step 1 of 5');
    await next(page).click();
    await expect(heading(page)).toBeFocused();
    await expect(heading(page)).toHaveAccessibleDescription('Step 2 of 5');
    // the dots and the icon are decoration
    await expect(page.locator('ol[aria-hidden="true"] li')).toHaveCount(5);
  });

  for (const scheme of ['light', 'dark'] as const) {
    test(`no accessibility violations on any card, and no sideways scroll at 320px (${scheme})`, async ({ browser }) => {
      const ctx = await browser.newContext({ colorScheme: scheme, viewport: { width: 320, height: 640 } });
      const page = await ctx.newPage();
      await forceTour(page);
      await page.goto('/');
      for (let i = 0; i < 5; i++) {
        await expect(heading(page)).toBeVisible();
        await page.waitForTimeout(500); // let the card finish easing in (the checker would measure a half-faded card)
        const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice']).analyze();
        expect(results.violations.map((v) => v.id), `card ${i + 1}`).toEqual([]);
        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
        if (i < 4) await next(page).click();
      }
      await ctx.close();
    });
  }

  test.describe('in Spanish', () => {
    test.use({ locale: 'es-ES' });
    test('the tour is in Spanish', async ({ page }) => {
      await page.goto('/');
      await expect(heading(page)).toHaveText('Bienvenido a Memoria Bíblica Simple');
      await page.getByRole('button', { name: 'Siguiente' }).click();
      await expect(heading(page)).toHaveText('Barajas y tarjetas');
      await expect(heading(page)).toHaveAccessibleDescription('Paso 2 de 5');
      await expect(page.getByRole('button', { name: 'Omitir' })).toBeVisible();
    });
  });
});
