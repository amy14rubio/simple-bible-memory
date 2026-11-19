import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { en } from '../src/i18n/messages.en';
import { es } from '../src/i18n/messages.es';
import { CREDIT_SECTIONS } from '../src/features/settings/credits';

/** "Made Possible By" (Spanish "Reconocimientos"): the thank-you to everything the app is built on, in Settings > About & support. */
const linkables = CREDIT_SECTIONS.flatMap((s) => s.items).filter((c) => c.href);

test('Settings > About & support has a "Made Possible By" row, after "About", that opens the credits', async ({ page }) => {
  await page.goto('/#/settings');
  const rows = page.locator('section[aria-labelledby="about"]').getByRole('link');
  await expect(rows.nth(0)).toHaveText('About');
  await expect(rows.nth(1)).toHaveText('Made Possible By');
  await rows.nth(1).click();
  await expect(page).toHaveURL(/#\/settings\/credits$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Made Possible By' })).toBeVisible();
  // one paragraph of thanks comes first, before the credits sections
  const thanks = page.getByText(en['credits.thanks'] as string);
  await expect(thanks).toBeVisible();
  expect((await thanks.boundingBox())!.y).toBeLessThan((await page.getByRole('heading', { level: 2, name: 'Bible texts' }).boundingBox())!.y);
  for (const name of ['Bible texts', 'Word study', 'Finding passages', 'Open-source software', 'How AI was used']) {
    await expect(page.getByRole('heading', { level: 2, name })).toBeVisible();
  }
  await page.getByRole('link', { name: 'Back' }).click();
  await expect(page).toHaveURL(/#\/settings$/);
});

test('every credit with a website is a link to it (https), opened outside the app, and every credit says what it is', async ({ page }) => {
  await page.goto('/#/settings/credits');
  await expect(page.getByRole('heading', { level: 2, name: 'Bible texts' })).toBeVisible();
  for (const c of linkables) {
    const link = page.getByRole('link', { name: c.name, exact: true });
    await expect(link, c.name).toHaveAttribute('href', c.href!);
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', /noopener/);
    expect(c.href, c.name).toMatch(/^https:\/\//);
  }
  // each credit has its line (no empty rows, no missing translation keys shown as text)
  const items = page.locator('main li');
  // every credit's line is a thank-you (except the AI one, which says how it was used)
  for (const c of CREDIT_SECTIONS.flatMap((x) => x.items).filter((i) => i.id !== 'claude')) expect(en[`credits.note.${c.id}`] as string, c.id).toMatch(/^Thank you/);
  expect(await items.count()).toBe(CREDIT_SECTIONS.flatMap((s) => s.items).length);
  for (const text of await items.allInnerTexts()) { expect(text.trim().length).toBeGreaterThan(5); expect(text).not.toContain('credits.note'); }
});

test('the credits name no tech stack, and one thank-you for the Bible texts (no individual translations, no license notes)', async () => {
  const all = CREDIT_SECTIONS.flatMap((x) => x.items.map((i) => i.name)).join(' ');
  for (const stack of ['React', 'Tailwind', 'Capacitor', 'Vite', 'wa-sqlite', 'Firebase', 'Recharts', 'Bklit']) expect(all, stack).not.toContain(stack);
  const texts = CREDIT_SECTIONS.find((s) => s.id === 'texts')!.items;
  expect(texts.map((i) => i.name)).toEqual(['YouVersion Platform']);
  expect(en['credits.note.youversion']).toBe('Thank you for the passage lookup, and to the publishers behind its translations.');
});

test('Spanish: "Reconocimientos", with the section names and thanks in Spanish', async ({ browser }) => {
  const ctx = await browser.newContext({ locale: 'es-ES' });
  const page = await ctx.newPage();
  await page.goto('/#/settings');
  const rows = page.locator('section[aria-labelledby="about"]').getByRole('link');
  await expect(rows.nth(1)).toHaveText('Reconocimientos');
  await rows.nth(1).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Reconocimientos' })).toBeVisible();
  await expect(page.getByText(es['credits.thanks'] as string)).toBeVisible();
  for (const name of ['Textos bíblicos', 'Estudio de palabras', 'Buscar pasajes', 'Software de código abierto', 'Cómo se usó la IA']) {
    await expect(page.getByRole('heading', { level: 2, name })).toBeVisible();
  }
  await ctx.close();
});

const noViolations = async (page: Page) => {
  await page.waitForTimeout(600); // the screen has finished arriving
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
};
for (const scheme of ['light', 'dark'] as const) {
  for (const locale of ['en-US', 'es-ES']) {
    test(`the credits page has no accessibility violations (${scheme}, ${locale})`, async ({ browser }) => {
      const ctx = await browser.newContext({ colorScheme: scheme, locale });
      const page = await ctx.newPage();
      await page.goto('/#/settings/credits');
      await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible();
      await noViolations(page);
      await ctx.close();
    });
  }
}

test('the AI section says briefly how AI was used, in the maker\'s voice, and credits Claude with a link', async ({ page }) => {
  await page.goto('/#/settings/credits');
  const section = page.locator('section[aria-labelledby="credits-ai"]');
  await expect(section.getByRole('heading', { level: 2, name: 'How AI was used' })).toBeVisible();
  await expect(section.getByRole('link', { name: 'Claude (Anthropic)', exact: true })).toHaveAttribute('href', 'https://www.anthropic.com/claude');
  await expect(section.getByText(en['credits.note.claude'] as string)).toBeVisible();
});
