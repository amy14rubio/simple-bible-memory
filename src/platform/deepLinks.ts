import { Capacitor } from '@capacitor/core';
import { deckIdFromLink } from '../lib/deepLink';

/** Opens the public deck a link points at (from the share page's "Open in the app", or a shared link). Native apps only. */
const open = (link: string | undefined) => {
  const id = link ? deckIdFromLink(link) : null;
  if (id) window.location.hash = `#/discover/${encodeURIComponent(id)}`;
};

export function installDeepLinks(): void {
  if (!Capacitor.isNativePlatform()) return;
  // Wrapped in an object on purpose: a Capacitor plugin must never be returned straight from a promise.
  void import('@capacitor/app').then((m) => ({ app: m.App })).then(async ({ app }) => {
    void app.addListener('appUrlOpen', (event) => open(event.url)); // the app was already running
    open((await app.getLaunchUrl())?.url); // the link is what started the app
  });
}
