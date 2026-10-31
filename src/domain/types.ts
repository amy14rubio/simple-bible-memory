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
  /** For a licensed translation: the text fetched to this device, or '' until it has been. */
  verseText: string;
  note: string | null;
  /** This card's own translation (a code like KJV or NASB2020). Null: the deck's. */
  translationCode: string | null;
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
  /** Required, except for a licensed translation, whose text is fetched later. */
  verseText: string;
  note?: string | null;
  /** The card's own translation. On an update, left alone when omitted; null puts it back to the deck's. */
  translationCode?: string | null;
}
