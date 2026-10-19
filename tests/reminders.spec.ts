import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { en } from '../src/i18n/messages.en';
import { es } from '../src/i18n/messages.es';

/**
 * Study reminders. The phone's notifications are replaced, in these tests, by a stand-in that writes what it would have
 * scheduled into localStorage ('sbm-fake-scheduled'), so we can check the settings really turn into notifications.
 */
const DEFAULT_MESSAGE = en['reminders.defaultMessage'] as string;
/** Picks a time in one of the drawer's time fields. (The phone's clock is a hidden time field behind each button.) */
async function setTime(drawer: ReturnType<Page['getByRole']>, label: string, hhmm: string) {
  await drawer.locator(`input[data-time-for="${label}"]`).fill(hhmm);
}
const remindersSwitch = (page: Page) => page.getByRole('switch', { name: 'Remind me to study' });
const scheduled = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('sbm-fake-scheduled') ?? '[]') as { title: string; body: string; at: string }[]);

async function turnOn(page: Page) {
  await page.goto('/#/settings');
  await remindersSwitch(page).click();
  await expect(remindersSwitch(page)).toBeChecked();
}

test('reminders are off at first, nothing is scheduled, and the phone is not asked for permission', async ({ page }) => {
  await page.goto('/#/settings');
  await expect(remindersSwitch(page)).not.toBeChecked();
  await expect(page.getByRole('button', { name: 'Add a reminder' })).toHaveCount(0);
  expect(await scheduled(page)).toEqual([]);
  expect(await page.evaluate(() => localStorage.getItem('sbm-fake-permission'))).toBeNull();
  // and browsing the rest of the app never asks either
  await page.goto('/#/');
  await page.goto('/#/stats');
  expect(await page.evaluate(() => localStorage.getItem('sbm-fake-permission'))).toBeNull();
});

test('turning them on asks for permission, starts a daily reminder with the app message, and schedules it', async ({ page }) => {
  await turnOn(page);
  expect(await page.evaluate(() => localStorage.getItem('sbm-fake-permission'))).toBe('granted');
  const list = page.getByRole('list', { name: 'Your reminders' });
  await expect(list.getByRole('listitem')).toHaveCount(1);
  await expect(list).toContainText('Every day at 8:00 PM');
  await expect(list).toContainText(DEFAULT_MESSAGE);
  await expect.poll(async () => (await scheduled(page)).length).toBeGreaterThan(50);
  const items = await scheduled(page);
  expect(items[0]!.body).toBe(DEFAULT_MESSAGE);
  expect(items[0]!.title).toBe('Simple Bible Memory');
  expect(new Date(items[0]!.at).getHours()).toBe(20);
});

test('a reminder can be edited: its own message, a weekly day and time', async ({ page }) => {
  await turnOn(page);
  await page.getByRole('button', { name: /Every day at 8:00 PM/ }).click();
  const drawer = page.getByRole('dialog', { name: 'Edit reminder' });
  await drawer.getByLabel('Repeat').selectOption('weekly');
  await drawer.getByLabel('Day').selectOption('5');
  await setTime(drawer, 'Time', '07:30');
  await drawer.getByLabel('Message').fill('Read Psalm 23 before work');
  await drawer.getByRole('button', { name: 'Save' }).click();
  await expect(drawer).toHaveCount(0);
  await expect(page.getByRole('list', { name: 'Your reminders' })).toContainText('Every Friday at 7:30 AM');
  await expect(page.getByRole('list', { name: 'Your reminders' })).toContainText('Read Psalm 23 before work');
  await expect.poll(async () => (await scheduled(page))[0]?.body).toBe('Read Psalm 23 before work');
  const items = await scheduled(page);
  expect(items.every((n) => n.body === 'Read Psalm 23 before work')).toBe(true);
  expect(items.every((n) => new Date(n.at).getDay() === 5 && new Date(n.at).getHours() === 7)).toBe(true);
});

