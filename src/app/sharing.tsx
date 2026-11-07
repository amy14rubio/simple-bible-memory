import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRepositories } from './repositories';
import { announceDatabaseWrite, onDatabaseWrite } from '../data/writeEvents';
import { loadBackends, sharingAvailable, type Backends } from '../features/sharing/backend';
import { createSyncEngine } from '../features/sharing/syncEngine';
import { TERMS_KEY, TERMS_VERSION } from '../features/sharing/terms';
import { createAccountSync, type AccountChoice } from '../features/account/accountSync';
import type { AccountBackend, AccountStatus } from '../features/account/types';
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
  /** Sign in with Apple: only in the iPhone and iPad app. */
  signInWithApple: () => Promise<void>;
  signOut: () => Promise<void>;
  /** Removes every public deck of this person, then deletes their account. Their local decks stay. */
  deleteAccount: () => Promise<void>;
  publish: (deckId: string) => Promise<void>;
  unpublish: (deckId: string) => Promise<void>;
  statusOf: (deckId: string) => DeckSyncStatus | undefined;
  /** Is the person's own data (decks, cards, study schedule) being backed up to their account? */
  accountStatus: AccountStatus;
  /** Set when the person signed in with a different account than this device was linked to: they must choose what happens to the decks here. */
  pendingSwitch: { email: string | null } | null;
  /** 'cancel' signs out again and changes nothing. */
  resolveSwitch: (choice: AccountChoice | 'cancel') => Promise<void>;
}
const Ctx = createContext<SharingValue | null>(null);

/**
 * Sign-in and publishing for the whole app. Sign-in is optional and only loaded when needed (to publish, or when some deck
 * is already published). Once signed in, every edit to a published deck is sent automatically in the background.
 */
export function SharingProvider({ children }: { children: ReactNode }) {
  const { sharing, account: accountRepo, settings } = useRepositories();
  const available = useMemo(() => sharingAvailable(), []);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authLoaded, setAuthLoaded] = useState(false);
  const [pendingSwitch, setPendingSwitch] = useState<{ uid: string; email: string | null } | null>(null);
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
  const engine = useMemo(() => createSyncEngine({
    sharing, cloud, ready: () => userRef.current !== null,
    agreed: async () => ((await settings.get<number>(TERMS_KEY)) ?? 0) >= TERMS_VERSION,
  }), [sharing, cloud, settings]);

  // The person's own data goes to their account through this, which also waits for the real thing to be loaded.
  const accountBackend = useMemo<AccountBackend>(() => {
    const b = async () => (backends.current ??= await loadBackends()).account;
    return {
      listen(since, onItems, onError) {
        let stop: (() => void) | undefined;
        let cancelled = false;
        void b().then((a) => { if (!cancelled) stop = a.listen(since, onItems, onError); }, onError);
        return () => { cancelled = true; stop?.(); };
      },
      push: async (items) => (await b()).push(items),
      removeAll: async () => (await b()).removeAll(),
    };
  }, []);
  const account = useMemo(() => createAccountSync({ repo: accountRepo, backend: accountBackend, announce: announceDatabaseWrite }), [accountRepo, accountBackend]);
  const [accountStatus, setAccountStatus] = useState<AccountStatus>({ state: 'off' });

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
        if (u) {
          void engine.syncAll(); // signing in catches up on anything that was waiting
          // Back up the person's own data too, unless this device holds decks from another account: then they choose first.
          void account.prepare(u.uid).then((r) => { if (r === 'ready') void account.start(u.uid); else setPendingSwitch({ uid: u.uid, email: u.email }); });
        } else {
          account.stop();
          setPendingSwitch(null);
        }
      });
    }).catch(() => { loading.current = false; });
  }, [available, engine, account]);

  // Published decks already exist, or this device is linked to an account: sign-in is needed to keep them up to date, so load it.
  useEffect(() => {
    if (!available) return;
    void Promise.all([sharing.publishedDeckIds(), accountRepo.getMeta('owner')]).then(([ids, owner]) => { if (ids.length > 0 || owner) ensureLoaded(); });
  }, [available, sharing, accountRepo, ensureLoaded]);

  // Edits are noticed, and sent a moment later; coming back online catches up too.
  useEffect(() => {
    if (!available) return;
    const off = onDatabaseWrite(() => { engine.schedule(); account.schedule(); });
    const online = () => { void engine.syncAll(); void account.syncAll(); };
    window.addEventListener('online', online);
    const unsubscribe = engine.subscribe(() => bump((n) => n + 1));
    const unsubscribeAccount = account.subscribe(() => setAccountStatus(account.status()));
    return () => { off(); window.removeEventListener('online', online); unsubscribe(); unsubscribeAccount(); };
  }, [available, engine, account]);

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
    async signInWithApple() {
      ensureLoaded();
      const b = (backends.current ??= await loadBackends());
      if (!b.auth.signInWithApple) throw new Error('Sign in with Apple is not available here');
      await b.auth.signInWithApple();
    },
    async signOut() {
      const b = (backends.current ??= await loadBackends());
      await b.auth.signOut();
    },
    async deleteAccount() {
      const b = (backends.current ??= await loadBackends());
      // The person's confirmation (signing in again) comes first, inside deleteAccount, so cancelling or a dropped connection there
      // loses nothing. Then their data goes (if removing it fails, e.g. offline, the account stays so it can be tried again).
      await b.auth.deleteAccount(async () => {
        await b.cloud.removeAllMine();
        await account.eraseAccountData(); // the backup of decks, cards and study schedules goes too
        for (const id of await sharing.publishedDeckIds()) await sharing.unpublish(id);
      });
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
    accountStatus,
    pendingSwitch: pendingSwitch && { email: pendingSwitch.email },
    async resolveSwitch(choice) {
      const pending = pendingSwitch;
      if (!pending) return;
      setPendingSwitch(null);
      if (choice === 'cancel') {
        const b = (backends.current ??= await loadBackends());
        await b.auth.signOut(); // nothing was changed on this device
        return;
      }
      await account.resolve(pending.uid, choice);
      announceDatabaseWrite(); // 'replace' emptied this device: screens refresh
      await account.start(pending.uid);
    },
  }), [available, user, authLoaded, ensureLoaded, engine, sharing, version, accountStatus, pendingSwitch, account]);

  return <Ctx value={value}>{children}</Ctx>;
}

export function useSharing() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSharing must be used inside SharingProvider');
  return v;
}
