import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadFont, fontFileKey } from './fontStore';

const CSS = `/* latin */\n@font-face {\n  font-family: 'Lora';\n  font-style: normal;\n  font-weight: 400;\n  src: url(https://fonts.gstatic.com/s/lora/v1/lat.woff2) format('woff2');\n  unicode-range: U+0000-00FF;\n}`;

describe('font files are kept in Cache Storage', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('under a full https address, because the Cache API refuses capacitor:// ones (the iPhone / iPad app lives at capacitor://localhost)', async () => {
    const keys: string[] = [];
    // like WebKit and Chrome: anything but http(s) is refused, and a bare path is read against the page's own address
    const origin = 'capacitor://localhost';
    const cache = { put: async (key: string) => { if (!/^https?:/.test(new URL(key, origin).href)) throw new TypeError('Request url is not HTTP/HTTPS'); keys.push(key); }, delete: async () => true };
    vi.stubGlobal('caches', { open: async () => cache });
    vi.stubGlobal('FontFace', class {});
    vi.stubGlobal('fetch', async (url: string) => (url.includes('googleapis') ? new Response(CSS) : new Response(new Blob(['font']))));
    const stored = await downloadFont({ family: 'Lora', category: 'serif', weights: [400] });
    expect(stored.faces).toHaveLength(1);
    expect(keys).toEqual([fontFileKey('Lora', 0)]);
    expect(fontFileKey('Playfair Display', 3)).toBe('https://fonts.sbm.invalid/Playfair%20Display/3.woff2');
  });
});
