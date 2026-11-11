import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * A drawer with only text in it (the explanation behind a small "i") has no button to say to Voice Control. Every drawer therefore has an
 * invisible "Close" over the top strip of the screen, outside the drawer: Voice Control can name it, and "Tap Close" taps the middle of it.
 */
for (const [locale, label] of [['en-US', 'Close'], ['es-ES', 'Cerrar']] as const) {
  test.describe(locale, () => {
    test.use({ locale, viewport: { width: 820, height: 1100 } });

    test('an info drawer can be closed with the Close that sits above it', async ({ page }) => {
      await page.goto('/#/settings/card-kinds');
      const info = page.locator('button[aria-haspopup="dialog"]').first();
      await info.click();
      const drawer = page.getByRole('dialog');
      await expect(drawer).toBeVisible();

      await page.waitForTimeout(800); // the drawer slides up; measure after it has stopped
      const close = drawer.locator('[data-slot="drawer-outside-close"]'); // inside the drawer's element (the page outside it is hidden from Voice Control), but drawn above it
      await expect(close).toHaveAccessibleName(label);
      await expect(drawer.getByRole('button', { name: label })).toHaveCount(1); // the only Close, so a screen reader hears it once
      const [c, d] = [await close.boundingBox(), await drawer.boundingBox()];
      expect(c!.y + c!.height / 2).toBeLessThan(d!.y - 20); // its middle is well above the drawer, so "Tap Close" taps outside it

      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);

      await page.mouse.click(c!.x + c!.width / 2, c!.y + c!.height / 2); // "Tap Close": a tap in the middle of it
      await expect(drawer).toBeHidden();
    });
  });
}

