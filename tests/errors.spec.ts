import { test, expect } from '@playwright/test';
import { createDeck } from './helpers';

test('unknown collection, card, mode and route show clear messages instead of a blank page', async ({ page }) => {
  await page.goto('/#/collections/does-not-exist');
  await expect(page.getByText('This collection no longer exists.')).toBeVisible();

  await page.goto('/#/collections/does-not-exist/edit');
  await expect(page.getByText('This collection no longer exists.')).toBeVisible();

  await page.goto('/#/cards/does-not-exist/edit');
  await expect(page.getByText('This card no longer exists.')).toBeVisible();

  await page.goto('/#/collections/does-not-exist/study');
  await expect(page.getByText('This collection no longer exists.')).toBeVisible();

  await page.goto('/#/nowhere');
  await expect(page.getByText('Page not found.')).toBeVisible();
});

test('an unknown study mode is rejected', async ({ page }) => {
  const id = await createDeck(page, 'Modes');
  await page.goto(`/#/collections/${id}/study/teleport`);
  await expect(page.getByText('Unknown study mode.')).toBeVisible();
});

test('validation errors are shown and nothing is saved', async ({ page }) => {
  await page.goto('/#/collections/new');
  await page.getByLabel('Title').fill('   ');
  // required attribute blocks whitespace-only? it does not: the repository rejects it
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('alert')).toContainText('Collection title is required');
  await page.goto('/');
  await expect(page.getByText('No collections yet')).toBeVisible();
});
