import { describe, it, expect } from 'vitest';
import { fetchCatalogue, loadCachedCatalogue, parseCatalogue, saveCatalogue } from './googleApi';

const ITEMS = [
  { family: 'Lora', category: 'serif', variants: ['regular', 'italic', '700', '700italic'], subsets: ['latin', 'cyrillic'] },
  { family: 'Pacifico', category: 'handwriting', variants: ['regular'], subsets: ['latin', 'latin-ext'] },
  { family: 'Noto Sans JP', category: 'sans-serif', variants: ['regular', '700'], subsets: ['japanese'] }, // no latin letters
  { family: 'Italic Only', category: 'serif', variants: ['italic'], subsets: ['latin'] }, // no regular text
  { family: 'Odd One', category: 'icons', variants: ['regular'], subsets: ['latin'] }, // not a text category we use
];

const memory = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }; };

describe('Google Fonts catalogue', () => {
  it('keeps fonts with regular latin text, and asks for bold only when there is one', () => {
    expect(parseCatalogue(ITEMS)).toEqual([
      { family: 'Lora', category: 'serif', weights: [400, 700] },
      { family: 'Pacifico', category: 'handwriting', weights: [400] },
    ]);
  });

  it('fetches with the key, sorted by popularity, and only the fields it needs', async () => {
    let asked = '';
    const fetcher = (async (url: string) => { asked = url; return new Response(JSON.stringify({ items: ITEMS })); }) as unknown as typeof fetch;
    const fonts = await fetchCatalogue('my key', fetcher);
    expect(fonts.map((f) => f.family)).toEqual(['Lora', 'Pacifico']);
    expect(asked).toContain('https://www.googleapis.com/webfonts/v1/webfonts?');
    expect(asked).toContain('key=my%20key');
    expect(asked).toContain('sort=popularity');
    expect(decodeURIComponent(asked)).toContain('fields=items(family,category,variants,subsets)');
  });

  it('fails clearly when Google says no, or sends nothing usable', async () => {
    const no = (async () => new Response('', { status: 403 })) as unknown as typeof fetch;
    await expect(fetchCatalogue('bad', no)).rejects.toThrow('403');
    const empty = (async () => new Response(JSON.stringify({ items: [] }))) as unknown as typeof fetch;
    await expect(fetchCatalogue('k', empty)).rejects.toThrow('empty');
  });

  it('remembers the list for a week, in a compact form', () => {
    const store = memory();
    const fonts = parseCatalogue(ITEMS);
    saveCatalogue(fonts, store);
    const back = loadCachedCatalogue(store);
    expect(back?.fonts).toEqual(fonts);
    expect(back?.fresh).toBe(true);
    expect(store.getItem('font-catalogue')!.length).toBeLessThan(200);
  });

  it('knows when the remembered list is old, and ignores a damaged one', () => {
    const store = memory();
    store.setItem('font-catalogue', JSON.stringify({ at: Date.now() - 8 * 24 * 60 * 60 * 1000, fonts: [['Lora', 0, true]] }));
    expect(loadCachedCatalogue(store)?.fresh).toBe(false);
    store.setItem('font-catalogue', '{nonsense');
    expect(loadCachedCatalogue(store)).toBeNull();
    expect(loadCachedCatalogue(memory())).toBeNull();
  });
});
