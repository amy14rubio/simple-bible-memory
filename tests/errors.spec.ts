import { test, expect } from '@playwright/test';
import { createDeck } from './helpers';

test('unknown collection, card, mode and route show clear messages instead of a blank page', async ({ page }) => {
  await page.goto('/#/collections/does-not-exist');
  await expect(page.getByText("This collection isn't here anymore. It may have been deleted.")).toBeVisible();

  await page.goto('/#/collections/does-not-exist/edit');
  await expect(page.getByText("This collection isn't here anymore. It may have been deleted.")).toBeVisible();

  await page.goto('/#/cards/does-not-exist/edit');
  await expect(page.getByText("This card isn't here anymore. It may have been deleted.")).toBeVisible();

  await page.goto('/#/collections/does-not-exist/study');
  await expect(page.getByText("This collection isn't here anymore. It may have been deleted.")).toBeVisible();

  await page.goto('/#/nowhere');
  await expect(page.getByText("We couldn't find that page.")).toBeVisible();
});

test('an unknown study mode is rejected', async ({ page }) => {
  const id = await createDeck(page, 'Modes');
  await page.goto(`/#/collections/${id}/study/teleport`);
  await expect(page.getByText("That study mode isn't available.")).toBeVisible();
});

test('validation errors are shown and nothing is saved', async ({ page }) => {
  await page.goto('/#/collections/new');
  await page.getByLabel('Title').fill('   ');
  // required attribute blocks whitespace-only? it does not: the repository rejects it
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('alert')).toContainText('Give your collection a name.');
  await page.goto('/');
  await expect(page.getByText('No collections yet')).toBeVisible();
});

test('an error message fades away when tapped', async ({ page }) => {
  await page.goto('/#/collections/new');
  await page.getByLabel('Title').fill('   ');
  await page.getByRole('button', { name: 'Save' }).click();
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('Give your collection a name.');
  await alert.getByRole('button').click();
  await expect(alert).toHaveCount(0);
});

test('making the same mistake again keeps the message in place and nudges it (no blink), and brings it back if it was tapped away', async ({ page }) => {
  await page.goto('/#/collections/new');
  await page.getByLabel('Title').fill('   ');
  await page.getByRole('button', { name: 'Save' }).click();
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('Give your collection a name.');
  await page.waitForTimeout(500); // the first entrance is over
  await alert.evaluate((el) => { el.setAttribute('data-first', 'yes'); (window as unknown as { seen: number }).seen = 0; new MutationObserver(() => {}).observe(el, { attributes: true }); });
  await page.getByRole('button', { name: 'Save' }).click();
  // the same element (not removed and added again), moving a little
  await expect.poll(() => alert.evaluate((el) => el.getAnimations().length)).toBeGreaterThan(0);
  await expect(alert).toHaveAttribute('data-first', 'yes');

  // tapped away, then the same mistake: it comes back
  await alert.getByRole('button').click();
  await expect(alert).toHaveCount(0);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(alert).toContainText('Give your collection a name.');
});
