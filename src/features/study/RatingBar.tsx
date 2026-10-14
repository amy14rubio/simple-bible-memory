import { useEffect, type ReactNode } from 'react';
import { RATING_LABELS, type Rating } from '../../domain/study/rating';

const RATINGS: Rating[] = [1, 2, 3, 4];

/** Again red, Hard orange, Good green, Easy light blue, as in Anki. Only the text is colored; buttons stay plain. */
export const RATING_TEXT: Record<Rating, string> = { 1: 'text-again', 2: 'text-hard', 3: 'text-good', 4: 'text-easy' };

/** Pinned to the bottom of the screen so the thumb never has to reach, whatever the keyboard is doing. */
export function ActionBar({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 -mx-5 mt-6 space-y-3 border-t border-border bg-background px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
      {children}
    </div>
  );
}

/**
 * Again / Hard / Good / Easy, with the next interval above each label (when scheduling). Keys 1-4 also work.
 * The suggested rating gets a ring but is never selected for the learner.
 */
export function RatingBar({ suggested, intervals, onRate }: { suggested?: Rating; intervals?: Record<Rating, string>; onRate: (r: Rating) => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select')) return;
      const n = Number(e.key);
      if (n >= 1 && n <= 4) onRate(n as Rating);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onRate]);

  return (
    <div role="group" aria-label="How well did you remember it?" className="grid grid-cols-4 gap-2">
      {RATINGS.map((r) => (
        <button
          key={r}
          type="button"
          onClick={() => onRate(r)}
          className={`flex min-h-14 flex-col-reverse items-center justify-center rounded-lg border border-border bg-background hover:border-foreground ${
            r === suggested ? 'ring-2 ring-foreground ring-offset-2 ring-offset-background' : ''
          }`}
        >
          {/* DOM order is label, then interval (screen readers say "Good, 10m"); flex-col-reverse shows the interval above. */}
          <span className={`text-[0.9375rem] font-semibold ${RATING_TEXT[r]}`}>{RATING_LABELS[r]}</span>
          {intervals && <span className="text-xs text-muted">{intervals[r]}</span>}
          {r === suggested && <span className="sr-only">suggested</span>}
        </button>
      ))}
    </div>
  );
}
