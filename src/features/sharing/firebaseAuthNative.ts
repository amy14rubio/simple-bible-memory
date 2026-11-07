import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import {
  GoogleAuthProvider, OAuthProvider, deleteUser, onAuthStateChanged, reauthenticateWithCredential, revokeAccessToken, signInWithCredential, signOut,
  type Auth, type AuthCredential,
} from 'firebase/auth';
import type { AuthBackend } from './types';
import { RECENT_MS, toUser } from './firebaseAuth';

/**
 * Google sign-in inside the Android and iPhone/iPad apps, and Sign in with Apple inside the iPhone/iPad app. Google refuses to sign
 * in inside an embedded web view (which is what the popup the website uses would be), so here the phone's own account picker does the
 * signing in, and its result is handed to the same Firebase sign-in the website uses. Everything after that (the signed-in person,
 * sync, publishing) is identical.
 * Needs the app registered in Firebase (google-services.json on Android, GoogleService-Info.plist on iOS; see docs/android-release.md
 * and docs/ios-release.md).
 */
export function createNativeFirebaseAuth(auth: Auth): AuthBackend {
  /** Asks the phone for the person's Google account and turns the answer into a Firebase credential. */
  const googleCredential = async (): Promise<{ credential: AuthCredential }> => {
    // skipNativeAuth: the plugin only does the Google part; signing in to Firebase is left to the web library below.
    const result = await FirebaseAuthentication.signInWithGoogle({ skipNativeAuth: true });
    const idToken = result.credential?.idToken;
    if (!idToken) throw new Error('Google sign-in did not return a token');
    return { credential: GoogleAuthProvider.credential(idToken) };
  };

  /** The same for Apple. `authorizationCode` is what lets the app tell Apple to forget the person when their account is deleted. */
  const appleCredential = async (): Promise<{ credential: AuthCredential; authorizationCode?: string }> => {
    const result = await FirebaseAuthentication.signInWithApple({ skipNativeAuth: true });
    const idToken = result.credential?.idToken;
    if (!idToken) throw new Error('Apple sign-in did not return a token');
    const credential = new OAuthProvider('apple.com').credential({ idToken, rawNonce: result.credential?.nonce });
    return { credential, authorizationCode: result.credential?.authorizationCode };
  };

  const usesApple = () => (auth.currentUser?.providerData ?? []).some((p) => p.providerId === 'apple.com');

  return {
    current: () => toUser(auth.currentUser),
    subscribe(callback) { return onAuthStateChanged(auth, (u) => callback(toUser(u))); },
    async signInWithGoogle() {
      const result = await signInWithCredential(auth, (await googleCredential()).credential);
      return toUser(result.user)!;
    },
    async signInWithApple() {
      const result = await signInWithCredential(auth, (await appleCredential()).credential);
      return toUser(result.user)!;
    },
    async signOut() {
      await signOut(auth);
      await FirebaseAuthentication.signOut().catch(() => undefined); // forget the Google account too, so the next sign-in asks which one
    },
    async deleteAccount(beforeDelete) {
      const user = auth.currentUser;
      if (!user) return;
      // Whatever is asked of the person (signing in again) comes first, before anything is erased: if they cancel or the
      // connection drops there, nothing has been lost and the account is still whole.
      let authorizationCode: string | undefined;
      if (usesApple()) {
        // Apple requires that deleting an account also revokes the person's Sign in with Apple link. That needs a fresh authorization
        // code, which only comes from signing in again.
        const apple = await appleCredential();
        authorizationCode = apple.authorizationCode;
        await reauthenticateWithCredential(user, apple.credential);
      } else if (Date.now() - Date.parse(user.metadata?.lastSignInTime ?? '') > RECENT_MS) {
        await reauthenticateWithCredential(user, (await googleCredential()).credential);
      }
      await beforeDelete?.();
      // Best effort: if Apple cannot be told right now, the person's account is still deleted (being unable to delete is worse).
      if (authorizationCode) {
        try { await revokeAccessToken(auth, authorizationCode); } catch { /* see above */ }
      }
      try {
        await deleteUser(user);
      } catch (e) {
        const code = (e as { code?: string }).code;
        if (code === 'auth/requires-recent-login' && !usesApple()) { await reauthenticateWithCredential(user, (await googleCredential()).credential); await deleteUser(user); }
        else if (code === 'auth/network-request-failed') await deleteUser(user); // the connection dropped for a moment: once more
        else throw e;
      }
    },
  };
}
