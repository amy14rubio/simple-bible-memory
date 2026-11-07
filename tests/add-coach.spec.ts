import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createDeck } from './helpers';

/** The guide the first time "Add card" opens. Every other test runs with it off (VITE_SKIP_ONBOARDING); these switch it on. */
const forceGuide = (page: Page) => page.addInitScript(() => localStorage.setItem('sbm-force-onboarding', '1'));
const guide = (page: Page) => page.getByRole('dialog').filter({ has: page.locator('#coach-title') });
const title = (page: Page) => guide(page).getByRole('heading', { level: 2 });
const STEPS = ['Choose a deck', 'Type the verse', 'Or let the app fill it in', 'Add the passage', 'Save it'];

async function openAdd(page: Page) {
  const id = await createDeck(page, 'Psalms');
  await page.goto(`/#/cards/new?deck=${id}`);
  await expect(page.getByLabel('Verse(s)')).toBeVisible();
}

test.beforeEach(({ page }) => forceGuide(page));

test('the first time Add card opens, a guide points at the real fields, one by one', async ({ page }) => {
  await openAdd(page);
  for (const [i, text] of STEPS.entries()) {
    await expect(title(page)).toHaveText(text);
    await expect(guide(page)).toContainText(`Step ${i + 1} of ${STEPS.length}`);
    if (i < STEPS.length - 1) await guide(page).getByRole('button', { name: 'Next' }).click();
  }
  await guide(page).getByRole('button', { name: 'Got it' }).click();
  await expect(guide(page)).toHaveCount(0);
});

test('it never blocks the form: you can type in the highlighted field while it is shown', async ({ page }) => {
  await openAdd(page);
  await guide(page).getByRole('button', { name: 'Next' }).click(); // the verse step
  await expect(title(page)).toHaveText('Type the verse');
  await page.getByLabel('Verse(s)').fill('John 3:16');
  await expect(page.getByLabel('Verse(s)')).toHaveValue('John 3:16');
});

test('it has no Skip button; Escape closes it, it is not shown again, and the ? button on the screen starts it again', async ({ page }) => {
  await openAdd(page);
  await expect(guide(page).getByRole('button', { name: 'Skip' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(guide(page)).toHaveCount(0);
  await page.reload();
  await expect(page.getByLabel('Verse(s)')).toBeVisible();
  await expect(guide(page)).toHaveCount(0); // remembered
  await page.getByRole('button', { name: 'How to add a verse' }).click();
  await expect(title(page)).toHaveText('Choose a deck');
  await page.keyboard.press('Escape');
  await expect(guide(page)).toHaveCount(0);
});

test('editing a card never shows it', async ({ page }) => {
  const id = await createDeck(page, 'Psalms');
  await page.goto(`/#/cards/new?deck=${id}`);
  await expect(guide(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByLabel('Verse(s)').fill('Psalm 23:1');
  await page.getByLabel('Passage', { exact: true }).fill('The Lord is my shepherd.');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Psalm 23:1 added')).toBeVisible();
  await page.goto(`/#/decks/${id}/cards`);
  await page.getByRole('link', { name: /Psalm 23:1/ }).click();
  await expect(page.getByRole('heading', { name: 'Edit card' })).toBeVisible();
  await expect(guide(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'How to add a verse' })).toHaveCount(0);
});

for (const scheme of ['light', 'dark'] as const) {
  test(`no accessibility violations on any step (${scheme})`, async ({ browser }) => {
    const ctx = await browser.newContext({ colorScheme: scheme, viewport: { width: 390, height: 780 } });
    const page = await ctx.newPage();
    await forceGuide(page);
    await openAdd(page);
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
  test('the guide is in Spanish', async ({ page }) => {
    await page.goto('/#/decks/new');
    await page.getByLabel('Título').fill('Salmos');
    await page.getByRole('button', { name: 'Guardar' }).click();
    await page.waitForURL(/#\/decks\/[0-9a-f-]{36}$/);
    const id = page.url().match(/#\/decks\/([0-9a-f-]{36})$/)![1];
    await page.goto(`/#/cards/new?deck=${id}`);
    await expect(title(page)).toHaveText('Elige una baraja');
    await expect(guide(page).getByRole('button', { name: 'Omitir' })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Cómo agregar un versículo' }).click();
    await expect(title(page)).toHaveText('Elige una baraja');
  });
});
