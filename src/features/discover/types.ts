import type { SharingLanguage } from '../../domain/sharing/translations';

/** A public deck as shown in the Discover list. */
export interface PublicDeck {
  id: string;
  title: string;
  description: string | null;
  translation: string;
  language: SharingLanguage;
  cardCount: number;
  /** When it was first published (milliseconds). */
  createdAt: number;
}

export interface PublicCard {
  id: string;
  reference: string;
  verseText: string;
  position: number;
}

export interface DiscoverFilters {
  language: 'all' | SharingLanguage;
  /** A translation code (KJV, OWN, ...) or 'all'. */
  translation: string;
  /** Searches the start of the title, ignoring case. */
  query: string;
}

export const NO_FILTERS: DiscoverFilters = { language: 'all', translation: 'all', query: '' };
export const PAGE_SIZE = 20;

export interface DeckPage {
  decks: PublicDeck[];
  /** Pass this back to get the next page; null when there are no more. */
  cursor: unknown | null;
}


/** Everything the Discover screens need from the public catalogue. Anyone can use it, signed in or not. */
export interface DiscoverBackend {
  listDecks(filters: DiscoverFilters, cursor?: unknown): Promise<DeckPage>;
  getDeck(id: string): Promise<PublicDeck | null>;
  getCards(id: string): Promise<PublicCard[]>;
}
