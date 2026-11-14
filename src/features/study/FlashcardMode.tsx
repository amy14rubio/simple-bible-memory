import { useState } from 'react';
import type { Card } from '../../domain/types';
import type { Rating } from '../../domain/study/rating';
import { Button } from '../../components/ui';
import { ActionBar, RatingBar } from './RatingBar';
import { Attribution } from '../bible/Attribution';
import { AnswerRegion } from './AnswerRegion';
import { useVerseLang } from './verseLang';
import { CARD_PROMPT_ID, CardPrompt } from './cardPosition';
import { useI18n } from '../../i18n/I18nProvider';
import { useCardWordStudy } from '../wordstudy/useCardWordStudy';

export function FlashcardMode({ card, intervals, onRate, onReveal }: { card: Card; intervals?: Record<Rating, string>; onRate: (r: Rating) => void; onReveal?: () => void }) {
  const { t } = useI18n();
  const word = useCardWordStudy(card);
  const [revealed, setRevealed] = useState(word.reopened); // back from this card's Interlinear page: as it was left
  const lang = useVerseLang();
  return (
    <>
      <CardPrompt prompt={card.reference} />
      <div className="flex flex-1 flex-col items-center justify-center gap-8 py-8 text-center">
        <p lang={lang} className="font-serif text-3xl font-medium tracking-tight">{card.reference}</p>
        {revealed && (
          <div className="space-y-3">
            <AnswerRegion labelOnly label={`${t('study.answer')}: ${card.verseText}`}>
              <p lang={lang} {...word.press} className="scripture select-none whitespace-pre-line text-xl [-webkit-touch-callout:none]">{card.verseText}</p>
            </AnswerRegion>
            {/* outside the group above, which is hidden from screen readers (its name already reads the verse) */}
            <Attribution code={card.translationCode} compact />
          </div>
        )}
      </div>
      {word.drawer}
      <ActionBar>
        {revealed ? <RatingBar intervals={intervals} onRate={onRate} /> : <Button className="w-full" onClick={() => { setRevealed(true); onReveal?.(); }} autoFocus aria-describedby={CARD_PROMPT_ID}>{t('study.showAnswer')}</Button>}
      </ActionBar>
    </>
  );
}
