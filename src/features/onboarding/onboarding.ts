import type { LucideIcon } from 'lucide-react';
import { BookOpen, CalendarClock, FilePlus2, Layers, ListChecks } from 'lucide-react';
import type { MessageKey } from '../../i18n';

/** The setting that remembers the welcome tour was seen (finished or skipped). */
export const ONBOARDING_DONE = 'onboarding_done';

/**
 * Show the tour only to someone brand new: it has not been seen, and they have no decks yet. Anyone who already uses
 * the app (they have decks) is never interrupted, even if they updated from a version that had no tour.
 */
export const shouldShowOnboarding = ({ done, deckCount }: { done: boolean | undefined; deckCount: number }) => !done && deckCount === 0;

/**
 * Browser tests turn the tour off for every other test (VITE_SKIP_ONBOARDING) and turn it back on for its own
 * (`localStorage['sbm-force-onboarding']`). Real builds never set either.
 */
export function onboardingDisabledForTests(): boolean {
  try {
    return import.meta.env.VITE_SKIP_ONBOARDING === 'true' && !localStorage.getItem('sbm-force-onboarding');
  } catch {
    return false;
  }
}

export interface OnboardingCard { key: 'welcome' | 'decks' | 'rhythm' | 'ways' | 'start'; icon: LucideIcon; title: MessageKey; body: MessageKey }

/**
 * Five cards in plain words, assuming nothing (no Anki, no jargon about scheduling): a welcome, what a deck and a card are, why it brings verses back at different times, the three ways to practise, and how to begin.
 */
export const ONBOARDING_CARDS: OnboardingCard[] = [
  { key: 'welcome', icon: BookOpen, title: 'onboarding.welcome.title', body: 'onboarding.welcome.body' },
  { key: 'decks', icon: Layers, title: 'onboarding.decks.title', body: 'onboarding.decks.body' },
  { key: 'rhythm', icon: CalendarClock, title: 'onboarding.rhythm.title', body: 'onboarding.rhythm.body' },
  { key: 'ways', icon: ListChecks, title: 'onboarding.ways.title', body: 'onboarding.ways.body' },
  { key: 'start', icon: FilePlus2, title: 'onboarding.start.title', body: 'onboarding.start.body' },
];
