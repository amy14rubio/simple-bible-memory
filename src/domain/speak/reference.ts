export type SpeakLanguage = 'en' | 'es';

const ORDINALS: Record<SpeakLanguage, Record<string, string>> = {
  en: { '1': 'First', '2': 'Second', '3': 'Third' },
  es: { '1': 'Primera', '2': 'Segunda', '3': 'Tercera' },
};
const WORDS: Record<SpeakLanguage, { verse: string; verses: string; to: string }> = {
  en: { verse: 'verse', verses: 'verses', to: 'to' },
  es: { verse: 'versículo', verses: 'versículos', to: 'al' },
};

/**
 * A reference written the way people SAY it, so a speech voice reads it well:
 *   "Philippians 4:6-7"    -> "Philippians 4, verses 6 to 7"
 *   "1 Corinthians 13:4-7" -> "First Corinthians 13, verses 4 to 7"
 *   "Psalm 23"             -> "Psalm 23"
 * Anything it does not recognise is read as it is written, with ":" and "-" turned into words.
 */
export function spokenReference(reference: string, lang: SpeakLanguage): string {
  const w = WORDS[lang];
  const text = reference.trim().replace(/[–—]/g, '-').replace(/\s+/g, ' ');
  const m = text.match(/^(?:([123])\s+)?(.+?)\s+(\d+)(?::(\d+)(?:-(\d+))?)?$/);
  if (!m) return text.replace(/:/g, ', ').replace(/-/g, ` ${w.to} `);
  const [, num, book, chapter, from, to] = m;
  const name = `${num ? `${ORDINALS[lang][num]} ` : ''}${book}`;
  if (!from) return `${name} ${chapter}`;
  if (!to || to === from) return `${name} ${chapter}, ${w.verse} ${from}`;
  return `${name} ${chapter}, ${w.verses} ${from} ${w.to} ${to}`;
}
