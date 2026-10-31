import type { CloudCard, CloudDeckMeta } from './types';

/** A short fingerprint of some text (cyrb53). Not for security: it just tells "same as last time" from "changed". */
export function fingerprint(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

export const cardFingerprint = (c: Pick<CloudCard, 'reference' | 'verseText' | 'position' | 'translation'>) =>
  fingerprint(JSON.stringify(c.translation ? [c.reference, c.verseText, c.position, c.translation] : [c.reference, c.verseText, c.position])); // (a card without its own translation keeps the fingerprint it always had)

export const metaFingerprint = (m: CloudDeckMeta) => fingerprint(JSON.stringify([m.title, m.description, m.translation, m.language, m.cardCount, m.v])); // v: a new format version re-sends the deck's details once, so the public copy says which format it is in
