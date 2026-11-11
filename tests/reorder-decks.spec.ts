import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createDeck } from './helpers';

/** The deck titles on the home screen, top to bottom. */
const order = (page: Page) => page.locator('li span.truncate').allTextContents();
async function three(page: Page) {
  for (const title of ['Banana', 'Apple', 'Cherry']) await createDeck(page, title);
  await page.goto('/');
  await expect.poll(() => order(page)).toEqual(['Apple', 'Banana', 'Cherry']); // A to Z until someone reorders
}

test('a new deck goes to the top, whatever the order was', async ({ page }) => {
  await three(page);
  await hold(page, 'Apple');
  await dragHandle(page, 'Apple', 'Cherry');
  await expect.poll(() => order(page)).toEqual(['Banana', 'Cherry', 'Apple']);
  await done(page).click();
  await page.waitForTimeout(300);
  await createDeck(page, 'Date');
  await page.goto('/');
  await expect.poll(() => order(page)).toEqual(['Date', 'Banana', 'Cherry', 'Apple']);
});

const menu = (page: Page, title: string) => page.getByRole('button', { name: `Actions for ${title}` }).click();
const heading = (page: Page) => page.getByRole('heading', { level: 1 });
const done = (page: Page) => page.getByRole('button', { name: 'Done' });
const handle = (page: Page, title: string) => page.getByRole('button', { name: `Move ${title}` });
const row = (page: Page, title: string) => page.locator('li').filter({ hasText: title }).first();
/** Presses and holds with the mouse, long enough to count as "touch and hold". */
async function hold(page: Page, title: string) {
  const b = (await row(page, title).boundingBox())!;
  await page.mouse.move(b.x + 60, b.y + b.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(600);
  await page.mouse.up();
}
async function dragHandle(page: Page, from: string, toTitle: string) {
  const h = (await handle(page, from).boundingBox())!;
  const t = (await row(page, toTitle).boundingBox())!;
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await page.mouse.down();
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2 + 12, { steps: 4 });
  await page.mouse.move(h.x + h.width / 2, t.y + t.height / 2 + 12, { steps: 12 });
  await page.mouse.up();
}

