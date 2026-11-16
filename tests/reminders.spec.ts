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

test('a reminder can be edited: its own message, a weekly day and time; there is no Save button, and what was typed is kept when the sheet is closed right away', async ({ page }) => {
  await turnOn(page);
  await page.getByRole('button', { name: /Every day at 8:00 PM/ }).click();
  const drawer = page.getByRole('dialog', { name: 'Edit reminder' });
  await expect(drawer.getByRole('button', { name: 'Save' })).toHaveCount(0);
  await drawer.getByLabel('Repeat').selectOption('weekly');
  await drawer.getByLabel('Day').selectOption('5');
  await setTime(drawer, 'Time', '07:30');
  await drawer.getByLabel('Message').fill('Read Psalm 23 before work');
  await page.keyboard.press('Escape'); // closed at once: the message was still waiting its moment, and is saved now
  await expect(drawer).toHaveCount(0);
  await expect(page.getByRole('list', { name: 'Your reminders' })).toContainText('Every Friday at 7:30 AM');
  await expect(page.getByRole('list', { name: 'Your reminders' })).toContainText('Read Psalm 23 before work');
  await expect.poll(async () => (await scheduled(page))[0]?.body).toBe('Read Psalm 23 before work');
  const items = await scheduled(page);
  expect(items.every((n) => n.body === 'Read Psalm 23 before work')).toBe(true);
  expect(items.every((n) => new Date(n.at).getDay() === 5 && new Date(n.at).getHours() === 7)).toBe(true);
});

test('changes save by themselves while the sheet is open: the time at once, the message a moment after typing stops', async ({ page }) => {
  await turnOn(page);
  await page.getByRole('button', { name: /Every day at 8:00 PM/ }).click();
  const drawer = page.getByRole('dialog', { name: 'Edit reminder' });
  await setTime(drawer, 'Time', '06:15');
  await expect.poll(async () => new Date((await scheduled(page))[0]!.at).getHours()).toBe(6); // the sheet is still open
  await drawer.getByLabel('Message').fill('A quiet minute with the Word');
  expect((await scheduled(page))[0]!.body).toBe(DEFAULT_MESSAGE); // not yet: still waiting for typing to pause
  await expect.poll(async () => (await scheduled(page))[0]?.body, { timeout: 4000 }).toBe('A quiet minute with the Word');
  await expect(drawer).toBeVisible(); // and the sheet stayed open
});

test('there can be two reminders, each with its own message', async ({ page }) => {
  await turnOn(page);
  await page.getByRole('button', { name: 'Add a reminder' }).click();
  const drawer = page.getByRole('dialog', { name: 'New reminder' });
  await setTime(drawer, 'Time', '08:00');
  await drawer.getByLabel('Message').fill('Good morning, a verse first!');
  await drawer.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByRole('list', { name: 'Your reminders' }).getByRole('listitem')).toHaveCount(2);
  await expect.poll(async () => new Set((await scheduled(page)).map((n) => n.body)).size).toBe(2);
  const items = await scheduled(page);
  expect(new Set(items.map((n) => n.body))).toEqual(new Set([DEFAULT_MESSAGE, 'Good morning, a verse first!']));
});

test('up to ten reminders, then no more can be added, and the phone is never given too many alarms', async ({ page }) => {
  await turnOn(page);
  for (let i = 2; i <= 10; i++) {
    await page.getByRole('button', { name: 'Add a reminder' }).click();
    await page.getByRole('dialog', { name: 'New reminder' }).getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.getByRole('list', { name: 'Your reminders' }).getByRole('listitem')).toHaveCount(i);
  }
  await expect(page.getByRole('button', { name: 'Add a reminder' })).toHaveCount(0);
  await expect.poll(async () => (await scheduled(page)).length).toBe(400);
});

test('there is no hourly option', async ({ page }) => {
  await turnOn(page);
  await page.getByRole('button', { name: /Every day at 8:00 PM/ }).click();
  const options = await page.getByRole('dialog', { name: 'Edit reminder' }).getByLabel('Repeat').locator('option').allTextContents();
  expect(options).toEqual(['Every day', 'Every 2 days', 'Every week']);
});

test('deleting a reminder removes it; deleting the last one turns reminders off', async ({ page }) => {
  await turnOn(page);
  await page.getByRole('button', { name: 'Add a reminder' }).click();
  await page.getByRole('dialog', { name: 'New reminder' }).getByRole('button', { name: 'Add', exact: true }).click();
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
    await page.keyboard.press('Escape');
    await expect(page.getByRole('list', { name: 'Your reminders' })).toContainText('Every day at 6:15 AM'); // saved without pressing anything
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

  test('the drawer fits a small phone without sideways scrolling, even for weekly', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 360, height: 740 } });
    const page = await ctx.newPage();
    const drawer = await open(page);
    await drawer.getByLabel('Repeat').selectOption('weekly');
    for (const name of ['Time, 8:00 PM']) {
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
    await expect(page.getByRole('list', { name: es['reminders.list'] as string })).toContainText('Cada día a las 8:00 PM');
    // the time is written 8:00 PM in Spanish too, not on a 24-hour clock
    await page.getByRole('button', { name: /Cada día a las 8:00 PM/ }).click();
    const drawer = page.getByRole('dialog', { name: es['reminders.edit'] as string });
    await expect(drawer.getByRole('button', { name: 'Hora, 8:00 PM' })).toHaveText('8:00 PM');
    await drawer.locator('input[data-time-for="Hora"]').fill('07:30');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('list', { name: es['reminders.list'] as string })).toContainText('Cada día a las 7:30 AM');
    await expect(page.getByRole('list', { name: es['reminders.list'] as string })).toContainText(es['reminders.defaultMessage'] as string);
    await expect.poll(async () => (await scheduled(page))[0]?.body).toBe(es['reminders.defaultMessage']);
  });
});

