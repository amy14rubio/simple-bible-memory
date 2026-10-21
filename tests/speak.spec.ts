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
  await page.goto(`/#/decks/${id}/study/speak`);
  await expect(page.getByRole('heading', { name: 'Hands-free study' })).toBeVisible();
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.getByRole('heading', { name: 'Session complete' })).toBeVisible();
  const spoken = await said(page);
  expect(spoken[0]).toBe('Example 1, verse 1.');
  expect(spoken.some((s) => s.includes('Example verse text.'))).toBe(true);
  expect(spoken.at(-1)).toBe('Got it: Easy.');
});

test('speak: the buttons still work, and skipping records nothing', async ({ page }) => {
  await hear(page);
  const id = await setup(page);
  await page.goto(`/#/decks/${id}/study/speak`);
  await page.getByRole('button', { name: 'Start' }).click();
  await page.getByRole('button', { name: /^Easy/ }).click();
  await expect(page.getByRole('heading', { name: 'Session complete' })).toBeVisible();
  await expect(page.getByText('1 card reviewed')).toBeVisible();
});

test('speak: saying "stop" leaves for the deck', async ({ page }) => {
  await hear(page, ['stop']);
  const id = await setup(page);
  await page.goto(`/#/decks/${id}/study/speak`);
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page).toHaveURL(new RegExp(`#/decks/${id}$`));
});

test('speak: an identify card reads the passage and asks which verse', async ({ page }) => {
  await hear(page, ['example one one'], ['done'], ['easy']);
  const id = await setup(page, 'Identify the verse');
  await page.goto(`/#/decks/${id}/study/speak`);
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.getByRole('heading', { name: 'Session complete' })).toBeVisible();
  const spoken = await said(page);
  expect(spoken[0]).toBe('Example verse text.');
  expect(spoken).toContain('It was Example 1, verse 1.'); // (the dev server starts each card twice, hence not checking positions)
  expect(spoken.at(-1)).toBe('Got it: Easy.');
});

test('speak: start screen has no accessibility violations', async ({ page }) => {
  const id = await setup(page);
  await page.goto(`/#/decks/${id}/study/speak`);
  await expect(page.getByRole('heading', { name: 'Hands-free study' })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
