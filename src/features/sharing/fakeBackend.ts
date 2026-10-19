import { NewerFormatError, type AuthBackend, type AuthUser, type CloudBackend, type CloudCard, type CloudDeckMeta } from './types';
import { PAGE_SIZE, type DiscoverBackend, type PublicDeck } from '../discover/types';
import type { AccountBackend } from '../account/types';
import { createFakeAccount, emptyFakeAccount, type FakeAccountState } from '../account/fakeAccount';

/**
 * A stand-in for Google sign-in and Firestore, kept in the browser's localStorage, used by the browser tests
 * (VITE_SHARING_BACKEND=fake). It follows the same interfaces as the real thing, and `window.__fakeCloud()` lets a test
 * look at what has been "published".
 */
const KEY = 'sbm-fake-cloud';
interface State {
  user: AuthUser | null;
  decks: Record<string, { ownerId?: string; createdAt?: number; hidden?: boolean; meta: CloudDeckMeta; cards: Record<string, CloudCard> }>;
  reports?: { deckId: string; reason: string; details: string }[];
  /** Tests: which account the next sign-in is (default one account). */
  nextUid?: string;
  offline: boolean;
}

const load = (): State => { try { return { user: null, decks: {}, offline: false, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<State>) }; } catch { return { user: null, decks: {}, offline: false }; } };
const save = (s: State) => localStorage.setItem(KEY, JSON.stringify(s));

const ACCOUNT_KEY = 'sbm-fake-account';

export function createFakeBackends(): { auth: AuthBackend; cloud: CloudBackend; discover: DiscoverBackend; account: AccountBackend } {
  const listeners = new Set<(u: AuthUser | null) => void>();
  const emit = (u: AuthUser | null) => listeners.forEach((l) => l(u));
  const edit = <T>(fn: (s: State) => T): T => {
    const s = load();
    if (s.offline) throw new Error('offline');
    if (!s.user) throw new Error('not signed in');
    const result = fn(s);
    save(s);
    return result;
  };
  (window as unknown as { __fakeCloud: () => State }).__fakeCloud = load;

  const auth: AuthBackend = {
    current: () => load().user,
    subscribe(cb) { listeners.add(cb); setTimeout(() => cb(load().user), 0); return () => { listeners.delete(cb); }; },
    async signInWithGoogle() {
      const s = load();
      s.user = { uid: s.nextUid ?? 'fake-user', email: `${s.nextUid ?? 'reader'}@example.com`, displayName: s.nextUid ?? 'Reader' };
      save(s);
      emit(s.user);
      return s.user;
    },
    async signOut() { const s = load(); s.user = null; save(s); emit(null); },
    async deleteAccount() { const s = load(); s.user = null; s.decks = {}; save(s); emit(null); },
  };

  const cloud: CloudBackend = {
    async createDeck(id, meta) { edit((s) => { s.decks[id] = { ownerId: s.user!.uid, createdAt: Date.now(), meta, cards: {} }; }); },
    async updateDeck(id, meta) { edit((s) => { const d = s.decks[id]; if (!d) throw new Error('no such deck'); if ((d.meta.v ?? 1) > meta.v) throw new NewerFormatError(); d.meta = meta; }); },
    async putCards(id, cards) { edit((s) => { const d = s.decks[id]; if (!d) throw new Error('no such deck'); for (const c of cards) d.cards[c.id] = c; }); },
    async removeCards(id, ids) { edit((s) => { const d = s.decks[id]; if (d) for (const i of ids) delete d.cards[i]; }); },
    async removeDeck(id) { edit((s) => { delete s.decks[id]; }); },
    async removeAllMine() { edit((s) => { s.decks = {}; }); },
  };

  const publicDeck = (id: string, d: State['decks'][string]): PublicDeck => ({
    id, title: d.meta.title, description: d.meta.description, translation: d.meta.translation, language: d.meta.language, cardCount: d.meta.cardCount, createdAt: d.createdAt ?? 0, v: d.meta.v ?? 1,
  });
  const discover: DiscoverBackend = {
    async listDecks(filters, cursor) {
      const s = load();
      if (s.offline) throw new Error('offline');
      const q = filters.query.trim().toLowerCase();
      const all = Object.entries(s.decks)
        .filter(([, d]) => !d.hidden && (filters.language === 'all' || d.meta.language === filters.language) && (filters.translation === 'all' || d.meta.translation === filters.translation) && (!q || d.meta.title.toLowerCase().startsWith(q)))
        .sort(([, a], [, b]) => (q ? a.meta.title.toLowerCase().localeCompare(b.meta.title.toLowerCase()) : (b.createdAt ?? 0) - (a.createdAt ?? 0)));
      const start = typeof cursor === 'number' ? cursor : 0;
      const page = all.slice(start, start + PAGE_SIZE);
      return { decks: page.map(([id, d]) => publicDeck(id, d)), cursor: start + PAGE_SIZE < all.length ? start + PAGE_SIZE : null };
    },
    async getDeck(id) { const s = load(); if (s.offline) throw new Error('offline'); const d = s.decks[id]; return d && !d.hidden ? publicDeck(id, d) : null; },
    async getCards(id) {
      const s = load();
      if (s.offline) throw new Error('offline');
      return Object.values(s.decks[id]?.cards ?? {}).sort((a, b) => a.position - b.position).map((c) => ({ id: c.id, reference: c.reference, verseText: c.verseText, position: c.position }));
    },
    async report(deckId, reason, details) {
      const s = load();
      if (s.offline) throw new Error('offline');
      s.reports = [...(s.reports ?? []), { deckId, reason, details }];
      save(s);
    },
  };
  // The person's private backup, kept beside the public decks. "Offline" is shared, so one switch cuts off both.
  const account = createFakeAccount(
    {
      load: (): FakeAccountState => {
        try { return { ...emptyFakeAccount(), ...(JSON.parse(localStorage.getItem(ACCOUNT_KEY) ?? '{}') as Partial<FakeAccountState>), offline: load().offline }; } catch { return { ...emptyFakeAccount(), offline: load().offline }; }
      },
      save: ({ offline: _o, ...rest }) => localStorage.setItem(ACCOUNT_KEY, JSON.stringify(rest)),
    },
    () => load().user?.uid ?? null,
  );
  (window as unknown as { __fakeAccount: () => unknown }).__fakeAccount = () => JSON.parse(localStorage.getItem(ACCOUNT_KEY) ?? '{}');
  return { auth, cloud, discover, account };
}
