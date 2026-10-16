/**
 * The fonts you can choose from. With a Google Fonts API key the app loads the full catalogue (see googleApi.ts);
 * without one, or when Google can't be reached, it offers this hand-picked list of readable fonts instead.
 * Each font is fetched only when chosen, then kept on the device.
 */
export type FontCategory = 'serif' | 'sans-serif' | 'handwriting' | 'display' | 'monospace';
export const FONT_CATEGORIES: FontCategory[] = ['serif', 'sans-serif', 'handwriting', 'display', 'monospace'];

export interface CatalogueFont {
  family: string;
  category: FontCategory;
  /** Weights this family really has (asking Google for one it lacks is an error). */
  weights: number[];
}

const both = [400, 700];
const regular = [400];
const f = (family: string, category: FontCategory, weights = both): CatalogueFont => ({ family, category, weights });

export const CURATED_FONTS: CatalogueFont[] = [
  f('Lora', 'serif'), f('Merriweather', 'serif'), f('Playfair Display', 'serif'), f('Crimson Pro', 'serif'),
  f('EB Garamond', 'serif'), f('Source Serif 4', 'serif'), f('Libre Baskerville', 'serif'), f('Cormorant Garamond', 'serif'),
  f('Noto Serif', 'serif'), f('PT Serif', 'serif'),
  f('Inter', 'sans-serif'), f('Nunito', 'sans-serif'), f('Open Sans', 'sans-serif'), f('Roboto', 'sans-serif'),
  f('Lato', 'sans-serif'), f('Poppins', 'sans-serif'), f('DM Sans', 'sans-serif'), f('Work Sans', 'sans-serif'),
  f('Atkinson Hyperlegible', 'sans-serif'), f('Source Sans 3', 'sans-serif'),
  f('Dancing Script', 'handwriting'), f('Caveat', 'handwriting'), f('Kalam', 'handwriting'),
  f('Pacifico', 'handwriting', regular), f('Shadows Into Light', 'handwriting', regular), f('Patrick Hand', 'handwriting', regular),
  f('Abril Fatface', 'display', regular), f('Lobster', 'display', regular), f('Bebas Neue', 'display', regular), f('Righteous', 'display', regular),
  f('JetBrains Mono', 'monospace'), f('Space Mono', 'monospace'), f('IBM Plex Mono', 'monospace'),
];


/** What to fall back to while a font loads, so text never disappears. */
export const FALLBACK: Record<FontCategory, string> = {
  serif: "Georgia, 'Times New Roman', serif",
  'sans-serif': 'system-ui, sans-serif',
  handwriting: "'Comic Sans MS', cursive",
  display: 'system-ui, sans-serif',
  monospace: "ui-monospace, 'SF Mono', Menlo, monospace",
};

const CSS_API = 'https://fonts.googleapis.com/css2';
const spec = (font: CatalogueFont) => `family=${font.family.replace(/ /g, '+')}:wght@${font.weights.join(';')}`;

/** The stylesheet that describes a font's files: all of them, or (with `text`) a tiny version holding only those letters. */
export function fontCssUrl(font: CatalogueFont, text?: string): string {
  const unique = text ? [...new Set(text)].join('') : '';
  return `${CSS_API}?${spec(font)}&display=swap${unique ? `&text=${encodeURIComponent(unique)}` : ''}`;
}

/** The value for a CSS font-family variable: the chosen font first, then the fallback. */
export const fontFamilyValue = (font: { family: string; category: FontCategory }) => `"${font.family}", ${FALLBACK[font.category]}`;
