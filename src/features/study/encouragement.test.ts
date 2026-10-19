import { describe, it, expect } from 'vitest';
import { ENCOURAGEMENT, pickEncouragement } from './encouragement';
import { en } from '../../i18n/messages.en';
import { es } from '../../i18n/messages.es';
import type { Rating } from '../../domain/study/rating';

const RATINGS: Rating[] = [1, 2, 3, 4];

describe('encouragement messages', () => {
  it('every rating has several, and every one is written in English and Spanish', () => {
    for (const r of RATINGS) {
      expect(ENCOURAGEMENT[r].length).toBeGreaterThanOrEqual(4);
      for (const key of ENCOURAGEMENT[r]) { expect(en[key], key).toBeTruthy(); expect(es[key], key).toBeTruthy(); }
    }
  });
  it('a message belongs to the rating it is picked for', () => {
    for (const r of RATINGS) for (let i = 0; i < 40; i++) expect(ENCOURAGEMENT[r]).toContain(pickEncouragement(r));
  });
  it('is never the same message twice in a row, and every message can come up', () => {
    for (const r of RATINGS) {
      const seen = new Set<string>();
      let previous: ReturnType<typeof pickEncouragement> | undefined;
      for (let i = 0; i < 300; i++) {
        const next = pickEncouragement(r, previous);
        expect(next).not.toBe(previous);
        seen.add(next);
        previous = next;
      }
      expect(seen.size).toBe(ENCOURAGEMENT[r].length);
    }
  });
  it('is varied by the random number it is given', () => {
    expect(pickEncouragement(1, undefined, () => 0)).toBe(ENCOURAGEMENT[1][0]);
    expect(pickEncouragement(1, undefined, () => 0.999)).toBe(ENCOURAGEMENT[1].at(-1));
  });
});
