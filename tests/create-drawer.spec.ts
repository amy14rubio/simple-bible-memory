import { closeWithEscape } from './helpers';
import { test, expect, type Page } from '@playwright/test';

const plus = (page: Page) => page.locator('button[aria-haspopup="dialog"]');
const drawer = (page: Page, name = 'Create new') => page.getByRole('dialog', { name });

test.describe('the create drawer', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the + button opens a drawer from the bottom of the screen', async ({ page }) => {
    await page.goto('/');
    await expect(plus(page)).toHaveAttribute('aria-expanded', 'false');
    await plus(page).click();
    await expect(drawer(page)).toBeVisible();
    await expect(plus(page)).toHaveAttribute('aria-expanded', 'true');
    await page.waitForTimeout(700); // let it finish sliding up
    const box = (await drawer(page).boundingBox())!;
    expect(box.x).toBeLessThanOrEqual(1); // full width on a phone
    expect(box.width).toBeGreaterThanOrEqual(388);
    expect(Math.round(box.y + box.height)).toBeGreaterThanOrEqual(843); // sits on the bottom edge
    expect(box.y).toBeGreaterThan(844 * 0.4); // a drawer, not a full screen
  });

  test('shows a swipe handle, the title, the two choices (with no extra explanation text), and an invisible Cancel for assistive tech', async ({ page }) => {
    await page.goto('/');
    await plus(page).click();
    const d = drawer(page);
    await expect(d.locator('[data-slot="drawer-swipe-handle"]')).toBeVisible();
    await expect(d.getByRole('heading', { name: 'Create new' })).toBeVisible();
    await expect(d.getByRole('button', { name: 'New deck', exact: true })).toBeVisible();
    await expect(d.getByRole('button', { name: 'New card', exact: true })).toBeVisible();
    // the choices are just their names: no description text under them
    await expect(d.getByText('Organize your verses')).toHaveCount(0);
    await expect(d.getByText(/Type or paste/)).toHaveCount(0);
    await expect(d.getByRole('button', { name: 'Cancel' })).toBeAttached(); // invisible, but there for screen readers and voice control
  });

  test('its typography matches the rest of the app: the title is the serif used by other dialogs and headings', async ({ page }) => {
    await page.goto('/');
    await plus(page).click();
    const title = drawer(page).getByRole('heading', { name: 'Create new' });
    await expect(title).toBeVisible();
    const family = await title.evaluate((el) => getComputedStyle(el).fontFamily);
    expect(family).toContain('Literata');
    // the same family as a title in another dialog (the delete-deck confirmation uses the shared Dialog)
    const choice = drawer(page).getByRole('button', { name: 'New deck', exact: true });
    expect(await choice.evaluate((el) => getComputedStyle(el).fontFamily)).toContain('Instrument Sans'); // action labels are sans, like the other buttons and menus
  });

  test('the page behind is dimmed and cannot be used until the drawer is closed', async ({ page }) => {
    await page.goto('/');
    await plus(page).click();
    await expect(drawer(page)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Statistics' })).toHaveCount(0); // hidden from assistive tech and out of reach
    await page.getByRole('button', { name: 'Cancel' }).dispatchEvent('click');
    await expect(drawer(page)).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Statistics' })).toBeVisible();
  });

  test('Cancel closes it, and focus goes back to the + button', async ({ page }) => {
    await page.goto('/');
    await plus(page).click();
    await drawer(page).getByRole('button', { name: 'Cancel' }).dispatchEvent('click');
    await expect(drawer(page)).toHaveCount(0);
    await expect(plus(page)).toBeFocused();
    await expect(plus(page)).toHaveAttribute('aria-expanded', 'false');
  });

  test('Escape closes it', async ({ page }) => {
    await page.goto('/');
    await plus(page).click();
    await expect(drawer(page)).toBeVisible();
    await closeWithEscape(page);
    await expect(drawer(page)).toHaveCount(0);
    await expect(plus(page)).toBeFocused();
  });

  test('tapping the dimmed area outside closes it', async ({ page }) => {
    await page.goto('/');
    await plus(page).click();
    await page.waitForTimeout(700);
    await page.mouse.click(195, 120); // well above the drawer
    await expect(drawer(page)).toHaveCount(0);
  });

  test('swiping it down closes it', async ({ page }) => {
    await page.goto('/');
    await plus(page).click();
    await page.waitForTimeout(700);
    const handle = (await drawer(page).locator('[data-slot="drawer-swipe-handle"]').boundingBox())!;
    const x = handle.x + handle.width / 2;
    const y = handle.y + handle.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    for (let i = 1; i <= 12; i++) await page.mouse.move(x, y + i * 30, { steps: 2 });
    await page.mouse.up();
    await expect(drawer(page)).toHaveCount(0);
  });

  test('a small drag does not close it: it springs back', async ({ page }) => {
    await page.goto('/');
    await plus(page).click();
    await page.waitForTimeout(700);
    const handle = (await drawer(page).locator('[data-slot="drawer-swipe-handle"]').boundingBox())!;
    const x = handle.x + handle.width / 2;
    const y = handle.y + handle.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y + 25, { steps: 4 });
    await page.mouse.up();
    await page.waitForTimeout(600);
    await expect(drawer(page)).toBeVisible();
  });

  test('New deck goes to the new deck form, and the drawer is gone', async ({ page }) => {
    await page.goto('/');
    await plus(page).click();
    await drawer(page).getByRole('button', { name: /New deck/ }).click();
    await expect(page.getByRole('heading', { name: 'New deck' })).toBeVisible();
    await expect(page).toHaveURL(/#\/decks\/new$/);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('New card goes to the new card form', async ({ page }) => {
    await page.goto('/');
    await plus(page).click();
    await drawer(page).getByRole('button', { name: /New card/ }).click();
    await expect(page).toHaveURL(/#\/cards\/new$/);
    await expect(page.getByText('Create a deck first')).toBeVisible(); // no decks yet
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('going back to the home screen after choosing leaves the drawer closed', async ({ page }) => {
    await page.goto('/');
    await plus(page).click();
    await drawer(page).getByRole('button', { name: /New deck/ }).click();
    await page.goBack();
    await expect(page.getByRole('heading', { name: 'Simple Bible Memory' })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await plus(page).click(); // and it opens again normally
    await expect(drawer(page)).toBeVisible();
  });

  test('works in Spanish', async ({ browser }) => {
    const ctx = await browser.newContext({ locale: 'es-ES', viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await page.goto('/');
    await page.getByRole('button', { name: 'Añadir' }).click();
    const d = drawer(page, 'Crear nuevo');
    await expect(d).toBeVisible();
    await expect(d.getByRole('button', { name: 'Nueva carpeta', exact: true })).toBeVisible();
    await expect(d.getByRole('button', { name: 'Nueva tarjeta', exact: true })).toBeVisible();
    await d.getByRole('button', { name: 'Cancelar' }).dispatchEvent('click');
    await expect(d).toHaveCount(0);
    await ctx.close();
  });

  for (const scheme of ['light', 'dark'] as const) {
    test(`the text in the drawer is readable in ${scheme} mode`, async ({ browser }) => {
      const ctx = await browser.newContext({ colorScheme: scheme, viewport: { width: 390, height: 844 } });
      const page = await ctx.newPage();
      await page.goto('/');
      await plus(page).click();
      await expect(drawer(page)).toBeVisible();
      await page.waitForTimeout(700);
      const AxeBuilder = (await import('@axe-core/playwright')).default;
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
      await ctx.close();
    });
  }
});

test('on a wide screen the drawer is centered and not stretched across the whole window', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await plus(page).click();
  await expect(drawer(page)).toBeVisible();
  await page.waitForTimeout(700);
  const box = (await drawer(page).boundingBox())!;
  expect(box.width).toBeLessThanOrEqual(672 * 1.35 + 2); // 42rem, and this window is big enough for the 1.35 size (see responsive.spec.ts)
  expect(box.width).toBeLessThan(1280 / 1.3); // never stretched across the window
  expect(Math.abs(box.x + box.width / 2 - 640)).toBeLessThanOrEqual(2); // centered
});

test.describe('closing popups without a Cancel button', () => {
  test('Back closes the drawer instead of leaving the page, and leaves no extra history behind', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Add' })).toBeVisible();
    await page.getByRole('button', { name: 'Add' }).click();
    await expect(drawer(page)).toBeVisible();
    await page.goBack(); // the phone's Back button
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page).toHaveURL(/\/#?\/?$/); // still on the home screen
  });

  test('closing with Escape removes the extra history entry, so Back still goes where it should', async ({ page }) => {
    await page.goto('/#/settings');
    await page.goto('/');
    await page.getByRole('button', { name: 'Add' }).click();
    await expect(drawer(page)).toBeVisible();
    await closeWithEscape(page);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.waitForTimeout(100);
    await page.goBack(); // one Back from the home screen goes to Settings, not to a leftover popup entry
    await expect(page).toHaveURL(/#\/settings$/);
  });

  test('choosing New deck from the drawer leaves a clean history: Back returns to the home screen', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Add' }).click();
    await drawer(page).getByRole('button', { name: 'New deck' }).click();
    await expect(page).toHaveURL(/#\/decks\/new$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/#?\/?$/);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('a popup has a named Close for screen readers and voice control, though nothing is drawn', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Add' }).click();
    const close = drawer(page).getByRole('button', { name: 'Cancel' });
    await expect(close).toBeAttached();
    const box = await close.boundingBox();
    expect(box!.width).toBeLessThanOrEqual(2); // not visible on screen
    await close.dispatchEvent('click');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});
