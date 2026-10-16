import { test, expect } from '@playwright/test';
import { closeWithEscape } from './helpers';

test('settings explanations live behind an "i" with a drawer, not as small print', async ({ page }) => {
  await page.goto('/#/settings');
  const explanations: [string, string][] = [
    ['Language', 'Changes the text of the app only.'],
    ['New cards per day', 'Counted across all decks.'],
    ['Cards for each verse', 'Recall the passage from its verse, and name the verse from its passage.'],
    ['Fill-in-the-blanks difficulty', 'Sets how many words are hidden in each verse.'],
  ];
  for (const [title, text] of explanations) {
    await expect(page.getByText(text)).toHaveCount(0); // nothing printed on the page
    await page.getByRole('button', { name: title, exact: true }).click();
    const drawer = page.getByRole('dialog', { name: title });
    await expect(drawer).toContainText(text);
    await closeWithEscape(page);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  }
});

test('the card-kinds options show only their names; the drawer explains all three', async ({ page }) => {
  await page.goto('/#/settings');
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

test('Notifications and Backup keep their text visible', async ({ page }) => {
  await page.goto('/#/settings');
  await expect(page.getByText("Study reminders aren't available yet.")).toBeVisible();
  await expect(page.getByText(/You don't need an account/)).toBeVisible();
});
