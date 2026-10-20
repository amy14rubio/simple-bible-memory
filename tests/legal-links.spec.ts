import { test, expect } from '@playwright/test';

/** The in-app links to the website's privacy policy, terms and account-deletion pages, in the app's language. */
test('English: the Privacy page links to the English pages', async ({ page }) => {
  await page.goto('/#/settings/privacy');
  await expect(page.getByRole('link', { name: 'Read the full privacy policy' })).toHaveAttribute('href', 'https://simple-bible-memory.web.app/privacy-policy');
  await expect(page.getByRole('link', { name: 'Read the terms' })).toHaveAttribute('href', 'https://simple-bible-memory.web.app/terms');
  await expect(page.getByRole('link', { name: 'How to delete your account' })).toHaveAttribute('href', 'https://simple-bible-memory.web.app/delete-account');
});

test.describe('Spanish', () => {
  test.use({ locale: 'es-ES' });
  test('the Privacy page links to the Spanish pages', async ({ page }) => {
    await page.goto('/#/settings/privacy');
    await expect(page.getByRole('link', { name: 'Leer la política de privacidad completa' })).toHaveAttribute('href', 'https://simple-bible-memory.web.app/es/privacy-policy');
    await expect(page.getByRole('link', { name: 'Leer los términos' })).toHaveAttribute('href', 'https://simple-bible-memory.web.app/es/terms');
    await expect(page.getByRole('link', { name: 'Cómo eliminar tu cuenta' })).toHaveAttribute('href', 'https://simple-bible-memory.web.app/es/delete-account');
  });
});
