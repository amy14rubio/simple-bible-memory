import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { addCard, createDeck, setCardKinds } from './helpers';
import { ENCOURAGEMENT } from '../src/features/study/encouragement';
import { en } from '../src/i18n/messages.en';
import { es } from '../src/i18n/messages.es';

/** The banner after a card is rated: tinted in the rating's colour, with an encouraging message, gone by itself. */
/** The banners are off in every other test (VITE_SKIP_ENCOURAGEMENT); these switch them on. */
test.beforeEach(({ page }) => page.addInitScript(() => localStorage.setItem('sbm-force-encouragement', '1')));
const banner = (page: Page) => page.locator('[data-slot="rating-banner"]');
const NAMES = { 1: 'Again', 2: 'Hard', 3: 'Good', 4: 'Easy' } as const;

async function deckToStudy(page: Page) {
  const id = await createDeck(page, 'Banner');
  for (let i = 1; i <= 5; i++) await addCard(page, id, `John 3:${i}`, `Passage number ${i}.`);
  await setCardKinds(page, 'Recall the passage');
  await page.goto(`/#/decks/${id}/study/flashcard`);
  await expect(page.getByRole('button', { name: 'Show answer' })).toBeVisible();
  return id;
}
/** Rates with the keyboard (Enter on "Show answer", then the rating's number key): a tap would have to wait for the banner to go. */
async function rate(page: Page, rating: 1 | 2 | 3 | 4) {
  await page.getByRole('button', { name: 'Show answer' }).press('Enter');
  await expect(page.getByRole('group', { name: /^Answer: / })).toBeFocused();
  await page.keyboard.press(String(rating));
}

test('each rating shows a banner with its own check mark colour and one of its own messages', async ({ page }) => {
  await deckToStudy(page);
  const seen: Record<number, string> = {};
  for (const rating of [1, 2, 3, 4] as const) {
    await rate(page, rating);
    await expect(banner(page)).toHaveAttribute('data-rating', String(rating));
    const text = (await banner(page).innerText()).trim();
    expect(ENCOURAGEMENT[rating].map((k) => en[k]), `rating ${rating}`).toContain(text);
    seen[rating] = await banner(page).locator('.rating-banner-card svg').evaluate((e) => getComputedStyle(e).color);
    await expect(banner(page)).toHaveCount(0, { timeout: 8000 }); // gone by itself
  }
  expect(new Set(Object.values(seen)).size).toBe(4); // four different check mark colours
});

test('while it is up, the buttons beneath it cannot be tapped; once it is gone they can', async ({ page }) => {
  await deckToStudy(page);
  await rate(page, 3);
  await expect(banner(page)).toBeVisible();
  await page.waitForTimeout(700); // let it finish sliding up
  const show = page.getByRole('button', { name: 'Show answer' });
  const box = (await show.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  // what is under the finger is the banner, not the button
  expect(await page.evaluate(([px, py]) => !!document.elementFromPoint(px!, py!)?.closest('[data-slot="rating-banner"]'), [x, y])).toBe(true);
  await page.mouse.click(x, y);
  await expect(page.getByRole('group', { name: /^Answer: / })).toHaveCount(0); // the tap did nothing

  await expect(banner(page)).toHaveCount(0, { timeout: 8000 });
  await page.mouse.click(x, y); // now it presses the button
  await expect(page.getByRole('group', { name: /^Answer: / })).toBeFocused();
});

test('the keyboard is not held up by it (Enter on the focused button still works)', async ({ page }) => {
  await deckToStudy(page);
  await rate(page, 3);
  await expect(banner(page)).toBeVisible();
  await page.keyboard.press('Enter'); // "Show answer" has focus on each new card
  await expect(page.getByRole('group', { name: /^Answer: / })).toBeFocused();
});

test('it is hidden from screen readers (the next card is announced instead)', async ({ page }) => {
  await deckToStudy(page);
  await rate(page, 2);
  await expect(banner(page)).toHaveAttribute('aria-hidden', 'true');
});

test('a new message replaces the last one, and never repeats back to back', async ({ page }) => {
  await deckToStudy(page);
  const messages: string[] = [];
  let lastId = '0';
  for (let i = 0; i < 5; i++) { // five cards, all Good: the messages should not repeat back to back
    await rate(page, 3);
    await expect(banner(page)).not.toHaveAttribute('data-id', lastId); // a new banner, not the old one still fading
    lastId = (await banner(page).getAttribute('data-id'))!;
    messages.push((await banner(page).innerText()).trim());
    await page.waitForTimeout(150);
  }
  for (let i = 1; i < messages.length; i++) expect(messages[i]).not.toBe(messages[i - 1]);
});

for (const scheme of ['light', 'dark'] as const) {
  test(`no accessibility violations while it is showing (${scheme})`, async ({ browser }) => {
    const ctx = await browser.newContext({ colorScheme: scheme, viewport: { width: 390, height: 780 } });
    const page = await ctx.newPage();
    await page.addInitScript(() => localStorage.setItem('sbm-force-encouragement', '1'));
    await deckToStudy(page);
    for (const rating of [1, 2, 3, 4] as const) {
      await rate(page, rating);
      await expect(banner(page)).toBeVisible();
      await page.waitForTimeout(250); // past the rise-in
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      expect(results.violations.map((v) => v.id), `rating ${rating}`).toEqual([]);
      await expect(banner(page)).toHaveCount(0, { timeout: 8000 });
    }
    await ctx.close();
  });
}

test('with reduced motion it simply appears, and is still removed', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await deckToStudy(page);
  await rate(page, 4);
  await page.waitForTimeout(300);
  expect(await banner(page).evaluate((e) => Number(getComputedStyle(e).opacity))).toBe(1);
  await expect(banner(page)).toHaveCount(0, { timeout: 8000 });
});

