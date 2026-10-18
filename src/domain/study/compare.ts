import { tokenize } from './normalize';
import { suggestRating, type Rating } from './rating';

export interface DiffOp {
  /** match: typed correctly. missing: in the verse, not typed (or typed wrongly). extra: typed, not in the verse. */
  type: 'match' | 'missing' | 'extra';
  word: string;
}

export interface Comparison {
  ops: DiffOp[];
  expectedCount: number;
  matchedCount: number;
  /** matched words / words in the verse, 0..1 */
  accuracy: number;
  /** Every word right, in order, nothing extra. */
  exact: boolean;
  suggestedRating: Rating;
}

/**
 * Word-level diff using the longest common subsequence of normalized words.
 * A wrongly typed word appears as `missing` (what the verse says) followed by `extra` (what was typed).
 * This is an aid for feedback, not a measure of how well something is memorized.
 */
export function compareVerse(expected: string, typed: string): Comparison {
  const a = tokenize(expected);
  const b = tokenize(typed);

  // lcs[i][j] = length of the longest common subsequence of a[i..] and b[j..]
  const lcs = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i]![j] = a[i]!.key === b[j]!.key ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }

  const ops: DiffOp[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i]!.key === b[j]!.key) {
      ops.push({ type: 'match', word: a[i]!.text });
      i++; j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      ops.push({ type: 'missing', word: a[i]!.text });
      i++;
    } else {
      ops.push({ type: 'extra', word: b[j]!.text });
      j++;
    }
  }
  for (; i < a.length; i++) ops.push({ type: 'missing', word: a[i]!.text });
  for (; j < b.length; j++) ops.push({ type: 'extra', word: b[j]!.text });

  const matchedCount = ops.filter((o) => o.type === 'match').length;
  const exact = ops.every((o) => o.type === 'match');
  const accuracy = a.length === 0 ? (exact ? 1 : 0) : matchedCount / a.length;
  return { ops, expectedCount: a.length, matchedCount, accuracy, exact, suggestedRating: suggestRating(accuracy, exact) };
}

/**
 * A piece of text for display: a word that matched, a word that is wrong, the spaces/punctuation between words,
 * or (typed side only) a `gap` marking where you skipped words, so a partly-right answer doesn't look fully right.
 */
export interface Segment {
  text: string;
  state: 'match' | 'wrong' | 'plain' | 'gap';
}

/** One place where what was typed differs from the verse, with the word before it so it can be found. */
export interface Difference {
  /** The matching word just before (null: at the very start). */
  after: string | null;
  /** What was typed there ("" if nothing). */
  typed: string;
  /** What the verse has there ("" if nothing). */
  missing: string;
}

/** The differences in reading order, each a self-contained fact: after "world", you typed "earth" and the verse has "heaven". */
export function differences(ops: DiffOp[]): Difference[] {
  const out: Difference[] = [];
  let after: string | null = null;
  for (let i = 0; i < ops.length; ) {
    const op = ops[i]!;
    if (op.type === 'match') { after = op.word; i++; continue; }
    const missing: string[] = [];
    const typed: string[] = [];
    for (; i < ops.length && ops[i]!.type !== 'match'; i++) (ops[i]!.type === 'missing' ? missing : typed).push(ops[i]!.word);
    out.push({ after, typed: typed.join(' '), missing: missing.join(' ') });
  }
  return out;
}


/**
 * Splits both texts back into displayable pieces, keeping punctuation and line breaks as written.
 * On the expected side, `wrong` words are the ones that were missed. On the typed side, they are the extra or wrong ones.
 */
export function paintComparison(expected: string, typed: string): { expected: Segment[]; typed: Segment[]; exact: boolean } {
  const c = compareVerse(expected, typed);
  // Where the typed text skipped words: before which typed word. A skipped run next to a wrong typed word is a
  // replacement (that word is already red), so it gets no gap.
  const gapsBefore = new Set<number>();
  let typedIndex = 0;
  for (let i = 0; i < c.ops.length; ) {
    if (c.ops[i]!.type === 'match') { typedIndex++; i++; continue; }
    let missing = false;
    let extras = 0;
    for (; i < c.ops.length && c.ops[i]!.type !== 'match'; i++) {
      if (c.ops[i]!.type === 'missing') missing = true; else extras++;
    }
    if (missing && extras === 0) gapsBefore.add(typedIndex);
    typedIndex += extras;
  }

  const paint = (source: string, skip: DiffOp['type'], gaps?: Set<number>): Segment[] => {
    const states = c.ops.filter((o) => o.type !== skip).map((o) => (o.type === 'match' ? 'match' : 'wrong') as Segment['state']);
    const text = source.normalize('NFC');
    const out: Segment[] = [];
    let pos = 0;
    const tokens = tokenize(source);
    const gap = (): Segment[] => [{ text: ' ', state: 'plain' }, { text: '_', state: 'gap' }, { text: ' ', state: 'plain' }];
    tokens.forEach((tok, i) => {
      if (gaps?.has(i)) out.push(...gap());
      if (tok.start > pos) out.push({ text: text.slice(pos, tok.start), state: 'plain' });
      out.push({ text: tok.text, state: states[i] ?? 'wrong' });
      pos = tok.start + tok.text.length;
    });
    if (pos < text.length) out.push({ text: text.slice(pos), state: 'plain' });
    if (gaps?.has(tokens.length)) out.push(...gap());
    return out;
  };
  return { expected: paint(expected, 'extra'), typed: paint(typed, 'missing', gapsBefore), exact: c.exact };
}