test.describe('on an iPad', () => {
  // Safari on iPhone and iPad only opens a time clock when the finger lands on the time field itself, so there the (invisible) field
  // must be what is under the finger when the person taps the time button.
  test.use({ userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1', hasTouch: true });

  test('the invisible clock field is on top of the time button, so a tap reaches it', async ({ page }) => {
    await turnOn(page);
    await page.getByRole('list', { name: 'Your reminders' }).getByRole('button').first().click();
    const drawer = page.getByRole('dialog');
    const button = drawer.getByRole('button', { name: /^Time, / });
    await expect(button).toBeVisible();
    await page.waitForTimeout(700); // the sheet slides up first
    const box = (await button.boundingBox())!;
    const topmost = await page.evaluate(([x, y]) => (document.elementFromPoint(x!, y!) as HTMLElement | null)?.getAttribute('data-time-for'), [box.x + box.width / 2, box.y + box.height / 2]);
    expect(topmost).toBe('Time');
  });
});

test('everywhere else the time button opens the clock from code, and the field underneath is left alone', async ({ page }) => {
  await turnOn(page);
  await page.getByRole('list', { name: 'Your reminders' }).getByRole('button').first().click();
  const drawer = page.getByRole('dialog');
  await expect(drawer.getByRole('button', { name: /^Time, / })).toBeVisible();
  await page.waitForTimeout(700); // the sheet slides up first
  const box = (await drawer.getByRole('button', { name: /^Time, / }).boundingBox())!;
  const topmost = await page.evaluate(([x, y]) => (document.elementFromPoint(x!, y!) as HTMLElement | null)?.tagName, [box.x + box.width / 2, box.y + box.height / 2]);
  expect(topmost).toBe('BUTTON');
});

test('on Android, an "i" next to Notifications says what to do when reminders are late, with > between the steps; it is not shown anywhere else', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('sbm-fake-android', '1'));
  await page.goto('/#/settings');
  await page.getByRole('button', { name: 'Notifications' }).click(); // the heading is the "i": tapping it opens the tip, even before reminders are on
  const tip = page.getByRole('dialog', { name: 'Notifications' });
  await expect(tip).toContainText('Are your reminders late?');
  await expect(tip).toContainText(/Settings\s> Apps\s> Simple Bible Memory\s> Battery/); // (a no-break space before each >, so a line never starts with one)
  await expect(tip).toContainText('Unrestricted');
  await expect(tip).toContainText('Samsung');
  await expect(tip).not.toContainText('On Android'); // it is only ever shown on Android, so it does not need to say so
});

test('the "i" is not shown on iPhone, iPad or the web: Notifications is just a heading there', async ({ page }) => {
  await page.goto('/#/settings');
  await expect(page.getByRole('heading', { name: 'Notifications' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Notifications' })).toHaveCount(0);
});

test('the Android tip is in Spanish too, with the Spanish app name', async ({ browser }) => {
  const ctx = await browser.newContext({ locale: 'es-ES' });
  const page = await ctx.newPage();
  await page.addInitScript(() => localStorage.setItem('sbm-fake-android', '1'));
  await page.goto('/#/settings');
  await page.getByRole('button', { name: es['settings.reminders'] as string }).click();
  const tip = page.getByRole('dialog');
  await expect(tip).toContainText('¿Te llegan tarde los recordatorios?');
  await expect(tip).toContainText(/Aplicaciones\s> Memoria Bíblica Simple\s> Batería/);
  await ctx.close();
});

test('in Spanish the time is written 8:00 PM, not on a 24-hour clock, and the one o\'clock hour is "a la 1:00 PM"', async ({ browser }) => {
  const ctx = await browser.newContext({ locale: 'es-ES' });
  const page = await ctx.newPage();
  await page.goto('/#/settings');
  await page.getByRole('switch', { name: es['reminders.switch'] as string }).click();
  const list = page.getByRole('list', { name: es['reminders.list'] as string });
  await expect(list).toContainText('Cada día a las 8:00 PM'); // the default reminder, at 20:00
  await expect(list).not.toContainText('20:00');
  await page.getByRole('button', { name: /Cada día a las 8:00 PM/ }).click();
  const drawer = page.getByRole('dialog');
  await expect(drawer.getByRole('button', { name: /8:00 PM/ })).toBeVisible(); // the time button in the editor reads the same way
  await setTime(drawer, es['reminders.time'] as string, '13:00');
  await page.keyboard.press('Escape'); // closed: the change was already saved
  await expect(list).toContainText('Cada día a la 1:00 PM');
  await ctx.close();
});

test('a new reminder exists only once "Add" is pressed: closing the sheet without it adds nothing', async ({ page }) => {
  await turnOn(page);
  await page.getByRole('button', { name: 'Add a reminder' }).click();
  const drawer = page.getByRole('dialog', { name: 'New reminder' });
  await expect(drawer.getByRole('button', { name: 'Save' })).toHaveCount(0);
  await setTime(drawer, 'Time', '06:00');
  await drawer.getByLabel('Message').fill('Not added');
  await page.keyboard.press('Escape'); // closed without Add
  await expect(drawer).toHaveCount(0);
  await expect(page.getByRole('list', { name: 'Your reminders' }).getByRole('listitem')).toHaveCount(1);
  expect((await scheduled(page)).every((n) => n.body === DEFAULT_MESSAGE)).toBe(true);
});
