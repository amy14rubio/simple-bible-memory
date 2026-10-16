/** Domain models: plain objects, independent of database row shapes. Timestamps are UTC epoch ms. */
export interface Deck {
  id: string;
  title: string;
  description: string | null;
  bibleLanguage: string | null;
  translationCode: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface DeckSummary extends Deck {
  cardCount: number;
}

export interface Card {
  id: string;
  reference: string;
  verseText: string;
  note: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface DeckInput {
  title: string;
  description?: string | null;
  /** Which Bible translation the deck's text is from (a code like KJV, or OWN for your own words). Left alone when omitted. */
  translationCode?: string | null;
  /** The language of the text ('en' or 'es'). Left alone when omitted. */
  bibleLanguage?: string | null;
}

export interface CardInput {
  reference: string;
  verseText: string;
  note?: string | null;
}
