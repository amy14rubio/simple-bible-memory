import type { LucideIcon } from 'lucide-react';
import { BookOpen, CalendarClock, Layers, ListChecks, Sparkles } from 'lucide-react';
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

export interface OnboardingCard { key: 'welcome' | 'decks' | 'practice' | 'schedule' | 'starter'; icon: LucideIcon; title: MessageKey; /** The welcome card has no text under its title. */ body?: MessageKey }

/**
 * Five short cards, nothing assumed (no Anki, no jargon): a welcome (title only), what a deck and a card are, the ways to
 * practice, how the scheduling works, and a push to try the starter deck. Nobody wants a long tour before they can start, so it stops there. The empty home
 * screen takes it from here.
 */
export const ONBOARDING_CARDS: OnboardingCard[] = [
  { key: 'welcome', icon: BookOpen, title: 'onboarding.welcome.title' },
  { key: 'decks', icon: Layers, title: 'onboarding.decks.title', body: 'onboarding.decks.body' },
  { key: 'practice', icon: ListChecks, title: 'onboarding.practice.title', body: 'onboarding.practice.body' },
  { key: 'schedule', icon: CalendarClock, title: 'onboarding.schedule.title', body: 'onboarding.schedule.body' },
  { key: 'starter', icon: Sparkles, title: 'onboarding.starter.title', body: 'onboarding.starter.body' },
];
