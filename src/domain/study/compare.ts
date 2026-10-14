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
