import type { LucideIcon } from 'lucide-react';
import { BookOpen, CalendarClock, Compass, FilePlus, Layers } from 'lucide-react';
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

export interface OnboardingCard {
  key: 'welcome' | 'decks' | 'add' | 'discover' | 'schedule' | 'starter';
  /** Shown when a card has no clip. The welcome card has the logo, and the last card has neither: just its words. */
  icon?: LucideIcon;
  title: MessageKey;
  /** The welcome card has no text under its title. */
  body?: MessageKey;
  /** A short looping clip of the real app (public/tutorial/<language>/<clip>.mp4, with a still <clip>.jpg), made by `npm run clips`. Cards without one show their icon. */
  clip?: string;
}

/**
 * Short cards, nothing assumed (no Anki, no jargon): a welcome (title only), what a deck and a card are, adding your own verse,
 * finding decks other people shared, how the scheduling works, and a push to try the starter deck. Most show a short clip of the
 * real app. The last one says where to find the tour again.
 */
export const ONBOARDING_CARDS: OnboardingCard[] = [
  { key: 'welcome', icon: BookOpen, title: 'onboarding.welcome.title' },
  { key: 'decks', icon: Layers, title: 'onboarding.decks.title', body: 'onboarding.decks.body', clip: 'decks-cards' },
  { key: 'add', icon: FilePlus, title: 'onboarding.add.title', body: 'onboarding.add.body', clip: 'add' },
  { key: 'discover', icon: Compass, title: 'onboarding.discover.title', body: 'onboarding.discover.body', clip: 'discover' },
  { key: 'schedule', icon: CalendarClock, title: 'onboarding.schedule.title', body: 'onboarding.schedule.body', clip: 'schedule' },
  { key: 'starter', title: 'onboarding.starter.title', body: 'onboarding.starter.body' },
];
