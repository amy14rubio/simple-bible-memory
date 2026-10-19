/**
 * Study reminders, as plain data, and the maths that turns them into the actual moments a notification should appear.
 * Nothing here knows about phones: `planNotifications` just answers "given these reminders and the time now, when
 * should the phone buzz?", so it can be tested without a phone.
 */
export type Repeat = 'hourly' | 'daily' | 'every2days' | 'weekly';
export const REPEATS: Repeat[] = ['hourly', 'daily', 'every2days', 'weekly'];

/** A person can have one reminder or two (for example a morning and an evening one). */
export const MAX_REMINDERS = 2;
export const MESSAGE_MAX = 120;

export interface Reminder {
  id: string;
  repeat: Repeat;
  /** "HH:MM", 24-hour. Used by daily, every 2 days and weekly. */
  time: string;
  /** Hourly reminders only buzz between these two times ("HH:MM"), so they never wake anyone up. */
  from: string;
  to: string;
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

/** How many upcoming notifications are scheduled per reminder. The plan is rebuilt every time the app opens. */
export const PLAN_PER_REMINDER = 100;
const MAX_DAYS_AHEAD = 400;

export const toMinutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};
export const fromMinutes = (minutes: number): string =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

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
  return { id, repeat: 'daily', time: '20:00', from: '09:00', to: '21:00', weekday: now.getDay(), startDay: dayKey(now), message: '' };
}

/** The times of day a reminder fires on a day it is active. Hourly: on the hour from `from` to `to`, inclusive. */
export function timesOfDay(r: Reminder): string[] {
  if (r.repeat !== 'hourly') return [r.time];
  const start = toMinutes(r.from);
  const end = toMinutes(r.to);
  if (end < start) return [r.from];
  const times: string[] = [];
  for (let m = start; m <= end; m += 60) times.push(fromMinutes(m));
  return times;
}

function activeOn(r: Reminder, day: Date): boolean {
  if (r.repeat === 'weekly') return day.getDay() === r.weekday;
  if (r.repeat === 'every2days') return (((daysBetween(r.startDay, dayKey(day)) % 2) + 2) % 2) === 0;
  return true;
}

/** The next moments each reminder should fire, soonest first. Moments already past (or in the next few seconds) are skipped. */
export function planNotifications(reminders: Reminder[], now: Date, defaultMessage: string): PlannedNotification[] {
  const planned: PlannedNotification[] = [];
  const earliest = now.getTime() + 5_000;
  for (const r of reminders) {
    const body = r.message.trim() || defaultMessage;
    const times = timesOfDay(r);
    let count = 0;
    for (let offset = 0; offset < MAX_DAYS_AHEAD && count < PLAN_PER_REMINDER; offset++) {
      const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
      if (!activeOn(r, day)) continue;
      for (const time of times) {
        const [h, m] = time.split(':').map(Number);
        const at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m);
        if (at.getTime() < earliest) continue;
        planned.push({ reminderId: r.id, at, body });
        if (++count >= PLAN_PER_REMINDER) break;
      }
    }
  }
  return planned.sort((a, b) => a.at.getTime() - b.at.getTime());
}
