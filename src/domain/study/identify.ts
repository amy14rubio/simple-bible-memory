import { parseReference } from '../bible/reference';
import { normalizeText } from './normalize';
import { suggestRating, type Rating } from './rating';

export interface IdentifyResult {
  correct: boolean;
  suggestedRating: Rating;
}

/**
 * Is the typed verse reference the same as the card's reference?
 * Both are read as Bible references first, so "jn 3:16", "John 3:16" and "Juan 3:16" all match.
 * References that are not recognizable (a free-text label) are compared word by word instead.
 */
export function checkReference(expected: string, typed: string): IdentifyResult {
  const a = parseReference(expected);
  const b = parseReference(typed);
  const correct = a && b ? a.normalized === b.normalized : normalizeText(typed) !== '' && normalizeText(typed) === normalizeText(expected);
  return { correct, suggestedRating: suggestRating(correct ? 1 : 0, correct) };
}
