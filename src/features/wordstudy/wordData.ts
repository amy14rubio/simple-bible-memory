import { parseReference } from '../../domain/bible/reference';
import { usfmBook } from '../../domain/bible/usfm';

/**
 * The original-language words of a verse, and the dictionary entry of each, from the Free Use Bible API (https://bible.helloao.org):
 * the Berean interlinear (public domain) and the STEPBible brief lexicons (CC BY 4.0, Tyndale House). The words of a verse do not depend on
 * the translation or language the person reads in, so one verse reference is enough to ask for them.
 * What is asked for is kept on the device (the browser's Cache Storage), so a chapter or an entry is fetched once.
 */
const API = 'https://bible.helloao.org/api/d';
const CACHE = 'sbm-word-study-v1';

export interface OriginalWord {
  pos: number;
  language: 'greek' | 'hebrew';
  text: string;
  transliteration: string;
  parsingFull: string | null;
  /** As the interlinear writes it: "G0649", "H0430". */
  strongs: string;
  /** The English the Berean Standard Bible puts for it ("He gave", "[His]"), or null for a word it leaves out. */
  gloss: string | null;
}

export interface LexiconSense { lemma: string; transliteration: string; partOfSpeech: string | null; gloss: string | null; definition: string }
export interface LexiconEntry { id: string; language: 'greek' | 'hebrew'; senses: LexiconSense[] }

const memory = new Map<string, Promise<unknown>>();

/** JSON from the API, remembered for this session and kept in Cache Storage for next time (it still works offline once it has been seen). */
async function getJson<T>(url: string): Promise<T> {
  const hit = memory.get(url);
  if (hit) return hit as Promise<T>;
  const load = (async () => {
    let cache: Cache | null = null;
    try { cache = typeof caches === 'undefined' ? null : await caches.open(CACHE); } catch { cache = null; }
    const stored = await cache?.match(url).catch(() => undefined);
    if (stored) return (await stored.json()) as T;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`word study ${response.status}`);
    void cache?.put(url, response.clone()).catch(() => undefined);
    return (await response.json()) as T;
  })();
  memory.set(url, load);
  load.catch(() => memory.delete(url)); // a failure is not remembered: the next try asks again
  return load;
}

/** A verse that can have word study: its USFM book code, chapter and verse. */
export interface VerseRef { book: string; code: string; chapter: number; verse: number }

/**
 * The verses a card's reference names, when they are in one chapter ("John 3:16", "Philippians 4:6-7", "Psalm 23:1,3").
 * Null for anything else (a whole chapter, a stretch across chapters, text that is not a reference): no word study for those.
 */
export function versesOfReference(reference: string): VerseRef[] | null {
  const parsed = parseReference(reference);
  const span = parsed?.span;
  const code = parsed && usfmBook(parsed.book);
  if (!parsed || !span || !span.verses || !code || span.verses.length === 0 || span.verses.length > 40) return null;
  return span.verses.map((verse) => ({ book: parsed.book, code, chapter: span.chapter, verse }));
}

interface ChapterJson { chapter: { content: { verse?: number; words?: Array<OriginalWord & { bsbPos?: number }> }[] } }

/** The original words of one verse, in reading order. */
export async function originalWords(ref: VerseRef): Promise<OriginalWord[]> {
  const data = await getJson<ChapterJson>(`${API}/bsb-interlinear/${ref.code}/${ref.chapter}.json`);
  const verse = data.chapter.content.find((c) => c.verse === ref.verse);
  return (verse?.words ?? []).map((w) => ({ pos: w.pos, language: w.language, text: w.text, transliteration: w.transliteration, parsingFull: w.parsingFull ?? null, strongs: w.strongs, gloss: w.gloss ?? null }));
}

/** "G0649" is how the interlinear writes it and also how the lexicon files are named; people know it as G649. */
export const strongsNumber = (strongs: string) => strongs.replace(/^([GH])0*(\d)/, '$1$2');

export async function lexiconEntry(strongs: string): Promise<LexiconEntry | null> {
  try {
    const data = await getJson<{ entry?: LexiconEntry }>(`${API}/stepbible-lexicon/lexicon/${strongs}.json`);
    return data.entry ?? null;
  } catch { return null; }
}

/** Blue Letter Bible's page for a Strong's number ("G0649" -> .../lexicon/g649/kjv/tr/0-1/). */
export const blueLetterUrl = (strongs: string) => {
  const n = strongsNumber(strongs).toLowerCase();
  return `https://www.blueletterbible.org/lexicon/${n}/kjv/${n.startsWith('g') ? 'tr' : 'wlc'}/0-1/`;
};

/** Blue Letter Bible's page for a verse (its book codes are USFM's, bar three). */
export const blueLetterVerseUrl = (ref: VerseRef) => {
  const code = ({ EZK: 'eze', JOL: 'joe', NAM: 'nah' } as Record<string, string>)[ref.code] ?? ref.code.toLowerCase();
  return `https://www.blueletterbible.org/kjv/${code}/${ref.chapter}/${ref.verse}/`;
};

/** StudyLight's commentaries for one verse ("John 3:16" -> .../commentary/john/3-16.html). */
export const commentaryUrl = (ref: VerseRef) => {
  const slug = (ref.book === 'Psalm' ? 'Psalms' : ref.book).toLowerCase().replace(/ /g, '-');
  return `https://www.studylight.org/commentary/${slug}/${ref.chapter}-${ref.verse}.html`;
};

const plain = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}' ]/gu, ' ').split(/\s+/).filter(Boolean);

/**
 * Which of a verse's original words the English word that was pressed stands for, in the Berean text (its glosses are the English words it
 * uses). Only a word whose gloss holds the pressed word, once (or, if several, the one nearest where the word sits in the verse); otherwise null
 * and the person picks from the list. `place` is 0..1: how far into the verse the pressed word is.
 */
export function wordForEnglish(words: OriginalWord[], pressed: string, place: number): OriginalWord | null {
  const target = plain(pressed)[0];
  if (!target) return null;
  const matches = words.filter((w) => w.gloss && plain(w.gloss).includes(target));
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0]!;
  const spot = place * (words.length - 1);
  return matches.reduce((best, w) => (Math.abs(words.indexOf(w) - spot) < Math.abs(words.indexOf(best) - spot) ? w : best));
}

/** The words of a verse's English (as the Berean text has them, lower case) that have an original word behind them, for underlining. */
export function lookableEnglish(words: OriginalWord[]): Set<string> {
  const out = new Set<string>();
  for (const w of words) if (w.gloss) for (const token of plain(w.gloss)) out.add(token);
  return out;
}

/** The pressed word's lower-case form, the way it is compared. */
export const englishKey = (word: string) => plain(word)[0] ?? '';
