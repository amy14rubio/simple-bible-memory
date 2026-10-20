import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { GoogleAuthProvider, deleteUser, onAuthStateChanged, reauthenticateWithCredential, signInWithCredential, signOut, type Auth } from 'firebase/auth';
import type { AuthBackend } from './types';
import { toUser } from './firebaseAuth';

/**
 * Google sign-in inside the Android app. Google refuses to sign in inside an embedded web view (which is what the popup
 * the website uses would be), so here Android's own account picker does the signing in, and its result is handed to the same
 * Firebase sign-in the website uses. Everything after that (the signed-in person, sync, publishing) is identical.
 * Needs the app registered in Firebase with google-services.json (see docs/android-release.md).
 */
export function createNativeFirebaseAuth(auth: Auth): AuthBackend {
  /** Asks Android for the person's Google account and turns the answer into a Firebase credential. */
  const googleCredential = async () => {
    // skipNativeAuth: the plugin only does the Google part; signing in to Firebase is left to the web library below.
    const result = await FirebaseAuthentication.signInWithGoogle({ skipNativeAuth: true });
    const idToken = result.credential?.idToken;
    if (!idToken) throw new Error('Google sign-in did not return a token');
    return GoogleAuthProvider.credential(idToken);
  };

  return {
    current: () => toUser(auth.currentUser),
    subscribe(callback) { return onAuthStateChanged(auth, (u) => callback(toUser(u))); },
    async signInWithGoogle() {
      const result = await signInWithCredential(auth, await googleCredential());
      return toUser(result.user)!;
    },
    async signOut() {
      await signOut(auth);
      await FirebaseAuthentication.signOut().catch(() => undefined); // forget the Google account too, so the next sign-in asks which one
    },
    async deleteAccount() {
      const user = auth.currentUser;
      if (!user) return;
      try {
        await deleteUser(user);
      } catch (e) {
        // Deleting an account asks for a recent sign-in: ask again, then retry once.
        if ((e as { code?: string }).code !== 'auth/requires-recent-login') throw e;
        await reauthenticateWithCredential(user, await googleCredential());
        await deleteUser(user);
      }
    },
  };
}
