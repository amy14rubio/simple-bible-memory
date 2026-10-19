import type { CSSProperties } from 'react';
import { CircleCheckIcon } from 'lucide-react';
import type { Rating } from '../../domain/study/rating';

/** How long the banner stays up (see .rating-banner in tokens.css, which moves it in and out over the same time). */
export const BANNER_MS = 3000;

const TONE: Record<Rating, string> = { 1: 'again', 2: 'hard', 3: 'good', 4: 'easy' };

/**
 * A little confirmation of the rating just chosen. It is the app's own toast (same place, shape, font, size and colours,
 * so it follows light, dark and any custom theme), with the check mark tinted in the rating's colour.
 * While it is up it covers the buttons beneath it and takes the taps itself, so a quick second tap cannot press the next
 * card's button by accident (keys and keyboard still work). It fades away by itself. It is hidden from screen readers: the person knows what they pressed, and
 * the next card is announced right after.
 */
export function RatingBanner({ id, rating, text }: { id: number; rating: Rating; text: string }) {
  return (
    <div data-slot="rating-banner" data-id={id} data-rating={rating} aria-hidden="true" className="rating-banner fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-50 mx-auto max-w-2xl">
      <div className="rating-banner-card flex w-full items-center gap-3 rounded-2xl bg-foreground px-5 py-4 text-background shadow-lg" style={{ '--tone': `var(--rating-${TONE[rating]})` } as CSSProperties}>
        <CircleCheckIcon className="size-5 shrink-0" />
        <p className="text-[0.9375rem] font-medium">{text}</p>
      </div>
    </div>
  );
}
