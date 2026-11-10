import { Capacitor } from '@capacitor/core';

export type ShareResult = 'shared' | 'copied' | 'cancelled';

/**
 * In the phone apps: opens the phone's own Share sheet. Closing it without choosing anything is not an error: 'cancelled'.
 * In a web browser: copies the link. (A browser's own share menu, such as Safari's on a Mac, is drawn wherever the browser likes, not
 * by the button, so it is not used.)
 */
export async function shareLink({ title, text, url }: { title: string; text: string; url: string }): Promise<ShareResult> {
  if (Capacitor.isNativePlatform()) {
    try {
      // Wrapped in an object on purpose: a Capacitor plugin must never be returned straight from a promise.
      const { share } = await import('@capacitor/share').then((m) => ({ share: m.Share }));
      await share.share({ title, text, url, dialogTitle: title });
      return 'shared';
    } catch (e) {
      if (/cancel|abort/i.test(e instanceof Error ? `${e.name} ${e.message}` : String(e))) return 'cancelled';
      throw e;
    }
  }
  await copy(url);
  return 'copied';
}

async function copy(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // No clipboard access (an insecure page, or the browser said no): the old way, through a text box nobody sees.
    const box = document.createElement('textarea');
    box.value = text;
    box.setAttribute('readonly', '');
    box.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
    document.body.append(box);
    box.select();
    const ok = document.execCommand('copy');
    box.remove();
    if (!ok) throw new Error('copy failed');
  }
}
