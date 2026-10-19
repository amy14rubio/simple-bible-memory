/**
 * Custom theme: the user picks three colours (background, text, accent) and everything else is worked out from them,
 * so the app always looks coherent: panels, borders and muted text are mixes of the text colour into the background.
 */
export interface CustomTheme {
  background: string;
  text: string;
  accent: string;
}

/** The app's own light and dark palettes: the starting point for a new custom theme. */
export const LIGHT_START: CustomTheme = { background: '#f8f8f6', text: '#17171a', accent: '#d96878' };
export const DARK_START: CustomTheme = { background: '#131312', text: '#f1f0ec', accent: '#d96878' };

export const HEX = /^#[0-9a-f]{6}$/i;
export const isHex = (value: string) => HEX.test(value);

export function isCustomTheme(value: unknown): value is CustomTheme {
  const v = value as Partial<CustomTheme> | null;
  return !!v && typeof v.background === 'string' && typeof v.text === 'string' && typeof v.accent === 'string' && isHex(v.background) && isHex(v.text) && isHex(v.accent);
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Which built-in palette (for the rating colours and the browser's own controls) suits this background. */
export const isDarkBackground = (background: string) => luminance(background) < 0.3;

const mix = (fg: string, percent: number, bg: string) => `color-mix(in srgb, ${fg} ${percent}%, ${bg})`;

/** The CSS variables a custom theme sets, and whether it should be treated as a dark theme. */
export function customThemeVars(c: CustomTheme): { dark: boolean; vars: Record<string, string> } {
  return {
    dark: isDarkBackground(c.background),
    vars: {
      '--background': c.background,
      '--foreground': c.text,
      '--primary': c.text,
      '--primary-foreground': c.background,
      '--ring': c.text,
      '--accent': c.accent,
      '--danger': c.accent,
      '--muted': mix(c.text, 68, c.background),
      '--surface': mix(c.text, 6, c.background),
      '--panel': mix(c.text, 9, c.background),
      '--border': mix(c.text, 14, c.background),
      // The banner after a rating: its words are tinted by the rating, but in a custom theme they are simply the theme's background colour on the text-coloured pill.
      '--toast-again': c.background,
      '--toast-hard': c.background,
      '--toast-good': c.background,
      '--toast-easy': c.background,
    },
  };
}

/** Variable names a custom theme may set, so switching away can remove exactly those. */
export const CUSTOM_VAR_NAMES = Object.keys(customThemeVars(LIGHT_START).vars);
