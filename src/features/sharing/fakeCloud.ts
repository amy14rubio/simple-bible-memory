import { NewerFormatError, type CloudBackend, type CloudCard, type CloudDeckMeta } from './types';

/** The public catalogue in memory, for tests. It also counts what was sent, so tests can check that only changes go out. */
export function createFakeCloud() {
  const decks = new Map<string, { meta: CloudDeckMeta; cards: Map<string, CloudCard> }>();
  const log: string[] = [];
  const cloud: CloudBackend & { decks: typeof decks; log: string[]; failNext: (message?: string) => void } = {
    decks,
    log,
    failNext(message = 'offline') { pending = message; },
    async createDeck(id, meta) { check(); log.push(`createDeck ${id}`); decks.set(id, { meta, cards: new Map() }); },
    async updateDeck(id, meta) { check(); log.push(`updateDeck ${id}`); const d = decks.get(id); if (!d) throw new Error('no such deck'); if (d.meta.v > meta.v) throw new NewerFormatError(); d.meta = meta; },
    async putCards(id, cards) { check(); log.push(`putCards ${cards.length}`); const d = decks.get(id); if (!d) throw new Error('no such deck'); for (const c of cards) { if ((d.cards.get(c.id)?.v ?? 1) > c.v) throw new NewerFormatError(); d.cards.set(c.id, c); } },
    async removeCards(id, ids) { check(); log.push(`removeCards ${ids.length}`); const d = decks.get(id); for (const i of ids) d?.cards.delete(i); },
    async removeDeck(id) { check(); log.push(`removeDeck ${id}`); decks.delete(id); },
    async removeAllMine() { check(); log.push('removeAllMine'); decks.clear(); },
  };
  let pending: string | null = null;
  function check() { if (pending) { const m = pending; pending = null; throw new Error(m); } }
  return cloud;
}
