import type { Rating } from '../../domain/study/rating';
import type { MessageKey } from '../../i18n';

/**
 * A short message for each rating, shown in a banner after a card is rated. Warm and encouraging, with the odd gentle
 * pun or Scripture nod ("good and faithful", "hidden in your heart"). Nothing that makes light of Scripture.
 */
export const ENCOURAGEMENT: Record<Rating, MessageKey[]> = {
  1: ['encourage.again.1', 'encourage.again.2', 'encourage.again.3', 'encourage.again.4', 'encourage.again.5'],
  2: ['encourage.hard.1', 'encourage.hard.2', 'encourage.hard.3', 'encourage.hard.4'],
  3: ['encourage.good.1', 'encourage.good.2', 'encourage.good.3', 'encourage.good.4'],
  4: ['encourage.easy.1', 'encourage.easy.2', 'encourage.easy.3', 'encourage.easy.4'],
};

/** Picks a message for the rating, never the same one twice in a row (`previous` is the last one shown). */
export function pickEncouragement(rating: Rating, previous?: MessageKey, random: () => number = Math.random): MessageKey {
  const options = ENCOURAGEMENT[rating].filter((k) => k !== previous);
  return options[Math.floor(random() * options.length)]!;
}

/**
 * Whether the banners are on when the person has not chosen: yes, except in the browser tests, where they would make every
 * test that taps through cards wait for each banner to go. The tests that are about the banner switch them on again
 * (`localStorage['sbm-force-encouragement']`). Real builds never set either.
 */
export function encouragementDefault(): boolean {
  try {
    return !(import.meta.env.VITE_SKIP_ENCOURAGEMENT === 'true' && !localStorage.getItem('sbm-force-encouragement'));
  } catch {
    return true;
  }
}
