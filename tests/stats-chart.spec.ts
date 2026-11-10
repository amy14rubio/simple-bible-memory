import { test, expect, type Page } from '@playwright/test';
import { addCard, createDeck } from './helpers';

const legend = (page: Page) => page.getByRole('group', { name: /^(Highlight a stage in the chart|Resalta una etapa en el gráfico)$/ });
const legendItems = async (page: Page) => (await legend(page).getByRole('button').allInnerTexts()).map((t) => t.trim());
const label = (page: Page) => page.getByRole('status').filter({ hasText: /\S/ });

/** One verse studied once with Easy: of its 2 study cards, 1 is young. Another verse is untouched. So: 3 new, 0 learning, 1 young, 0 mature. */
async function deckWithProgress(page: Page) {
  const id = await createDeck(page, 'Chart deck');
  await addCard(page, id, 'John 3:16', 'Example one.');
  await addCard(page, id, 'Psalm 23:1', 'Example two.');
  await page.goto(`/#/decks/${id}/study/flashcard`);
  await page.getByRole('button', { name: 'Show answer' }).click();
  await page.getByRole('button', { name: /^Easy/ }).click();
  await expect(page.getByRole('list', { name: 'Cards remaining' })).toContainText('New: 3');
  await page.goto('/#/stats');
  await expect(legend(page)).toBeVisible();
}

type Stage = 'new' | 'learning' | 'young' | 'mature';

/** A point that is really inside the slice for this stage, or null if the stage has no area (no cards). */
const pointInSlice = (page: Page, stage: Stage) =>
  page.evaluate((key) => {
    const el = document.querySelector(`.recharts-pie-sector:has(path[fill="var(--color-${key})"])`);
    if (!el) return null;
    el.scrollIntoView({ block: 'center' }); // hit-testing only works on what is on screen
    const b = el.getBoundingClientRect();
    for (let y = b.top + 2; y < b.bottom - 2; y += 2) for (let x = b.left + 2; x < b.right - 2; x += 2) if (document.elementFromPoint(x, y)?.closest('.recharts-pie-sector') === el) return { x, y };
    return null;
  }, stage);

/** Computed transform and opacity of each drawn slice, by stage. Stages with no cards are not drawn, so they are absent. */
const sliceState = (page: Page) =>
  page.evaluate(() => {
    const out: Record<string, { transform: string; opacity: string }> = {};
    for (const path of document.querySelectorAll('.recharts-pie-sector path')) {
      const key = /--color-(\w+)/.exec(path.getAttribute('fill') ?? '')?.[1];
      if (!key) continue;
      const cs = getComputedStyle(path);
      out[key] = { transform: cs.transform, opacity: cs.opacity };
    }
    return out;
  });
const allNormal = async (page: Page) => Object.values(await sliceState(page)).every((s) => s.opacity === '1');

