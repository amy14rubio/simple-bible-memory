import { CANONICAL_BOOKS, parseReference, type ParsedReference } from './reference';

/**
 * YouVersion names a passage in USFM: "JHN.3.16", "PHP.4.6-7", "PSA.23". Their books are in Bible order, like CANONICAL_BOOKS.
 * (A request takes one chapter's worth at a time: a list of verses or a stretch across chapters is asked for in pieces.)
 */
const USFM_BOOKS = [
  'GEN', 'EXO', 'LEV', 'NUM', 'DEU', 'JOS', 'JDG', 'RUT', '1SA', '2SA', '1KI', '2KI', '1CH', '2CH', 'EZR', 'NEH', 'EST', 'JOB', 'PSA', 'PRO',
  'ECC', 'SNG', 'ISA', 'JER', 'LAM', 'EZK', 'DAN', 'HOS', 'JOL', 'AMO', 'OBA', 'JON', 'MIC', 'NAM', 'HAB', 'ZEP', 'HAG', 'ZEC', 'MAL',
  'MAT', 'MRK', 'LUK', 'JHN', 'ACT', 'ROM', '1CO', '2CO', 'GAL', 'EPH', 'PHP', 'COL', '1TH', '2TH', '1TI', '2TI', 'TIT', 'PHM', 'HEB', 'JAS',
  '1PE', '2PE', '1JN', '2JN', '3JN', 'JUD', 'REV',
] as const;

/** The USFM code of a canonical (English) book name, or null. */
export const usfmBook = (book: string): string | null => USFM_BOOKS[CANONICAL_BOOKS.indexOf(book)] ?? null;

const SINGLE_CHAPTER = new Set(['Obadiah', 'Philemon', '2 John', '3 John', 'Jude']);

/**
 * The pieces to ask YouVersion for, in reading order, for a reference like "Philippians 4:6-7" or "Romans 8:38-9:2".
 * `lastVerse(chapter)` says how many verses a chapter has; it is only called when a stretch runs across chapters.
 * Null if the text is not a reference the API can be asked about.
 */
export async function usfmPassages(reference: string, lastVerse: (book: string, chapter: number) => Promise<number>): Promise<string[] | null> {
  const parsed = parseReference(reference);
  if (!parsed) return null;
  return segments(parsed, lastVerse);
}

async function segments(parsed: ParsedReference, lastVerse: (book: string, chapter: number) => Promise<number>): Promise<string[] | null> {
  const code = usfmBook(parsed.book);
  if (!code) return null;
  const p = parsed.passage;
  let m: RegExpExecArray | null;

  if (SINGLE_CHAPTER.has(parsed.book)) {
    if ((m = /^(\d+)$/.exec(p))) return [`${code}.1.${m[1]}`];
    if ((m = /^(\d+)-(\d+)$/.exec(p))) return [`${code}.1.${m[1]}-${m[2]}`];
    return null;
  }
  if ((m = /^(\d+)$/.exec(p))) return [`${code}.${m[1]}`]; // a whole chapter
  if ((m = /^(\d+)-(\d+)$/.exec(p))) { // several whole chapters
    const [a, b] = [Number(m[1]), Number(m[2])];
    return Array.from({ length: b - a + 1 }, (_, i) => `${code}.${a + i}`);
  }
  if ((m = /^(\d+):(\d+)-(\d+):(\d+)$/.exec(p))) { // across chapters
    const [c1, v1, c2, v2] = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
    const out = [`${code}.${c1}.${v1}-${await lastVerse(parsed.book, c1)}`];
    for (let c = c1 + 1; c < c2; c++) out.push(`${code}.${c}`);
    out.push(v2 === 1 ? `${code}.${c2}.1` : `${code}.${c2}.1-${v2}`);
    return out;
  }
  if ((m = /^(\d+):(.+)$/.exec(p))) { // verses in one chapter, maybe several stretches: "4:6-7,13"
    return m[2]!.split(',').map((part) => `${code}.${m![1]}.${part}`);
  }
  return null;
}
