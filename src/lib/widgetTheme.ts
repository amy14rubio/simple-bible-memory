import { isDarkBackground, type CustomTheme } from './customTheme';

/**
 * The colours the home-screen widgets are drawn with: the app's own theme. A widget is drawn by the phone, not by the web view, so it
 * cannot read the app's CSS; the app hands over plain colours instead (see src/platform/widgets.ts). A test keeps LIGHT and DARK equal to
 * the tokens in src/styles/tokens.css.
 */
export interface WidgetPalette {
  background: string;
  foreground: string;
  muted: string;
  surface: string;
  border: string;
  accent: string;
  primary: string;
  primaryForeground: string;
}

export const LIGHT: WidgetPalette = { background: '#f8f8f6', foreground: '#17171a', muted: '#5e5e5a', surface: '#eeeeea', border: '#d9d8d3', accent: '#d96878', primary: '#17171a', primaryForeground: '#f8f8f6' };
export const DARK: WidgetPalette = { background: '#131312', foreground: '#f1f0ec', muted: '#a4a29b', surface: '#1d1d1b', border: '#333330', accent: '#d96878', primary: '#f1f0ec', primaryForeground: '#131312' };

/** `percent`% of `fg` mixed into `bg`, per colour channel in sRGB: what CSS `color-mix(in srgb, fg percent%, bg)` gives. */
export function mixHex(fg: string, percent: number, bg: string): string {
  const channel = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  return `#${[0, 1, 2].map((i) => Math.round((channel(fg, i) * percent + channel(bg, i) * (100 - percent)) / 100).toString(16).padStart(2, '0')).join('')}`;
}

/** A custom theme's palette: the same mixes the app's CSS makes (`customThemeVars`). */
export function customPalette(c: CustomTheme): WidgetPalette {
  return {
    background: c.background,
    foreground: c.text,
    muted: mixHex(c.text, 68, c.background),
    surface: mixHex(c.text, 6, c.background),
    border: mixHex(c.text, 14, c.background),
    accent: c.accent,
    primary: c.text,
    primaryForeground: c.background,
  };
}

export type WidgetThemePreference = 'system' | 'light' | 'dark' | 'custom';

/** What the widgets need to follow the app's theme: the person's choice, and every palette it could mean ("system" follows the phone). */
export function widgetTheme(pref: WidgetThemePreference, custom: CustomTheme | undefined) {
  const chosen = pref === 'custom' && custom ? custom : undefined;
  return {
    pref: pref === 'custom' && !chosen ? 'system' : pref,
    light: LIGHT,
    dark: DARK,
    ...(chosen ? { custom: customPalette(chosen), customIsDark: isDarkBackground(chosen.background) } : {}),
  };
}

