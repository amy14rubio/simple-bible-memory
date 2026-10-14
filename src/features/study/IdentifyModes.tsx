import { useMemo, useState } from 'react';
import { Check, X } from 'lucide-react';
import type { Card } from '../../domain/types';
import { checkReference } from '../../domain/study/identify';
import { buildCitationChoices } from '../../domain/study/choices';
import type { Rating } from '../../domain/study/rating';
import { Button } from '../../components/ui';
import { ActionBar, RatingBar } from './RatingBar';
import { useI18n } from '../../i18n/I18nProvider';

interface ModeProps {
  card: Card;
  intervals?: Record<Rating, string>;
  onRate: (r: Rating) => void;
}

const Passage = ({ text }: { text: string }) => (
  <blockquote className="scripture whitespace-pre-line text-center text-xl">{text}</blockquote>
);

/** Identify card, Flashcard mode: see the passage, recall the verse, reveal, rate. */
export function IdentifyFlashcard({ card, intervals, onRate }: ModeProps) {
  const { t } = useI18n();
  const [revealed, setRevealed] = useState(false);
  return (
    <>
      <div className="flex flex-1 flex-col items-center justify-center gap-8 py-8 text-center">
        <p className="text-sm text-muted">{t('identify.which')}</p>
        <Passage text={card.verseText} />
        {revealed && (
          <div className="space-y-1">
            <p className="font-serif text-3xl font-medium tracking-tight">{card.reference}</p>
            {card.note && <p className="text-sm text-muted">{card.note}</p>}
          </div>
        )}
      </div>
      <ActionBar>
        {revealed ? <RatingBar intervals={intervals} onRate={onRate} /> : <Button className="w-full" onClick={() => setRevealed(true)} autoFocus>{t('study.showAnswer')}</Button>}
      </ActionBar>
    </>
  );
}

type TypeResult = { typed: string; correct: boolean; suggestedRating: Rating } | { revealedOnly: true };

/** Identify card, Type mode: see the passage and type which verse it is. One "Show answer" button. */
export function IdentifyType({ card, intervals, onRate }: ModeProps) {
  const { t } = useI18n();
  const [typed, setTyped] = useState('');
  const [result, setResult] = useState<TypeResult>();

  const check = () => setResult(typed.trim() ? { typed: typed.trim(), ...checkReference(card.reference, typed) } : { revealedOnly: true });

  return (
    <>
      <div className="flex flex-1 flex-col gap-6 pt-6">
        <p className="text-center text-sm text-muted">{t('identify.which')}</p>
        <Passage text={card.verseText} />
        {!result ? (
          <div className="space-y-2">
            <label htmlFor="typed-reference" className="sr-only">{t('identify.inputLabel')}</label>
            <input
              id="typed-reference"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && check()}
              placeholder={t('identify.placeholder')}
              autoFocus
              autoCapitalize="words"
              autoCorrect="off"
              spellCheck={false}
              className="w-full rounded-lg border border-border bg-surface px-4 py-3.5 text-center text-lg placeholder:text-muted"
            />
          </div>
        ) : (
          <section aria-label={t('identify.answer')} className="space-y-2 text-center">
            {'correct' in result && (
              <p className={`flex items-center justify-center gap-2 font-medium ${result.correct ? '' : 'text-accent'}`}>
                {result.correct ? <Check size={18} aria-hidden /> : <X size={18} aria-hidden />}
                {result.correct ? t('common.correct') : t('identify.wrong', { typed: result.typed })}
              </p>
            )}
            <p className="font-serif text-3xl font-medium tracking-tight">{card.reference}</p>
            {card.note && <p className="text-sm text-muted">{card.note}</p>}
          </section>
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
  if (!choices) return <IdentifyType card={card} intervals={intervals} onRate={onRate} />;

  const correct = picked === card.reference;
  return (
    <>
      <div className="flex flex-1 flex-col gap-6 pt-6">
        <p className="text-center text-sm text-muted">{t('identify.which')}</p>
        <Passage text={card.verseText} />
        <div role="group" aria-label={t('identify.choose')} className="grid gap-2.5">
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
                className={`flex min-h-14 items-center justify-between gap-3 rounded-lg border px-4 text-left font-serif text-lg disabled:opacity-100 ${
                  state === 'right' ? 'border-2 border-foreground bg-surface font-semibold' : state === 'wrong' ? 'border-2 border-accent text-accent' : 'border-border'
                } ${state === 'idle' ? 'hover:bg-surface' : ''} ${state === 'other' ? 'text-muted' : ''}`}
              >
                <span>{c}</span>
                {state === 'right' && <span className="flex items-center gap-1 font-sans text-sm"><Check size={16} aria-hidden />{t('common.correct')}</span>}
                {state === 'wrong' && <span className="flex items-center gap-1 font-sans text-sm"><X size={16} aria-hidden />{t('identify.yourAnswer')}</span>}
              </button>
            );
          })}
        </div>
        {picked !== undefined && card.note && <p className="text-center text-sm text-muted">{card.note}</p>}
      </div>
      {picked !== undefined && (
        <ActionBar>
          <RatingBar suggested={correct ? 3 : 1} intervals={intervals} onRate={onRate} />
        </ActionBar>
      )}
    </>
  );
}
