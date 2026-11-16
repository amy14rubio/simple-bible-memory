import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { en } from '../src/i18n/messages.en';
import { es } from '../src/i18n/messages.es';

/** A short message from the person who made the app, inside Settings > About & support. Text only: no links, no donation, no pictures. */
const aboutRow = (page: import('@playwright/test').Page, name: string) => page.getByRole('link', { name, exact: true });

test('Settings > About & support has an "About" row, first in the section, that opens the letter', async ({ page }) => {
  await page.goto('/#/settings');
  const section = page.locator('section[aria-labelledby="about"]');
  const rows = section.getByRole('link');
  await expect(rows.first()).toHaveText('About'); // the first row of the section
  await aboutRow(page, 'About').click();
  await expect(page).toHaveURL(/#\/settings\/about$/);
  await expect(page.getByRole('heading', { level: 1, name: 'About' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Hello there!' })).toBeVisible();
  await expect(page.getByText(en['about.p1'] as string)).toBeVisible();
  await expect(page.getByText(en['about.p2'] as string)).toBeVisible();
  await expect(page.getByText(en['about.p3'] as string)).toBeVisible();
  await expect(page.getByText('Thanks for stopping by, and God bless!')).toBeVisible();
  await page.getByRole('link', { name: 'Back' }).click();
  await expect(page).toHaveURL(/#\/settings$/);
});

test('the sign-off is the same type as the paragraphs: not bigger, not slanted', async ({ page }) => {
  await page.goto('/#/settings/about');
  const type = (text: string) => page.getByText(text).evaluate((e) => { const c = getComputedStyle(e); return { size: c.fontSize, style: c.fontStyle, family: c.fontFamily, weight: c.fontWeight }; });
  const body = await type(en['about.p3'] as string);
  const signoff = await type('Thanks for stopping by, and God bless!');
  expect(signoff).toEqual(body);
  expect(signoff.style).toBe('normal');
});

test('the page starts a little lower under the bar', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#/settings/about');
  await expect(page.getByRole('heading', { level: 2, name: 'Hello there!' })).toBeVisible();
  const gap = await page.evaluate(() => document.querySelector('h2')!.getBoundingClientRect().top - document.querySelector('h1')!.closest('header')!.getBoundingClientRect().bottom);
  expect(gap).toBeGreaterThanOrEqual(30); // about 2rem of space between the top bar and the greeting
});

test('the page is only the letter: no links out (no donation), no buttons, no pictures', async ({ page }) => {
  await page.goto('/#/settings/about');
  await expect(page.getByRole('heading', { level: 2, name: 'Hello there!' })).toBeVisible();
  const content = page.locator('main'); // (the app's own menu and logo are around it)
  await expect(content.locator('a[href^="http"]')).toHaveCount(0); // nothing leads outside the app
  await expect(content.locator('img')).toHaveCount(0);
  await expect(content.getByRole('button')).toHaveCount(0);
  expect((await content.innerText()).toLowerCase()).not.toMatch(/ko-fi|donat|support (me|us|the)|dona/);
});

test('in Spanish: "Información y ayuda" is the section, "Acerca de la app" the row, and the letter is Spanish', async ({ browser }) => {
  const ctx = await browser.newContext({ locale: 'es-ES' });
  const page = await ctx.newPage();
  await page.goto('/#/settings');
  await expect(page.getByRole('heading', { name: 'Información y ayuda' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Acerca de y ayuda' })).toHaveCount(0);
  await aboutRow(page, 'Acerca de la app').click();
  await expect(page.getByRole('heading', { level: 2, name: '¡Hola!' })).toBeVisible();
  await expect(page.getByText(es['about.p1'] as string)).toBeVisible();
  await expect(page.getByText('¡Gracias por leer, y que Dios te bendiga!')).toBeVisible();
  await ctx.close();
});

for (const scheme of ['light', 'dark'] as const) {
  test(`the About page has no accessibility violations (${scheme})`, async ({ browser }) => {
    const ctx = await browser.newContext({ colorScheme: scheme });
    const page = await ctx.newPage();
    await page.goto('/#/settings/about');
    await expect(page.getByRole('heading', { level: 2, name: 'Hello there!' })).toBeVisible();
    await page.waitForTimeout(600); // the screen has finished arriving
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(results.violations).toEqual([]);
    await ctx.close();
  });
}
