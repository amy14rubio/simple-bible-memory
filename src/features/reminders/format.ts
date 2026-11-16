import type { Language } from '../../i18n';

/**
 * "20:00" as it is read aloud and written in everyday life: "8:00 PM", in English and in Spanish (a 24-hour "20:00" is what most people
 * in Spanish-speaking countries do not use for a reminder). The saved value stays "HH:MM", 24-hour.
 */
export function formatTime(language: Language, hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  if (language === 'es') return `${h! % 12 || 12}:${String(m).padStart(2, '0')} ${h! >= 12 ? 'PM' : 'AM'}`;
  return new Intl.DateTimeFormat(language, { hour: 'numeric', minute: '2-digit' }).format(new Date(2000, 0, 1, h, m));
}

/** 0 = Sunday ... 6 = Saturday, named in the interface language ("Monday" / "lunes"). */
export function weekdayName(language: Language, weekday: number): string {
  return new Intl.DateTimeFormat(language, { weekday: 'long' }).format(new Date(2000, 0, 2 + weekday)); // 2000-01-02 was a Sunday
}
