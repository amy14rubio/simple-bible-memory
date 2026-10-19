import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/** The rating colours on the banner's pill (see tokens.css): the pill is the page's text colour, so the words must read on it. */
const css = readFileSync('src/styles/tokens.css', 'utf8');
const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number]; return (hi + 0.05) / (lo + 0.05); };
const colours = (block: string) => Object.fromEntries([...block.matchAll(/--toast-(again|hard|good|easy):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1]!, m[2]!]));

describe('the rating colours on the banner', () => {
  const light = colours(/:root \{[^}]*--toast-again[^}]*\}/.exec(css)![0]);
  const dark = colours(/:root\[data-theme='dark'\] \{[^}]*--toast-again[^}]*\}/.exec(css)![0]);
  it('are all four defined, for both themes', () => {
    expect(Object.keys(light).sort()).toEqual(['again', 'easy', 'good', 'hard']);
    expect(Object.keys(dark).sort()).toEqual(['again', 'easy', 'good', 'hard']);
  });
  it('read clearly on the dark toast of the light theme (at least 10 to 1)', () => {
    for (const [name, c] of Object.entries(light)) expect(contrast(c, '#17171a'), name).toBeGreaterThanOrEqual(10);
  });
  it('read clearly on the pale toast of the dark theme (at least 6 to 1)', () => {
    for (const [name, c] of Object.entries(dark)) expect(contrast(c, '#f1f0ec'), name).toBeGreaterThanOrEqual(6);
  });
});
