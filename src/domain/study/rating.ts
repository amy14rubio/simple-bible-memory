/** Recall rating, using FSRS's four grades. The scheduler (Phase 5) maps these to its own enum. */
export type Rating = 1 | 2 | 3 | 4;

/**
 * Deliberate, simple mapping from an automatic score to a SUGGESTED rating.
 * The user always makes the final choice. We never suggest Easy: only the learner knows
 * whether recall felt effortless.
 *   perfect              -> Good
 *   at least 90% correct -> Hard  (recalled, but with a slip)
 *   anything less        -> Again
 */
export function suggestRating(accuracy: number, perfect: boolean): Rating {
  if (perfect) return 3;
  return accuracy >= 0.9 ? 2 : 1;
}
