import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRepositories } from './repositories';
import { onDatabaseWrite } from '../data/writeEvents';
import { loadBackends, sharingAvailable, type Backends } from '../features/sharing/backend';
import { createSyncEngine } from '../features/sharing/syncEngine';
import type { AuthUser, CloudBackend, DeckSyncStatus } from '../features/sharing/types';

interface SharingValue {
  /** Is sharing set up in this build at all? */
  available: boolean;
  /** Who is signed in (null if nobody). Only known once `authLoaded`. */
  user: AuthUser | null;
  authLoaded: boolean;
  /** Starts loading sign-in (it is loaded only when something needs it). */
  ensureLoaded: () => void;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  /** Removes every public deck of this person, then deletes their account. Their local decks stay. */
  deleteAccount: () => Promise<void>;
  publish: (deckId: string) => Promise<void>;
  unpublish: (deckId: string) => Promise<void>;
  statusOf: (deckId: string) => DeckSyncStatus | undefined;
}
const Ctx = createContext<SharingValue | null>(null);

/**
 * Sign-in and publishing for the whole app. Sign-in is optional and only loaded when needed (to publish, or when some deck
 * is already published). Once signed in, every edit to a published deck is sent automatically in the background.
 */
export function SharingProvider({ children }: { children: ReactNode }) {
  const { sharing } = useRepositories();
  const available = useMemo(() => sharingAvailable(), []);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authLoaded, setAuthLoaded] = useState(false);
  const [version, bump] = useState(0); // goes up whenever a deck's sync status changes, so screens showing it update
  const userRef = useRef<AuthUser | null>(null);
  const backends = useRef<Backends>(undefined);

  // The engine talks to the cloud through this, which waits for the real thing to be loaded.
  const cloud = useMemo<CloudBackend>(() => {
    const b = async () => (backends.current ??= await loadBackends());
    return {
      createDeck: async (id, m) => (await b()).cloud.createDeck(id, m),
      updateDeck: async (id, m) => (await b()).cloud.updateDeck(id, m),
      putCards: async (id, c) => (await b()).cloud.putCards(id, c),
      removeCards: async (id, c) => (await b()).cloud.removeCards(id, c),
      removeDeck: async (id) => (await b()).cloud.removeDeck(id),
      removeAllMine: async () => (await b()).cloud.removeAllMine(),
    };
  }, []);
  const engine = useMemo(() => createSyncEngine({ sharing, cloud, ready: () => userRef.current !== null }), [sharing, cloud]);

  const loading = useRef(false);
  const ensureLoaded = useCallback(() => {
    if (!available || loading.current) return;
    loading.current = true;
    loadBackends().then((b) => {
      backends.current = b;
      b.auth.subscribe((u) => {
        userRef.current = u;
        setUser(u);
        setAuthLoaded(true);
        if (u) void engine.syncAll(); // signing in catches up on anything that was waiting
      });
    }).catch(() => { loading.current = false; });
  }, [available, engine]);

  // Published decks already exist: sign-in is needed to keep them up to date, so load it.
  useEffect(() => { if (available) void sharing.publishedDeckIds().then((ids) => { if (ids.length > 0) ensureLoaded(); }); }, [available, sharing, ensureLoaded]);

  // Edits are noticed, and sent a moment later; coming back online catches up too.
  useEffect(() => {
    if (!available) return;
    const off = onDatabaseWrite(() => engine.schedule());
    const online = () => void engine.syncAll();
    window.addEventListener('online', online);
    const unsubscribe = engine.subscribe(() => bump((n) => n + 1));
    return () => { off(); window.removeEventListener('online', online); unsubscribe(); };
  }, [available, engine]);

  const value = useMemo<SharingValue>(() => ({
    available,
    user,
    authLoaded,
    ensureLoaded,
    async signIn() {
      ensureLoaded();
      const b = (backends.current ??= await loadBackends());
      await b.auth.signInWithGoogle();
    },
    async signOut() {
      const b = (backends.current ??= await loadBackends());
      await b.auth.signOut();
    },
    async deleteAccount() {
      const b = (backends.current ??= await loadBackends());
      await b.cloud.removeAllMine(); // first: if this fails (offline), the account stays so it can be tried again
      for (const id of await sharing.publishedDeckIds()) await sharing.unpublish(id);
      await b.auth.deleteAccount();
      bump((n) => n + 1);
    },
    async publish(deckId) {
      ensureLoaded();
      if (!userRef.current) throw new Error('Not signed in');
      await engine.publish(deckId);
    },
    async unpublish(deckId) {
      ensureLoaded();
      await engine.unpublish(deckId);
    },
    statusOf: (deckId) => engine.status(deckId),
  }), [available, user, authLoaded, ensureLoaded, engine, sharing, version]);

  return <Ctx value={value}>{children}</Ctx>;
}

export function useSharing() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSharing must be used inside SharingProvider');
  return v;
}