test('hourly reminders stay inside their window, and the window cannot end before it starts', async ({ page }) => {
  await turnOn(page);
  await page.getByRole('button', { name: /Every day at 8:00 PM/ }).click();
  const drawer = page.getByRole('dialog', { name: 'Edit reminder' });
  await drawer.getByLabel('Repeat').selectOption('hourly');
  await setTime(drawer, 'From', '10:00');
  await setTime(drawer, 'Until', '13:00');
  await setTime(drawer, 'From', '15:00'); // later than "Until": the window follows instead of breaking
  await expect(drawer.getByRole('button', { name: 'Until, 3:00 PM' })).toBeVisible();
  await setTime(drawer, 'From', '10:00');
  await setTime(drawer, 'Until', '13:00');
  await drawer.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('list', { name: 'Your reminders' })).toContainText('Every hour, 10:00 AM to 1:00 PM');
  await expect.poll(async () => new Set((await scheduled(page)).map((n) => new Date(n.at).getHours())).size).toBe(4);
  const hours = new Set((await scheduled(page)).map((n) => new Date(n.at).getHours()));
  expect([...hours].sort((a, b) => a - b)).toEqual([10, 11, 12, 13]);
});

test('there can be two reminders and no more, each with its own message', async ({ page }) => {
  await turnOn(page);
  await page.getByRole('button', { name: 'Add a reminder' }).click();
  const drawer = page.getByRole('dialog', { name: 'New reminder' });
  await setTime(drawer, 'Time', '08:00');
  await drawer.getByLabel('Message').fill('Good morning, a verse first!');
  await drawer.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('list', { name: 'Your reminders' }).getByRole('listitem')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Add a reminder' })).toHaveCount(0);
  await expect.poll(async () => new Set((await scheduled(page)).map((n) => n.body)).size).toBe(2);
  const items = await scheduled(page);
  expect(new Set(items.map((n) => n.body))).toEqual(new Set([DEFAULT_MESSAGE, 'Good morning, a verse first!']));
});

test('deleting a reminder removes it; deleting the last one turns reminders off', async ({ page }) => {
  await turnOn(page);
  await page.getByRole('button', { name: 'Add a reminder' }).click();
  await page.getByRole('dialog', { name: 'New reminder' }).getByRole('button', { name: 'Save' }).click();
  await page.getByRole('button', { name: /Every day at 8:00 PM/ }).first().click();
  await page.getByRole('dialog', { name: 'Edit reminder' }).getByRole('button', { name: 'Delete reminder' }).click();
  await expect(page.getByRole('list', { name: 'Your reminders' }).getByRole('listitem')).toHaveCount(1);
  await page.getByRole('button', { name: /Every day at 8:00 PM/ }).click();
  await page.getByRole('dialog', { name: 'Edit reminder' }).getByRole('button', { name: 'Delete reminder' }).click();
  await expect(remindersSwitch(page)).not.toBeChecked();
  await expect.poll(() => scheduled(page)).toEqual([]);
});

test('turning the switch off cancels everything, and turning it on again brings the reminders back', async ({ page }) => {
  await turnOn(page);
  await remindersSwitch(page).click();
  await expect(remindersSwitch(page)).not.toBeChecked();
  await expect(page.getByRole('list', { name: 'Your reminders' })).toHaveCount(0);
  await expect.poll(() => scheduled(page)).toEqual([]);
  await remindersSwitch(page).click();
  await expect(page.getByRole('list', { name: 'Your reminders' })).toContainText('Every day at 8:00 PM');
  await expect.poll(async () => (await scheduled(page)).length).toBeGreaterThan(50);
});

test('it is remembered, and re-planned when the app opens again', async ({ page }) => {
  await turnOn(page);
  await page.evaluate(() => localStorage.removeItem('sbm-fake-scheduled'));
  await page.reload();
  await expect(remindersSwitch(page)).toBeChecked();
  await expect(page.getByRole('list', { name: 'Your reminders' })).toContainText('Every day at 8:00 PM');
  await expect.poll(async () => (await scheduled(page)).length).toBeGreaterThan(50);
});

test('if the phone says no, the switch stays off and says how to fix it', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('sbm-fake-permission', 'denied'));
  await page.goto('/#/settings');
  await remindersSwitch(page).click();
  await expect(page.getByText(/Notifications are blocked for this app/)).toBeVisible();
  await expect(remindersSwitch(page)).not.toBeChecked();
  expect(await scheduled(page)).toEqual([]);
});

