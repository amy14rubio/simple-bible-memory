import { collection, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where, writeBatch, type Firestore } from 'firebase/firestore';
import { NewerFormatError, type CloudBackend, type CloudCard, type CloudDeckMeta } from './types';

/**
 * The public catalogue in Firestore. Layout: `publicDecks/{id}` holds a deck's details (and who owns it, as an opaque
 * id: no name or email is ever stored), and `publicDecks/{id}/cards/{cardId}` holds its cards. The security rules in
 * firestore.rules decide who may do what; this code just does the work, and the rules tests run it against them.
 */
const CHUNK = 400;

const deckFields = (m: CloudDeckMeta) => ({
  title: m.title,
  titleLower: m.title.toLowerCase(),
  description: m.description,
  translation: m.translation,
  language: m.language,
  cardCount: m.cardCount,
  v: m.v,
});

export function createFirestoreCloud(db: Firestore, uid: () => string): CloudBackend {
  const deckRef = (id: string) => doc(db, 'publicDecks', id);
  const cardsRef = (id: string) => collection(db, 'publicDecks', id, 'cards');

  /**
   * Runs a write. If the rules refuse it because the public copy is in a newer format than this app writes (the rules never
   * let an older format replace a newer one), that is reported as NewerFormatError rather than as a failure to retry.
   */
  async function guarded<T>(id: string, v: number, write: () => Promise<T>): Promise<T> {
    try { return await write(); } catch (e) {
      if ((e as { code?: string }).code === 'permission-denied') {
        const there = await getDoc(deckRef(id)).catch(() => null);
        if (there?.exists() && typeof there.data().v === 'number' && there.data().v > v) throw new NewerFormatError();
      }
      throw e;
    }
  }

  async function removeDeck(id: string) {
    if (!(await getDoc(deckRef(id))).exists()) return; // already gone (the rules need the deck to prove who owns its cards)
    const ids = (await getDocs(cardsRef(id))).docs.map((d) => d.id);
    for (let i = 0; i < ids.length; i += CHUNK) {
      const batch = writeBatch(db);
      for (const cardId of ids.slice(i, i + CHUNK)) batch.delete(doc(db, 'publicDecks', id, 'cards', cardId));
      await batch.commit();
    }
    const batch = writeBatch(db);
    batch.delete(deckRef(id));
    await batch.commit();
  }

  return {
    async createDeck(id, meta) {
      await guarded(id, meta.v, () => setDoc(deckRef(id), { ownerId: uid(), ...deckFields(meta), createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));
    },

    async updateDeck(id, meta) {
      await guarded(id, meta.v, () => updateDoc(deckRef(id), { ...deckFields(meta), updatedAt: serverTimestamp() }));
    },

    async putCards(id, cards: CloudCard[]) {
      for (let i = 0; i < cards.length; i += CHUNK) {
        const batch = writeBatch(db);
        for (const c of cards.slice(i, i + CHUNK)) {
          batch.set(doc(db, 'publicDecks', id, 'cards', c.id), { reference: c.reference, verseText: c.verseText, position: c.position, ...(c.translation ? { translation: c.translation } : {}), v: c.v });
        }
        await guarded(id, Math.max(...cards.slice(i, i + CHUNK).map((c) => c.v)), () => batch.commit());
      }
    },

    async removeCards(id, cardIds) {
      for (let i = 0; i < cardIds.length; i += CHUNK) {
        const batch = writeBatch(db);
        for (const cardId of cardIds.slice(i, i + CHUNK)) batch.delete(doc(db, 'publicDecks', id, 'cards', cardId));
        await batch.commit();
      }
    },

    removeDeck,

    async removeAllMine() {
      const mine = await getDocs(query(collection(db, 'publicDecks'), where('ownerId', '==', uid())));
      for (const d of mine.docs) await removeDeck(d.id);
    },
  };
}
