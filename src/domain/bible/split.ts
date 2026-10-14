import { parseReference, withPassage } from './reference';

export interface SplitVerse {
  verse: number;
  /** The new card's reference, written in the same style as the original ("Salmos 130:1"). */
  reference: string;
  text: string;
}

/** Why a passage could not be split. The screen turns the code (and `verse`, if any) into text in the user's language. */
export type SplitErrorCode = 'not-splittable' | 'single-verse' | 'no-markers' | 'missing-verse' | 'empty-verse' | 'cannot-split';

export type SplitResult =
  | { ok: true; verses: SplitVerse[]; ignored: string }
  | { ok: false; code: SplitErrorCode; verse?: number; message: string };

const SUPERSCRIPT = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const MAX_VERSE = 176;

/**
 * Can this reference be split into one card per verse? True for a whole chapter ("Psalm 130") or several verses
 * of one chapter ("Psalm 130:1-2", "Romans 8:28,30"). False for a single verse or anything spanning chapters.
 */
export function canSplit(reference: string): boolean {
  const span = parseReference(reference)?.span;
  return !!span && (span.verses === null || span.verses.length > 1);
}

/** Matches verse number `n` standing on its own: "2 Lord", "[2] Lord", "(2)Lord", "²Lord". Never part of 130 or 2:1. */
function markerRegex(n: number) {
  return new RegExp(`(?:^|[\\s\\[(])(${n})(?![\\d:])[\\])]?[ \\t]*`, 'g');
}

/** `textStart` is where the verse's words begin; `numberEnd` is just after the number, where the next search should start. */
function findMarker(text: string, n: number, from: number): { start: number; textStart: number; numberEnd: number } | null {
  const re = markerRegex(n);
  re.lastIndex = from;
  const m = re.exec(text);
  if (!m) return null;
  return { start: m.index, textStart: m.index + m[0].length, numberEnd: m.index + m[0].trimEnd().length };
}

const tidy = (t: string) => t.replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').trim();

/**
 * Cuts a pasted passage into one verse per card, using the verse numbers inside the text, for example
 * "1 Out of the depths I cry to you, O LORD. 2 Lord, hear my voice." Numbers are looked for in order, so a stray
 * number inside a verse is only a problem if it is the next verse's number. The screen shows a preview first.
 */
export function splitPassage(reference: string, passage: string): SplitResult {
  const parsed = parseReference(reference);
  if (!parsed?.span) return { ok: false, code: 'not-splittable', message: 'Splitting works for one chapter or several verses of one chapter, for example Psalm 130 or Psalm 130:1-2.' };
  const { chapter, verses: named } = parsed.span;
  if (named !== null && named.length < 2) return { ok: false, code: 'single-verse', message: 'This is a single verse, so there is nothing to split.' };

  const text = [...passage.replace(/\r/g, '')].map((c) => (SUPERSCRIPT.includes(c) ? String(SUPERSCRIPT.indexOf(c)) : c)).join('');
  // Jude 3-5 style: a one-chapter book written without a chapter number.
  const singleChapterBook = named !== null && !parsed.passage.includes(':');

  // Where does each verse start (marker) and where does its text begin?
  const found: { verse: number; markerStart: number; textStart: number }[] = [];
  const wanted = named ?? Array.from({ length: MAX_VERSE }, (_, i) => i + 1);
  let cursor = 0;
  for (const [i, verse] of wanted.entries()) {
    const m = findMarker(text, verse, cursor);
    if (!m) {
      if (i === 0) { found.push({ verse, markerStart: 0, textStart: 0 }); continue; } // the first number may have been left out when copying
      if (named !== null) return { ok: false, code: 'missing-verse', verse, message: `We couldn't find verse ${verse} in the text. Each verse should start with its number, for example "${verse} In the beginning...".` };
      break; // whole chapter: the verses simply ended
    }
    found.push({ verse, markerStart: m.start, textStart: m.textStart });
    cursor = m.numberEnd;
  }
  if (found.length < 2) {
    return { ok: false, code: 'no-markers', message: `We couldn't find the verse numbers in the text. Each verse should start with its number, for example "1 In the beginning... 2 And the earth...".` };
  }

  const out: SplitVerse[] = [];
  for (const [i, f] of found.entries()) {
    const end = i + 1 < found.length ? found[i + 1]!.markerStart : text.length;
    const body = tidy(text.slice(f.textStart, end));
    if (!body) return { ok: false, code: 'empty-verse', verse: f.verse, message: `Verse ${f.verse} has no text after its number.` };
    const ref = withPassage(reference, singleChapterBook ? String(f.verse) : `${chapter}:${f.verse}`);
    if (!ref) return { ok: false, code: 'cannot-split', message: 'This reference could not be split.' };
    out.push({ verse: f.verse, reference: ref, text: body });
  }
  return { ok: true, verses: out, ignored: tidy(text.slice(0, found[0]!.markerStart)) };
}
