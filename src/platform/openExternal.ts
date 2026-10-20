import { Capacitor } from '@capacitor/core';

/**
 * Opens a web page in the device's own browser, never inside the app. Only https links are opened (never javascript:, data:,
 * http:, file: ...). Returns false for anything else.
 * - Browser: a new tab with no access back to this page (noopener) and no referrer.
 * - Android app: the web view cannot open a new window, so the phone is asked to open the link (its default browser).
 *   (@capacitor/browser would show an in-app browser view, which is not what we want.)
 */
export function openExternal(url: string, open: typeof window.open = (...a) => window.open(...a)): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  if (Capacitor.isNativePlatform()) {
    // Wrapped in an object on purpose: a Capacitor plugin must never be returned straight from a promise.
    void import('@capacitor/app-launcher').then((m) => ({ launcher: m.AppLauncher })).then(({ launcher }) => launcher.openUrl({ url: parsed.toString() })).catch(() => undefined);
    return true;
  }
  open(parsed.toString(), '_blank', 'noopener,noreferrer');
  return true;
}
