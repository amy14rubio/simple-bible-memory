import { readFileSync } from 'node:fs';
import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { CURATED_FONTS } from '../src/lib/fonts/catalogue';

// A real (small) font file stands in for every Google font, so these tests never touch the network.
const FONT_BYTES = readFileSync('node_modules/@fontsource-variable/instrument-sans/files/instrument-sans-latin-standard-normal.woff2');

interface Seen { css: string[]; files: string[]; api: string[] }

// Stand-in for Google's list: the hand-picked fonts plus some more, and two that must be left out.
const EXTRA = ['Zilla Slab', 'Comfortaa', 'Rubik', 'Karla', 'Arvo'].map((family, i) => ({ family, category: (['serif', 'sans-serif', 'display', 'sans-serif', 'serif'] as const)[i]!, variants: ['regular', '700'], subsets: ['latin'] }));
const API_ITEMS = [
  ...CURATED_FONTS.map((f) => ({ family: f.family, category: f.category, variants: f.weights.includes(700) ? ['regular', '700'] : ['regular'], subsets: ['latin'] })),
  ...EXTRA,
  { family: 'Noto Sans JP', category: 'sans-serif', variants: ['regular'], subsets: ['japanese'] }, // no latin letters: left out
  { family: 'Italic Only', category: 'serif', variants: ['italic'], subsets: ['latin'] }, // no regular text: left out
];
const FULL_COUNT = CURATED_FONTS.length + EXTRA.length;

async function mockGoogleFonts(page: Page): Promise<Seen> {
  const seen: Seen = { css: [], files: [], api: [] };
  await page.route('https://www.googleapis.com/webfonts/**', (route) => {
    seen.api.push(route.request().url());
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ items: API_ITEMS }) });
  });
  await page.route('https://fonts.googleapis.com/**', (route) => {
    const url = new URL(route.request().url());
    seen.css.push(url.toString());
    const family = url.searchParams.get('family')!.split(':')[0]!.replace(/\+/g, ' ');
    const slug = encodeURIComponent(family);
    const face = (subset: string, n: number, range: string) =>
      `/* ${subset} */\n@font-face {\n  font-family: '${family}';\n  font-style: normal;\n  font-weight: 400;\n  font-display: swap;\n  src: url(https://fonts.gstatic.com/mock/${slug}-${n}.woff2) format('woff2');\n  unicode-range: ${range};\n}\n`;
    const body = url.searchParams.get('text')
      ? face('latin', 0, 'U+0000-00FF')
      : face('cyrillic', 1, 'U+0400-045F') + face('latin-ext', 2, 'U+0100-02BA') + face('latin', 3, 'U+0000-00FF');
    return route.fulfill({ status: 200, contentType: 'text/css', headers: { 'access-control-allow-origin': '*' }, body });
  });
  await page.route('https://fonts.gstatic.com/**', (route) => {
    seen.files.push(route.request().url());
    return route.fulfill({ status: 200, contentType: 'font/woff2', headers: { 'access-control-allow-origin': '*' }, body: FONT_BYTES });
  });
  return seen;
}

const trigger = (page: Page) => page.getByRole('button', { name: /^Font:/ });
const popup = (page: Page) => page.getByRole('dialog', { name: 'Select a font' });
const pickFont = async (page: Page, name: string) => { await trigger(page).click(); await popup(page).getByRole('button', { name, exact: true }).click(); };
const useFont = (page: Page) => page.getByRole('button', { name: 'Use this font' });
const vars = (page: Page) => page.evaluate(() => ({ serif: document.documentElement.style.getPropertyValue('--font-serif'), sans: document.documentElement.style.getPropertyValue('--font-sans') }));
const cacheKeys = (page: Page) => page.evaluate(async () => (await (await caches.open('fonts-v1')).keys()).map((r) => new URL(r.url).pathname));

