import { test, expect } from '@playwright/test';

/**
 * Sign in with Apple is offered in the iPhone and iPad app (Apple requires it whenever an app offers Google sign-in). The browser
 * tests turn it on with VITE_FAKE_APPLE and use the same stand-in for the cloud as the Google sign-in tests.
 */
test('Settings offers Sign in with Apple next to Google, and signing in with it works', async ({ page }) => {
  await page.goto('/#/settings');
  await expect(page.getByRole('button', { name: 'Sign in with Google' })).toBeVisible();
  const apple = page.getByRole('button', { name: 'Sign in with Apple' });
  await expect(apple).toBeVisible();
  await apple.click();
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
  // Apple may hide the person's email behind a relay address and gives no name: the account line still says who is signed in
  await expect(page.getByText(/Signed in as .*privaterelay\.appleid\.com/)).toBeVisible();
});

test('Sign in with Apple is in Spanish too', async ({ browser }) => {
  const ctx = await browser.newContext({ locale: 'es-ES' });
  const page = await ctx.newPage();
  await page.goto('/#/settings');
  await expect(page.getByRole('button', { name: 'Iniciar sesión con Apple' })).toBeVisible();
  await ctx.close();
});
