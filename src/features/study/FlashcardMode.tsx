import { useState } from 'react';
import type { Card } from '../../domain/types';
import type { Rating } from '../../domain/study/rating';
import { Button } from '../../components/ui';
import { ActionBar, RatingBar } from './RatingBar';

export function FlashcardMode({ card, intervals, onRate }: { card: Card; intervals?: Record<Rating, string>; onRate: (r: Rating) => void }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <>
      <div className="flex flex-1 flex-col items-center justify-center gap-8 py-8 text-center">
        <p className="font-serif text-3xl font-medium tracking-tight">{card.reference}</p>
        {revealed && (
          <div className="space-y-3">
            <p className="scripture whitespace-pre-line text-xl">{card.verseText}</p>
            {card.note && <p className="text-sm text-muted">{card.note}</p>}
          </div>
        )}
      </div>
      <ActionBar>
        {revealed ? <RatingBar intervals={intervals} onRate={onRate} /> : <Button className="w-full" onClick={() => setRevealed(true)} autoFocus>Show answer</Button>}
      </ActionBar>
    </>
  );
}
