import { test, expect, type Page, type Locator } from '@playwright/test';
import { addCard, createDeck, openDeck } from './helpers';

/** With the text at its biggest on a small phone, every drawer's buttons can still be reached by a finger. */
test.use({ viewport: { width: 360, height: 480 } });

/** Set the text size the way a person does (the slider in Settings > Font). */
async function setTextSize(page: Page, percent: number) {
  await page.goto('/#/settings/font');
  await page.getByLabel('Text size').fill(String(percent));
  await page.waitForTimeout(500); // saved shortly after
  expect(await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize))).toBeCloseTo(16 * (percent / 100), 0);
}

/**
 * A person cannot use a program-made scroll (Playwright's scrollIntoView works even on a box that does not scroll), so this asks the
 * real question: is the button on the screen already, or is there a box around it that a finger can scroll? Then it is scrolled
 * with the mouse wheel, as a finger would, and must end up fully visible and unblocked.
 */
async function reachableByFinger(page: Page, dialog: Locator, target: Locator) {
  const scroller = await dialog.evaluateHandle((d, ) => {
    const els = [d, ...d.querySelectorAll('*')] as HTMLElement[];
    return els.find((e) => e.scrollHeight > e.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(e).overflowY)) ?? null;
  });
  const vh = page.viewportSize()!.height;
  const fits = async () => { const b = await target.boundingBox(); return !!b && b.y >= 0 && b.y + b.height <= vh; };
  if (!(await fits())) {
    expect(await scroller.evaluate((e) => !!e), 'it is off the screen and nothing around it scrolls').toBe(true);
    const box = (await dialog.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, 2000);
    await page.waitForTimeout(300);
  }
  expect(await fits(), 'fully on the screen').toBe(true);
  await target.click({ trial: true }); // fails if something sits on top of it
}

for (const size of [100, 125, 150]) {
  test(`the community rules drawer: Agree and publish can be reached at ${size}% text`, async ({ page }) => {
    await setTextSize(page, size);
    const id = await createDeck(page, 'Psalm 23');
    await addCard(page, id, 'Psalm 23:1', 'The Lord is my shepherd; I shall not want.');
    await page.goto(`/#/decks/${id}/edit`);
    await page.getByRole('button', { name: /^Translation:/ }).click();
    await page.getByRole('dialog', { name: 'Choose a translation' }).getByRole('button', { name: /King James Version/ }).click();
    await page.getByRole('button', { name: 'Save' }).click();
    await openDeck(page, id);
    await page.getByRole('button', { name: 'Deck actions' }).click();
    await page.getByRole('button', { name: 'Publish deck' }).click();
    const publish = page.getByRole('dialog', { name: 'Publish deck' });
    await publish.getByRole('button', { name: 'Continue with Google' }).click();
    await publish.getByRole('button', { name: 'Publish', exact: true }).click();
    const rules = page.getByRole('dialog', { name: 'Community rules' });
    await expect(rules).toBeVisible();
    await page.waitForTimeout(600); // let it finish sliding in
    await reachableByFinger(page, rules, rules.getByRole('button', { name: 'Agree and publish' }));
    await reachableByFinger(page, rules, rules.getByRole('button', { name: 'Cancel', exact: true }).first());
  });
}
