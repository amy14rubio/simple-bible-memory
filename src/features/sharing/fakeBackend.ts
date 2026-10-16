import type { AuthBackend, AuthUser, CloudBackend, CloudCard, CloudDeckMeta } from './types';

/**
 * A stand-in for Google sign-in and Firestore, kept in the browser's localStorage, used by the browser tests
 * (VITE_SHARING_BACKEND=fake). It follows the same interfaces as the real thing, and `window.__fakeCloud()` lets a test
 * look at what has been "published".
 */
const KEY = 'sbm-fake-cloud';
interface State { user: AuthUser | null; decks: Record<string, { meta: CloudDeckMeta; cards: Record<string, CloudCard> }>; offline: boolean }

const load = (): State => { try { return { user: null, decks: {}, offline: false, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<State>) }; } catch { return { user: null, decks: {}, offline: false }; } };
const save = (s: State) => localStorage.setItem(KEY, JSON.stringify(s));

export function createFakeBackends(): { auth: AuthBackend; cloud: CloudBackend } {
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
      s.user = { uid: 'fake-user', email: 'reader@example.com', displayName: 'Reader' };
      save(s);
      emit(s.user);
      return s.user;
    },
    async signOut() { const s = load(); s.user = null; save(s); emit(null); },
    async deleteAccount() { const s = load(); s.user = null; s.decks = {}; save(s); emit(null); },
  };

  const cloud: CloudBackend = {
    async createDeck(id, meta) { edit((s) => { s.decks[id] = { meta, cards: {} }; }); },
    async updateDeck(id, meta) { edit((s) => { const d = s.decks[id]; if (!d) throw new Error('no such deck'); d.meta = meta; }); },
    async putCards(id, cards) { edit((s) => { const d = s.decks[id]; if (!d) throw new Error('no such deck'); for (const c of cards) d.cards[c.id] = c; }); },
    async removeCards(id, ids) { edit((s) => { const d = s.decks[id]; if (d) for (const i of ids) delete d.cards[i]; }); },
    async removeDeck(id) { edit((s) => { delete s.decks[id]; }); },
    async removeAllMine() { edit((s) => { s.decks = {}; }); },
  };
  return { auth, cloud };
}
