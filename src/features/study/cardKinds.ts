import type { SettingsRepository } from '../../data/repositories/settingsRepository';
import { kindsFor, parseCardKindSetting, type CardKind, type CardKindSetting } from '../../domain/study/cardKind';

export async function loadCardKindSetting(settings: SettingsRepository): Promise<CardKindSetting> {
  return parseCardKindSetting(await settings.get<unknown>('card_kinds'));
}

export async function loadCardKinds(settings: SettingsRepository): Promise<CardKind[]> {
  return kindsFor(await loadCardKindSetting(settings));
}
