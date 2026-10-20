import { beforeEach, describe, expect, it, vi } from 'vitest';

const plugin = vi.hoisted(() => ({ signInWithGoogle: vi.fn(), signOut: vi.fn() }));
const web = vi.hoisted(() => ({
  signInWithCredential: vi.fn(), signOut: vi.fn(), deleteUser: vi.fn(), reauthenticateWithCredential: vi.fn(), onAuthStateChanged: vi.fn(),
  credential: vi.fn((token: string) => ({ token })),
}));
vi.mock('@capacitor-firebase/authentication', () => ({ FirebaseAuthentication: plugin }));
vi.mock('firebase/auth', () => ({
  GoogleAuthProvider: { credential: web.credential },
  signInWithCredential: web.signInWithCredential, signOut: web.signOut, deleteUser: web.deleteUser,
  reauthenticateWithCredential: web.reauthenticateWithCredential, onAuthStateChanged: web.onAuthStateChanged,
}));

import { createNativeFirebaseAuth } from './firebaseAuthNative';

const person = { uid: 'u1', email: 'a@example.com', displayName: 'Amy' };
let auth: { currentUser: typeof person | null };
beforeEach(() => {
  vi.clearAllMocks();
  auth = { currentUser: person };
  plugin.signInWithGoogle.mockResolvedValue({ credential: { idToken: 'google-id-token' } });
  plugin.signOut.mockResolvedValue(undefined);
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
