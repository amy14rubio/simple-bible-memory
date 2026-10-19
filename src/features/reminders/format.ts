import type { Language } from '../../i18n';

/** "20:00" as the person's clock would write it: "8:00 PM" in English, "20:00" in Spanish. */
export function formatTime(language: Language, hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  return new Intl.DateTimeFormat(language, { hour: 'numeric', minute: '2-digit' }).format(new Date(2000, 0, 1, h, m));
}

/** 0 = Sunday ... 6 = Saturday, named in the interface language ("Monday" / "lunes"). */
export function weekdayName(language: Language, weekday: number): string {
  return new Intl.DateTimeFormat(language, { weekday: 'long' }).format(new Date(2000, 0, 2 + weekday)); // 2000-01-02 was a Sunday
}
