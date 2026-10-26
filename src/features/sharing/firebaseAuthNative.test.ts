import { beforeEach, describe, expect, it, vi } from 'vitest';

const plugin = vi.hoisted(() => ({ signInWithGoogle: vi.fn(), signInWithApple: vi.fn(), signOut: vi.fn() }));
const web = vi.hoisted(() => ({
  signInWithCredential: vi.fn(), signOut: vi.fn(), deleteUser: vi.fn(), reauthenticateWithCredential: vi.fn(), onAuthStateChanged: vi.fn(),
  credential: vi.fn((token: string) => ({ token })),
  appleCredential: vi.fn((o: { idToken: string; rawNonce?: string }) => ({ apple: o })),
  revokeAccessToken: vi.fn(),
}));
vi.mock('@capacitor-firebase/authentication', () => ({ FirebaseAuthentication: plugin }));
vi.mock('firebase/auth', () => ({
  GoogleAuthProvider: { credential: web.credential },
  OAuthProvider: class { constructor(public id: string) {} credential(o: { idToken: string; rawNonce?: string }) { return web.appleCredential(o); } },
  revokeAccessToken: web.revokeAccessToken,
  signInWithCredential: web.signInWithCredential, signOut: web.signOut, deleteUser: web.deleteUser,
  reauthenticateWithCredential: web.reauthenticateWithCredential, onAuthStateChanged: web.onAuthStateChanged,
}));

import { createNativeFirebaseAuth } from './firebaseAuthNative';

const person = { uid: 'u1', email: 'a@example.com', displayName: 'Amy' };
const applePerson = { ...person, providerData: [{ providerId: 'apple.com' }] };
let auth: { currentUser: (typeof person & { providerData?: { providerId: string }[] }) | null };
beforeEach(() => {
  vi.clearAllMocks();
  auth = { currentUser: person };
  plugin.signInWithGoogle.mockResolvedValue({ credential: { idToken: 'google-id-token' } });
  plugin.signOut.mockResolvedValue(undefined);
  plugin.signInWithApple.mockResolvedValue({ credential: { idToken: 'apple-id-token', nonce: 'raw-nonce', authorizationCode: 'auth-code' } });
  web.signInWithCredential.mockResolvedValue({ user: person });
});
const backend = () => createNativeFirebaseAuth(auth as never);

describe('Google sign-in inside the Android app', () => {
  it('asks Android for the Google account (without signing in natively), then signs in to Firebase with its token', async () => {
    const user = await backend().signInWithGoogle();
    expect(plugin.signInWithGoogle).toHaveBeenCalledWith({ skipNativeAuth: true });
    expect(web.credential).toHaveBeenCalledWith('google-id-token');
    expect(web.signInWithCredential).toHaveBeenCalledWith(auth, { token: 'google-id-token' });
    expect(user).toEqual({ uid: 'u1', email: 'a@example.com', displayName: 'Amy' });
  });

  it('fails clearly if Google gives back no token, and signs nobody in', async () => {
    plugin.signInWithGoogle.mockResolvedValue({ credential: null });
    await expect(backend().signInWithGoogle()).rejects.toThrow(/did not return a token/);
    expect(web.signInWithCredential).not.toHaveBeenCalled();
  });

  it('lets a cancelled or failed Google sign-in through as an error, signing nobody in', async () => {
    plugin.signInWithGoogle.mockRejectedValue(new Error('canceled'));
    await expect(backend().signInWithGoogle()).rejects.toThrow('canceled');
    expect(web.signInWithCredential).not.toHaveBeenCalled();
  });

  it('signing out signs out of Firebase and forgets the Google account, even if the second part fails', async () => {
    plugin.signOut.mockRejectedValue(new Error('nothing to sign out'));
    await backend().signOut();
    expect(web.signOut).toHaveBeenCalledWith(auth);
    expect(plugin.signOut).toHaveBeenCalled();
  });
});

describe('deleting the account', () => {
  it('deletes straight away when the sign-in is recent', async () => {
    await backend().deleteAccount();
    expect(web.deleteUser).toHaveBeenCalledWith(person);
    expect(web.reauthenticateWithCredential).not.toHaveBeenCalled();
  });

  it('asks Google again when a recent sign-in is needed, then deletes', async () => {
    web.deleteUser.mockRejectedValueOnce({ code: 'auth/requires-recent-login' }).mockResolvedValueOnce(undefined);
    await backend().deleteAccount();
    expect(plugin.signInWithGoogle).toHaveBeenCalledTimes(1);
    expect(web.reauthenticateWithCredential).toHaveBeenCalledWith(person, { token: 'google-id-token' });
    expect(web.deleteUser).toHaveBeenCalledTimes(2);
  });

  it('passes on any other failure, and does nothing when nobody is signed in', async () => {
    web.deleteUser.mockRejectedValueOnce({ code: 'auth/network-request-failed' });
    await expect(backend().deleteAccount()).rejects.toEqual({ code: 'auth/network-request-failed' });
    auth.currentUser = null;
    web.deleteUser.mockClear();
    await backend().deleteAccount();
    expect(web.deleteUser).not.toHaveBeenCalled();
  });
});

describe('Sign in with Apple inside the iPhone and iPad app', () => {
  it('asks iOS for the Apple account (without signing in natively), then signs in to Firebase with its token and nonce', async () => {
    const user = await backend().signInWithApple!();
    expect(plugin.signInWithApple).toHaveBeenCalledWith({ skipNativeAuth: true });
    expect(web.appleCredential).toHaveBeenCalledWith({ idToken: 'apple-id-token', rawNonce: 'raw-nonce' });
    expect(web.signInWithCredential).toHaveBeenCalledWith(auth, { apple: { idToken: 'apple-id-token', rawNonce: 'raw-nonce' } });
    expect(user).toEqual({ uid: 'u1', email: 'a@example.com', displayName: 'Amy' });
  });

  it('fails clearly if Apple gives back no token, and signs nobody in', async () => {
    plugin.signInWithApple.mockResolvedValue({ credential: null });
    await expect(backend().signInWithApple!()).rejects.toThrow(/did not return a token/);
    expect(web.signInWithCredential).not.toHaveBeenCalled();
  });

  it('deleting an Apple account asks Apple again, tells Apple to forget the person, then deletes', async () => {
    auth.currentUser = applePerson;
    await backend().deleteAccount();
    expect(plugin.signInWithApple).toHaveBeenCalledTimes(1);
    expect(plugin.signInWithGoogle).not.toHaveBeenCalled();
    expect(web.reauthenticateWithCredential).toHaveBeenCalledWith(applePerson, { apple: { idToken: 'apple-id-token', rawNonce: 'raw-nonce' } });
    expect(web.revokeAccessToken).toHaveBeenCalledWith(auth, 'auth-code');
    expect(web.deleteUser).toHaveBeenCalledWith(applePerson);
    // revoked before deleted: once the account is gone there is nobody to revoke for
    expect(web.revokeAccessToken.mock.invocationCallOrder[0]).toBeLessThan(web.deleteUser.mock.invocationCallOrder[0]!);
  });

  it('deleting an Apple account still deletes when Apple gives no authorization code', async () => {
    auth.currentUser = applePerson;
    plugin.signInWithApple.mockResolvedValue({ credential: { idToken: 'apple-id-token', nonce: 'raw-nonce' } });
    await backend().deleteAccount();
    expect(web.revokeAccessToken).not.toHaveBeenCalled();
    expect(web.deleteUser).toHaveBeenCalledWith(applePerson);
  });
});
