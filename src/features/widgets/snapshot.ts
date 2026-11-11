import type { CustomTheme } from '../../lib/customTheme';
import { widgetTheme, type WidgetThemePreference } from '../../lib/widgetTheme';
import { isLicensed } from '../../domain/bible/sources';
import type { Card, DeckSummary } from '../../domain/types';

/** Bumped when the shape changes in a way the widgets (which may be older or newer than the app's data) must notice. */
export const SNAPSHOT_VERSION = 2;

/** How much the widgets are given: a home screen only ever shows a few decks, and one verse of a deck at a time. */
export const MAX_DECKS = 12;
export const MAX_VERSES_PER_DECK = 60;
const MAX_TEXT = 320;

export interface WidgetDeck { id: string; title: string; due: number; cards: number }
export interface WidgetVerseDeck { id: string; title: string; verses: { ref: string; text: string; tr?: string }[] }
export interface WidgetContent {
  /** In the order of the home screen. */
  decks: WidgetDeck[];
  stats: { memorized: number; mastered: number; total: number; counts: { new: number; learning: number; young: number; mature: number } };
  /** Decks whose verses can be shown on the home screen (their own or public-domain text). */
  verseDecks: WidgetVerseDeck[];
  /** Decks that can't be (every card is licensed text), so the widget's setup can say why. */
  licensedDecks: { id: string; title: string }[];
}

const clip = (text: string) => (text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT - 1).trimEnd()}…` : text);

/**
 * The verses a deck may show on the home screen. Licensed Bible text (see docs/youversion.md) is never put on a widget: its publisher's
 * notice and link must come with it, and a widget has no room for them. A verse with no text yet is left out too.
 */
export function previewVerses(deck: Pick<DeckSummary, 'translationCode'>, cards: Card[]): WidgetVerseDeck['verses'] {
  return cards
    .filter((c) => c.verseText.trim() !== '' && !isLicensed(c.translationCode ?? deck.translationCode))
    .slice(0, MAX_VERSES_PER_DECK)
    .map((c) => {
      const code = c.translationCode ?? deck.translationCode;
      return { ref: c.reference, text: clip(c.verseText.trim().replace(/\s+/g, ' ')), ...(code && code !== 'OWN' ? { tr: code } : {}) };
    });
}

export interface WidgetSnapshotInput {
  language: string;
  theme: WidgetThemePreference;
  custom: CustomTheme | undefined;
  labels: Record<string, string>;
  content: WidgetContent;
  now: number;
}

/** Everything the home-screen widgets draw, as plain data. The widgets cannot read the app's database, so they only ever show this. */
export function buildSnapshot({ language, theme, custom, labels, content, now }: WidgetSnapshotInput) {
  return { v: SNAPSHOT_VERSION, updatedAt: now, language, theme: widgetTheme(theme, custom), labels, ...content };
}
