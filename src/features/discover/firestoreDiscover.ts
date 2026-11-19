import { addDoc, collection, doc, getDocFromServer, getDocsFromServer, limit, orderBy, query, serverTimestamp, startAfter, where, type DocumentData, type DocumentSnapshot, type Firestore, type QueryConstraint } from 'firebase/firestore';
import { PAGE_SIZE, type DiscoverBackend, type PublicDeck } from './types';

/**
 * Reads the public catalogue from Firestore. Newest first, or (when searching) by title, which Firestore can only match
 * from the start of the title; the rules let anyone read, so no sign-in is involved.
 */
const toDeck = (id: string, d: DocumentData): PublicDeck => ({
  id,
  title: d.title,
  description: d.description ?? null,
  translation: d.translation,
  language: d.language,
  cardCount: d.cardCount,
  createdAt: typeof d.createdAt?.toMillis === 'function' ? d.createdAt.toMillis() : 0,
  v: typeof d.v === 'number' ? d.v : 1,
});

// These reads ask the server on purpose ("FromServer"): a plain getDocs with no internet quietly answers with an empty list from its cache, and the
// screen would say "no public collections yet" instead of "no internet". Asking the server makes it fail, so the screen can say so and offer Try again.
export function createFirestoreDiscover(db: Firestore): DiscoverBackend {
  return {
    async listDecks(filters, cursor) {
      const c: QueryConstraint[] = [];
      if (filters.language !== 'all') c.push(where('language', '==', filters.language));
      if (filters.translation !== 'all') c.push(where('translation', '==', filters.translation));
      const text = filters.query.trim().toLowerCase();
      if (text) {
        c.push(where('titleLower', '>=', text), where('titleLower', '<=', `${text}`), orderBy('titleLower'));
      } else {
        c.push(orderBy('createdAt', 'desc'));
      }
      if (cursor) c.push(startAfter(cursor as DocumentSnapshot));
      c.push(limit(PAGE_SIZE + 1)); // one more than a page, to know whether there is a next page

      const snap = await getDocsFromServer(query(collection(db, 'publicDecks'), ...c));
      const docs = snap.docs.slice(0, PAGE_SIZE);
      // Decks you hid after a report stay in Firestore but are left out here.
      return { decks: docs.filter((d) => d.data().hidden !== true).map((d) => toDeck(d.id, d.data())), cursor: snap.docs.length > PAGE_SIZE ? docs[docs.length - 1]! : null };
    },

    async getDeck(id) {
      const snap = await getDocFromServer(doc(db, 'publicDecks', id));
      return snap.exists() && snap.data().hidden !== true ? toDeck(snap.id, snap.data()) : null;
    },

    async getCards(id) {
      const snap = await getDocsFromServer(query(collection(db, 'publicDecks', id, 'cards'), orderBy('position')));
      return snap.docs.map((d) => ({ id: d.id, reference: d.data().reference, verseText: d.data().verseText, position: d.data().position, ...(typeof d.data().translation === 'string' ? { translation: d.data().translation as string } : {}) }));
    },

    async report(deckId, reason, details) {
      await addDoc(collection(db, 'reports'), { deckId, reason, details: details.trim().slice(0, 500), status: 'open', createdAt: serverTimestamp() });
    },
  };
}
