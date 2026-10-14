/**
 * Every verse has up to two study cards, each scheduled separately by FSRS:
 *  - recall:   you see the verse (its reference) and recall the passage.
 *  - identify: you see the passage and name the verse.
 */
export type CardKind = 'recall' | 'identify';
export const CARD_KINDS: CardKind[] = ['recall', 'identify'];

/** What the learner picks in Settings. */
export type CardKindSetting = 'both' | CardKind;

export function kindsFor(setting: CardKindSetting): CardKind[] {
  return setting === 'both' ? ['recall', 'identify'] : [setting];
}

/** Settings are stored as text, so anything unexpected falls back to the default. */
export function parseCardKindSetting(value: unknown): CardKindSetting {
  return value === 'recall' || value === 'identify' || value === 'both' ? value : 'both';
}