test.describe('the pie', () => {
  test('is a filled pie with a legend underneath, in learning order, with the numbers', async ({ page }) => {
    await deckWithProgress(page);
    expect(await legendItems(page)).toEqual(['New 3', 'Learning 0', 'Young 1', 'Mature 0']);

    const visible = await page.evaluate(() => [...document.querySelectorAll('.recharts-pie-sector')].filter((el) => { const b = el.getBoundingClientRect(); return b.width > 4 && b.height > 4; }).length);
    expect(visible).toBe(2); // stages with 0 cards take up no space

    // a pie, not a ring: points just around the very middle are all part of a slice
    const middleIsSlice = await page.evaluate(() => {
      const sectors = [...document.querySelectorAll('.recharts-pie-sector')];
      sectors[0]?.scrollIntoView({ block: 'center' });
      const boxes = sectors.map((el) => el.getBoundingClientRect()).filter((b) => b.width > 4);
      const cx = (Math.min(...boxes.map((b) => b.left)) + Math.max(...boxes.map((b) => b.right))) / 2;
      const cy = (Math.min(...boxes.map((b) => b.top)) + Math.max(...boxes.map((b) => b.bottom))) / 2;
      return [0, 1, 2, 3, 4, 5, 6, 7].every((i) => {
        const a = (i * Math.PI) / 4;
        return !!document.elementFromPoint(cx + Math.cos(a) * 12, cy + Math.sin(a) * 12)?.closest('.recharts-pie-sector');
      });
    });
    expect(middleIsSlice).toBe(true);
  });

  test('is described in words for screen readers, with the same numbers', async ({ page }) => {
    await deckWithProgress(page);
    await expect(page.getByRole('img', { name: 'Cards by stage: 3 new, 0 learning, 1 young, 0 mature' })).toBeVisible();
  });

  test('with no cards it shows an empty disc and zeros, not a blank space', async ({ page }) => {
    await createDeck(page, 'Empty deck');
    await page.goto('/#/stats');
    await expect(legend(page)).toBeVisible();
    expect(await legendItems(page)).toEqual(['New 0', 'Learning 0', 'Young 0', 'Mature 0']);
    const visible = await page.evaluate(() => [...document.querySelectorAll('.recharts-pie-sector')].filter((el) => el.getBoundingClientRect().width > 4).length);
    expect(visible).toBe(1); // just the grey placeholder disc
    await legend(page).getByRole('button', { name: /New/ }).click();
    await expect(label(page)).toHaveText('New: 0 cards (0%)'); // no division by zero
  });
});

