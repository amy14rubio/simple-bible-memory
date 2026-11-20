import { test, expect, type Page } from '@playwright/test';
import { addCard, createDeck, setBlankDifficulty } from './helpers';

// The text size goes up to 200%. At that size nothing may run sideways, hide a title behind "…", pile controls on top of each other, or put a label on top of its field.
// (The size is set the way the app remembers it, before the page starts, as the Font page's slider would.)
const at = (page: Page, scale: number) => page.addInitScript((s) => { try { localStorage.setItem('text-scale', String(s)); } catch { /* the cache is optional */ } }, scale);

const LONG = 'The Lord is my shepherd, I shall not want; he makes me lie down in green pastures; he leads me beside quiet waters; he refreshes my soul. He guides me along the right paths for his name’s sake. Even though I walk through the darkest valley, I will fear no evil, for you are with me.';

/** What is wrong on the screen as it stands: sideways overflow, titles cut off, tappable things on top of each other. */
const problems = (page: Page) => page.evaluate(() => {
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
  const visible = (e: Element) => {
    const r = e.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    for (let p: Element | null = e; p; p = p.parentElement) { const st = getComputedStyle(p); if (st.display === 'none' || st.visibility === 'hidden' || (p as HTMLElement).inert) return false; }
    return !e.closest('.sr-only');
  };
  const name = (e: Element) => `${e.tagName.toLowerCase()} "${norm((e as HTMLElement).innerText ?? '').slice(0, 30)}"`;
  const found: string[] = [];
  const scroller = document.getElementById('app-scroll');
  if (scroller && scroller.scrollWidth - scroller.clientWidth > 1) {
    const wide = Array.from(scroller.querySelectorAll('*')).filter((e) => visible(e) && e.getBoundingClientRect().right > scroller.clientWidth + 1 && !e.closest('[class*="overflow-x"]')).slice(0, 3).map(name);
    found.push(`runs sideways by ${scroller.scrollWidth - scroller.clientWidth}px (${wide.join('; ')})`);
  }
  for (const h of Array.from(document.querySelectorAll('h1')).filter(visible)) if (h.scrollHeight > h.clientHeight + 1) found.push(`title cut off: ${name(h)}`);
  const taps = Array.from(document.querySelectorAll('a[href], button, [role=button], [role=tab], [role=radio], [role=switch], input:not([type=hidden]), select, textarea, summary')).filter(visible);
  for (let i = 0; i < taps.length; i++) for (let j = i + 1; j < taps.length; j++) {
    const a = taps[i]!, b = taps[j]!;
    if (a.contains(b) || b.contains(a)) continue;
    const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
    if (Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left) > 3 && Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top) > 3) found.push(`on top of each other: ${name(a)} and ${name(b)}`);
  }
  return found;
});

for (const size of [{ n: 'a phone', w: 390, h: 844 }, { n: 'a small phone', w: 360, h: 640 }]) {
  test(`at 200% on ${size.n}, no screen runs sideways, cuts a title off or piles controls up`, async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: size.w, height: size.h });
    await at(page, 2);
    const id = await createDeck(page, 'Psalms');
    await addCard(page, id, 'Psalm 23:1-3', LONG);
    const routes = ['/#/', `/#/collections/${id}`, `/#/collections/${id}/cards`, `/#/cards/new?collection=${id}`, `/#/collections/${id}/edit`, '/#/collections/new', '/#/stats', '/#/discover', '/#/import',
      '/#/settings', '/#/settings/theme', '/#/settings/language', '/#/settings/font', '/#/settings/card-kinds', '/#/settings/blanks', '/#/settings/voice', '/#/settings/privacy', '/#/settings/about', '/#/settings/credits',
      `/#/collections/${id}/study/flashcard`, `/#/collections/${id}/study/type`, `/#/collections/${id}/study/blanks`];
    const bad: string[] = [];
    for (const route of routes) {
      await page.goto(route);
      await page.reload();
      await page.waitForTimeout(900);
      await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))));
      for (const p of await problems(page)) bad.push(`${route.replace(id, ':id')}: ${p}`);
    }
    expect(bad).toEqual([]);
  });
}

