import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const tile = (page: Page, name: string) => page.getByRole('group', { name: 'Theme' }).getByRole('radio', { name, exact: true });
const hex = (page: Page, label: string) => page.getByLabel(`${label}, hex code`);
const rootVar = (page: Page, name: string) => page.evaluate((n) => document.documentElement.style.getPropertyValue(n), name);
const bodyColors = (page: Page) => page.evaluate(() => { const cs = getComputedStyle(document.body); return { background: cs.backgroundColor, color: cs.color }; });
const openCustom = async (page: Page) => { await page.goto('/#/settings/theme'); await tile(page, 'Custom').click(); };

test.describe('the Theme page', () => {
  test('Settings has one Theme row showing the current choice; it opens the Theme page', async ({ page }) => {
    await page.goto('/#/settings');
    await expect(page.getByRole('group', { name: 'Theme' })).toHaveCount(0); // no cramped options in Settings any more
    const row = page.getByRole('link', { name: /^Theme/ });
    await expect(row).toContainText('System');
    await row.click();
    await expect(page).toHaveURL(/#\/settings\/theme$/);
    await expect(page.getByRole('heading', { name: 'Theme' })).toBeVisible();
    await tile(page, 'Dark').click();
    await page.goBack();
    await expect(page.getByRole('link', { name: /^Theme/ })).toContainText('Dark');
  });

  test('four options in a list, one chosen; Light and Dark apply straight away', async ({ page }) => {
    await page.goto('/#/settings/theme');
    await expect(page.getByRole('group', { name: 'Theme' }).getByRole('radio')).toHaveCount(4);
    for (const name of ['System', 'Light', 'Dark', 'Custom']) await expect(tile(page, name)).toBeVisible();
    await expect(tile(page, 'System')).toBeChecked();
    await tile(page, 'Dark').click();
    await expect(tile(page, 'Dark')).toBeChecked();
    await expect(tile(page, 'System')).not.toBeChecked();
    expect((await bodyColors(page)).background).toBe('rgb(19, 19, 18)');
    await expect(page.getByLabel('Background, hex code')).toHaveCount(0); // pickers only for Custom
  });

  test('all four options fit in Spanish, even on a very narrow screen', async ({ browser }) => {
    const ctx = await browser.newContext({ locale: 'es-ES', viewport: { width: 320, height: 700 } });
    const page = await ctx.newPage();
    await page.goto('/#/settings/theme');
    const rows = page.getByRole('group', { name: 'Tema' }).locator('label');
    await expect(rows).toHaveCount(4);
    for (const name of ['Sistema', 'Claro', 'Oscuro', 'Personal']) await expect(page.getByRole('radio', { name, exact: true })).toBeVisible();
    for (const b of await rows.all()) {
      const box = (await b.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(320); // nothing cut off at the edge
    }
    await ctx.close();
  });

  test('choosing Custom shows the colour pickers, and the colours change the whole app live', async ({ page }) => {
    await openCustom(page);
    await expect(tile(page, 'Custom')).toBeChecked();
    await hex(page, 'Background').fill('#102030');
    await hex(page, 'Text').fill('#e0f0ff');
    await hex(page, 'Accent').fill('#ff8800');
    expect(await bodyColors(page)).toEqual({ background: 'rgb(16, 32, 48)', color: 'rgb(224, 240, 255)' });
    expect(await rootVar(page, '--accent')).toBe('#ff8800');
    await expect(page.getByText('Learning')).toHaveCSS('color', 'rgb(255, 136, 0)'); // the accent in the preview
    expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark'); // a dark background gets the dark palette for the rest
  });

  test('the native colour picker works too', async ({ page }) => {
    await openCustom(page);
    await page.getByLabel('Pick Background').fill('#336699');
    expect((await bodyColors(page)).background).toBe('rgb(51, 102, 153)');
    await expect(hex(page, 'Background')).toHaveValue('#336699');
  });

  test('typing an invalid hex code changes nothing, and a half-typed code is dropped when you leave the field', async ({ page }) => {
    await openCustom(page);
    const field = hex(page, 'Background');
    const before = (await bodyColors(page)).background;
    await field.fill('#12');
    expect((await bodyColors(page)).background).toBe(before);
    await field.blur();
    await expect(field).toHaveValue('#f8f8f6');
  });

  test('the choice is remembered after a reload, with no flash of the default colours', async ({ page }) => {
    await openCustom(page);
    await hex(page, 'Background').fill('#223344');
    await hex(page, 'Text').fill('#ffeecc');
    await page.waitForTimeout(1500); // the app saves a moment after the last change
    await page.reload();
    expect(await bodyColors(page)).toEqual({ background: 'rgb(34, 51, 68)', color: 'rgb(255, 238, 204)' });
    await page.goto('/#/settings');
    await expect(page.getByRole('link', { name: /^Theme/ })).toContainText('Custom');
  });

  test('Light and Dark are fixed presets: customizing never changes them, and your custom colours are kept for next time', async ({ page }) => {
    await openCustom(page);
    await hex(page, 'Background').fill('#102030');
    await hex(page, 'Accent').fill('#ff8800');
    await page.waitForTimeout(1500);

    await tile(page, 'Light').click();
    expect(await rootVar(page, '--background')).toBe(''); // every custom colour is removed
    expect(await rootVar(page, '--accent')).toBe('');
    expect(await bodyColors(page)).toEqual({ background: 'rgb(248, 248, 246)', color: 'rgb(23, 23, 26)' }); // always the same paper and ink
    await tile(page, 'Dark').click();
    expect(await bodyColors(page)).toEqual({ background: 'rgb(19, 19, 18)', color: 'rgb(241, 240, 236)' }); // always the same dark

    await tile(page, 'Custom').click(); // back to Custom: your colours are still there
    await expect(hex(page, 'Background')).toHaveValue('#102030');
    await expect(hex(page, 'Accent')).toHaveValue('#ff8800');
    expect((await bodyColors(page)).background).toBe('rgb(16, 32, 48)');
  });

  test('every colour dot has a visible ring, so a dark dot does not vanish on a dark page', async ({ browser }) => {
    for (const scheme of ['light', 'dark'] as const) {
      const ctx = await browser.newContext({ colorScheme: scheme });
      const page = await ctx.newPage();
      await page.goto('/#/settings/theme');
      const dots = page.getByRole('group', { name: 'Theme' }).locator('label span[aria-hidden]');
      await expect(dots).toHaveCount(4);
      for (const d of await dots.all()) {
        const ring = await d.evaluate((e) => getComputedStyle(e).boxShadow); // an inner ring in the text colour, partly see-through
        expect(ring).toContain('inset');
        expect(ring).not.toBe('none');
      }
      await ctx.close();
    }
  });

  test('Reset to default restores the starting colours', async ({ page }) => {
    await openCustom(page);
    await hex(page, 'Background').fill('#102030');
    await page.getByRole('button', { name: 'Reset to default' }).click();
    await expect(hex(page, 'Background')).toHaveValue('#f8f8f6');
    expect((await bodyColors(page)).background).toBe('rgb(248, 248, 246)');
  });

  test('starting Custom from the dark theme starts from the dark colours', async ({ browser }) => {
    const ctx = await browser.newContext({ colorScheme: 'dark' });
    const page = await ctx.newPage();
    await openCustom(page);
    await expect(hex(page, 'Background')).toHaveValue('#131312');
    await ctx.close();
  });

  for (const scheme of ['light', 'dark'] as const) {
    test(`the page has no accessibility violations (${scheme}, Custom open)`, async ({ browser }) => {
      const ctx = await browser.newContext({ colorScheme: scheme });
      const page = await ctx.newPage();
      await openCustom(page);
      await expect(hex(page, 'Background')).toBeVisible();
      const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      expect(r.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
      await ctx.close();
    });
  }
});
