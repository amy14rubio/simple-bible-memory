import { fontCssUrl, type CatalogueFont, type FontCategory } from './catalogue';
import { parseFontFaces } from './googleCss';

/**
 * Keeps downloaded font files on the device (the browser's Cache Storage) and registers them with the page, so a
 * chosen font works offline. Nothing here talks to a server except `downloadFont`.
 */
const CACHE_NAME = 'fonts-v1';

export interface StoredFace { key: string; weight: string; style: string; unicodeRange: string }
export interface StoredFont { family: string; category: FontCategory; bytes: number; faces: StoredFace[] }

export const fontStorageAvailable = () => typeof caches !== 'undefined' && typeof FontFace !== 'undefined';

/** Fetches a font's stylesheet and its latin files, and stores them. Throws if anything fails, leaving nothing behind. */
export async function downloadFont(font: CatalogueFont): Promise<StoredFont> {
  if (!fontStorageAvailable()) throw new Error('Font storage is not available in this browser.');
  const cssResponse = await fetch(fontCssUrl(font));
  if (!cssResponse.ok) throw new Error(`Could not load the ${font.family} stylesheet (${cssResponse.status}).`);
  const faces = parseFontFaces(await cssResponse.text());
  if (faces.length === 0) throw new Error(`No font files found for ${font.family}.`);

  const cache = await caches.open(CACHE_NAME);
  const stored: StoredFace[] = [];
  let bytes = 0;
  try {
    for (const [i, face] of faces.entries()) {
      const file = await fetch(face.url);
      if (!file.ok) throw new Error(`Could not download a ${font.family} file (${file.status}).`);
      const blob = await file.blob();
      bytes += blob.size;
      const key = `/fonts/${encodeURIComponent(font.family)}/${i}.woff2`;
      await cache.put(key, new Response(blob, { headers: { 'content-type': 'font/woff2' } }));
      stored.push({ key, weight: face.weight, style: face.style, unicodeRange: face.unicodeRange });
    }
  } catch (err) {
    await Promise.all(stored.map((s) => cache.delete(s.key)));
    throw err;
  }
  return { family: font.family, category: font.category, bytes, faces: stored };
}

const registered = new Map<string, FontFace[]>();

/** Makes a stored font usable on the page. Returns false if its files are gone (for example, site data was cleared). */
export async function registerFont(font: StoredFont): Promise<boolean> {
  if (registered.has(font.family)) return true;
  if (!fontStorageAvailable()) return false;
  const cache = await caches.open(CACHE_NAME);
  const faces: FontFace[] = [];
  for (const s of font.faces) {
    const hit = await cache.match(s.key);
    if (!hit) { faces.forEach((f) => document.fonts.delete(f)); return false; }
    const face = new FontFace(font.family, await hit.arrayBuffer(), { weight: s.weight, style: s.style, unicodeRange: s.unicodeRange || undefined });
    await face.load();
    document.fonts.add(face);
    faces.push(face);
  }
  registered.set(font.family, faces);
  return true;
}

/** Forgets a font: unregisters it and deletes its files. */
export async function removeFont(font: StoredFont): Promise<void> {
  registered.get(font.family)?.forEach((f) => document.fonts.delete(f));
  registered.delete(font.family);
  if (!fontStorageAvailable()) return;
  const cache = await caches.open(CACHE_NAME);
  await Promise.all(font.faces.map((s) => cache.delete(s.key)));
}
