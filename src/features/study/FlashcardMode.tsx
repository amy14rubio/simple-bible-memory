import { useState } from 'react';
import type { Card } from '../../domain/types';
import type { Rating } from '../../domain/study/rating';
import { Button } from '../../components/ui';
import { ActionBar, RatingBar } from './RatingBar';
import { AnswerRegion } from './AnswerRegion';
import { useVerseLang } from './verseLang';
import { CARD_PROMPT_ID, CardPrompt } from './cardPosition';
import { useI18n } from '../../i18n/I18nProvider';

export function FlashcardMode({ card, intervals, onRate }: { card: Card; intervals?: Record<Rating, string>; onRate: (r: Rating) => void }) {
  const { t } = useI18n();
  const [revealed, setRevealed] = useState(false);
  const lang = useVerseLang();
  return (
    <>
      <CardPrompt prompt={card.reference} />
      <div className="flex flex-1 flex-col items-center justify-center gap-8 py-8 text-center">
        <p lang={lang} className="font-serif text-3xl font-medium tracking-tight">{card.reference}</p>
        {revealed && (
          <AnswerRegion labelOnly label={`${t('study.answer')}: ${card.verseText}`} className="space-y-3">
            <p lang={lang} className="scripture whitespace-pre-line text-xl">{card.verseText}</p>
          </AnswerRegion>
        )}
      </div>
      <ActionBar>
        {revealed ? <RatingBar intervals={intervals} onRate={onRate} /> : <Button className="w-full" onClick={() => setRevealed(true)} autoFocus aria-describedby={CARD_PROMPT_ID}>{t('study.showAnswer')}</Button>}
      </ActionBar>
    </>
  );
}
