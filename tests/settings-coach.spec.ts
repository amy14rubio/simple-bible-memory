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

test.describe('going into a setting and back', () => {
  // These click the page underneath the guide. The guide's box goes below the highlighted row if it fits, and above it if not; on the default 720 px screen step 2 fits with 0 px to spare,
  // so on a machine that draws the text 1 px taller the box flipped above the row and covered the link that was about to be clicked. A taller screen leaves a safe margin.
  test.use({ viewport: { width: 1280, height: 900 } });

  test('the guide carries on at the step it was on', async ({ page }) => {
    await page.goto('/#/settings');
    await guide(page).getByRole('button', { name: 'Next' }).click();
    await expect(title(page)).toHaveText('Choose your cards');
    await page.getByRole('link', { name: /^Theme/ }).click({ force: true }); // the page underneath stays tappable
    await expect(page).toHaveURL(/#\/settings\/theme$/);
    await expect(guide(page)).toHaveCount(0);
    await page.goBack();
    await expect(title(page)).toHaveText('Choose your cards'); // not step 1 again
    await expect(guide(page).locator('p.sr-only')).toHaveText(`Step 2 of ${STEPS.length}`);
    await guide(page).getByRole('button', { name: 'Close' }).click();
    await page.getByRole('link', { name: /^Theme/ }).click();
    await page.goBack();
    await expect(guide(page)).toHaveCount(0); // closed for good
  });

  test('even a guide replayed with the ? button carries on after going into a setting, until the X', async ({ page }) => {
    await page.goto('/#/settings');
    await guide(page).getByRole('button', { name: 'Close' }).click(); // seen before
    await page.getByRole('button', { name: 'How to use Settings' }).click();
    await guide(page).getByRole('button', { name: 'Next' }).click();
    await page.getByRole('link', { name: /^Theme/ }).click({ force: true });
    await expect(page).toHaveURL(/#\/settings\/theme$/);
    await page.getByRole('link', { name: 'Back' }).first().click(); // the arrow at the top, as a person would
    await expect(title(page)).toHaveText('Choose your cards'); // no need to press ? again
    await guide(page).getByRole('button', { name: 'Close' }).click();
    await page.getByRole('link', { name: /^Theme/ }).click();
    await page.getByRole('link', { name: 'Back' }).first().click();
    await expect(guide(page)).toHaveCount(0); // closed with the X: it stays closed
  });

  test('changing the language comes back to the same step, now in that language', async ({ page }) => {
    await page.goto('/#/settings');
    await guide(page).getByRole('button', { name: 'Next' }).click();
    await page.getByRole('link', { name: /^Language/ }).click({ force: true });
    await page.getByRole('group', { name: 'Language' }).getByRole('radio', { name: 'Español', exact: true }).check({ force: true });
    await page.goBack();
    await expect(title(page)).toHaveText('Elige tus tarjetas');
  });

  test('leaving Settings for somewhere else counts as closing the guide', async ({ page }) => {
    await page.goto('/#/settings');
    await guide(page).getByRole('button', { name: 'Next' }).click();
    await page.getByRole('link', { name: 'Back to collections' }).click({ force: true });
    await expect(page.getByRole('heading', { name: 'Simple Bible Memory', level: 1 })).toBeVisible();
    await page.goto('/#/settings');
    await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
    await expect(guide(page)).toHaveCount(0);
    await page.reload();
    await expect(guide(page)).toHaveCount(0); // remembered
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
        const roomBelow = await page.evaluate(() => (() => { const a = document.getElementById('app-scroll')!; return a.scrollHeight - a.clientHeight - a.scrollTop; })());
        if (roomBelow > 4) expect(tip.y, `${anchor}: box is below the part (not jumped above it)`).toBeGreaterThanOrEqual(part.y + part.height);
        if (i < anchors.length - 1) await guide(page).getByRole('button', { name: 'Next' }).click();
      }
      await ctx.close();
    });
  }
});

test('the dimmed screen covers the whole screen, even a big one with the highlight in a corner (Safari left part of it bright when it was a huge shadow)', async ({ page }) => {
  await page.setViewportSize({ width: 1720, height: 1620 });
  await page.goto('/#/collections/new');
  await expect(guide(page)).toBeVisible();
  const dim = page.locator('svg:has(mask#coach-hole)');
  const box = (await dim.boundingBox())!;
  expect(box).toMatchObject({ x: 0, y: 0, width: 1720, height: 1620 });
});
