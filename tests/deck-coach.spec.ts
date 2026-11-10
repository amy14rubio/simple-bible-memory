import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/** The guide the first time "New deck" opens. Every other test runs with it off (VITE_SKIP_ONBOARDING); these switch it on. */
const forceGuide = (page: Page) => page.addInitScript(() => localStorage.setItem('sbm-force-onboarding', '1'));
const guide = (page: Page) => page.getByRole('dialog').filter({ has: page.locator('#coach-title') });
const title = (page: Page) => guide(page).getByRole('heading', { level: 2 });
const STEPS = ['Name your deck', 'Only for publishing', 'Create the deck'];

test.beforeEach(({ page }) => forceGuide(page));

test('the first time New deck opens, a guide explains the name, the optional publishing fields and the check mark', async ({ page }) => {
  await page.goto('/#/decks/new');
  await expect(page.getByLabel('Title')).toHaveAttribute('placeholder', 'Ex. Verses about grace');
  for (const [i, text] of STEPS.entries()) {
    await expect(title(page)).toHaveText(text);
    await expect(guide(page).locator('p.sr-only')).toHaveText(`Step ${i + 1} of ${STEPS.length}`);
    if (i === 1) await expect(guide(page)).toContainText('optional');
    if (i < STEPS.length - 1) await guide(page).getByRole('button', { name: 'Next' }).click();
  }
  await guide(page).getByRole('button', { name: 'Got it' }).click();
  await expect(guide(page)).toHaveCount(0);
});

test('the X closes it, it is remembered, and the ? button starts it again', async ({ page }) => {
  await page.goto('/#/decks/new');
  await guide(page).getByRole('button', { name: 'Close' }).click();
  await expect(guide(page)).toHaveCount(0);
  await page.reload();
  await expect(page.getByLabel('Title')).toBeVisible();
  await expect(guide(page)).toHaveCount(0);
  await page.getByRole('button', { name: 'How to make a deck' }).click();
  await expect(title(page)).toHaveText('Name your deck');
});

test('it does not block the form, and renaming a deck never shows it', async ({ page }) => {
  await page.goto('/#/decks/new');
  await page.getByLabel('Title').fill('Grace');
  await expect(page.getByLabel('Title')).toHaveValue('Grace');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Save' }).click();
  await page.waitForURL(/#\/decks\/[0-9a-f-]{36}$/);
  const id = page.url().match(/#\/decks\/([0-9a-f-]{36})$/)![1];
  await page.goto(`/#/decks/${id}/edit`);
  await expect(page.getByLabel('Title')).toHaveValue('Grace');
  await expect(guide(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'How to make a deck' })).toHaveCount(0);
});

for (const scheme of ['light', 'dark'] as const) {
  test(`no accessibility violations on any step (${scheme})`, async ({ browser }) => {
    const ctx = await browser.newContext({ colorScheme: scheme, viewport: { width: 390, height: 780 } });
    const page = await ctx.newPage();
    await forceGuide(page);
    await page.goto('/#/decks/new');
    for (let i = 0; i < STEPS.length; i++) {
      await expect(title(page)).toHaveText(STEPS[i]!);
      await page.waitForTimeout(300);
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.help}`), `step ${i + 1}`).toEqual([]);
      if (i < STEPS.length - 1) await guide(page).getByRole('button', { name: 'Next' }).click();
    }
    await ctx.close();
  });
}

test.describe('in Spanish', () => {
  test.use({ locale: 'es-ES' });
  test('the guide and the placeholder are in Spanish', async ({ page }) => {
    await page.goto('/#/decks/new');
    await expect(page.getByLabel('Título')).toHaveAttribute('placeholder', 'Ej. Versículos sobre la gracia');
    await expect(title(page)).toHaveText('Ponle nombre a tu carpeta');
    await guide(page).getByRole('button', { name: 'Siguiente' }).click();
    await expect(title(page)).toHaveText('Solo para publicar');
    await guide(page).getByRole('button', { name: 'Cerrar' }).click();
    await page.getByRole('button', { name: 'Cómo crear una carpeta' }).click();
    await expect(title(page)).toHaveText('Ponle nombre a tu carpeta');
  });
});
