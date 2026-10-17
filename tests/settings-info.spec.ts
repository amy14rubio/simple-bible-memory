import { test, expect } from '@playwright/test';
import { closeWithEscape } from './helpers';

test('settings explanations live behind an "i" with a drawer, not as small print', async ({ page }) => {
  await page.goto('/#/settings');
  await expect(page.getByText('Counted across all decks.')).toHaveCount(0); // nothing printed on the page
  await page.getByRole('button', { name: 'New cards per day', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'New cards per day' })).toContainText('Counted across all decks.');
  await closeWithEscape(page);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('card kinds and blanks difficulty are their own pages, showing the current choice on the Settings row', async ({ page }) => {
  await page.goto('/#/settings');
  const kindsRow = page.getByRole('link', { name: /^Cards for each verse/ });
  const blanksRow = page.getByRole('link', { name: /^Fill-in-the-blanks difficulty/ });
  await expect(kindsRow).toContainText('Both');
  await expect(blanksRow).toContainText('Medium');
  await expect(page.getByRole('radio')).toHaveCount(0); // no options on the Settings page itself

  await kindsRow.click();
  await expect(page.getByRole('radio')).toHaveCount(3);
  await page.getByRole('radio', { name: 'Identify the verse' }).check();
  await page.getByRole('link', { name: 'Back' }).click();
  await expect(kindsRow).toContainText('Identify the verse'); // remembered

  await blanksRow.click();
  await expect(page.getByRole('radio')).toHaveCount(3);
  await expect(page.getByRole('radio', { name: 'Medium' })).toBeChecked();
  await page.getByRole('radio', { name: 'Hard' }).check();
  await page.getByRole('link', { name: 'Back' }).click();
  await expect(blanksRow).toContainText('Hard');
  await page.reload();
  await expect(page.getByRole('link', { name: /^Fill-in-the-blanks difficulty/ })).toContainText('Hard');
});

test('the blanks explanation is behind the "i" in the page title', async ({ page }) => {
  await page.goto('/#/settings/blanks');
  await expect(page.getByText('Sets how many words are hidden in each verse.')).toHaveCount(0);
  await page.getByRole('button', { name: 'Fill-in-the-blanks difficulty', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Fill-in-the-blanks difficulty' })).toContainText('Sets how many words are hidden in each verse.');
});

test('the card-kinds options show only their names; the drawer explains all three', async ({ page }) => {
  await page.goto('/#/settings/card-kinds');
  const radios = page.getByRole('radio');
  await expect(radios).toHaveCount(3);
  await expect(page.getByText('You see the verse reference and recall the passage.')).toHaveCount(0);
  await page.getByRole('button', { name: 'Cards for each verse', exact: true }).click();
  const drawer = page.getByRole('dialog', { name: 'Cards for each verse' });
  for (const [name, text] of [['Both', 'Recall the passage from its verse'], ['Recall the passage', 'You see the verse reference and recall the passage.'], ['Identify the verse', 'You see the passage and name the verse.']]) {
    await expect(drawer.getByRole('term').filter({ hasText: new RegExp(`^${name}$`) })).toBeVisible();
    await expect(drawer.getByText(text!)).toBeVisible();
  }
});

test('Notifications keep their text visible', async ({ page }) => {
  await page.goto('/#/settings');
  await expect(page.getByText("Study reminders aren't available yet.")).toBeVisible();
});

test('the Language explanation is behind the "i" in the Language page title', async ({ page }) => {
  await page.goto('/#/settings/language');
  await expect(page.getByText('Changes the text of the app only.')).toHaveCount(0);
  await page.getByRole('button', { name: 'Language', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Language' })).toContainText('Changes the text of the app only.');
});

test('Account and backup: Export everything comes first, then sign in, and there is no Import row', async ({ page }) => {
  await page.goto('/#/settings');
  const section = page.getByRole('region', { name: 'Account and backup' });
  const items = section.getByRole('button').filter({ hasNotText: /^Account and backup$/ });
  await expect(items.nth(0)).toContainText('Export everything');
  await expect(items.nth(1)).toContainText('Sign in');
  await expect(section.getByRole('link')).toHaveCount(0);
  await section.getByRole('button', { name: 'Account and backup', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Account and backup' })).toContainText('also backs up your decks, cards, study schedule and study settings to your account');
});
