
/** A card as it appears in the public copy of a deck. (A card's private note is never published.) */
export interface CloudCard {
  id: string;
  reference: string;
  /** Empty for a card in a licensed translation: whoever imports the deck fetches its text from the publisher. */
  verseText: string;
  position: number;
  /** The card's own (licensed) translation, when it has one. */
  translation?: string;
  /** The format version it is saved in. */
  v: number;
}

/** A deck's details as they appear in the public copy. */
export interface CloudDeckMeta {
  title: string;
  description: string | null;
  /** An open translation's code, "OWN", a licensed code, or "MIXED". */
  translation: string;
  /** The language's code ("en", "es", or any other for a licensed text). */
  language: string;
  cardCount: number;
  /** The format version the deck and its cards are saved in. */
  v: number;
}

/**
 * Everything the app asks of the public catalogue on behalf of the signed-in person. Real one: Firestore.
 * Fake one: in memory, for tests. All calls act on the person's own decks only; they throw if the person is not signed in
 * or the network is down, and the sync engine simply tries again later.
 */
export interface CloudBackend {
  createDeck(id: string, meta: CloudDeckMeta): Promise<void>;
  updateDeck(id: string, meta: CloudDeckMeta): Promise<void>;
  putCards(id: string, cards: CloudCard[]): Promise<void>;
  removeCards(id: string, cardIds: string[]): Promise<void>;
  /** Removes the deck and its cards. Fine if it is already gone. */
  removeDeck(id: string): Promise<void>;
  /** Removes every deck this person published (used when they delete their account). */
  removeAllMine(): Promise<void>;
}

export interface AuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
}

export interface AuthBackend {
  current(): AuthUser | null;
  /** Calls back now and whenever the person signs in or out. */
  subscribe(callback: (user: AuthUser | null) => void): () => void;
  signInWithGoogle(): Promise<AuthUser>;
  /** Only in the iPhone and iPad app (see `appleSignInSupported`). */
  signInWithApple?(): Promise<AuthUser>;
  signOut(): Promise<void>;
  /**
   * Deletes the account. Whatever the sign-in needs (a fresh confirmation) comes FIRST, so a person who cancels or loses the
   * connection there loses nothing; then `beforeDelete` runs (the caller removes the person's data and public decks), and the
   * account itself goes last.
   */
  deleteAccount(beforeDelete?: () => Promise<void>): Promise<void>;
}

/** Settings the app reads from the cloud (anyone can read them; only the owner writes them, in the Firebase console). */
export interface ConfigBackend {
  /** The off switch for licensed translations (see src/domain/bible/switch.ts): the document's data, or null if there is none. */
  licensedSwitch(): Promise<unknown>;
}

/** Why a deck cannot be published or kept in sync. */
export type BlockReason = 'no-translation' | 'copyrighted' | 'no-language' | 'too-many-cards' | 'newer-format' | 'rules';

/** The public copy was saved by a newer version of the app than this one, so this app must not touch it. */
export class NewerFormatError extends Error {
  constructor() { super('The public copy of this deck is in a newer format than this app understands.'); }
}
export type DeckSyncStatus =
  | { state: 'syncing' }
  | { state: 'synced' }
  | { state: 'waiting' } // signed out or offline: it will be sent when it can
  | { state: 'blocked'; reason: BlockReason };