test('touch and hold a deck starts reordering: handles appear, and nothing opens by accident', async ({ page }) => {
  await three(page);
  await expect(page.getByRole('button', { name: /^Move / })).toHaveCount(0); // no handles until then
  await hold(page, 'Apple');
  await expect(heading(page)).toHaveText('Reorder decks');
  await expect(page).toHaveURL(/\/(#\/)?$/); // the hold did not open the deck
  await expect(page.getByRole('button', { name: /^Move / })).toHaveCount(3);
  await expect(page.getByRole('button', { name: /^Actions for / })).toHaveCount(0); // the menus are out of the way
  await row(page, 'Banana').click(); // tapping a deck does nothing in this mode
  await expect(page).toHaveURL(/\/(#\/)?$/);
  await expect(page.getByRole('link', { name: /Banana/ })).toHaveCount(0); // they are not links any more
});

test('dragging a handle moves a deck; Done keeps the order and leaves the mode', async ({ page }) => {
  await three(page);
  await hold(page, 'Apple');
  await dragHandle(page, 'Apple', 'Cherry');
  await expect.poll(() => order(page)).toEqual(['Banana', 'Cherry', 'Apple']);
  await done(page).click();
  await expect(heading(page)).toHaveText('Simple Bible Memory');
  await expect(page.getByRole('button', { name: /^Move / })).toHaveCount(0);
  await page.waitForTimeout(300);
  await page.reload();
  await expect.poll(() => order(page)).toEqual(['Banana', 'Cherry', 'Apple']);
});

test('outside the mode a click opens the deck, and dragging a row does not move it', async ({ page }) => {
  await three(page);
  const a = (await row(page, 'Apple').boundingBox())!;
  const c = (await row(page, 'Cherry').boundingBox())!;
  await page.mouse.move(a.x + 60, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + 60, c.y + c.height / 2, { steps: 10 });
  await page.mouse.up();
  await expect.poll(() => order(page)).toEqual(['Apple', 'Banana', 'Cherry']);
  await page.getByRole('link', { name: /Banana/ }).click();
  await expect(page).toHaveURL(/#\/decks\/[0-9a-f-]{36}$/);
});

test('Back leaves reordering without leaving the screen', async ({ page }) => {
  await three(page);
  await hold(page, 'Apple');
  await expect(heading(page)).toHaveText('Reorder decks');
  await page.goBack();
  await expect(heading(page)).toHaveText('Simple Bible Memory');
  await expect(page).toHaveURL(/\/(#\/)?$/);
});

test('from the keyboard: the Reorder decks button, then Space and the arrow keys on a handle', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 }); // one column (on a wide screen decks sit two to a row, and Down means the row below)
  await three(page);
  const start = page.getByRole('button', { name: 'Reorder decks' });
  await start.focus();
  await page.keyboard.press('Enter');
  await expect(heading(page)).toHaveText('Reorder decks');
  await expect(handle(page, 'Apple')).toBeFocused(); // focus lands on the first handle
  await page.keyboard.press('Space');
  await page.waitForTimeout(150);
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(300);
  await page.keyboard.press('Space');
  await expect.poll(() => order(page)).toEqual(['Banana', 'Apple', 'Cherry']);
  await done(page).click();
  await expect(heading(page)).toBeFocused(); // focus is not lost when the mode's buttons go
});

test('on a wide screen too, every arrow key moves a deck one place along the list (two to a row or not)', async ({ page }) => {
  for (const title of ['Apple', 'Banana', 'Cherry', 'Date']) await createDeck(page, title);
  await page.goto('/');
  await expect.poll(() => order(page)).toEqual(['Apple', 'Banana', 'Cherry', 'Date']);
  await page.getByRole('button', { name: 'Reorder decks' }).focus();
  await page.keyboard.press('Enter');
  await expect(handle(page, 'Apple')).toBeFocused();
  const press = async (keys: string[]) => { await page.keyboard.press('Space'); await page.waitForTimeout(150); for (const k of keys) { await page.keyboard.press(k); await page.waitForTimeout(250); } await page.keyboard.press('Space'); await page.waitForTimeout(400); };
  await press(['ArrowDown']); // Apple and Banana sit side by side, but Down still means "one later"
  await expect.poll(() => order(page)).toEqual(['Banana', 'Apple', 'Cherry', 'Date']);
  await handle(page, 'Apple').focus();
  await press(['ArrowRight', 'ArrowRight']);
  await expect.poll(() => order(page)).toEqual(['Banana', 'Cherry', 'Date', 'Apple']);
  await handle(page, 'Apple').focus();
  await press(['ArrowUp']);
  await expect.poll(() => order(page)).toEqual(['Banana', 'Cherry', 'Apple', 'Date']);
  await handle(page, 'Apple').focus();
  await press(['ArrowLeft']);
  await expect.poll(() => order(page)).toEqual(['Banana', 'Apple', 'Cherry', 'Date']);
});

test.describe('with a finger', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 780 } });

  async function touch(page: Page, points: { x: number; y: number }[], holdMs: number) {
    const cdp = await page.context().newCDPSession(page);
    const send = (type: string, p: { x: number; y: number }[]) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: p.map((q) => ({ ...q, id: 0 })) });
    await send('touchStart', [points[0]!]);
    await page.waitForTimeout(holdMs);
    for (const p of points.slice(1)) { await send('touchMove', [p]); await page.waitForTimeout(30); }
    await send('touchEnd', []);
  }
  const centre = async (page: Page, locator: ReturnType<Page['locator']>) => { const b = (await locator.boundingBox())!; return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };

  test('hold starts reordering without opening the deck; then a finger on the handle drags', async ({ page }) => {
    await three(page);
    await touch(page, [await centre(page, row(page, 'Apple'))], 650);
    await expect(heading(page)).toHaveText('Reorder decks');
    await expect(page).toHaveURL(/\/(#\/)?$/);
    const a = await centre(page, handle(page, 'Apple'));
    const c = await centre(page, row(page, 'Cherry'));
    await touch(page, [a, ...Array.from({ length: 12 }, (_, i) => ({ x: a.x, y: a.y + ((c.y + 12 - a.y) * (i + 1)) / 12 }))], 50);
    await expect.poll(() => order(page)).toEqual(['Banana', 'Cherry', 'Apple']);
  });

  test('a quick tap or swipe is not a hold', async ({ page }) => {
    await three(page);
    const a = await centre(page, row(page, 'Apple'));
    await touch(page, [a, { x: a.x, y: a.y + 40 }, { x: a.x, y: a.y + 120 }], 0);
    await page.waitForTimeout(600);
    await expect(heading(page)).toHaveText('Simple Bible Memory');
    expect(await order(page)).toEqual(['Apple', 'Banana', 'Cherry']);
  });
});