test.describe('tapping the pie', () => {
  test('tapping a slice pops it out, fades the others, and shows a label', async ({ page }) => {
    await deckWithProgress(page);
    const before = await sliceState(page);
    expect(await allNormal(page)).toBe(true);

    const p = (await pointInSlice(page, 'new'))!; // the big New slice
    await page.mouse.click(p.x, p.y);
    await expect(label(page)).toHaveText('New: 3 cards (75%)');
    await expect(legend(page).getByRole('button', { name: /^New/ })).toHaveAttribute('aria-pressed', 'true');
    await page.waitForTimeout(400); // let it finish sliding
    const after = await sliceState(page);
    expect(after.new!.transform).not.toBe(before.new!.transform); // the New slice moved outward
    expect(after.new!.opacity).toBe('1');
    expect(after.young!.opacity).toBe('0.45'); // the Young slice is faded
  });

  test('tapping the same slice again, or empty space, clears it', async ({ page }) => {
    await deckWithProgress(page);
    const p = (await pointInSlice(page, 'new'))!;
    await page.mouse.click(p.x, p.y);
    await expect(label(page)).toBeVisible();
    await page.mouse.click(p.x, p.y);
    await expect(label(page)).toHaveCount(0);

    await page.mouse.click(p.x, p.y);
    await expect(label(page)).toBeVisible();
    const box = (await page.getByRole('img', { name: /^Cards by stage/ }).boundingBox())!;
    await page.mouse.click(box.x + 3, box.y + 3); // the corner of the chart area, outside the pie
    await expect(label(page)).toHaveCount(0);
    expect(await allNormal(page)).toBe(true);
  });

  test('tapping a different slice switches to it', async ({ page }) => {
    await deckWithProgress(page);
    const a = (await pointInSlice(page, 'new'))!;
    const b = (await pointInSlice(page, 'young'))!;
    await page.mouse.click(a.x, a.y);
    await expect(label(page)).toHaveText(/^New:/);
    await page.mouse.click(b.x, b.y);
    await expect(label(page)).toHaveText('Young: 1 card (25%)'); // singular "card"
    await expect(legend(page).getByRole('button', { name: /^Young/ })).toHaveAttribute('aria-pressed', 'true');
    await expect(legend(page).getByRole('button', { name: /^New/ })).toHaveAttribute('aria-pressed', 'false');
  });

  test('the label goes away by itself after a few seconds', async ({ page }) => {
    await deckWithProgress(page);
    const p = (await pointInSlice(page, 'new'))!;
    await page.mouse.click(p.x, p.y);
    await expect(label(page)).toBeVisible();
    await page.waitForTimeout(2000);
    await expect(label(page)).toBeVisible(); // still there at 2s
    await expect(label(page)).toHaveCount(0, { timeout: 4000 }); // gone by about 3s
    expect(await allNormal(page)).toBe(true); // and the pie is back to normal
  });

  test('works with a finger: a touch tap on a slice', async ({ browser }) => {
    const ctx = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await deckWithProgress(page);
    const p = (await pointInSlice(page, 'young'))!;
    await page.touchscreen.tap(p.x, p.y);
    await expect(label(page)).toHaveText('Young: 1 card (25%)');
    await ctx.close();
  });

  test('the legend items do the same, and are easy to reach with a finger', async ({ page }) => {
    await deckWithProgress(page);
    const young = legend(page).getByRole('button', { name: /^Young/ });
    const box = (await young.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(36); // a comfortable tap target
    await young.click();
    await expect(label(page)).toHaveText('Young: 1 card (25%)');
    await page.waitForTimeout(400);
    const state = await sliceState(page);
    expect(state.young!.transform).not.toBe(state.new!.transform); // the Young slice moved
    await young.click();
    await expect(label(page)).toHaveCount(0);
  });

  test('selecting a stage with no cards shows its label without fading the pie', async ({ page }) => {
    await deckWithProgress(page);
    await legend(page).getByRole('button', { name: /^Mature/ }).click();
    await expect(label(page)).toHaveText('Mature: 0 cards (0%)');
    await page.waitForTimeout(300);
    expect(await allNormal(page)).toBe(true); // nothing to highlight, so nothing fades
  });

  test('is fully usable with the keyboard', async ({ page }) => {
    await deckWithProgress(page);
    const learning = legend(page).getByRole('button', { name: /^Learning/ });
    await learning.focus();
    await page.keyboard.press('Enter');
    await expect(learning).toHaveAttribute('aria-pressed', 'true');
    await expect(label(page)).toHaveText('Learning: 0 cards (0%)');
    await page.keyboard.press('Space');
    await expect(learning).toHaveAttribute('aria-pressed', 'false');
  });

  test('the label is announced to screen readers (it is a status region) and reserves its space', async ({ page }) => {
    await deckWithProgress(page);
    const status = page.getByRole('status').last();
    const heightBefore = (await status.boundingBox())!.height;
    expect(heightBefore).toBeGreaterThanOrEqual(24); // room is kept even when empty
    await legend(page).getByRole('button', { name: /^New/ }).click();
    await expect(label(page)).toBeVisible();
    expect((await status.boundingBox())!.height).toBe(heightBefore); // the page does not jump
  });
});

test('everything is in Spanish when the app is: legend, group name and the label', async ({ browser }) => {
  const ctx = await browser.newContext({ locale: 'es-ES' });
  const page = await ctx.newPage();
  await page.goto('/#/decks/new');
  await page.getByLabel('Título').fill('Carpeta');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await page.waitForURL(/#\/decks\/[0-9a-f-]{36}$/);
  await page.goto('/#/stats');
  await expect(legend(page)).toBeVisible();
  expect(await legendItems(page)).toEqual(['Nuevas 0', 'En aprendizaje 0', 'Jóvenes 0', 'Maduras 0']);
  await legend(page).getByRole('button', { name: /^Nuevas/ }).click();
  await expect(label(page)).toHaveText(/^Nuevas: 0 tarjetas \(0\s?%\)$/);
  await ctx.close();
});

test('the charting library is only loaded when Statistics is opened', async ({ page }) => {
  const requested: string[] = [];
  page.on('request', (r) => requested.push(r.url()));
  await page.goto('/');
  await expect(page.getByText('No decks yet')).toBeVisible();
  await page.goto('/#/settings');
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  expect(requested.filter((u) => /recharts/i.test(u))).toEqual([]);

  await createDeck(page, 'Lazy');
  await page.goto('/#/stats');
  await expect(legend(page)).toBeVisible();
  expect(requested.some((u) => /recharts/i.test(u))).toBe(true);
});
