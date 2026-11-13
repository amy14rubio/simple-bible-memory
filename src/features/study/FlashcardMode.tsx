import { useEffect, useState } from 'react';
import type { Card } from '../../domain/types';
import type { Rating } from '../../domain/study/rating';
import { Button } from '../../components/ui';
import { ActionBar, RatingBar } from './RatingBar';
import { Attribution } from '../bible/Attribution';
import { AnswerRegion } from './AnswerRegion';
import { useVerseLang } from './verseLang';
import { CARD_PROMPT_ID, CardPrompt } from './cardPosition';
import { useI18n } from '../../i18n/I18nProvider';
import { WordStudyDrawer, type WordStudyTarget } from '../wordstudy/WordStudyDrawer';
import { useLongPressWord } from '../wordstudy/useLongPressWord';
import { englishKey, lookableEnglish, originalWords, versesOfReference, wordForEnglish } from '../wordstudy/wordData';

export function FlashcardMode({ card, intervals, onRate }: { card: Card; intervals?: Record<Rating, string>; onRate: (r: Rating) => void }) {
  const { t } = useI18n();
  const [revealed, setRevealed] = useState(false);
  const lang = useVerseLang();
  const [study, setStudy] = useState<WordStudyTarget | null>(null);
  const [lookable, setLookable] = useState<Set<string> | null>(null); // the words that have an original word, underlined for a moment
  useEffect(() => {
    if (!lookable) return;
    const timer = window.setTimeout(() => setLookable(null), 4000);
    return () => window.clearTimeout(timer);
  }, [lookable]);
  // Holding a word of the verse (not the reference). In the Berean text the word is matched to its Greek or Hebrew word; a word with none (\"the\")
  // underlines the words that do have one. In any other text the drawer opens for the verse, with its three ways to read on.
  const press = useLongPressWord((word, place) => {
    const refs = versesOfReference(card.reference);
    const open = (extra?: Partial<WordStudyTarget>) => setStudy({ reference: card.reference, ...extra });
    if (card.translationCode !== 'BSB' || !refs || refs.length !== 1) return open();
    originalWords(refs[0]!).then((words) => {
      const found = wordForEnglish(words, word, place);
      if (found) open({ ref: refs[0]!, word: found });
      else setLookable(lookableEnglish(words));
    }).catch(() => open());
  });
  return (
    <>
      <CardPrompt prompt={card.reference} />
      <div className="flex flex-1 flex-col items-center justify-center gap-8 py-8 text-center">
        <p lang={lang} className="font-serif text-3xl font-medium tracking-tight">{card.reference}</p>
        {revealed && (
          <div className="space-y-3">
            <AnswerRegion labelOnly label={`${t('study.answer')}: ${card.verseText}`}>
              <p lang={lang} {...press} className="scripture select-none whitespace-pre-line text-xl [-webkit-touch-callout:none]">{lookable ? underlined(card.verseText, lookable) : card.verseText}</p>
            </AnswerRegion>
            {/* outside the group above, which is hidden from screen readers (its name already reads the verse) */}
            <Attribution code={card.translationCode} compact />
          </div>
        )}
      </div>
      <WordStudyDrawer target={study} onClose={() => setStudy(null)} />
      <ActionBar>
        {revealed ? <RatingBar intervals={intervals} onRate={onRate} /> : <Button className="w-full" onClick={() => setRevealed(true)} autoFocus aria-describedby={CARD_PROMPT_ID}>{t('study.showAnswer')}</Button>}
      </ActionBar>
    </>
  );
}

/** The verse with the words that have an original word underlined (a soft dotted line). */
function underlined(text: string, lookable: Set<string>) {
  return text.split(/(\p{L}[\p{L}\p{M}'’-]*)/u).map((piece, i) => (i % 2 === 1 && lookable.has(englishKey(piece))
    ? <span key={i} className="underline decoration-dotted decoration-2 underline-offset-4">{piece}</span>
    : piece));
}
