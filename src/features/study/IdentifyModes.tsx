import { useMemo, useState } from 'react';
import type { Card } from '../../domain/types';
import { checkReference } from '../../domain/study/identify';
import { paintComparison } from '../../domain/study/compare';
import { buildCitationChoices } from '../../domain/study/choices';
import type { Rating } from '../../domain/study/rating';
import { Button, GrowingTextarea } from '../../components/ui';
import { ActionBar, RatingBar } from './RatingBar';
import { useI18n } from '../../i18n/I18nProvider';
import { PaintedText } from './PaintedText';
import { AnswerRegion } from './AnswerRegion';
import { useVerseLang } from './verseLang';
import { CARD_PROMPT_ID, CardPrompt } from './cardPosition';

interface ModeProps {
  card: Card;
  intervals?: Record<Rating, string>;
  onRate: (r: Rating) => void;
}

const Passage = ({ text }: { text: string }) => {
  const lang = useVerseLang();
  return <blockquote lang={lang} className="scripture whitespace-pre-line text-center text-xl">{text}</blockquote>;
};

/** Identify card, Flashcard mode: see the passage, recall the verse, reveal, rate. */
export function IdentifyFlashcard({ card, intervals, onRate }: ModeProps) {
  const { t } = useI18n();
  const [revealed, setRevealed] = useState(false);
  const lang = useVerseLang();
  return (
    <>
      <CardPrompt prompt={t('study.promptName')} />
      <div className="flex flex-1 flex-col items-center justify-center gap-8 py-8 text-center">
        <Passage text={card.verseText} />
        {revealed && (
          <AnswerRegion labelOnly label={`${t('study.answer')}: ${card.reference}`} className="space-y-1">
            <p lang={lang} className="font-serif text-3xl font-medium tracking-tight">{card.reference}</p>
          </AnswerRegion>
        )}
      </div>
      <ActionBar>
        {revealed ? <RatingBar intervals={intervals} onRate={onRate} /> : <Button className="w-full" onClick={() => setRevealed(true)} autoFocus aria-describedby={CARD_PROMPT_ID}>{t('study.showAnswer')}</Button>}
      </ActionBar>
    </>
  );
}

type TypeResult = { typed: string; correct: boolean; suggestedRating: Rating; painted: ReturnType<typeof paintComparison> } | { revealedOnly: true };

/** Identify card, Type mode: see the passage and type which verse it is. One "Show answer" button. */
export function IdentifyType({ card, intervals, onRate }: ModeProps) {
  const { t } = useI18n();
  const [typed, setTyped] = useState('');
  const [result, setResult] = useState<TypeResult>();
  const lang = useVerseLang();

  const check = () => setResult(typed.trim() ? { typed: typed.trim(), ...checkReference(card.reference, typed), painted: paintComparison(card.reference, typed) } : { revealedOnly: true });

  return (
    <>
      <div className="flex flex-1 flex-col gap-6 pt-6">
        <CardPrompt prompt={t('study.promptName')} />
        <Passage text={card.verseText} />
        {!result ? (
          <div className="space-y-2">
            <label htmlFor="typed-reference" className="sr-only">{t('identify.inputLabel')}</label>
            <GrowingTextarea
              id="typed-reference"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); check(); } }}
              placeholder={t('identify.placeholder')}
              autoFocus
              aria-describedby={CARD_PROMPT_ID}
              autoCapitalize="words"
              autoCorrect="off"
              spellCheck={false}
              className="text-center"
            />
          </div>
        ) : (
          <AnswerRegion
            labelOnly
            className="space-y-5 text-center"
            label={
              'correct' in result
                ? result.correct ? `${t('common.correct')}. ${card.reference}` : t('identify.wrongSummary', { typed: result.typed, answer: card.reference })
                : `${t('study.answer')}: ${card.reference}`
            }
          >
            {'correct' in result && !result.correct && (
              <div className="space-y-1">
                <h2 className="text-sm font-medium text-muted">{t('identify.yourAnswer')}</h2>
                <p lang={lang} className="font-serif text-3xl font-medium tracking-tight"><PaintedText segments={result.painted.typed} side="typed" /></p>
              </div>
            )}
            <div className="space-y-1">
              {'correct' in result && !result.correct && <h2 className="text-sm font-medium text-muted">{t('type.correctVerse')}</h2>}
              <p lang={lang} className="font-serif text-3xl font-medium tracking-tight">
                {'correct' in result ? (
                  result.correct ? <span className="text-good">{card.reference}</span> : <PaintedText segments={result.painted.expected} side="expected" />
                ) : card.reference}
              </p>
            </div>
          </AnswerRegion>
        )}
      </div>
      <ActionBar>
        {!result ? (
          <Button className="w-full" onClick={check}>{t('study.showAnswer')}</Button>
        ) : (
          <RatingBar suggested={'correct' in result ? result.suggestedRating : 1} intervals={intervals} onRate={onRate} />
        )}
      </ActionBar>
    </>
  );
}

/**
 * Identify card, Blanks mode: the verse is the blank, and you choose it from several options.
 * Falls back to typing when there are not enough options to make a fair choice.
 */
export function IdentifyChoice({ card, references, sessionSeed, intervals, onRate }: ModeProps & { references: string[]; sessionSeed: string }) {
  const { t } = useI18n();
  const choices = useMemo(
    () => buildCitationChoices({ correct: card.reference, others: references.filter((r) => r !== card.reference), seed: `${sessionSeed}:${card.id}` }),
    [card, references, sessionSeed],
  );
  const [picked, setPicked] = useState<string>();
  const lang = useVerseLang();
  if (!choices) return <IdentifyType card={card} intervals={intervals} onRate={onRate} />;

  const correct = picked === card.reference;
  return (
    <>
      <div className="flex flex-1 flex-col gap-6 pt-6">
        <CardPrompt prompt={t('study.promptChoose')} />
        <Passage text={card.verseText} />
      </div>
      {picked !== undefined && <AnswerRegion label={correct ? `${t('common.correct')}. ${card.reference}` : t('identify.wrongChoice', { answer: card.reference })} />}
      {/* The options are pinned at the bottom (like the word bank), so a long passage scrolls above them and they never sit against the edge. */}
      <ActionBar>
        <div role="group" aria-label={t('identify.choose')} aria-describedby={CARD_PROMPT_ID} className="grid max-h-[45dvh] gap-2 overflow-y-auto">
          {choices.map((c) => {
            const isRight = c === card.reference;
            const state = picked === undefined ? 'idle' : isRight ? 'right' : c === picked ? 'wrong' : 'other';
            return (
              <button
                key={c}
                type="button"
                disabled={picked !== undefined}
                aria-pressed={c === picked}
                onClick={() => setPicked(c)}
                className={`flex min-h-12 items-center justify-between gap-3 rounded-lg border px-4 text-left font-serif text-lg disabled:opacity-100 ${
                  state === 'right' ? 'border-2 border-good text-good' : state === 'wrong' ? 'border-2 border-again text-again' : 'border-border'
                } ${state === 'idle' ? 'hover:bg-surface' : ''} ${state === 'other' ? 'text-muted' : ''}`}
              >
                <span lang={lang}>{c}</span>
                {/* color is the visible signal; screen readers get the words */}
                {state === 'right' && <span className="sr-only">{t('common.correct')}</span>}
                {state === 'wrong' && <span className="sr-only">{t('identify.yourAnswer')}</span>}
              </button>
            );
          })}
        </div>
        {picked !== undefined && <RatingBar suggested={correct ? 3 : 1} intervals={intervals} onRate={onRate} />}
      </ActionBar>
    </>
  );
}