test('in a browser (not the app) the switch is off and an "i" says reminders are for the mobile app', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('sbm-notifications-unavailable', '1'));
  await page.goto('/#/settings');
  await expect(remindersSwitch(page)).toBeDisabled();
  await expect(page.getByText('Reminders are only available in the mobile app.')).toHaveCount(0);
  await page.getByRole('button', { name: 'Remind me to study' }).click();
  await expect(page.getByRole('dialog', { name: 'Remind me to study' })).toContainText('Reminders are only available in the mobile app.');
});

test.describe('the time button', () => {
  const open = async (page: Page) => {
    await turnOn(page);
    await page.getByRole('button', { name: /Every day at 8:00 PM/ }).click();
    return page.getByRole('dialog', { name: 'Edit reminder' });
  };

  test('the time is a button that reads like a time, and the phone\'s clock changes it', async ({ page }) => {
    const drawer = await open(page);
    await expect(drawer.getByRole('button', { name: 'Time, 8:00 PM' })).toHaveText('8:00 PM');
    await setTime(drawer, 'Time', '06:15');
    await expect(drawer.getByRole('button', { name: 'Time, 6:15 AM' })).toHaveText('6:15 AM');
    await drawer.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('list', { name: 'Your reminders' })).toContainText('Every day at 6:15 AM');
  });

  test('midnight and noon read right', async ({ page }) => {
    const drawer = await open(page);
    await setTime(drawer, 'Time', '00:00');
    await expect(drawer.getByRole('button', { name: 'Time, 12:00 AM' })).toBeVisible();
    await setTime(drawer, 'Time', '12:00');
    await expect(drawer.getByRole('button', { name: 'Time, 12:00 PM' })).toBeVisible();
  });

  test('the clock behind the button is hidden from screen readers and the keyboard (the button is the control)', async ({ page }) => {
    const drawer = await open(page);
    const clock = drawer.locator('input[type="time"]');
    await expect(clock).toHaveAttribute('aria-hidden', 'true');
    await expect(clock).toHaveAttribute('tabindex', '-1');
  });

  test('the drawer fits a small phone without sideways scrolling, even for hourly', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 360, height: 740 } });
    const page = await ctx.newPage();
    const drawer = await open(page);
    await drawer.getByLabel('Repeat').selectOption('hourly');
    for (const name of ['From, 9:00 AM', 'Until, 9:00 PM']) {
      const box = await drawer.getByRole('button', { name }).boundingBox();
      expect(box!.x + box!.width, name).toBeLessThanOrEqual(360);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
    await ctx.close();
  });
});

for (const scheme of ['light', 'dark'] as const) {
  test(`no accessibility violations: the reminders and their drawer (${scheme})`, async ({ browser }) => {
    const ctx = await browser.newContext({ colorScheme: scheme, viewport: { width: 390, height: 780 } });
    const page = await ctx.newPage();
    await turnOn(page);
    const audit = async (label: string) => {
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      expect(results.violations.map((v) => v.id), label).toEqual([]);
    };
    await audit('settings');
    await page.getByRole('button', { name: /Every day at 8:00 PM/ }).click();
    await page.getByRole('dialog', { name: 'Edit reminder' }).waitFor();
    await page.waitForTimeout(500);
    await audit('drawer');
    await ctx.close();
  });
}

test.describe('in Spanish', () => {
  test.use({ locale: 'es-ES' });
  test('the screens, the summary and the default message are Spanish', async ({ page }) => {
    await page.goto('/#/settings');
    await page.getByRole('switch', { name: es['reminders.switch'] as string }).click();
    await expect(page.getByRole('list', { name: es['reminders.list'] as string })).toContainText('Cada día a las 20:00');
    // Spanish uses a 24-hour clock: no AM/PM
    await page.getByRole('button', { name: /Cada día a las 20:00/ }).click();
    const drawer = page.getByRole('dialog', { name: es['reminders.edit'] as string });
    await expect(drawer.getByRole('button', { name: 'Hora, 20:00' })).toHaveText('20:00');
    await drawer.locator('input[data-time-for="Hora"]').fill('07:30');
    await drawer.getByRole('button', { name: es['reminders.save'] as string }).click();
    await expect(page.getByRole('list', { name: es['reminders.list'] as string })).toContainText('Cada día a las 7:30');
    await expect(page.getByRole('list', { name: es['reminders.list'] as string })).toContainText(es['reminders.defaultMessage'] as string);
    await expect.poll(async () => (await scheduled(page))[0]?.body).toBe(es['reminders.defaultMessage']);
  });
});
