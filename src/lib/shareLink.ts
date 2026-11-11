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
      // The link goes inside the text, after a blank line: given separately, Android joins it to the sentence with a single space, so
      // in a chat it ended up on the same line as the description.
      await share.share({ title, text: `${text}\n\n${url}`, dialogTitle: title });
      return 'shared';
    } catch (e) {
      const message = e instanceof Error ? `${e.name} ${e.message}` : String(e);
      if (/cancel|abort/i.test(message)) return 'cancelled';
      // Android can think an earlier Share sheet is still open ("Can't share while sharing is in progress"). That is not the person's
      // problem: the link is copied instead, so the button always does something.
      if (/while sharing/i.test(message)) { await copy(url); return 'copied'; }
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
