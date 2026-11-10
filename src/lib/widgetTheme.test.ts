import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DARK, LIGHT, customPalette, mixHex, widgetTheme } from './widgetTheme';
import { buildSnapshot } from '../features/widgets/snapshot';

const css = readFileSync('src/styles/tokens.css', 'utf8');
/** The `--name: #hex` values inside one block of tokens.css. */
const tokens = (selector: string) => {
  const block = css.slice(css.indexOf(selector)).split('}')[0]!;
  return Object.fromEntries([...block.matchAll(/--([a-z-]+):\s*(#[0-9a-f]{6})\b/gi)].map((m) => [m[1]!, m[2]!.toLowerCase()]));
};

describe('the widgets use the app\'s own colours', () => {
  const pick = (t: Record<string, string>) => ({ background: t.background, foreground: t.foreground, muted: t.muted, surface: t.surface, border: t.border, accent: t.accent, primary: t.primary, primaryForeground: t['primary-foreground'] });
  it('the light palette is the light tokens', () => expect(LIGHT).toEqual(pick(tokens(':root {'))));
  it('the dark palette is the dark tokens', () => expect(DARK).toEqual(pick(tokens(":root[data-theme='dark'] {"))));

  it('the Android widgets\' own defaults (used before the app has been opened) are the same colours', () => {
    const java = readFileSync('android/app/src/main/java/app/simplebiblememory/widgets/WidgetData.java', 'utf8');
    const argb = (p: typeof LIGHT) => [p.background, p.foreground, p.muted, p.surface, p.border, p.accent, p.primary, p.primaryForeground].map((c) => `0xFF${c.slice(1).toUpperCase()}`).join(', ');
    expect(java).toContain(`LIGHT = new Palette(${argb(LIGHT)})`);
    expect(java).toContain(`DARK = new Palette(${argb(DARK)})`);
  });
});

describe('mixing colours like CSS does', () => {
  it('all of one, none of one, half of each', () => {
    expect(mixHex('#000000', 100, '#ffffff')).toBe('#000000');
    expect(mixHex('#000000', 0, '#ffffff')).toBe('#ffffff');
    expect(mixHex('#000000', 50, '#ffffff')).toBe('#808080');
  });
  it('a custom theme gets the same panels, borders and muted text as in the app', () => {
    const p = customPalette({ background: '#fdf6e3', text: '#073642', accent: '#cb4b16' });
    expect(p).toMatchObject({ background: '#fdf6e3', foreground: '#073642', accent: '#cb4b16', primary: '#073642', primaryForeground: '#fdf6e3' });
    expect(p.muted).toBe(mixHex('#073642', 68, '#fdf6e3'));
    expect(p.surface).toBe(mixHex('#073642', 6, '#fdf6e3'));
    expect(p.border).toBe(mixHex('#073642', 14, '#fdf6e3'));
  });
});

describe('the theme part of the snapshot', () => {
  const custom = { background: '#101820', text: '#f2aa4c', accent: '#d96878' };
  it('"system" carries both palettes so the widget can follow the phone', () => {
    const t = widgetTheme('system', undefined);
    expect(t).toMatchObject({ pref: 'system', light: LIGHT, dark: DARK });
    expect(t).not.toHaveProperty('custom');
  });
  it('a custom theme carries its palette', () => {
    expect(widgetTheme('custom', custom)).toMatchObject({ pref: 'custom', custom: customPalette(custom), customIsDark: true });
  });
  it('"custom" with no saved colours falls back to following the phone', () => expect(widgetTheme('custom', undefined).pref).toBe('system'));
  it('the whole snapshot is plain JSON with a version, the time, the language and the wording', () => {
    const s = buildSnapshot({ language: 'es', theme: 'dark', custom: undefined, labels: { addCard: 'Añadir tarjeta' }, now: 123 });
    expect(JSON.parse(JSON.stringify(s))).toMatchObject({ v: 1, updatedAt: 123, language: 'es', theme: { pref: 'dark' }, labels: { addCard: 'Añadir tarjeta' } });
  });
});
