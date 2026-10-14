const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** How a number of each unit is written. The default is English; the interface language supplies its own. */
export interface IntervalUnits {
  minutes: (n: number) => string;
  hours: (n: number) => string;
  days: (n: number) => string;
  months: (n: number) => string;
  years: (n: number) => string;
}

const ENGLISH_UNITS: IntervalUnits = {
  minutes: (n) => `${n}m`,
  hours: (n) => `${n}h`,
  days: (n) => `${n}d`,
  months: (n) => `${n}mo`,
  years: (n) => `${n}y`,
};

/** Short label for "how long until due", e.g. 10m, 3h, 5d, 2mo, 1y. Rounds to the nearest unit, never shows 0m. */
export function formatIntervalWith(ms: number, units: IntervalUnits): string {
  const m = Math.max(ms, 0);
  if (m < HOUR) return units.minutes(Math.max(1, Math.round(m / MIN)));
  if (m < DAY) return units.hours(Math.round(m / HOUR));
  if (m < 30 * DAY) return units.days(Math.round(m / DAY));
  if (m < 365 * DAY) return units.months(Math.round(m / (30 * DAY)));
  return units.years(Math.round((m / (365 * DAY)) * 10) / 10);
}

/** English labels (10m, 3h, 5d, 2mo, 1y). */
export const formatInterval = (ms: number): string => formatIntervalWith(ms, ENGLISH_UNITS);

/** Local midnight at or before `now`. Used for "cards introduced today" limits. */
export function startOfLocalDay(now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
