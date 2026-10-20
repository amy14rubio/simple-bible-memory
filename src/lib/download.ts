import { Capacitor } from '@capacitor/core';

/**
 * Saves text as a file and says whether it was handed over.
 * - In a browser: the browser's own download.
 * - In the Android app: the web view cannot download a file, so the file is written to the app's temporary folder and
 *   Android's Share panel opens with it (the person can save it to Drive or Files, email it to themselves, and so on).
 *   Closing the panel without choosing anything is not an error: it returns false and nothing is claimed.
 */
export async function downloadTextFile(name: string, text: string, type = 'application/json'): Promise<boolean> {
  if (Capacitor.isNativePlatform()) return shareTextFile(name, text);
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

const EXPORTS = 'exports'; // a folder in the cache; android/app/src/main/res/xml/file_paths.xml lets the Share panel read exactly this folder

async function shareTextFile(name: string, text: string): Promise<boolean> {
  // Wrapped in objects on purpose: a Capacitor plugin must never be returned straight from a promise.
  const [{ fs }, { share }] = await Promise.all([
    import('@capacitor/filesystem').then((m) => ({ fs: { api: m.Filesystem, dir: m.Directory, encoding: m.Encoding } })),
    import('@capacitor/share').then((m) => ({ share: m.Share })),
  ]);
  await fs.api.rmdir({ path: EXPORTS, directory: fs.dir.Cache, recursive: true }).catch(() => undefined); // earlier exports are not kept
  const { uri } = await fs.api.writeFile({ path: `${EXPORTS}/${name}`, data: text, directory: fs.dir.Cache, encoding: fs.encoding.UTF8, recursive: true });
  try {
    await share.share({ title: name, files: [uri] });
    return true;
  } catch (e) {
    if (/cancel/i.test(e instanceof Error ? e.message : String(e))) return false; // closed the panel: nothing was exported
    throw e;
  }
}
