import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/** The guide the first time Settings opens. Every other test runs with it off (VITE_SKIP_ONBOARDING); these switch it on. */
const forceGuide = (page: Page) => page.addInitScript(() => localStorage.setItem('sbm-force-onboarding', '1'));
const guide = (page: Page) => page.getByRole('dialog').filter({ has: page.locator('#coach-title') });
const title = (page: Page) => guide(page).getByRole('heading', { level: 2 });
const STEPS = ['Make it yours', 'Choose your cards', 'Fill-in-the-blank difficulty', 'New cards each day', 'Daily reminder', "Don't lose your cards", 'Need help?'];

test.beforeEach(({ page }) => forceGuide(page));

test('the first time Settings opens, a guide points at the real rows, one by one', async ({ page }) => {
  await page.goto('/#/settings');
  for (const [i, text] of STEPS.entries()) {
    await expect(title(page)).toHaveText(text);
    await expect(guide(page).locator('p.sr-only')).toHaveText(`Step ${i + 1} of ${STEPS.length}`);
    if (i < STEPS.length - 1) await guide(page).getByRole('button', { name: 'Next' }).click();
  }
  await guide(page).getByRole('button', { name: 'Got it' }).click();
  await expect(guide(page)).toHaveCount(0);
});

test('each step highlights the row it talks about (the first one: language, theme and font together)', async ({ page }) => {
  await page.goto('/#/settings');
  const look = page.locator('#settings-page [data-coach="look"]');
  for (const name of [/^Language/, /^Theme/, /^Font/]) await expect(look.getByRole('link', { name })).toBeVisible(); // all three are inside the highlighted part
  const rows = [page.locator('#settings-page [data-coach="look"]'), page.getByRole('link', { name: /^Cards for each verse/ }), page.getByRole('link', { name: /^Fill-in-the-blanks difficulty/ }), page.getByRole('spinbutton', { name: 'New cards per day' }), page.getByRole('switch', { name: 'Remind me to study' }), page.locator('#settings-page section[aria-labelledby="backup"]'), page.getByRole('link', { name: 'How to use the app' })];
  for (const [i, row] of rows.entries()) {
    await expect(title(page)).toHaveText(STEPS[i]!);
    await page.waitForTimeout(250);
    const r = (await row.boundingBox())!;
    const tip = (await guide(page).boundingBox())!;
    expect(r.y, `step ${i + 1}: the row is on the screen`).toBeGreaterThanOrEqual(0);
    expect(r.y + r.height, `step ${i + 1}: the row is on the screen`).toBeLessThanOrEqual(page.viewportSize()!.height);
    expect(tip.y + tip.height <= r.y || tip.y >= r.y + r.height, `step ${i + 1}: the box does not cover the row`).toBe(true);
    if (i < rows.length - 1) await guide(page).getByRole('button', { name: 'Next' }).click();
  }
});

test('the X closes it, it is remembered, and the ? button on Settings starts it again', async ({ page }) => {
  await page.goto('/#/settings');
  await expect(guide(page).getByRole('button', { name: 'Skip' })).toHaveCount(0);
  await guide(page).getByRole('button', { name: 'Close' }).click();
  await expect(guide(page)).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
  await expect(guide(page)).toHaveCount(0); // remembered
  await page.getByRole('button', { name: 'How to use Settings' }).click();
  await expect(title(page)).toHaveText('Make it yours');
  await page.keyboard.press('Escape');
  await expect(guide(page)).toHaveCount(0);
});

for (const scheme of ['light', 'dark'] as const) {
  test(`no accessibility violations on any step (${scheme})`, async ({ browser }) => {
    const ctx = await browser.newContext({ colorScheme: scheme, viewport: { width: 390, height: 780 } });
    const page = await ctx.newPage();
    await forceGuide(page);
    await page.goto('/#/settings');
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
    await page.goto('/#/settings');
    await expect(title(page)).toHaveText('Personaliza la app');
    await guide(page).getByRole('button', { name: 'Siguiente' }).click();
    await expect(title(page)).toHaveText('Elige tus tarjetas');
    await guide(page).getByRole('button', { name: 'Cerrar' }).click();
    await page.getByRole('button', { name: 'Cómo usar Ajustes' }).click();
    await expect(title(page)).toHaveText('Personaliza la app');
  });
});

test.describe('the box stays below the highlighted part when the page can scroll further', () => {
  for (const height of [560, 640, 720, 800]) {
    test(`every step on a ${height}px tall screen`, async ({ browser }) => {
      const ctx = await browser.newContext({ viewport: { width: 390, height } });
      const page = await ctx.newPage();
      await forceGuide(page);
      await page.goto('/#/settings');
      const anchors = ['look', 'kinds', 'blanks', 'new', 'reminders', 'backup', 'tour'];
      for (const [i, anchor] of anchors.entries()) {
        await expect(title(page)).toHaveText(STEPS[i]!);
        await page.waitForTimeout(350);
        const part = (await page.locator(`#settings-page [data-coach="${anchor}"]`).boundingBox())!;
        const tip = (await guide(page).boundingBox())!;
        expect(part.y, `${anchor}: highlighted part is on the screen`).toBeGreaterThanOrEqual(0);
        expect(part.y + part.height, `${anchor}: highlighted part is on the screen`).toBeLessThanOrEqual(height);
        const roomBelow = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight - window.scrollY);
        if (roomBelow > 4) expect(tip.y, `${anchor}: box is below the part (not jumped above it)`).toBeGreaterThanOrEqual(part.y + part.height);
        if (i < anchors.length - 1) await guide(page).getByRole('button', { name: 'Next' }).click();
      }
      await ctx.close();
    });
  }
});
