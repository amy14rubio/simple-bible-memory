import { describe, it, expect } from 'vitest';
import { shouldShowOnboarding, ONBOARDING_CARDS } from './onboarding';

describe('who sees the welcome tour', () => {
  it('someone brand new does', () => expect(shouldShowOnboarding({ done: undefined, deckCount: 0 })).toBe(true));
  it('someone who finished or skipped it does not', () => expect(shouldShowOnboarding({ done: true, deckCount: 0 })).toBe(false));
  it('someone who already has decks never does (an update must not interrupt them)', () => expect(shouldShowOnboarding({ done: undefined, deckCount: 2 })).toBe(false));
});

describe('the cards', () => {
  it('there are 3 to 5, each with its own icon and text', () => {
    expect(ONBOARDING_CARDS.length).toBeGreaterThanOrEqual(3);
    expect(ONBOARDING_CARDS.length).toBeLessThanOrEqual(5);
    expect(new Set(ONBOARDING_CARDS.map((c) => c.key)).size).toBe(ONBOARDING_CARDS.length);
  });
});
