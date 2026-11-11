import { Capacitor } from '@capacitor/core';
import { routeFromLink } from '../lib/deepLink';

/** Opens the screen a link points at (a shared deck, or a home-screen widget's shortcut). Native apps only. */
const open = (link: string | undefined) => {
  const route = link ? routeFromLink(link) : null;
  if (route) window.location.hash = `#${route}`;
};

export function installDeepLinks(): void {
  if (!Capacitor.isNativePlatform()) return;
  // Wrapped in an object on purpose: a Capacitor plugin must never be returned straight from a promise.
  void import('@capacitor/app').then((m) => ({ app: m.App })).then(async ({ app }) => {
    void app.addListener('appUrlOpen', (event) => open(event.url)); // the app was already running
    open((await app.getLaunchUrl())?.url); // the link is what started the app
  });
}
