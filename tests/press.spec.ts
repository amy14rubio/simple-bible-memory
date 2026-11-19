import { test, expect } from '@playwright/test';
import { createDeck } from './helpers';

test('buttons shrink a little while pressed and spring back when let go', async ({ page }) => {
  await page.goto('/#/settings');
  const back = page.getByRole('link', { name: 'Back' }); // an icon link
  const scale = (loc: typeof back) => loc.evaluate((el) => new DOMMatrixReadOnly(getComputedStyle(el).transform === 'none' ? undefined : getComputedStyle(el).transform).a);
  expect(await scale(back)).toBe(1);
  const box = (await back.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect.poll(() => scale(back)).toBeLessThan(0.97); // held: smaller
  await page.mouse.move(box.x + 200, box.y + 300); // let go somewhere else, so the link is not followed
  await page.mouse.up();
  await expect.poll(() => scale(back)).toBeCloseTo(1, 2); // settled back to normal size
});

test('with reduced motion, buttons do not move when pressed', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto('/#/settings');
  const back = page.getByRole('link', { name: 'Back' });
  const box = (await back.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(200);
  expect(await back.evaluate((el) => getComputedStyle(el).transform)).toBe('none');
  await page.mouse.move(box.x + 200, box.y + 300);
  await page.mouse.up();
  await ctx.close();
});

test('other tappable things (rows, the "i") answer a press too, and the "i" has its own bigger squeeze', async ({ page }) => {
  await page.goto('/#/settings');
  const row = page.getByRole('link', { name: /^Language/ });
  const scaleOf = (loc: typeof row, sel?: string) => loc.evaluate((el, s) => { const css = getComputedStyle(s ? el.querySelector(s)! : el); const t = css.transform; const sc = css.scale; return t !== 'none' ? new DOMMatrixReadOnly(t).a : sc === 'none' ? 1 : Number(sc.split(' ')[0]); }, sel);
  const rowBox = (await row.boundingBox())!;
  await page.mouse.move(rowBox.x + rowBox.width / 2, rowBox.y + rowBox.height / 2);
  await page.mouse.down();
  await expect.poll(() => scaleOf(row)).toBeLessThan(1);
  await page.mouse.move(rowBox.x + 5, rowBox.y + 1000 > 800 ? 5 : rowBox.y + 1000);
  await page.mouse.up();

  const info = page.getByRole('button', { name: 'New cards per day', exact: true });
  const infoBox = (await info.boundingBox())!;
  await page.mouse.move(infoBox.x + 10, infoBox.y + infoBox.height / 2);
  await page.mouse.down();
  await expect.poll(() => scaleOf(info, 'svg')).toBeLessThan(0.8); // the icon squeezes
  expect(await scaleOf(info)).toBe(1); // the words around it stay put
  await page.mouse.move(5, 5);
  await page.mouse.up();
});

test('popups come in and go out with a transition instead of just appearing', async ({ page }) => {
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort());
  await page.goto('/#/settings/font');
  const trigger = page.getByRole('button', { name: /^Font:/ });
  const dialog = page.getByRole('dialog');
  // in the first frame after opening it is still on its way in (not fully there yet)...
  const early = await trigger.evaluate((el) => new Promise<number>((resolve) => {
    (el as HTMLElement).click();
    requestAnimationFrame(() => resolve(Number(getComputedStyle(document.querySelector('dialog[open]')!).opacity)));
  }));
  expect(early).toBeLessThan(1);
  // ...and then it settles
  await expect.poll(() => dialog.evaluate((el) => Number(getComputedStyle(el).opacity))).toBe(1);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test("the collection popup keeps its collection's name while it fades out (it never flashes the word 'Collection')", async ({ page }) => {
  const id = await createDeck(page, 'Alpha');
  await page.goto(`/#/collections/${id}`);
  await page.getByRole('button', { name: 'Collection actions' }).click();
  await expect(page.locator('dialog[open]')).toHaveAttribute('aria-label', 'Alpha');
  await page.waitForTimeout(500);
  const seen = await page.evaluate(() => new Promise<string[]>((resolve) => {
    const d = document.querySelector('dialog[open]')!;
    const names = new Set<string>();
    const start = performance.now();
    const tick = () => {
      names.add(d.getAttribute('aria-label') ?? '');
      if (performance.now() - start < 500) requestAnimationFrame(tick); else resolve([...names]);
    };
    (d as HTMLDialogElement).close();
    tick();
  }));
  expect(seen).toEqual(['Alpha']);
});

test('while a popup is open the page behind it does not scroll, even when the list inside reaches its end', async ({ page }) => {
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort());
  await page.goto('/#/settings/font');
  await page.evaluate(() => { document.body.style.minHeight = '4000px'; });
  await page.getByRole('button', { name: /^Font:/ }).click();
  await expect(page.locator('dialog[open]')).toBeVisible();
  const list = page.locator('dialog[open] ul');
  await list.hover();
  for (let i = 0; i < 12; i++) await page.mouse.wheel(0, 600); // far past the end of the list
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await page.mouse.move(5, 5); // over the dimmed background
  for (let i = 0; i < 4; i++) await page.mouse.wheel(0, 600);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await page.mouse.wheel(0, 600); // and with the popup gone, the page scrolls again
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
});
