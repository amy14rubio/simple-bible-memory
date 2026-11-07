import { GoogleAuthProvider, deleteUser, onAuthStateChanged, reauthenticateWithPopup, signInWithPopup, signOut, type Auth, type User } from 'firebase/auth';
import type { AuthBackend, AuthUser } from './types';

export const toUser = (u: User | null): AuthUser | null => (u ? { uid: u.uid, email: u.email, displayName: u.displayName } : null);

/**
 * Google sign-in with Firebase Auth. This is the web version (a popup). In the Android and iOS apps Google refuses to
 * sign in inside an embedded web view, so those builds will use a native sign-in plugin behind the same interface.
 */
/** Firebase wants a sign-in from the last five minutes to delete an account; a little less, to be safe. */
export const RECENT_MS = 4 * 60 * 1000;

export function createFirebaseAuth(auth: Auth): AuthBackend {
  return {
    current: () => toUser(auth.currentUser),
    subscribe(callback) { return onAuthStateChanged(auth, (u) => callback(toUser(u))); },
    async signInWithGoogle() {
      const result = await signInWithPopup(auth, new GoogleAuthProvider());
      return toUser(result.user)!;
    },
    signOut: () => signOut(auth),
    async deleteAccount(beforeDelete) {
      const user = auth.currentUser;
      if (!user) return;
      // Deleting an account asks for a recent sign-in: ask first (before anything is erased) if it has been a while.
      if (Date.now() - Date.parse(user.metadata?.lastSignInTime ?? '') > RECENT_MS) await reauthenticateWithPopup(user, new GoogleAuthProvider());
      await beforeDelete?.();
      try {
        await deleteUser(user);
      } catch (e) {
        const code = (e as { code?: string }).code;
        if (code === 'auth/requires-recent-login') { await reauthenticateWithPopup(user, new GoogleAuthProvider()); await deleteUser(user); }
        else if (code === 'auth/network-request-failed') await deleteUser(user); // the connection dropped for a moment: once more
        else throw e;
      }
    },
  };
}