test('searching turns reordering off (only some decks are shown)', async ({ page }) => {
  await three(page);
  await page.getByRole('button', { name: 'Search decks' }).click();
  await page.getByRole('searchbox').or(page.getByPlaceholder('Search decks')).first().fill('an');
  await menu(page, 'Banana');
  await expect(page.getByRole('dialog').getByRole('button', { name: /^Move (up|down)$/ })).toHaveCount(0);
});

test('one deck alone cannot be moved, and says nothing about it', async ({ page }) => {
  await createDeck(page, 'Only');
  await page.goto('/');
  await menu(page, 'Only');
  await expect(page.getByRole('dialog').getByRole('button', { name: /^Move (up|down)$/ })).toHaveCount(0);
});

for (const scheme of ['light', 'dark'] as const) {
  test(`no accessibility violations with several decks (${scheme})`, async ({ browser }) => {
    const ctx = await browser.newContext({ colorScheme: scheme, viewport: { width: 390, height: 780 } });
    const page = await ctx.newPage();
    await three(page);
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice']).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    await page.getByRole('button', { name: 'Reorder decks' }).focus();
    await page.keyboard.press('Enter');
    await expect(heading(page)).toHaveText('Reorder decks');
    const inMode = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice']).analyze();
    expect(inMode.violations.map((v) => `${v.id}: ${v.help}`), 'while reordering').toEqual([]);
    await ctx.close();
  });
}

test.describe('in Spanish', () => {
  test.use({ locale: 'es-ES' });
  test('the menu and the hint are in Spanish', async ({ page }) => {
    for (const title of ['Uno', 'Dos']) { await page.goto('/#/decks/new'); await page.getByLabel('Título').fill(title); await page.getByRole('button', { name: 'Guardar' }).click(); await page.waitForURL(/#\/decks\/[0-9a-f-]{36}$/); }
    await page.goto('/');
    await page.getByRole('button', { name: 'Acciones de Dos' }).click();
    await expect(page.getByRole('dialog').getByRole('button', { name: 'Bajar' })).toHaveCount(0); // no Move buttons in the menu
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Reordenar carpetas' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Reordenar carpetas');
    await expect(page.getByRole('button', { name: 'Mover Uno' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Listo' })).toBeVisible();
  });
});

test('tapping outside the decks (or pressing Escape) leaves reordering', async ({ page }) => {
  await three(page);
  await hold(page, 'Apple');
  await expect(heading(page)).toHaveText('Reorder decks');
  await page.mouse.click(200, 760); // empty space below the decks
  await expect(heading(page)).toHaveText('Simple Bible Memory');
  await hold(page, 'Apple');
  await expect(heading(page)).toHaveText('Reorder decks');
  await heading(page).click(); // the top bar counts as outside too
  await expect(heading(page)).toHaveText('Simple Bible Memory');
  await hold(page, 'Apple');
  await expect(heading(page)).toHaveText('Reorder decks');
  await page.keyboard.press('Escape');
  await expect(heading(page)).toHaveText('Simple Bible Memory');
});
