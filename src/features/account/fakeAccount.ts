import type { AccountBackend, OutItem, RemoteItem } from './types';
import { itemKey } from '../../domain/account/items';

/**
 * A stand-in for the person's private area in Firestore, used by the browser tests and the engine's own tests. It keeps
 * the same promises as the real thing: an older version never replaces a newer one, and every write gets a later
 * "synced at" time than the one before.
 */
export interface FakeAccountState {
  /** per signed-in person: item key ("deck~ID") -> what is stored */
  items: Record<string, Record<string, RemoteItem>>;
  clock: number;
  offline: boolean;
}
export interface FakeAccountStore { load(): FakeAccountState; save(state: FakeAccountState): void }

export const emptyFakeAccount = (): FakeAccountState => ({ items: {}, clock: 0, offline: false });

export function createFakeAccount(store: FakeAccountStore, currentUid: () => string | null, pollMs = 250): AccountBackend {
  const need = () => { const uid = currentUid(); if (!uid) throw new Error('not signed in'); return uid; };
  return {
    listen(since, onItems) {
      const delivered = new Map<string, number>();
      const poll = () => {
        const uid = currentUid();
        const s = store.load();
        if (!uid || s.offline) return;
        const fresh = Object.entries(s.items[uid] ?? {}).filter(([key, it]) => it.syncedAt >= since && delivered.get(key) !== it.syncedAt);
        if (fresh.length === 0) return;
        fresh.forEach(([key, it]) => delivered.set(key, it.syncedAt));
        onItems(fresh.map(([, it]) => structuredClone(it)).sort((a, b) => a.syncedAt - b.syncedAt));
      };
      const first = setTimeout(poll, 0);
      const timer = setInterval(poll, pollMs);
      return () => { clearTimeout(first); clearInterval(timer); };
    },

    async push(items: OutItem[]) {
      const uid = need();
      const s = store.load();
      if (s.offline) throw new Error('offline');
      const mine = (s.items[uid] ??= {});
      const stale: string[] = [];
      for (const it of items) {
        const key = itemKey(it.entity, it.id);
        const existing = mine[key];
        if (existing && it.updatedAt < existing.updatedAt) { stale.push(key); continue; }
        s.clock = Math.max(Date.now(), s.clock + 1);
        mine[key] = { entity: it.entity, id: it.id, deleted: it.deleted, updatedAt: it.updatedAt, syncedAt: s.clock, data: it.doc ? structuredClone(it.doc) : null };
      }
      store.save(s);
      return { stale };
    },

    async removeAll() {
      const uid = need();
      const s = store.load();
      if (s.offline) throw new Error('offline');
      delete s.items[uid];
      store.save(s);
    },
  };
}
