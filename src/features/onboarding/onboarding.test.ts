import { existsSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { shouldShowOnboarding, ONBOARDING_CARDS } from './onboarding';

describe('who sees the welcome tour', () => {
  it('someone brand new does', () => expect(shouldShowOnboarding({ done: undefined, deckCount: 0 })).toBe(true));
  it('someone who finished or skipped it does not', () => expect(shouldShowOnboarding({ done: true, deckCount: 0 })).toBe(false));
  it('someone who already has decks never does (an update must not interrupt them)', () => expect(shouldShowOnboarding({ done: undefined, deckCount: 2 })).toBe(false));
});

describe('the cards', () => {
  it('there are 5 to 8, each with its own icon and text', () => {
    expect(ONBOARDING_CARDS.length).toBeGreaterThanOrEqual(5);
    expect(ONBOARDING_CARDS.length).toBeLessThanOrEqual(8);
    expect(new Set(ONBOARDING_CARDS.map((c) => c.key)).size).toBe(ONBOARDING_CARDS.length);
  });

  it('every clip a card names exists in both languages, with its still picture (made by `npm run clips`)', () => {
    const clips = ONBOARDING_CARDS.flatMap((c) => (c.clip ? [c.clip] : []));
    expect(clips.length).toBeGreaterThanOrEqual(4);
    for (const language of ['en', 'es']) {
      for (const clip of clips) {
        for (const ext of ['mp4', 'jpg']) expect(existsSync(`public/tutorial/${language}/${clip}.${ext}`), `${language}/${clip}.${ext}`).toBe(true);
      }
    }
  });
});
