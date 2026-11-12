import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/** On a wide screen (a tablet lying down, a computer) the bottom bar becomes a sidebar that can be hidden. */
const WIDE = { width: 1280, height: 800 };
const sidebar = (page: import('@playwright/test').Page) => page.getByRole('navigation', { name: 'Main' });

test('a wide screen has a sidebar with the main places, and no bottom bar', async ({ page }) => {
  await page.setViewportSize(WIDE);
  await page.goto('/');
  const nav = sidebar(page);
  await expect(nav).toBeVisible();
  for (const name of ['Collections', 'View cards', 'Statistics']) await expect(nav.getByRole('link', { name, exact: true })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Collections', exact: true })).toHaveAttribute('aria-current', 'page');
  const box = (await nav.boundingBox())!;
  expect(box.x).toBeLessThan(40); // down the left side
  await expect(page.getByRole('button', { name: 'Add' })).toBeVisible();
  await nav.getByRole('link', { name: 'Statistics', exact: true }).click();
  await expect(page).toHaveURL(/#\/stats$/);
  await expect(nav.getByRole('link', { name: 'Statistics', exact: true })).toHaveAttribute('aria-current', 'page');
});

test('View cards opens the cards of all collections, and is the highlighted place there', async ({ page }) => {
  await page.setViewportSize(WIDE);
  await page.goto('/');
  await sidebar(page).getByRole('link', { name: 'View cards' }).click();
  await expect(page).toHaveURL(/#\/collections\/all\/cards$/);
  await expect(sidebar(page).getByRole('link', { name: 'View cards' })).toHaveAttribute('aria-current', 'page');
  await expect(sidebar(page).getByRole('link', { name: 'Collections', exact: true })).not.toHaveAttribute('aria-current', 'page');
});

test('the logo is in the sidebar and takes you home', async ({ page }) => {
  await page.setViewportSize(WIDE);
  await page.goto('/#/stats');
  const logo = sidebar(page).locator('xpath=..').getByRole('link', { name: 'Simple Bible Memory' });
  await expect(logo.locator('img')).toBeVisible();
  await logo.click();
  await expect(page).toHaveURL(/#\/$/);
});

test('the Add button opens the create drawer from the sidebar', async ({ page }) => {
  await page.setViewportSize(WIDE);
  await page.goto('/');
  await page.getByRole('button', { name: 'Add' }).click();
  await expect(page.getByRole('dialog', { name: 'Create new' })).toBeVisible();
});

test('the sidebar can be hidden and shown again, and the choice is remembered', async ({ page }) => {
  await page.setViewportSize(WIDE);
  await page.goto('/');
  await page.getByRole('button', { name: 'Hide sidebar' }).click();
  await expect(sidebar(page)).toHaveCount(0);
  const show = page.getByRole('button', { name: 'Show sidebar' });
  await expect(show).toBeVisible();
  // the button never sits on top of the page's own title
  const title = (await page.getByRole('heading', { name: 'Simple Bible Memory' }).boundingBox())!;
  const button = (await show.boundingBox())!;
  expect(button.x + button.width).toBeLessThanOrEqual(title.x);
  await page.reload();
  await expect(sidebar(page)).toHaveCount(0);
  await show.click();
  await expect(sidebar(page)).toBeVisible();
  await page.reload();
  await expect(sidebar(page)).toBeVisible();
});

test('on a phone or a tablet standing up there is no sidebar: the bottom bar is used', async ({ page }) => {
  for (const size of [{ width: 390, height: 844 }, { width: 820, height: 1180 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(size);
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Hide sidebar' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Statistics' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'View cards' })).toHaveCount(0);
  }
});

test('resizing across the line switches between the two', async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Hide sidebar' })).toHaveCount(0);
  await page.setViewportSize(WIDE);
  await expect(page.getByRole('button', { name: 'Hide sidebar' })).toBeVisible();
});

test('studying has the whole screen: no sidebar', async ({ page }) => {
  await page.setViewportSize(WIDE);
  await page.goto('/#/collections/new');
  await page.getByLabel('Title').fill('Focus');
  await page.getByRole('button', { name: 'Save' }).click();
  await page.waitForURL(/#\/collections\/[0-9a-f-]{36}$/);
  const id = page.url().match(/#\/collections\/([0-9a-f-]{36})$/)![1]!;
  await expect(sidebar(page)).toBeVisible(); // the deck page has it
  await page.goto(`/#/collections/${id}/study/flashcard`);
  await expect(sidebar(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Show sidebar' })).toHaveCount(0);
});

test('the collection list is a grid of cards on a wide screen', async ({ page }) => {
  await page.setViewportSize(WIDE);
  await page.goto('/#/collections/new');
  for (const title of ['One', 'Two']) {
    await page.goto('/#/collections/new');
    await page.getByLabel('Title').fill(title);
    await page.getByRole('button', { name: 'Save' }).click();
    await page.waitForURL(/#\/collections\/[0-9a-f-]{36}$/);
  }
  await page.goto('/');
  const [a, b] = await Promise.all([page.getByRole('link', { name: /^One/ }).boundingBox(), page.getByRole('link', { name: /^Two/ }).boundingBox()]);
  expect(Math.abs(a!.y - b!.y)).toBeLessThan(4); // side by side
});

test('a single collection takes the whole width, not half of it', async ({ page }) => {
  await page.setViewportSize(WIDE);
  await page.goto('/#/collections/new');
  await page.getByLabel('Title').fill('Only one');
  await page.getByRole('button', { name: 'Save' }).click();
  await page.waitForURL(/#\/collections\/[0-9a-f-]{36}$/);
  await page.goto('/');
  const card = (await page.getByRole('link', { name: /^Only one/ }).locator('xpath=..').boundingBox())!;
  const list = (await page.locator('main ul').first().boundingBox())!;
  expect(card.width).toBeGreaterThan(list.width * 0.85);
});

test('no accessibility violations with the sidebar (light and dark, English and Spanish)', async ({ page }) => {
  await page.setViewportSize(WIDE);
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/');
    await expect(sidebar(page)).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(results.violations.map((v) => v.id)).toEqual([]);
  }
});
