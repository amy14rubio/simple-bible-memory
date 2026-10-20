import type { SharingLanguage } from '../../domain/sharing/translations';

/** A card as it appears in the public copy of a deck. (A card's private note is never published.) */
export interface CloudCard {
  id: string;
  reference: string;
  verseText: string;
  position: number;
  /** The format version it is saved in. */
  v: number;
}

/** A deck's details as they appear in the public copy. */
export interface CloudDeckMeta {
  title: string;
  description: string | null;
  translation: string;
  language: SharingLanguage;
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
  signOut(): Promise<void>;
  /** Deletes the account itself (the caller removes the person's public decks first). */
  deleteAccount(): Promise<void>;
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
