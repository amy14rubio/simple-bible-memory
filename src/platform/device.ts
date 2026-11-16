import { Capacitor } from '@capacitor/core';

/** In browser tests, this localStorage key makes the app behave as if it were the Android app (the stand-in for the phone). */
export const FAKE_ANDROID_KEY = 'sbm-fake-android';

/** Is this the Android app (not a browser, not iPhone or iPad)? Some behaviour is the system's job there (see where it is used). */
export function isAndroidApp(): boolean {
  if (import.meta.env.VITE_FAKE_NOTIFICATIONS === 'true') { try { return localStorage.getItem(FAKE_ANDROID_KEY) !== null; } catch { return false; } }
  return Capacitor.getPlatform() === 'android';
}
