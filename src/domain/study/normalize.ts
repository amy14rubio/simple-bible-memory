/**
 * Text normalization rules for comparing typed answers with a stored verse.
 * The stored verse is NEVER modified: these functions only produce comparison keys.
 *
 * Rules (each one is covered by tests):
 *  1. A "word" is a run of letters, digits and combining marks (any language), optionally
 *     containing apostrophes inside it (God's, don't).
 *  2. Everything else (spaces, newlines, punctuation, dashes, quotes) only separates words
 *     and is ignored. So "God-breathed" is two words: god, breathed.
 *  3. Unicode is normalized to NFC, so "é" typed two different ways matches.
 *  4. Comparison is case-insensitive.
 *  5. Apostrophes inside a word are dropped: don't = dont = don’t.
 */
export interface Token {
  /** The word exactly as it appears in the source text (punctuation around it excluded). */
  text: string;
  /** The comparison key. */
  key: string;
  /** Start offset of `text` in the source string. */
  start: number;
}

const WORD = /[\p{L}\p{N}\p{M}]+(?:['’ʼ‘][\p{L}\p{N}\p{M}]+)*/gu;

export function normalizeWord(word: string): string {
  return word.normalize('NFC').toLowerCase().replace(/['’ʼ‘]/g, '');
}

export function tokenize(text: string): Token[] {
  return [...text.normalize('NFC').matchAll(WORD)].map((m) => ({
    text: m[0],
    key: normalizeWord(m[0]),
    start: m.index,
  }));
}

/** Normalizes a whole string to one comparison key, e.g. for a single fill-in-the-blank answer. */
export function normalizeText(text: string): string {
  return tokenize(text).map((t) => t.key).join(' ');
}
