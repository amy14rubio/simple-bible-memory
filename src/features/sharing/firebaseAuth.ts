import { GoogleAuthProvider, deleteUser, onAuthStateChanged, reauthenticateWithPopup, signInWithPopup, signOut, type Auth, type User } from 'firebase/auth';
import type { AuthBackend, AuthUser } from './types';

const toUser = (u: User | null): AuthUser | null => (u ? { uid: u.uid, email: u.email, displayName: u.displayName } : null);

/**
 * Google sign-in with Firebase Auth. This is the web version (a popup). In the Android and iOS apps Google refuses to
 * sign in inside an embedded web view, so those builds will use a native sign-in plugin behind the same interface.
 */
export function createFirebaseAuth(auth: Auth): AuthBackend {
  return {
    current: () => toUser(auth.currentUser),
    subscribe(callback) { return onAuthStateChanged(auth, (u) => callback(toUser(u))); },
    async signInWithGoogle() {
      const result = await signInWithPopup(auth, new GoogleAuthProvider());
      return toUser(result.user)!;
    },
    signOut: () => signOut(auth),
    async deleteAccount() {
      const user = auth.currentUser;
      if (!user) return;
      try {
        await deleteUser(user);
      } catch (e) {
        // Deleting an account asks for a recent sign-in: ask again, then retry once.
        if ((e as { code?: string }).code !== 'auth/requires-recent-login') throw e;
        await reauthenticateWithPopup(user, new GoogleAuthProvider());
        await deleteUser(user);
      }
    },
  };
}