test('a label sits beside its field at the normal size, and above it when the text is big', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const id = await createDeck(page, 'Psalms');
  const boxes = async () => { await page.goto(`/#/cards/new?collection=${id}`); await page.reload(); const label = page.getByText('Verse(s)', { exact: true }); await expect(label).toBeVisible(); return [(await label.boundingBox())!, (await page.getByLabel('Verse(s)').boundingBox())!] as const; };
  const [l1, f1] = await boxes();
  expect(f1.x, 'beside').toBeGreaterThanOrEqual(l1.x + l1.width);
  expect(Math.abs((f1.y + f1.height / 2) - (l1.y + l1.height / 2)), 'on one line').toBeLessThan(l1.height);
  await page.evaluate(() => localStorage.setItem('text-scale', '2'));
  const [l2, f2] = await boxes();
  expect(f2.y, 'below').toBeGreaterThanOrEqual(l2.y + l2.height - 1);
  expect(f2.x, 'lined up with the label').toBeLessThanOrEqual(l2.x + 2);
});

test('the study modes sit two across at the normal size and one per row when the text is big', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const id = await createDeck(page, 'Psalms');
  await addCard(page, id, 'Psalm 23:1', 'The Lord is my shepherd.');
  const tops = async () => { await page.goto(`/#/collections/${id}`); await page.reload(); await page.waitForTimeout(800); return Promise.all(['Flashcard', 'Type'].map(async (n) => (await page.getByRole('link', { name: new RegExp(`^${n}`) }).boundingBox())!.y)); };
  const normal = await tops();
  expect(Math.abs(normal[0]! - normal[1]!), 'two across').toBeLessThan(2);
  await page.evaluate(() => localStorage.setItem('text-scale', '2'));
  const big = await tops();
  expect(big[1]! - big[0]!, 'one per row').toBeGreaterThan(40);
  await expect(page.getByRole('link', { name: /^Flashcard/ })).toBeInViewport();
});

test('at 200% the whole of a long answer can be scrolled above the rating buttons', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await at(page, 2);
  const id = await createDeck(page, 'Psalms');
  await addCard(page, id, 'Psalm 23:1-4', LONG);
  await page.goto(`/#/collections/${id}/study/flashcard`);
  await page.getByRole('button', { name: 'Show answer' }).click();
  await expect(page.getByRole('button', { name: /^Good/ })).toBeVisible();
  await page.waitForTimeout(700);
  const gap = await page.evaluate(() => {
    const scroller = document.getElementById('app-scroll')!;
    scroller.scrollTop = scroller.scrollHeight;
    const good = Array.from(document.querySelectorAll('button')).find((b) => /^Good/.test(b.getAttribute('aria-label') ?? b.textContent ?? ''))!;
    const answer = Array.from(document.querySelectorAll('.scripture')).pop()!;
    return good.getBoundingClientRect().top - answer.getBoundingClientRect().bottom;
  });
  expect(gap, 'the last line ends above the rating buttons').toBeGreaterThanOrEqual(-1);
});

test('at the normal size a settings row keeps its value on the right, even when the name is long', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#/');
  await setBlankDifficulty(page, 'Extreme');
  await page.goto('/#/settings');
  const row = page.locator('a[href="#/settings/blanks"]');
  await expect(row).toBeVisible();
  const [name, value] = await Promise.all([row.locator('> span').first().boundingBox(), row.locator('> span').last().boundingBox()]);
  expect(value!.x, 'the value sits beside the name').toBeGreaterThanOrEqual(name!.x + name!.width - 1);
  expect(Math.abs(value!.y - name!.y), 'on the same line').toBeLessThan(name!.height);
});
