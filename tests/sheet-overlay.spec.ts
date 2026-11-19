import { test, expect } from '@playwright/test';

/**
 * On iPhone and iPad a sheet's dimmed background is drawn "absolute" (components/shadcn/drawer.tsx). A desktop browser does not match that iOS-only
 * rule, so it is forced here. The dimmed layer must cover the whole screen however far the page behind the sheet is scrolled: before the page was the
 * layer's reference, a Settings page scrolled down by 65px left the bottom 65px of the screen undimmed.
 */
const IOS_RULE = '[data-slot="drawer-overlay"] { position: absolute !important; }';

for (const [name, width, height] of [['iPad portrait', 820, 1180], ['iPad landscape', 1180, 820], ['iPhone', 390, 844]] as const) {
  test(`${name}: the dimmed background of the reminder sheets covers the whole screen, even when the page is scrolled`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.addInitScript((css) => { document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s); }); }, IOS_RULE);
    await page.goto('/#/settings');
    await page.getByRole('switch', { name: 'Remind me to study' }).click();
    await page.evaluate(() => document.getElementById('app-scroll')!.scrollTo(0, 120)); // the page behind the sheet is scrolled down a little, as on an iPad
    await expect.poll(() => page.evaluate(() => Math.round(document.getElementById('app-scroll')!.scrollTop))).toBeGreaterThan(0);
    await page.getByRole('button', { name: 'Add a reminder' }).click();
    const sheet = page.getByRole('dialog', { name: 'New reminder' });
    await expect(sheet).toBeVisible();
    for (const which of ['New reminder', 'Edit reminder']) {
      if (which === 'Edit reminder') {
        await page.keyboard.press('Escape');
        await expect(sheet).toHaveCount(0);
        await page.getByRole('button', { name: /Every day at 8:00 PM/ }).first().click();
        await expect(page.getByRole('dialog', { name: 'Edit reminder' })).toBeVisible();
      }
      await page.waitForTimeout(600); // the overlay has faded in
      const cover = await page.evaluate(() => {
        const o = document.querySelector('[data-slot="drawer-overlay"]')!.getBoundingClientRect();
        return { top: o.top, bottom: o.bottom, left: o.left, right: o.right, vw: innerWidth, vh: innerHeight, scrolled: document.getElementById('app-scroll')!.scrollTop };
      });
      expect(cover.scrolled, `${which}: the page really is scrolled`).toBeGreaterThan(0);
      expect(cover.top, `${which}: covers the top`).toBeLessThanOrEqual(0);
      expect(cover.bottom, `${which}: covers the bottom of the screen`).toBeGreaterThanOrEqual(cover.vh);
      expect(cover.left).toBeLessThanOrEqual(0);
      expect(cover.right).toBeGreaterThanOrEqual(cover.vw);
    }
  });
}
