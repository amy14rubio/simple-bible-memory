/**
 * Study reminders, as plain data, and the maths that turns them into the actual moments a notification should appear.
 * Nothing here knows about phones: `planNotifications` just answers "given these reminders and the time now, when
 * should the phone buzz?", so it can be tested without a phone.
 */
export type Repeat = 'daily' | 'every2days' | 'weekly';
export const REPEATS: Repeat[] = ['daily', 'every2days', 'weekly'];

/** How many reminders a person can have (a morning verse, an evening review, a weekly catch-up...). */
export const MAX_REMINDERS = 10;
export const MESSAGE_MAX = 120;

export interface Reminder {
  id: string;
  repeat: Repeat;
  /** "HH:MM", 24-hour. */
  time: string;
  /** Weekly: 0 = Sunday ... 6 = Saturday. */
  weekday: number;
  /** "YYYY-MM-DD", the day an "every 2 days" reminder counts from, so its rhythm does not shift each time we re-plan. */
  startDay: string;
  /** Empty means "use the app's own message". */
  message: string;
}

export interface PlannedNotification {
  reminderId: string;
  at: Date;
  body: string;
}

/**
 * How many upcoming notifications are scheduled in all. Android allows roughly 500 pending alarms per app, so this stays
 * comfortably under; the budget is shared out between the reminders (10 reminders get 40 each, which is still 40 days of
 * a daily one). The plan is rebuilt every time the app opens, which tops it up. (An iPhone or iPad keeps only 64 pending local
 * notifications, so the iOS app asks for a smaller plan: see `Notifier.maxPending`.)
 */
export const PLAN_TOTAL = 400;
export const PLAN_PER_REMINDER_MAX = 100;
const MAX_DAYS_AHEAD = 400;

export const isTime = (v: unknown): v is string => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);

export function dayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** Whole days from one "YYYY-MM-DD" to another (calendar days, so a clock change does not matter). */
function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  return Math.round((Date.UTC(ty!, tm! - 1, td!) - Date.UTC(fy!, fm! - 1, fd!)) / 86_400_000);
}

export function newReminder(now: Date, id: string): Reminder {
  return { id, repeat: 'daily', time: '20:00', weekday: now.getDay(), startDay: dayKey(now), message: '' };
}

function activeOn(r: Reminder, day: Date): boolean {
  if (r.repeat === 'weekly') return day.getDay() === r.weekday;
  if (r.repeat === 'every2days') return (((daysBetween(r.startDay, dayKey(day)) % 2) + 2) % 2) === 0;
  return true;
}

/** The next moments each reminder should fire, soonest first. Moments already past (or in the next few seconds) are skipped. */
export function planNotifications(reminders: Reminder[], now: Date, defaultMessage: string, total = PLAN_TOTAL): PlannedNotification[] {
  const planned: PlannedNotification[] = [];
  const earliest = now.getTime() + 5_000;
  const perReminder = Math.min(PLAN_PER_REMINDER_MAX, Math.floor(total / Math.max(1, reminders.length)));
  for (const r of reminders) {
    const body = r.message.trim() || defaultMessage;
    const [h, m] = r.time.split(':').map(Number);
    let count = 0;
    for (let offset = 0; offset < MAX_DAYS_AHEAD && count < perReminder; offset++) {
      const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
      if (!activeOn(r, day)) continue;
      const at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m);
      if (at.getTime() < earliest) continue;
      planned.push({ reminderId: r.id, at, body });
      count++;
    }
  }
  return planned.sort((a, b) => a.at.getTime() - b.at.getTime());
}
