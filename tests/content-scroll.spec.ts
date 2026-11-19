import { test, expect } from '@playwright/test';
import { createDeck } from './helpers';

test.use({ viewport: { width: 430, height: 700 } });

test('only the content scrolls: the scrolling area sits exactly between the top bar and the bottom tabs, and the page itself never scrolls', async ({ page }) => {
  for (let i = 0; i < 14; i++) await createDeck(page, `Collection ${i + 1}`);
  await page.goto('/#/');
  await expect(page.getByText('Collection 1', { exact: true })).toBeVisible();

  const geometry = () => page.evaluate(() => {
    const area = document.getElementById('app-scroll')!.getBoundingClientRect();
    const bar = document.querySelector('header')!.getBoundingClientRect();
    const tabs = document.querySelector('nav[aria-label="Main"]')!.getBoundingClientRect();
    const root = document.documentElement;
    return { areaTop: area.top, areaBottom: area.bottom, barBottom: bar.bottom, tabsTop: tabs.top, pageOverflow: root.scrollHeight - root.clientHeight, pageScroll: root.scrollTop + document.body.scrollTop };
  });
  const before = await geometry();
  expect(before.areaTop).toBeCloseTo(before.barBottom, 0); // the scrollbar starts under the top bar
  expect(before.areaBottom).toBeCloseTo(before.tabsTop, 0); // and ends above the tabs
  expect(before.pageOverflow).toBeLessThanOrEqual(0); // nothing for the page itself to scroll

  // scroll the content: the bars stay where they are
  await page.mouse.move(215, 350);
  await page.mouse.wheel(0, 500);
  await expect.poll(() => page.evaluate(() => document.getElementById('app-scroll')!.scrollTop)).toBeGreaterThan(100);
  const after = await geometry();
  expect(after.barBottom).toBeCloseTo(before.barBottom, 0);
  expect(after.tabsTop).toBeCloseTo(before.tabsTop, 0);
  expect(after.pageScroll).toBe(0);
});

test('other screens: the top bar stays put while a long screen scrolls', async ({ page }) => {
  await page.goto('/#/settings');
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
  const barTop = () => page.evaluate(() => document.querySelector('header')!.getBoundingClientRect().top);
  await page.mouse.move(215, 350);
  await page.mouse.wheel(0, 3000);
  await expect.poll(() => page.evaluate(() => document.getElementById('app-scroll')!.scrollTop)).toBeGreaterThan(100);
  expect(await barTop()).toBe(0);
});
