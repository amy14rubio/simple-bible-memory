import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { addCard, createDeck, setCardKinds } from './helpers';

type Fake = { spoken: { text: string; lang: string; rate: number }[]; heard: string[][]; micRequests: number; micAllowed: boolean; speakMs: number };

/** Queues what the fake voice will "hear", one entry per listening turn, before the page starts. */
const hear = (page: Page, ...turns: string[][]) =>
  page.addInitScript((t) => { (window as unknown as { __fakeVoice: Fake }).__fakeVoice = { spoken: [], heard: t, micRequests: 0, micAllowed: true, speakMs: 0 }; }, turns);
const said = (page: Page) => page.evaluate(() => (window as unknown as { __fakeVoice: Fake }).__fakeVoice.spoken.map((s) => s.text));

async function setup(page: Page, kinds: 'Both' | 'Recall the passage' | 'Identify the verse' = 'Recall the passage') {
  const id = await createDeck(page);
  await addCard(page, id, 'Example 1:1', 'Example verse text.');
  await setCardKinds(page, kinds);
  return id;
}

test('speak: prompts, listens, reads the verse, asks, and records the spoken rating', async ({ page }) => {
  await hear(page, ['example verse text'], ['done'], ['easy']);
  const id = await setup(page);
  await page.goto(`/#/collections/${id}/study/speak`);
  await expect(page.getByRole('heading', { name: 'Hands-free study' })).toBeVisible();
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.getByRole('heading', { name: "You're done for today!" })).toBeVisible();
  const spoken = await said(page);
  expect(spoken[0]).toBe('Example 1, verse 1.');
  expect(spoken.some((s) => s.includes('Example verse text.'))).toBe(true);
  expect(spoken.at(-1)).toBe('Got it: Easy.');
});

test('speak: the rating buttons appear with the question, and tapping one works', async ({ page }) => {
  await hear(page, ['done']);
  const id = await setup(page);
  await page.goto(`/#/collections/${id}/study/speak`);
  await page.getByRole('button', { name: 'Start' }).click();
  await page.getByRole('button', { name: /^Easy/ }).click(); // (clicking waits for it to appear)
  await expect(page.getByRole('heading', { name: "You're done for today!" })).toBeVisible();
  await expect(page.getByText('1 card reviewed')).toBeVisible();
});

test('speak: no rating buttons while the verse is being said', async ({ page }) => {
  await hear(page);
  const id = await setup(page);
  await page.goto(`/#/collections/${id}/study/speak`);
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.getByText('Listening…')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Easy/ })).toBeHidden();
  await page.getByRole('button', { name: 'Skip' }).click();
  await expect(page.getByRole('heading', { name: "You're done for today!" })).toBeVisible();
});

test('speak: saying "stop" leaves for the collection', async ({ page }) => {
  await hear(page, ['stop']);
  const id = await setup(page);
  await page.goto(`/#/collections/${id}/study/speak`);
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page).toHaveURL(new RegExp(`#/collections/${id}$`));
});

test('speak: an identify card reads the passage and asks which verse', async ({ page }) => {
  await hear(page, ['example one one'], ['done'], ['easy']);
  const id = await setup(page, 'Identify the verse');
  await page.goto(`/#/collections/${id}/study/speak`);
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.getByRole('heading', { name: "You're done for today!" })).toBeVisible();
  const spoken = await said(page);
  expect(spoken[0]).toBe('Example verse text.');
  expect(spoken).toContain('Example 1, verse 1.'); // (the dev server starts each card twice, hence not checking positions)
  expect(spoken.at(-1)).toBe('Got it: Easy.');
});

test('speak: start screen has no accessibility violations', async ({ page }) => {
  const id = await setup(page);
  await page.goto(`/#/collections/${id}/study/speak`);
  await expect(page.getByRole('heading', { name: 'Hands-free study' })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test('speak: the "i" on the start screen says why what you say is not graded', async ({ page }) => {
  await hear(page);
  const id = await setup(page);
  await page.goto(`/#/collections/${id}/study/speak`);
  await expect(page.getByText("Speak mode doesn't grade what you say.")).toHaveCount(0); // behind the i, not printed
  await page.getByRole('button', { name: 'Hands-free study' }).click();
  await expect(page.getByRole('dialog', { name: 'Hands-free study' })).toContainText("Speak mode doesn't grade what you say. Speech recognition can mishear");
  await expect(page.getByRole('dialog', { name: 'Hands-free study' })).toContainText('rate how you did');
});

for (const [width, height] of [[375, 667], [360, 640]] as const) {
  test(`the Hands-free start screen fits a ${width}x${height} phone with no scrolling, Start button in view`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await hear(page, [], [], []);
    const id = await setup(page);
    await page.goto(`/#/collections/${id}/study/speak`);
    await expect(page.getByRole('heading', { name: 'Hands-free study' })).toBeVisible();
    const start = (await page.getByRole('button', { name: 'Start' }).boundingBox())!;
    expect(start.y + start.height).toBeLessThanOrEqual(height);
    const extra = await page.evaluate(() => (() => { const a = document.getElementById('app-scroll')!; return a.scrollHeight - a.clientHeight; })());
    expect(extra).toBeLessThanOrEqual(0);
  });
}

test('on a wide screen the Start button is as wide as the list of commands', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await hear(page, [], [], []);
  const id = await setup(page);
  await page.goto(`/#/collections/${id}/study/speak`);
  const list = (await page.locator('dl').boundingBox())!;
  const start = (await page.getByRole('button', { name: 'Start' }).boundingBox())!;
  expect(Math.abs(list.width - start.width)).toBeLessThanOrEqual(1);
});
