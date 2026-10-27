import { test, expect } from '@playwright/test';

/** The design is a phone's. A tablet or a computer gets the same design, bigger: text, spacing, icons and the column all grow together. */
const root = (page: import('@playwright/test').Page) => page.evaluate(() => ({
  scale: getComputedStyle(document.documentElement).getPropertyValue('--ui-scale').trim(),
  font: parseFloat(getComputedStyle(document.documentElement).fontSize),
}));

const SIZES = [
  { name: 'a phone', width: 390, height: 844, scale: '1', font: 16 },
  { name: 'a phone turned sideways', width: 844, height: 390, scale: '1', font: 16 },
  { name: 'a tablet standing up', width: 820, height: 1180, scale: '1.2', font: 19.2 },
  { name: 'a tablet lying down', width: 1180, height: 820, scale: '1.35', font: 21.6 },
  { name: 'a computer', width: 1440, height: 900, scale: '1.35', font: 21.6 },
];

for (const s of SIZES) {
  test(`${s.name} (${s.width} x ${s.height}) is shown at ${s.scale}x`, async ({ page }) => {
    await page.setViewportSize({ width: s.width, height: s.height });
    await page.goto('/#/settings');
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    expect(await root(page)).toEqual({ scale: s.scale, font: s.font });
  });
}

test('the column, the rows and the icons grow with the screen, and nothing overflows sideways', async ({ page }) => {
  const measure = async () => page.evaluate(() => ({
    column: (document.querySelector('main')!.parentElement as HTMLElement).getBoundingClientRect().width,
    icon: document.querySelector('main svg.lucide')!.getBoundingClientRect().width,
    row: ([...document.querySelectorAll('main a')].find((a) => a.textContent?.startsWith('Font')) as HTMLElement).getBoundingClientRect().height,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/#/settings');
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  const big = await measure();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(100);
  const small = await measure();
  expect(big.column / small.column).toBeGreaterThan(1.9); // the column is wider than a phone's: a 672px cap grown by 1.35 (907px)
  expect(big.icon / small.icon).toBeCloseTo(1.35, 1);
  expect(big.row / small.row).toBeCloseTo(1.35, 1);
  expect(big.overflow).toBeLessThanOrEqual(0);
  expect(small.overflow).toBeLessThanOrEqual(0);
});
