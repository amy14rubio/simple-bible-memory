import { normalizeText, tokenize } from './normalize';
import { shuffleSeeded } from './choices';
import { suggestRating, type Rating } from './rating';

export type Difficulty = 'easy' | 'medium' | 'hard';
export const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];

/** Share of words hidden. Easy/medium only hide words of 4+ letters (the "meaty" ones). */
const RATIO: Record<Difficulty, number> = { easy: 0.2, medium: 0.4, hard: 0.7 };
const MIN_LENGTH: Record<Difficulty, number> = { easy: 4, medium: 4, hard: 1 };

export type Segment = { type: 'text'; text: string } | { type: 'blank'; answer: string; id: number };

/** Small seeded random generator (mulberry32) so a given seed always yields the same blanks. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * Builds a fill-in-the-blanks exercise on the fly from the stored verse (nothing is persisted).
 * Joining the segments, with each blank replaced by its answer, gives back the original verse exactly.
 */
export function generateCloze(verse: string, difficulty: Difficulty, seed: number): Segment[] {
  const text = verse.normalize('NFC');
  const words = tokenize(text);
  let eligible = words.map((_, i) => i).filter((i) => words[i]!.text.length >= MIN_LENGTH[difficulty]);
  if (eligible.length === 0) eligible = words.map((_, i) => i); // very short verses: any word

  const count = words.length === 0 ? 0 : Math.min(eligible.length, Math.max(1, Math.round(eligible.length * RATIO[difficulty])));
  const random = rng(seed);
  const shuffled = [...eligible];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const k = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[k]] = [shuffled[k]!, shuffled[i]!];
  }
  const blankIndexes = new Set(shuffled.slice(0, count));

  const segments: Segment[] = [];
  let cursor = 0;
  let id = 0;
  words.forEach((w, i) => {
    if (!blankIndexes.has(i)) return;
    if (w.start > cursor) segments.push({ type: 'text', text: text.slice(cursor, w.start) });
    segments.push({ type: 'blank', answer: w.text, id: id++ });
    cursor = w.start + w.text.length;
  });
  if (cursor < text.length) segments.push({ type: 'text', text: text.slice(cursor) });
  return segments;
}

export interface ClozeResult {
  /** Per blank id: was the typed answer correct? */
  correct: boolean[];
  correctCount: number;
  total: number;
  accuracy: number;
  suggestedRating: Rating;
}

/** `answers[id]` is what the user typed for blank `id`. Same normalization rules as typed recall. */
export function checkCloze(segments: Segment[], answers: string[]): ClozeResult {
  const blanks = segments.filter((s): s is Extract<Segment, { type: 'blank' }> => s.type === 'blank');
  const correct = blanks.map((b) => {
    const given = normalizeText(answers[b.id] ?? '');
    return given !== '' && given === normalizeText(b.answer);
  });
  const correctCount = correct.filter(Boolean).length;
  const accuracy = blanks.length === 0 ? 1 : correctCount / blanks.length;
  return { correct, correctCount, total: blanks.length, accuracy, suggestedRating: suggestRating(accuracy, correctCount === blanks.length) };
}


/** The word bank always shows this many words (fewer only if the verse and deck do not have enough different words). */
export const WORD_BANK_SIZE = 8;

export interface BankWord {
  /** Unique within one bank. */
  id: number;
  text: string;
}

/** Is the tapped word the one that belongs in the blank? Same comparison rules as typed answers. */
export const isCorrectWord = (chosen: string, answer: string) => normalizeText(chosen) !== '' && normalizeText(chosen) === normalizeText(answer);

/**
 * The word bank for ONE blank: the word that belongs there plus other words, WORD_BANK_SIZE in all, shuffled.
 * It is rebuilt (and reshuffled) for every blank, and words you tapped earlier may come back: nothing is used up.
 *
 * The other words come first from the verse's other blanked words (so they are real words from this verse),
 * then from its words that were not blanked, then from `extraWords` (other verses in the deck). None of them is
 * ever the same word as the right answer, so a wrong tap can never be "right by accident".
 * If there are not enough different words the bank is simply smaller; words are never invented.
 */
export function buildWordBank({ segments, step, extraWords = [], seed, size = WORD_BANK_SIZE }: {
  segments: Segment[]; step: number; extraWords?: string[]; seed: string; size?: number;
}): BankWord[] {
  const blanks = segments.filter((s): s is Extract<Segment, { type: 'blank' }> => s.type === 'blank');
  const current = blanks[step];
  if (!current) return [];

  const taken = new Set([normalizeText(current.answer)]);
  const others: string[] = [];
  const addFrom = (group: string[], salt: string) => {
    for (const w of shuffleSeeded(group, hashSeed(`${seed}:${step}:${salt}`))) {
      const key = normalizeText(w);
      if (others.length >= size - 1) return;
      if (key.length < 2 || taken.has(key)) continue; // skip single letters and anything equal to a word already in the bank
      taken.add(key);
      others.push(w);
    }
  };
  addFrom(blanks.map((b) => b.answer), 'answers');
  addFrom(segments.flatMap((s) => (s.type === 'text' ? tokenize(s.text).map((t) => t.text) : [])), 'verse');
  addFrom(extraWords, 'deck');

  const all = [current.answer, ...others].map((text, id) => ({ id, text }));
  return shuffleSeeded(all, hashSeed(`${seed}:${step}:order`));
}

/** Every distinct word of some passages, for use as decoys. */
export function wordsOf(passages: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of passages) for (const t of tokenize(p)) if (!seen.has(t.key)) { seen.add(t.key); out.push(t.text); }
  return out;
}
