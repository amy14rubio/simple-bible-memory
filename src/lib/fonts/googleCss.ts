/** One font file from Google's stylesheet: a weight and style of a family, for a range of characters. */
export interface FaceSpec {
  weight: string; // "400"
  style: string; // "normal" | "italic"
  unicodeRange: string; // "U+0000-00FF, ..."
  url: string;
  subset: string; // "latin", "latin-ext", ...
}

/** Which character sets we download. Latin covers English and Spanish (ñ, á, ¿); latin-ext covers more accents. */
export const WANTED_SUBSETS = ['latin', 'latin-ext'];

/**
 * Reads the @font-face blocks of a Google Fonts stylesheet. Each block is preceded by a comment naming its subset.
 * Only the subsets we use are returned, so a font costs tens of kilobytes, not megabytes.
 */
export function parseFontFaces(css: string, wanted = WANTED_SUBSETS): FaceSpec[] {
  const faces: FaceSpec[] = [];
  const block = /\/\*\s*([\w-]+)\s*\*\/\s*@font-face\s*\{([^}]*)\}/g;
  for (const m of css.matchAll(block)) {
    const [, subset, body] = m;
    if (!subset || !body || !wanted.includes(subset)) continue;
    const url = /url\(([^)]+)\)/.exec(body)?.[1]?.replace(/^['"]|['"]$/g, '');
    if (!url) continue;
    faces.push({
      weight: /font-weight:\s*([^;]+);/.exec(body)?.[1]?.trim() ?? '400',
      style: /font-style:\s*([^;]+);/.exec(body)?.[1]?.trim() ?? 'normal',
      unicodeRange: /unicode-range:\s*([^;]+);/.exec(body)?.[1]?.trim() ?? '',
      url,
      subset,
    });
  }
  return faces;
}
