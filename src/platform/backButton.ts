import { Capacitor } from '@capacitor/core';

/**
 * What Android's back button (or back swipe) does inside the app.
 * By default Android closes an app on Back. We want: go back one screen (or close the open drawer, which has its own
 * history entry), and only leave the app when there is nowhere left to go back to.
 * `canGoBack` comes from the phone: is there an earlier screen in this app's history?
 */
export function handleBack({ canGoBack }: { canGoBack: boolean }, goBack: () => void, exit: () => void): void {
  if (canGoBack) goBack();
  else exit();
}

/** Switches the behaviour above on, in the Android app only (browsers already have their own Back button). */
export function installBackButton(): void {
  if (!Capacitor.isNativePlatform()) return;
  // Wrapped in an object on purpose: a Capacitor plugin must never be returned straight from a promise.
  void import('@capacitor/app').then((m) => ({ app: m.App })).then(({ app }) => {
    void app.addListener('backButton', (event) => handleBack(event, () => window.history.back(), () => void app.exitApp()));
  });
}