test.describe('the Settings switch', () => {
  test('is on by default; turning it off stops the banners, and it is remembered', async ({ page }) => {
    await page.goto('/#/settings');
    const sw = page.getByRole('switch', { name: 'Encouragement messages' });
    await expect(sw).toBeChecked();
    await sw.click();
    await expect(sw).not.toBeChecked();
    await page.waitForTimeout(400);
    await page.reload();
    await expect(page.getByRole('switch', { name: 'Encouragement messages' })).not.toBeChecked();

    await deckToStudy(page);
    await rate(page, 3);
    await page.waitForTimeout(500);
    await expect(banner(page)).toHaveCount(0);
  });
});

test('it is the toast\'s own look, and follows a custom theme: the pill is the text colour, the words are the theme\'s background colour', async ({ page }) => {
  await page.goto('/#/settings/theme');
  await page.getByRole('radio', { name: 'Custom' }).check();
  await page.getByLabel('Background, hex code').fill('#fff4e5');
  await page.getByLabel('Text, hex code').fill('#2a1a00');
  await page.waitForTimeout(1500); // the theme is saved a moment after the last change
  await deckToStudy(page);
  await rate(page, 3);
  const card = banner(page).locator('.rating-banner-card');
  await expect(card).toBeVisible();
  const style = await card.evaluate((e) => ({ pill: getComputedStyle(e).backgroundColor, words: getComputedStyle(e.querySelector('p')!).color, weight: getComputedStyle(e.querySelector('p')!).fontWeight, size: getComputedStyle(e.querySelector('p')!).fontSize, font: getComputedStyle(e.querySelector('p')!).fontFamily, bodyFont: getComputedStyle(document.body).fontFamily }));
  expect(style.pill).toBe('rgb(42, 26, 0)'); // the colour chosen for text
  expect(style.words).toBe('rgb(255, 244, 229)'); // the theme's own background colour, whatever the rating (no rating tints in a custom theme)
  expect(style.weight).toBe('500'); // medium, like the other toasts, not bold
  expect(style.size).toBe('15px'); // 0.9375rem, like the other toasts
  expect(style.font).toBe(style.bodyFont); // the app's own font
});

test('the icon is always a check mark, whatever the rating', async ({ page }) => {
  await deckToStudy(page);
  for (const rating of [1, 2, 3, 4] as const) {
    await rate(page, rating);
    await expect(banner(page).locator('svg.lucide-circle-check')).toBeVisible();
    await expect(banner(page)).toHaveCount(0, { timeout: 8000 });
  }
});

test.describe('in Spanish', () => {
  test.use({ locale: 'es-ES' });
  test('the message is Spanish', async ({ page }) => {
    await page.goto('/#/decks/new');
    await page.getByLabel('Título').fill('Mensajes');
    await page.getByRole('button', { name: 'Guardar' }).click();
    await page.waitForURL(/#\/decks\/[0-9a-f-]{36}$/);
    const id = page.url().match(/#\/decks\/([0-9a-f-]{36})$/)![1]!;
    await page.goto(`/#/cards/new?deck=${id}`);
    await page.getByLabel('Versículo(s)').fill('Juan 3:16');
    await page.getByLabel('Pasaje', { exact: true }).fill('Porque de tal manera amó Dios al mundo.');
    await page.getByRole('button', { name: 'Guardar' }).click();
    await page.waitForTimeout(600);
    await page.goto(`/#/decks/${id}/study/flashcard`);
    await page.getByRole('button', { name: 'Mostrar respuesta' }).click();
    await page.getByRole('button', { name: /^Bien/ }).click();
    const text = (await banner(page).innerText()).trim();
    expect(ENCOURAGEMENT[3].map((k) => es[k] as string)).toContain(text);
  });
});

test('it has no outline, and stays up long enough to read', async ({ page }) => {
  await deckToStudy(page);
  await rate(page, 1);
  const card = banner(page).locator('.rating-banner-card');
  await expect(card).toBeVisible();
  expect(await card.evaluate((e) => getComputedStyle(e).boxShadow)).not.toMatch(/inset/); // just the toast's soft shadow
  expect(await card.evaluate((e) => getComputedStyle(e).borderTopWidth)).toBe('0px');
  await page.waitForTimeout(2200);
  await expect(banner(page)).toBeVisible(); // still there after more than two seconds
  await expect(banner(page)).toHaveCount(0, { timeout: 4000 }); // and gone by about three
});

test('the words and the check mark are the colour of the rating chosen', async ({ page }) => {
  await deckToStudy(page);
  const seen: Record<number, string> = {};
  for (const rating of [1, 2, 3, 4] as const) {
    await rate(page, rating);
    const card = banner(page).locator('.rating-banner-card');
    await expect(card).toBeVisible();
    const [words, check] = await card.evaluate((e) => [getComputedStyle(e.querySelector('p')!).color, getComputedStyle(e.querySelector('svg')!).color]);
    expect(words).toBe(check); // the same colour for both
    seen[rating] = words;
    await expect(banner(page)).toHaveCount(0, { timeout: 8000 });
  }
  expect(seen).toEqual({ 1: 'rgb(255, 176, 171)', 2: 'rgb(255, 198, 115)', 3: 'rgb(153, 235, 187)', 4: 'rgb(181, 226, 255)' }); // red, orange, green, blue
});
