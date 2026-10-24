import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { addCard, createDeck, setCardKinds } from './helpers';

/** A long verse does not fit on a phone next to the word bank, the answer options or the Speak status: these checks are at phone sizes. */
const LONG = 'The LORD is my shepherd; I shall lack nothing. He makes me lie down in green pastures. He leads me beside still waters. He restores my soul. He guides me in the paths of righteousness for his name’s sake. Even though I walk through the valley of the shadow of death, I will fear no evil, for you are with me. Your rod and your staff, they comfort me. You prepare a table before me in the presence of my enemies. You anoint my head with oil. My cup runs over. Surely goodness and loving kindness shall follow me all the days of my life, and I will dwell in the LORD’s house forever.';

const SIZES = [{ width: 390, height: 844 }, { width: 360, height: 640 }];

/** A phone's gesture bar (34px) at the bottom, the way the Android app reports it. */
const withGestureBar = (page: Page) => page.addStyleTag({ content: ':root{--safe-area-inset-bottom:34px}' });

async function deckWithLongVerse(page: Page, kinds: 'Recall the passage' | 'Identify the verse') {
  const id = await createDeck(page, 'Long');
  await addCard(page, id, 'Psalm 23:1-6', LONG);
  await addCard(page, id, 'John 3:16', 'For God so loved the world, that he gave his only born Son.');
  await addCard(page, id, 'Psalm 22:1-6', 'My God, my God, why have you forsaken me?');
  await addCard(page, id, 'Psalm 24:1-6', 'The earth is the LORD’s, with its fullness.');
  await setCardKinds(page, kinds);
  return id;
}

/** The part of the screen a person can see while studying: below the header, above the pinned bar. */
const visibleZone = (page: Page) => page.evaluate(() => ({
  top: document.querySelector('header')!.getBoundingClientRect().bottom,
  bottom: document.querySelector('[data-action-bar]')!.getBoundingClientRect().top,
}));

for (const size of SIZES) {
  test.describe(`${size.width}x${size.height}`, () => {
    test.use({ viewport: size, reducedMotion: 'reduce' });

    test('fill in the blanks: the current blank stays in view as blanks are filled, with the word bank pinned below', async ({ page }) => {
      const id = await deckWithLongVerse(page, 'Recall the passage');
      await page.goto(`/#/decks/${id}/study/blanks`);
      await withGestureBar(page);
      // the first card may be either verse (the order is random): wait for the long one by retrying from the deck page
      for (let tries = 0; tries < 12 && !(await page.getByText('Psalm 23:1-6', { exact: true }).isVisible()); tries++) {
        await page.goto('/#/'); await page.goto(`/#/decks/${id}/study/blanks`);
      }
      await expect(page.getByText('Psalm 23:1-6', { exact: true })).toBeVisible();
      const bank = page.getByRole('group', { name: 'Word bank' });
      for (let step = 0; step < 10; step++) {
        const blank = page.locator('[aria-current="step"]');
        await expect.poll(async () => {
          const zone = await visibleZone(page);
          const box = (await blank.boundingBox())!;
          return box.y >= zone.top && box.y + box.height <= zone.bottom;
        }, { message: `blank ${step + 1} is in view`, timeout: 5000 }).toBe(true);
        const bankBox = (await bank.boundingBox())!;
        expect(bankBox.y + bankBox.height).toBeLessThanOrEqual(size.height - 30); // the bank has room below it, above the gesture bar
        await bank.getByRole('button').first().click();
      }
    });

    test('choose the reference: the options are pinned at the bottom with room below them, the passage scrolls above', async ({ page }) => {
      const id = await deckWithLongVerse(page, 'Identify the verse');
      await page.goto(`/#/decks/${id}/study/blanks`);
      await withGestureBar(page);
      for (let tries = 0; tries < 12 && !(await page.getByText(/shepherd; I shall lack nothing/).isVisible()); tries++) {
        await page.goto('/#/'); await page.goto(`/#/decks/${id}/study/blanks`);
      }
      const options = page.getByRole('group', { name: 'Choose the verse' }).getByRole('button');
      await expect(options.first()).toBeVisible();
      const last = (await options.last().boundingBox())!;
      expect(size.height - (last.y + last.height)).toBeGreaterThanOrEqual(24); // padding below the last option (it used to touch the edge)
      for (let i = 0; i < (await options.count()); i++) await expect(options.nth(i)).toBeInViewport(); // every option reachable without scrolling
      await options.first().click();
      await expect(page.getByRole('button', { name: /^Good|^Again/ }).first()).toBeInViewport(); // the rating buttons join them
    });
  });
}

test.describe('Speak with a long verse', () => {
  test.use({ viewport: SIZES[0], reducedMotion: 'reduce' });

  test('the status and buttons stay on screen and the start of the verse is brought into view when it is read', async ({ page }) => {
    await page.addInitScript(() => { (window as unknown as { __fakeVoice: unknown }).__fakeVoice = { spoken: [], heard: [['done']], micRequests: 0, micAllowed: true, speakMs: 3000 }; });
    const id = await deckWithLongVerse(page, 'Recall the passage');
    // only the long verse matters here: open the deck's study screen until the long one comes first
    await page.goto(`/#/decks/${id}/study/speak`);
    await withGestureBar(page);
    await page.getByRole('button', { name: 'Start' }).click();
    await expect(page.getByText('Here is the verse')).toBeVisible({ timeout: 15_000 });
    const zone = await visibleZone(page);
    const status = (await page.getByText('Here is the verse').boundingBox())!;
    expect(status.y).toBeGreaterThan(zone.bottom - 400); // the status is part of the pinned bar, not far below a long verse
    await expect(page.getByRole('button', { name: 'Skip' })).toBeInViewport();
    expect(await page.evaluate(() => document.querySelector('[data-action-bar]')!.getBoundingClientRect().bottom)).toBeLessThanOrEqual(844);
  });
});

test.describe('Speak status', () => {
  test.use({ viewport: SIZES[0], reducedMotion: 'reduce' });

  test('the mic and the status text sit in the horizontal centre of the screen', async ({ page }) => {
    await page.addInitScript(() => { (window as unknown as { __fakeVoice: unknown }).__fakeVoice = { spoken: [], heard: [['x'], ['x'], ['x'], ['x'], ['x'], ['x']], micRequests: 0, micAllowed: true, speakMs: 100 }; });
    const id = await deckWithLongVerse(page, 'Recall the passage');
    await page.goto(`/#/decks/${id}/study/speak`);
    await page.getByRole('button', { name: 'Start' }).click();
    await expect(page.getByText('Listening…')).toBeVisible();
    const gaps = await page.evaluate(() => {
      const row = document.querySelector('[role=status]')!.parentElement!.parentElement!;
      const kids = Array.from(row.children).map((c) => c.getBoundingClientRect());
      return { left: kids[0]!.left, right: window.innerWidth - kids[kids.length - 1]!.right };
    });
    expect(Math.abs(gaps.left - gaps.right)).toBeLessThanOrEqual(2); // the same space on both sides
  });
});

test('the study screens with a long verse have no accessibility violations', async ({ page }) => {
  const id = await deckWithLongVerse(page, 'Recall the passage');
  await page.goto(`/#/decks/${id}/study/blanks`);
  await expect(page.getByRole('group', { name: 'Word bank' })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
