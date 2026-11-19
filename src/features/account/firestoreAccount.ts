import { collection, doc, getDoc, getDocs, onSnapshot, orderBy, query, serverTimestamp, Timestamp, where, writeBatch, setDoc, type Firestore } from 'firebase/firestore';
import { itemKey, parseKey } from '../../domain/account/items';
import type { AccountBackend, OutItem, RemoteItem } from './types';

/**
 * The person's private area in Firestore: one collection, `users/{uid}/items`, with a document per thing ("deck~ID",
 * "card~ID", "schedule~CARDID~KIND", "setting~KEY"). Every document carries `updatedAt` (when the thing was last changed,
 * from the device) and `syncedAt` (when the cloud received it: this is what other devices ask "what is new since?" with).
 * firestore.rules makes it private to the person and refuses to replace a newer version with an older one.
 */
const CHUNK = 400;

export function createFirestoreAccount(db: Firestore, uid: () => string): AccountBackend {
  const items = () => collection(db, 'users', uid(), 'items');
  const ref = (it: { entity: string; id: string }) => doc(db, 'users', uid(), 'items', itemKey(it.entity as never, it.id));
  const body = (it: OutItem) => ({ entity: it.entity, deleted: it.deleted, updatedAt: it.updatedAt, v: it.v, ...(it.doc ?? {}), syncedAt: serverTimestamp() });
  const denied = (e: unknown) => typeof e === 'object' && e !== null && (e as { code?: string }).code === 'permission-denied';

  return {
    listen(since, onItems, onError) {
      const q = query(items(), where('syncedAt', '>=', Timestamp.fromMillis(since)), orderBy('syncedAt'));
      return onSnapshot(
        q,
        (snap) => {
          const out: RemoteItem[] = [];
          for (const change of snap.docChanges()) {
            if (change.type === 'removed' || change.doc.metadata.hasPendingWrites) continue; // our own write, not yet confirmed: it comes back
            const parsed = parseKey(change.doc.id);
            const data = change.doc.data();
            const syncedAt = data.syncedAt instanceof Timestamp ? data.syncedAt.toMillis() : 0;
            if (!parsed || typeof data.updatedAt !== 'number' || syncedAt === 0) continue;
            out.push({ entity: parsed.entity, id: parsed.id, deleted: data.deleted === true, updatedAt: data.updatedAt, syncedAt, v: typeof data.v === 'number' ? data.v : 1, data });
          }
          if (out.length) onItems(out);
        },
        onError,
      );
    },

    async push(list) {
      const stale: string[] = [];
      const refused: string[] = [];
      for (let i = 0; i < list.length; i += CHUNK) {
        const chunk = list.slice(i, i + CHUNK);
        try {
          const batch = writeBatch(db);
          for (const it of chunk) batch.set(ref(it), body(it));
          await batch.commit();
        } catch (e) {
          if (!denied(e)) throw e;
          // One of them is older than what the cloud has (a batch is all-or-nothing): find out which, send the rest.
          for (const it of chunk) {
            try { await setDoc(ref(it), body(it)); } catch (err) {
              if (!denied(err)) throw err;
              // Refused: only "the cloud has a newer one" counts as stale. Any other refusal is reported (as `refused`), never hidden, and never stops the rest.
              const there = await getDoc(ref(it));
              const theirs = there.exists() ? there.data() : null;
              // Refused because the cloud has a newer edit, or the same thing saved in a newer format than this app writes.
              if (theirs && typeof theirs.updatedAt === 'number' && (theirs.updatedAt > it.updatedAt || (typeof theirs.v === 'number' && theirs.v > it.v))) stale.push(itemKey(it.entity, it.id));
              else { refused.push(itemKey(it.entity, it.id)); console.warn('The account did not accept', itemKey(it.entity, it.id)); } // set aside: the others must still be sent
            }
          }
        }
      }
      return { stale, refused };
    },

    async removeAll() {
      const ids = (await getDocs(items())).docs.map((d) => d.id);
      for (let i = 0; i < ids.length; i += CHUNK) {
        const batch = writeBatch(db);
        for (const id of ids.slice(i, i + CHUNK)) batch.delete(doc(db, 'users', uid(), 'items', id));
        await batch.commit();
      }
    },
  };
}
