import type { AuthBackend, CloudBackend } from './types';

/**
 * Finds the sign-in and the public catalogue. The real ones come from Firebase and are loaded only when needed (the
 * library is large), so people who never sign in never download it. The browser tests swap in stand-ins.
 */
export interface Backends { auth: AuthBackend; cloud: CloudBackend }

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
    const [{ initializeApp }, { getAuth }, { getFirestore }, { createFirebaseAuth }, { createFirestoreCloud }] = await Promise.all([
      import('firebase/app'), import('firebase/auth'), import('firebase/firestore'), import('./firebaseAuth'), import('./firestoreCloud'),
    ]);
    const app = initializeApp(config);
    const auth = getAuth(app);
    return {
      auth: createFirebaseAuth(auth),
      cloud: createFirestoreCloud(getFirestore(app), () => {
        if (!auth.currentUser) throw new Error('Not signed in');
        return auth.currentUser.uid;
      }),
    };
  })().catch((e) => { loading = undefined; throw e; });
  return loading;
}
