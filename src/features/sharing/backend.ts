import { Capacitor } from '@capacitor/core';
import type { AuthBackend, CloudBackend } from './types';
import type { DiscoverBackend } from '../discover/types';
import type { AccountBackend } from '../account/types';
import type { ConfigBackend } from './types';

/**
 * Finds the sign-in and the public catalogue. The real ones come from Firebase and are loaded only when needed (the
 * library is large), so people who never sign in never download it. The browser tests swap in stand-ins.
 */
export interface Backends { auth: AuthBackend; cloud: CloudBackend; discover: DiscoverBackend; account: AccountBackend; config: ConfigBackend }

const env = import.meta.env;
const config = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
};

/** Is sharing set up in this build? (A Firebase config, or the test stand-ins.) */
export const sharingAvailable = () => env.VITE_SHARING_BACKEND === 'fake' || Boolean(config.apiKey && config.projectId && config.appId);

let loading: Promise<Backends> | undefined;
export function loadBackends(): Promise<Backends> {
  loading ??= (async (): Promise<Backends> => {
    if (env.VITE_SHARING_BACKEND === 'fake') return (await import('./fakeBackend')).createFakeBackends();
    const native = Capacitor.isNativePlatform();
    const [{ initializeApp }, { getAuth, initializeAuth, indexedDBLocalPersistence }, { getFirestore, doc, getDoc }, { createFirebaseAuth }, { createFirestoreCloud }, { createFirestoreDiscover }, { createFirestoreAccount }] = await Promise.all([
      import('firebase/app'), import('firebase/auth'), import('firebase/firestore'), import('./firebaseAuth'), import('./firestoreCloud'), import('../discover/firestoreDiscover'), import('../account/firestoreAccount'),
    ]);
    const uid = () => {
      if (!auth.currentUser) throw new Error('Not signed in');
      return auth.currentUser.uid;
    };
    const app = initializeApp(config);
    // In the Android app the person stays signed in between launches through the web view's own storage (indexedDB), and signing in
    // is done by Android's Google account picker instead of a popup.
    const auth = native ? initializeAuth(app, { persistence: indexedDBLocalPersistence }) : getAuth(app);
    const authBackend = native ? (await import('./firebaseAuthNative')).createNativeFirebaseAuth(auth) : createFirebaseAuth(auth);
    const firestore = getFirestore(app);
    return {
      auth: authBackend,
      cloud: createFirestoreCloud(firestore, uid),
      discover: createFirestoreDiscover(firestore),
      account: createFirestoreAccount(firestore, uid),
      config: { licensedSwitch: async () => { const snap = await getDoc(doc(firestore, 'config', 'licensedTranslations')); return snap.exists() ? snap.data() : null; } },
    };
  })().catch((e) => { loading = undefined; throw e; });
  return loading;
}
