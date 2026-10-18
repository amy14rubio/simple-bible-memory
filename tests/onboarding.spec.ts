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
    await expect(page.getByText('Learn Bible verses by heart, a few minutes at a time.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Skip' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Back' })).toHaveCount(0); // nothing to go back to yet

    for (const title of ['Decks and cards', 'Practise at the right time', 'Three ways to practise', 'Make your first deck']) {
      await next(page).click();
      await expect(heading(page)).toHaveText(title);
    }
    await expect(next(page)).toHaveCount(0);
    await page.getByRole('button', { name: 'Get started' }).click();
    await expect(page).toHaveURL(/#\/$/);
    await expect(page.getByText('No decks yet')).toBeVisible();

    await page.reload();
    await expect(page).toHaveURL(/#\/$/); // seen: it does not come back
    await expect(page.getByText('No decks yet')).toBeVisible();
  });

  test('Skip counts as seeing it', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Skip' }).click();
    await expect(page).toHaveURL(/#\/$/);
    await page.reload();
    await expect(page).toHaveURL(/#\/$/);
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

    const card = page.getByRole('region', { name: 'Welcome to Simple Bible Memory' });
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

test.describe('opening it again', () => {
  test('Settings > Help > Welcome tour opens it, and finishing returns home', async ({ page }) => {
    await page.goto('/#/settings');
    await page.getByRole('link', { name: 'Welcome tour' }).click();
    await expect(page).toHaveURL(/#\/welcome$/);
    await expect(heading(page)).toHaveText('Welcome to Simple Bible Memory');
    await page.getByRole('button', { name: 'Skip' }).click();
    await expect(page).toHaveURL(/#\/$/);
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
