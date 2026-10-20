import type { SharingRepository } from '../../data/repositories/sharingRepository';
import { PUBLIC_SCHEMA_VERSION } from '../../domain/sharing/version';
import { LIMITS, canPublishTranslation, translationLanguage, SHARING_LANGUAGES, type SharingLanguage } from '../../domain/sharing/translations';
import { cardFingerprint, metaFingerprint } from './fingerprint';
import { NewerFormatError, type BlockReason, type CloudBackend, type CloudCard, type CloudDeckMeta, type DeckSyncStatus } from './types';

/**
 * Keeps each published deck's public copy in step with the local deck, automatically. The local database remembers a
 * fingerprint of what was last sent for every card, so only cards that changed are sent again, and which deletions are
 * still owed. If the network is down or nobody is signed in, nothing is lost: the work is simply done next time.
 */
const CHUNK = 400; // Firestore allows 500 writes per batch

export class PublishBlockedError extends Error {
  reason: BlockReason;
  constructor(reason: BlockReason) { super(`This deck can't be published: ${reason}`); this.reason = reason; }
}

/** The reason a deck can't be (or stay) published, or null if it can. */
export function blockReason(deck: { translationCode: string | null; bibleLanguage: string | null }, cardCount: number): BlockReason | null {
  if (!deck.translationCode) return 'no-translation';
  if (!canPublishTranslation(deck.translationCode)) return 'copyrighted';
  if (!languageOf(deck)) return 'no-language';
  if (cardCount > LIMITS.cardsPerDeck) return 'too-many-cards';
  return null;
}

function languageOf(deck: { translationCode: string | null; bibleLanguage: string | null }): SharingLanguage | null {
  const fixed = deck.translationCode ? translationLanguage(deck.translationCode) : null;
  if (fixed) return fixed;
  return SHARING_LANGUAGES.find((l) => l === deck.bibleLanguage) ?? null;
}

export interface SyncEngine {
  /** Marks the deck published and sends it. Throws PublishBlockedError if it may not be published. */
  publish(deckId: string): Promise<void>;
  /** Removes the public copy (needs a connection) and keeps the local deck. */
  unpublish(deckId: string): Promise<void>;
  /** Brings every public copy up to date now. Never throws: problems become statuses. */
  syncAll(): Promise<void>;
  /** Same, a moment from now (so a burst of edits is sent once). */
  schedule(): void;
  status(deckId: string): DeckSyncStatus | undefined;
  subscribe(callback: () => void): () => void;
}

export function createSyncEngine({ sharing, cloud, ready, delayMs = 1500, schemaVersion = PUBLIC_SCHEMA_VERSION }: {
  sharing: SharingRepository;
  cloud: CloudBackend;
  /** True when the person is signed in (and so changes can be sent). */
  ready: () => boolean;
  delayMs?: number;
  /** The deck format this app writes (a different one only in tests). */
  schemaVersion?: number;
}): SyncEngine {
  const statuses = new Map<string, DeckSyncStatus>();
  const listeners = new Set<() => void>();
  const set = (deckId: string, s: DeckSyncStatus | undefined) => {
    if (s) statuses.set(deckId, s); else statuses.delete(deckId);
    listeners.forEach((l) => l());
  };

  async function syncDeck(deckId: string): Promise<DeckSyncStatus> {
    const deck = await sharing.getDeck(deckId);
    if (!deck?.publishId) return { state: 'synced' };
    const publishId = deck.publishId;
    const rows = await sharing.cardsOf(deckId);
    const reason = blockReason(deck, rows.length);
    if (reason) return { state: 'blocked', reason };

    const meta: CloudDeckMeta = { title: deck.title, description: deck.description, translation: deck.translationCode!, language: languageOf(deck)!, cardCount: rows.length, v: schemaVersion };
    const cards: (CloudCard & { hash: string; syncedHash: string | null })[] = rows.map((r, position) => {
      const card = { id: r.id, reference: r.reference, verseText: r.verseText, position };
      return { ...card, v: schemaVersion, hash: cardFingerprint(card), syncedHash: r.syncedHash };
    });
    const changed = cards.filter((c) => c.hash !== c.syncedHash);
    const removals = await sharing.pendingCardRemovals(publishId);
    const metaStamp = metaFingerprint(meta);
    const firstTime = deck.syncedMeta === null;

    if (firstTime) await cloud.createDeck(publishId, meta);
    for (let i = 0; i < changed.length; i += CHUNK) {
      await cloud.putCards(publishId, changed.slice(i, i + CHUNK).map(({ id, reference, verseText, position, v }) => ({ id, reference, verseText, position, v })));
    }
    for (let i = 0; i < removals.length; i += CHUNK) await cloud.removeCards(publishId, removals.slice(i, i + CHUNK));
    if (!firstTime && deck.syncedMeta !== metaStamp) await cloud.updateDeck(publishId, meta);

    await sharing.markSynced(deckId, { cardHashes: Object.fromEntries(changed.map((c) => [c.id, c.hash])), meta: metaStamp });
    await sharing.clearCardRemovals(publishId, removals);
    return { state: 'synced' };
  }

  let running: Promise<void> | null = null;
  let again = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  async function pass() {
    const ids = await sharing.publishedDeckIds();
    if (!ready()) { for (const id of ids) set(id, { state: 'waiting' }); return; }
    for (const publishId of await sharing.pendingDeckRemovals()) {
      try { await cloud.removeDeck(publishId); await sharing.clearDeckRemoval(publishId); } catch { /* try again next time */ }
    }
    for (const id of ids) {
      set(id, { state: 'syncing' });
      try { set(id, await syncDeck(id)); } catch (e) { set(id, e instanceof NewerFormatError ? { state: 'blocked', reason: 'newer-format' } : { state: 'waiting' }); }
    }
  }

  const engine: SyncEngine = {
    async publish(deckId) {
      const deck = await sharing.getDeck(deckId);
      if (!deck) throw new Error('No such deck');
      const reason = blockReason(deck, (await sharing.cardsOf(deckId)).length);
      if (reason) throw new PublishBlockedError(reason);
      if (!deck.publishId) await sharing.publish(deckId, crypto.randomUUID());
      set(deckId, { state: 'syncing' });
      try { set(deckId, await syncDeck(deckId)); } catch (e) { set(deckId, e instanceof NewerFormatError ? { state: 'blocked', reason: 'newer-format' } : { state: 'waiting' }); throw e; }
    },

    async unpublish(deckId) {
      const deck = await sharing.getDeck(deckId);
      if (!deck?.publishId) return;
      await cloud.removeDeck(deck.publishId);
      await sharing.unpublish(deckId);
      set(deckId, undefined);
    },

    syncAll() {
      if (running) { again = true; return running; }
      running = (async () => {
        try { do { again = false; await pass(); } while (again); }
        finally { running = null; }
      })();
      return running;
    },

    schedule() {
      clearTimeout(timer);
      timer = setTimeout(() => { void engine.syncAll(); }, delayMs);
    },

    status: (deckId) => statuses.get(deckId),
    subscribe(cb) { listeners.add(cb); return () => { listeners.delete(cb); }; },
  };
  return engine;
}
