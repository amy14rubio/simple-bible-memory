const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** Short label for "how long until due", e.g. 10m, 3h, 5d, 2mo, 1y. Rounds to the nearest unit, never shows 0m. */
export function formatInterval(ms: number): string {
  const m = Math.max(ms, 0);
  if (m < HOUR) return `${Math.max(1, Math.round(m / MIN))}m`;
  if (m < DAY) return `${Math.round(m / HOUR)}h`;
  if (m < 30 * DAY) return `${Math.round(m / DAY)}d`;
  if (m < 365 * DAY) return `${Math.round(m / (30 * DAY))}mo`;
  return `${Math.round((m / (365 * DAY)) * 10) / 10}y`;
}

/** Local midnight at or before `now`. Used for "cards introduced today" limits. */
export function startOfLocalDay(now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
