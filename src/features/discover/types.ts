
/** A public deck as shown in the Discover list. */
export interface PublicDeck {
  id: string;
  title: string;
  description: string | null;
  /** An open translation's code, "OWN", a licensed code, or "MIXED". */
  translation: string;
  /** The language's code ("en", "es", or any other for a licensed text). */
  language: string;
  cardCount: number;
  /** When it was first published (milliseconds). */
  createdAt: number;
  /** The format version it is saved in (1 if it was published before versions existed). */
  v: number;
}

export interface PublicCard {
  id: string;
  reference: string;
  /** Empty for a card in a licensed translation (see `translation`): its text is fetched by whoever imports the deck. */
  verseText: string;
  position: number;
  /** The card's own translation, when it has one. */
  translation?: string;
}

export interface DiscoverFilters {
  language: string; // 'all', or a language code (the filter offers English and Spanish)
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

export type ReportReason = 'copyright' | 'inappropriate' | 'other';
export const REPORT_REASONS: ReportReason[] = ['copyright', 'inappropriate', 'other'];

/** Everything the Discover screens need from the public catalogue. Anyone can use it, signed in or not. */
export interface DiscoverBackend {
  listDecks(filters: DiscoverFilters, cursor?: unknown): Promise<DeckPage>;
  getDeck(id: string): Promise<PublicDeck | null>;
  getCards(id: string): Promise<PublicCard[]>;
  report(deckId: string, reason: ReportReason, details: string): Promise<void>;
}
