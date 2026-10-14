/**
 * Opens a web page in the device's own browser, never inside the app.
 * Browser: a new tab with no access back to this page (noopener) and no referrer.
 * Native (Capacitor): added in the Android phase. @capacitor/browser would open an in-app browser view
 * (SFSafariViewController), which is not what we want, so the plan is @capacitor/app-launcher or the
 * platform's default link handling, verified on a real device.
 */
export function openExternal(url: string, open: typeof window.open = (...a) => window.open(...a)): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') return false; // never open javascript:, data:, http:, file: ...
  open(parsed.toString(), '_blank', 'noopener,noreferrer');
  return true;
}
