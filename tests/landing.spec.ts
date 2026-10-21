import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/** The landing page is a plain file (like the privacy policy), so it opens without loading the app. */
for (const [lang, url, heading, open, other] of [
  ['English', '/landing.html', 'Learn Scripture by heart, and keep it.', 'Open the app', '/es/landing'],
  ['Spanish', '/es/landing.html', 'Aprende la Escritura de memoria, y consérvala.', 'Abrir la app', '/landing'],
] as const) {
  test.describe(lang, () => {
    test('has the headline, a way into the app, the study ways and the legal links', async ({ page }) => {
      await page.goto(url);
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
      await expect(page.getByRole('link', { name: open })).toHaveAttribute('href', '/');
      await expect(page.getByRole('heading', { level: 2 })).toHaveCount(3);
      await expect(page.locator('footer a[href$="privacy-policy"]')).toHaveCount(1);
      await expect(page.locator('footer a[href$="terms"]')).toHaveCount(1);
      await expect(page.locator(`link[rel="alternate"][href="${other}"]`)).toHaveCount(1); // points at the other language
    });

    test('fits a phone without sideways scrolling', async ({ page }) => {
      await page.setViewportSize({ width: 360, height: 740 });
      await page.goto(url);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBe(0);
    });

    for (const scheme of ['light', 'dark'] as const) {
      test(`has no WCAG A/AA violations (${scheme})`, async ({ browser }) => {
        const ctx = await browser.newContext({ colorScheme: scheme });
        const page = await ctx.newPage();
        await page.goto(url);
        const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
        expect(results.violations).toEqual([]);
        await ctx.close();
      });
    }
  });
}
