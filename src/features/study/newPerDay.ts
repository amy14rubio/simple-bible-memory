import type { SettingsRepository } from '../../data/repositories/settingsRepository';

/** Verses are heavier to learn than vocabulary, so the default is modest. Changeable in Settings. */
export const DEFAULT_NEW_PER_DAY = 5;
export const MAX_NEW_PER_DAY = 100;

export async function loadNewPerDay(settings: SettingsRepository): Promise<number> {
  const v = await settings.get<number>('new_cards_per_day');
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= MAX_NEW_PER_DAY ? v : DEFAULT_NEW_PER_DAY;
}
