import { describe, it, expect } from 'vitest';
import { parseFontFaces } from './googleCss';
import { CURATED_FONTS, FONT_CATEGORIES, fontCssUrl, fontFamilyValue } from './catalogue';

const findFont = (name: string) => CURATED_FONTS.find((f) => f.family === name);

const CSS = `
/* cyrillic */
@font-face {
  font-family: 'Lora';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url(https://fonts.gstatic.com/s/lora/v1/cyr.woff2) format('woff2');
  unicode-range: U+0301, U+0400-045F;
}
/* latin-ext */
@font-face {
  font-family: 'Lora';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url(https://fonts.gstatic.com/s/lora/v1/ext.woff2) format('woff2');
  unicode-range: U+0100-02BA, U+1E00-1EFF;
}
/* latin */
@font-face {
  font-family: 'Lora';
  font-style: italic;
  font-weight: 700;
  font-display: swap;
  src: url('https://fonts.gstatic.com/s/lora/v1/lat.woff2') format('woff2');
  unicode-range: U+0000-00FF, U+0131;
}
`;

describe('Google Fonts stylesheet', () => {
  it('keeps only the latin subsets, with their weight, style, range and file', () => {
    const faces = parseFontFaces(CSS);
    expect(faces.map((f) => f.subset)).toEqual(['latin-ext', 'latin']);
    expect(faces[0]).toEqual({ weight: '400', style: 'normal', unicodeRange: 'U+0100-02BA, U+1E00-1EFF', url: 'https://fonts.gstatic.com/s/lora/v1/ext.woff2', subset: 'latin-ext' });
    expect(faces[1]).toMatchObject({ weight: '700', style: 'italic', url: 'https://fonts.gstatic.com/s/lora/v1/lat.woff2' }); // quotes around the url are removed
  });
  it('returns nothing for an empty or unrelated stylesheet', () => {
    expect(parseFontFaces('')).toEqual([]);
    expect(parseFontFaces('body { color: red }')).toEqual([]);
  });
});

describe('font catalogue', () => {
  it('has a good spread of categories and no duplicates', () => {
    for (const c of FONT_CATEGORIES) expect(CURATED_FONTS.filter((f) => f.category === c).length).toBeGreaterThanOrEqual(3);
    const names = CURATED_FONTS.map((f) => f.family);
    expect(new Set(names).size).toBe(names.length);
  });
  it('builds a stylesheet address with the family and weights, spaces as +', () => {
    expect(fontCssUrl(findFont('Source Serif 4')!)).toBe('https://fonts.googleapis.com/css2?family=Source+Serif+4:wght@400;700&display=swap');
    expect(fontCssUrl(findFont('Pacifico')!)).toContain('wght@400&');
  });
  it('asks for only the letters of a preview text, each once', () => {
    const url = fontCssUrl(findFont('Lora')!, 'aab ba');
    expect(url).toContain('&text=' + encodeURIComponent('ab '));
  });
  it('puts a fallback after the chosen font', () => {
    expect(fontFamilyValue(findFont('Dancing Script')!)).toMatch(/^"Dancing Script", .*cursive/);
  });
});
