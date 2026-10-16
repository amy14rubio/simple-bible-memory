import type { CatalogueFont, FontCategory } from './catalogue';
import { FONT_CATEGORIES } from './catalogue';

/**
 * The full Google Fonts catalogue, from the Web Fonts Developer API (it needs an API key; see .env.example).
 * The reply is shrunk to the few fields we use, sorted by popularity, then kept on the device for a week.
 */
const ENDPOINT = 'https://www.googleapis.com/webfonts/v1/webfonts';
const CACHE_KEY = 'font-catalogue';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

interface ApiItem { family: string; category: string; variants: string[]; subsets: string[] }

/** Keeps the fonts we can use (they have regular text in the latin alphabet) and works out which weights to ask for. */
export function parseCatalogue(items: ApiItem[]): CatalogueFont[] {
  const fonts: CatalogueFont[] = [];
  for (const item of items) {
    if (!item.subsets?.includes('latin') || !item.variants?.includes('regular')) continue;
    const category = FONT_CATEGORIES.find((c) => c === item.category);
    if (!category) continue;
    fonts.push({ family: item.family, category, weights: item.variants.includes('700') ? [400, 700] : [400] });
  }
  return fonts;
}

export async function fetchCatalogue(key: string, fetcher: typeof fetch = fetch): Promise<CatalogueFont[]> {
  const url = `${ENDPOINT}?key=${encodeURIComponent(key)}&sort=popularity&fields=${encodeURIComponent('items(family,category,variants,subsets)')}`;
  const response = await fetcher(url);
  if (!response.ok) throw new Error(`Google Fonts list failed (${response.status}).`);
  const fonts = parseCatalogue(((await response.json()) as { items?: ApiItem[] }).items ?? []);
  if (fonts.length === 0) throw new Error('Google Fonts list was empty.');
  return fonts;
}

type Stored = { at: number; fonts: [string, number, boolean][] }; // [family, category index, has bold]

export function saveCatalogue(fonts: CatalogueFont[], storage: Pick<Storage, 'setItem'> = localStorage) {
  const compact: Stored = { at: Date.now(), fonts: fonts.map((f) => [f.family, FONT_CATEGORIES.indexOf(f.category), f.weights.includes(700)]) };
  try { storage.setItem(CACHE_KEY, JSON.stringify(compact)); } catch { /* the cache is optional */ }
}

/** The saved list, and whether it is still fresh. */
export function loadCachedCatalogue(storage: Pick<Storage, 'getItem'> = localStorage): { fonts: CatalogueFont[]; fresh: boolean } | null {
  try {
    const stored = JSON.parse(storage.getItem(CACHE_KEY) ?? 'null') as Stored | null;
    if (!stored || !Array.isArray(stored.fonts) || stored.fonts.length === 0) return null;
    const fonts = stored.fonts.flatMap(([family, c, bold]) => {
      const category: FontCategory | undefined = FONT_CATEGORIES[c];
      return category ? [{ family, category, weights: bold ? [400, 700] : [400] }] : [];
    });
    return { fonts, fresh: Date.now() - stored.at < MAX_AGE_MS };
  } catch { return null; }
}