test.describe('font', () => {
  test('Settings has one Font row, Default at first, that opens the Font page', async ({ page }) => {
    await page.goto('/#/settings');
    await expect(page.getByRole('link', { name: /^Verse font|^Interface font/ })).toHaveCount(0); // one setting, not two
    const row = page.getByRole('link', { name: /^Font/ });
    await expect(row).toContainText('Default');
    await row.click();
    await expect(page).toHaveURL(/#\/settings\/font$/);
    await expect(page.getByRole('heading', { name: 'Font' })).toBeVisible();
    await expect(useFont(page)).toHaveCount(0); // nothing to apply yet
  });

  test('the font list is the same popup as the deck picker: names in their own typeface, search and category chips', async ({ page }) => {
    await mockGoogleFonts(page);
    await page.goto('/#/settings/font');
    await trigger(page).click();
    await expect(popup(page).getByRole('heading', { name: 'Select a font' })).toBeVisible();
    await expect(popup(page).getByRole('button', { name: /^(Default|Search fonts)$/ })).toHaveCount(2); // Default row and the search icon
    await expect(popup(page).locator('li')).toHaveCount(FULL_COUNT + 1);
    const lora = popup(page).getByRole('button', { name: 'Lora', exact: true });
    expect(await lora.locator('span').first().evaluate((e) => getComputedStyle(e).fontFamily)).toContain('Lora'); // the name is set in that font
    await expect(popup(page).getByRole('button', { name: 'New deck' })).toHaveCount(0); // and no +

    await popup(page).getByRole('button', { name: 'Search fonts' }).click();
    await popup(page).getByLabel('Search fonts', { exact: true }).fill('mono');
    await expect(popup(page).locator('li')).toHaveCount(CURATED_FONTS.filter((f) => f.family.toLowerCase().includes('mono')).length);
    await popup(page).getByLabel('Search fonts', { exact: true }).fill('zzz');
    await expect(popup(page).getByText('No fonts match "zzz".')).toBeVisible();
  });

  test('the full catalogue comes from Google with the key, sorted by popularity, minus fonts we cannot use', async ({ page }) => {
    const seen = await mockGoogleFonts(page);
    await page.goto('/#/settings/font');
    await trigger(page).click();
    await expect(popup(page).locator('li')).toHaveCount(FULL_COUNT + 1);
    await expect(popup(page).getByRole('button', { name: 'Zilla Slab', exact: true })).toBeVisible(); // beyond the hand-picked list
    await expect(popup(page).getByRole('button', { name: 'Noto Sans JP', exact: true })).toHaveCount(0); // no latin letters
    await expect(popup(page).getByRole('button', { name: 'Italic Only', exact: true })).toHaveCount(0); // no regular text
    expect(seen.api).toHaveLength(1);
    expect(seen.api[0]).toContain('key=test-key');
    expect(seen.api[0]).toContain('sort=popularity');
    await expect(page.getByText(/short one|short list/)).toHaveCount(0);

    // remembered for a week: opening the page again does not ask Google again
    await page.reload();
    await trigger(page).click();
    await expect(popup(page).locator('li')).toHaveCount(FULL_COUNT + 1);
    expect(seen.api).toHaveLength(1);
  });

  test('category chips narrow the list, and work together with search', async ({ page }) => {
    await mockGoogleFonts(page);
    await page.goto('/#/settings/font');
    await trigger(page).click();
    const chips = popup(page).getByRole('group', { name: 'Categories' });
    await expect(chips.getByRole('button')).toHaveText(['All', 'Serif', 'Sans serif', 'Handwriting', 'Display', 'Monospace']);
    await expect(chips.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
    await chips.getByRole('button', { name: 'Handwriting' }).click();
    await expect(chips.getByRole('button', { name: 'Handwriting' })).toHaveAttribute('aria-pressed', 'true');
    await expect(popup(page).locator('li')).toHaveCount(CURATED_FONTS.filter((f) => f.category === 'handwriting').length); // Default only shows under All? no: it has no category
    await expect(popup(page).getByRole('button', { name: 'Dancing Script', exact: true })).toBeVisible();
    await expect(popup(page).getByRole('button', { name: 'Lora', exact: true })).toHaveCount(0);
    await popup(page).getByRole('button', { name: 'Search fonts' }).click();
    await popup(page).getByLabel('Search fonts', { exact: true }).fill('kalam');
    await expect(popup(page).locator('li')).toHaveCount(1);
    await popup(page).getByLabel('Search fonts', { exact: true }).fill('lora'); // Lora is a serif: nothing under Handwriting
    await expect(popup(page).getByText('No fonts match "lora".')).toBeVisible();
  });

  test('without the full list (Google unreachable) the short hand-picked list is offered, with a note', async ({ page }) => {
    await mockGoogleFonts(page);
    await page.unroute('https://www.googleapis.com/webfonts/**');
    await page.route('https://www.googleapis.com/webfonts/**', (route) => route.abort());
    await page.goto('/#/settings/font');
    await expect(page.getByText(/short one/)).toBeVisible();
    await trigger(page).click();
    await expect(popup(page).locator('li')).toHaveCount(CURATED_FONTS.length + 1);
    await expect(popup(page).getByRole('button', { name: 'Lora', exact: true })).toBeVisible();
  });

  test('choosing a font previews it in the card but does not download or apply it', async ({ page }) => {
    const seen = await mockGoogleFonts(page);
    await page.goto('/#/settings/font');
    await pickFont(page, 'Lora');
    await expect(page.getByRole('dialog')).toHaveCount(0); // the popup closed
    await expect(trigger(page)).toContainText('Lora');
    await expect(useFont(page)).toBeVisible();
    const card = page.getByRole('region', { name: 'Preview' });
    await expect.poll(() => card.evaluate((e) => getComputedStyle(e).getPropertyValue('--font-serif'))).toContain('"Lora"');
    expect(await vars(page)).toEqual({ serif: '', sans: '' }); // the app itself is untouched
    expect(seen.css.filter((u) => !u.includes('text='))).toEqual([]); // only tiny preview files so far, no download
    expect(await cacheKeys(page)).toEqual([]);
  });

  test('Use this font downloads it and applies it to the whole app, both fonts at once', async ({ page }) => {
    const seen = await mockGoogleFonts(page);
    await page.goto('/#/settings/font');
    await pickFont(page, 'Lora');
    await useFont(page).click();
    await expect(useFont(page)).toHaveCount(0);
    await expect.poll(async () => await vars(page)).toEqual({ serif: expect.stringContaining('"Lora"'), sans: expect.stringContaining('"Lora"') });
    expect(await page.evaluate(() => document.fonts.check('16px "Lora"'))).toBe(true);
    expect(await page.evaluate(() => getComputedStyle(document.body).fontFamily)).toContain('Lora');
    // only the latin files came down (the cyrillic one was skipped)
    expect(seen.files.some((u) => u.endsWith('Lora-2.woff2'))).toBe(true);
    expect(seen.files.some((u) => u.endsWith('Lora-3.woff2'))).toBe(true);
    expect(seen.files.some((u) => u.endsWith('Lora-1.woff2'))).toBe(false);
    await expect(page.getByText(/\d+ KB stored on this device/)).toBeVisible();

    await page.goto('/#/settings');
    await expect(page.getByRole('link', { name: /^Font/ })).toContainText('Lora');
  });

  test('only the font in use is kept: choosing another replaces it on the device', async ({ page }) => {
    await mockGoogleFonts(page);
    await page.goto('/#/settings/font');
    await pickFont(page, 'Lora');
    await useFont(page).click();
    await expect(useFont(page)).toHaveCount(0);
    expect((await cacheKeys(page)).every((k) => k.includes('Lora'))).toBe(true);

    await pickFont(page, 'Inter');
    await useFont(page).click();
    await expect.poll(async () => (await vars(page)).serif).toContain('"Inter"');
    await expect.poll(async () => (await cacheKeys(page)).length).toBeGreaterThan(0);
    expect((await cacheKeys(page)).every((k) => k.includes('Inter'))).toBe(true); // Lora's files are gone
  });

  test('going back to Default removes the font and frees the space', async ({ page }) => {
    await mockGoogleFonts(page);
    await page.goto('/#/settings/font');
    await pickFont(page, 'Lora');
    await useFont(page).click();
    await expect(useFont(page)).toHaveCount(0);
    await pickFont(page, 'Default');
    await page.getByRole('button', { name: 'Use default font' }).click();
    await expect.poll(async () => (await vars(page)).serif).toBe('');
    expect((await vars(page)).sans).toBe('');
    await expect.poll(() => cacheKeys(page)).toEqual([]); // the files are deleted a moment after the font changes
    await expect(page.getByText(/stored on this device/)).toHaveCount(0);
  });

  test('a chosen font survives a reload and works with Google unreachable', async ({ page }) => {
    await mockGoogleFonts(page);
    await page.goto('/#/settings/font');
    await pickFont(page, 'Merriweather');
    await useFont(page).click();
    await expect(useFont(page)).toHaveCount(0);
    await page.waitForTimeout(500); // let the choice be written

    await page.unroute('https://fonts.googleapis.com/**');
    await page.unroute('https://fonts.gstatic.com/**');
    await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort());
    await page.reload();
    await expect.poll(async () => (await vars(page)).serif).toContain('"Merriweather"');
    expect(await page.evaluate(async () => { await document.fonts.load('16px "Merriweather"'); return document.fonts.check('16px "Merriweather"'); })).toBe(true);
    await expect(trigger(page)).toContainText('Merriweather');
  });

  test('a failed download shows a message and changes nothing', async ({ page }) => {
    await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort());
    await page.goto('/#/settings/font');
    await pickFont(page, 'Lora');
    await useFont(page).click();
    await expect(page.getByRole('alert')).toContainText("Couldn't download Lora");
    expect(await vars(page)).toEqual({ serif: '', sans: '' });
    await expect(useFont(page)).toBeVisible(); // try again
  });

  test('the preview card is just the verse title and the verse', async ({ page }) => {
    await page.goto('/#/settings/font');
    const card = page.getByRole('region', { name: 'Preview' });
    await expect(card.locator('p')).toHaveCount(2);
    await expect(card).toContainText('Example 1:1');
    await expect(card).toContainText('The Lord is my shepherd');
    await expect(card.getByText('Show answer')).toHaveCount(0); // no button
    await expect(card.locator('div')).toHaveCount(0); // and no progress bar
  });

  test('the text size slider scales the text across the whole app, and only the text', async ({ page }) => {
    await page.goto('/#/settings');
    const height = async () => (await page.getByRole('link', { name: /^Font/ }).boundingBox())!.height;
    const rowBefore = await height();
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    const titleSize = () => page.getByRole('heading', { name: 'Settings' }).evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
    const titleBefore = await titleSize();
    const bodyBefore = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
    expect(bodyBefore).toBe(16);

    await page.goto('/#/settings/font');
    await expect(page.getByLabel('Text size')).toHaveValue('100');
    await expect(page.getByRole('button', { name: /Reset/ })).toHaveCount(0); // no reset button: double-tap does it
    await page.getByLabel('Text size').fill('125'); // live as you drag
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).fontSize)).toBe('20px');
    await page.waitForTimeout(500); // saved shortly after

    await page.reload();
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).fontSize)).toBe('20px'); // remembered
    await page.goto('/#/settings');
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    await expect.poll(async () => (await titleSize()) / titleBefore).toBeCloseTo(1.25, 2); // every size grows by the same share ("adds on")
    expect(await height()).toBe(rowBefore); // rows, buttons and spacing do not grow, only the text

    await page.goto('/#/settings/font');
    await page.getByLabel('Text size').dblclick();
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).fontSize)).toBe('16px');
  });

  test('double-tapping the label, the slider or the percentage resets the size to 100%', async ({ page }) => {
    await page.goto('/#/settings/font');
    const rootSize = () => page.evaluate(() => getComputedStyle(document.documentElement).fontSize);
    const row = page.locator('div').filter({ has: page.getByLabel('Text size') }).last();
    for (const target of [page.getByText('Text size', { exact: true }), page.getByLabel('Text size'), row.getByText(/^\d+%$/)]) {
      await page.getByLabel('Text size').fill('130');
      expect(await rootSize()).toBe('20.8px');
      await target.dblclick();
      await expect.poll(rootSize).toBe('16px');
      await expect(page.getByLabel('Text size')).toHaveValue('100');
    }
    // one single tap is not enough
    await page.getByLabel('Text size').fill('130');
    await page.getByText('Text size', { exact: true }).click();
    expect(await rootSize()).toBe('20.8px');
  });

  test('double-tap works with a finger too', async ({ browser }) => {
    const ctx = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await page.goto('/#/settings/font');
    await page.getByLabel('Text size').fill('140');
    const box = (await page.getByText('Text size', { exact: true }).boundingBox())!;
    await page.touchscreen.tap(box.x + 5, box.y + 5);
    await page.touchscreen.tap(box.x + 5, box.y + 5);
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).fontSize)).toBe('16px');
    await ctx.close();
  });

  test('keyboard users reach 100% with the arrow keys (steps of 5%)', async ({ page }) => {
    await page.goto('/#/settings/font');
    const slider = page.getByLabel('Text size');
    await slider.fill('110');
    await slider.press('ArrowLeft');
    await slider.press('ArrowLeft');
    await expect(slider).toHaveValue('100');
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).fontSize)).toBe('16px');
  });

  test('the size range is 85% to 150%', async ({ page }) => {
    await page.goto('/#/settings/font');
    const slider = page.getByLabel('Text size');
    await expect(slider).toHaveAttribute('min', '85');
    await expect(slider).toHaveAttribute('max', '150');
    await slider.fill('150');
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).fontSize)).toBe('24px');
  });

  test('the "i" explains how downloaded fonts work, the line at the bottom, and the live text size', async ({ page }) => {
    await page.goto('/#/settings/font');
    await page.getByRole('button', { name: 'Font', exact: true }).click();
    const drawer = page.getByRole('dialog', { name: 'Font' });
    await expect(drawer).toContainText('only applied everywhere when you press “Use this font”');
    await expect(drawer).toContainText('Only the font in use is kept; the line at the bottom shows its size');
    await expect(drawer).toContainText('Text size changes the whole app live as you drag');
    await expect(drawer).toContainText('Double-tap it to go back to 100%');
    expect((await drawer.innerText()).length).toBeLessThan(400); // short
  });

  test('the page is in Spanish when the app is', async ({ browser }) => {
    const ctx = await browser.newContext({ locale: 'es-ES' });
    const page = await ctx.newPage();
    await mockGoogleFonts(page);
    await page.goto('/#/settings/font');
    await expect(page.getByRole('heading', { name: 'Fuente' })).toBeVisible();
    await page.getByRole('button', { name: /^Fuente:/ }).click();
    await expect(page.getByRole('dialog', { name: 'Selecciona una fuente' })).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Lora', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Usar esta fuente' })).toBeVisible();
    await ctx.close();
  });

  for (const scheme of ['light', 'dark'] as const) {
    test(`the font page has no accessibility violations (${scheme})`, async ({ browser }) => {
      const ctx = await browser.newContext({ colorScheme: scheme });
      const page = await ctx.newPage();
      await mockGoogleFonts(page);
      await page.goto('/#/settings/font');
      await pickFont(page, 'Lora');
      await expect(useFont(page)).toBeVisible();
      await page.waitForTimeout(400);
      const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      expect(r.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
      await ctx.close();
    });
  }
});
