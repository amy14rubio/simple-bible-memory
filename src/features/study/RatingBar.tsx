import { useEffect, type ReactNode } from 'react';
import type { Rating } from '../../domain/study/rating';
import { useI18n } from '../../i18n/I18nProvider';
import type { MessageKey } from '../../i18n';

const RATINGS: Rating[] = [1, 2, 3, 4];
const LABEL_KEYS: Record<Rating, MessageKey> = { 1: 'rating.again', 2: 'rating.hard', 3: 'rating.good', 4: 'rating.easy' };

/** Again red, Hard orange, Good green, Easy light blue, as in Anki. Only the text is colored; buttons stay plain. */
export const RATING_TEXT: Record<Rating, string> = { 1: 'text-again', 2: 'text-hard', 3: 'text-good', 4: 'text-easy' };

/** Pinned to the bottom of the screen so the thumb never has to reach, whatever the keyboard is doing. */
export function ActionBar({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 -mx-5 mt-6 space-y-3 bg-background px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
      {children}
    </div>
  );
}

/**
 * Again / Hard / Good / Easy, with the next interval above each label (when scheduling). Keys 1-4 also work.
 * The suggested rating gets a ring but is never selected for the learner.
 */
export function RatingBar({ suggested, intervals, onRate }: { suggested?: Rating; intervals?: Record<Rating, string>; onRate: (r: Rating) => void }) {
  const { t } = useI18n();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return; // (Cmd+1 switches browser tabs, for one)
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select')) return;
      // Single-key shortcuts only act while focus is on the answer or the rating buttons (or nowhere), so they never
      // fire unexpectedly for someone moving about the screen with a screen reader or the keyboard.
      if (t !== document.body && !t.closest('[data-rating-keys]')) return;
      const n = Number(e.key);
      if (n >= 1 && n <= 4) onRate(n as Rating);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onRate]);

  return (
    <div role="group" aria-label={t('rating.question')} data-rating-keys className="grid grid-cols-4 gap-2">
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
          <span className={`text-[0.9375rem] font-semibold ${RATING_TEXT[r]}`}>{t(LABEL_KEYS[r])}</span>
          {intervals && <span className="text-xs text-muted">{intervals[r]}</span>}
          {r === suggested && <span className="sr-only">{t('rating.suggested')}</span>}
        </button>
      ))}
    </div>
  );
}
