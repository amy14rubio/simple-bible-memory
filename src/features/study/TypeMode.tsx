import { useState } from 'react';
import type { Card } from '../../domain/types';
import { compareVerse, differences, paintComparison, type Comparison, type Segment } from '../../domain/study/compare';
import type { Rating } from '../../domain/study/rating';
import { Button, GrowingTextarea } from '../../components/ui';
import { ActionBar, RatingBar } from './RatingBar';
import { Attribution } from '../bible/Attribution';
import { useI18n } from '../../i18n/I18nProvider';
import { PaintedText } from './PaintedText';
import { AnswerRegion } from './AnswerRegion';
import { useVerseLang } from './verseLang';
import { CARD_PROMPT_ID, CardPrompt } from './cardPosition';

type Result = { comparison: Comparison; painted: ReturnType<typeof paintComparison> } | { revealedOnly: true };

export function TypeMode({ card, intervals, onRate }: { card: Card; intervals?: Record<Rating, string>; onRate: (r: Rating) => void }) {
  const { t } = useI18n();
  const [typed, setTyped] = useState('');
  const [result, setResult] = useState<Result>();
  const lang = useVerseLang();

  // One button for everything: if you typed something it is checked against the verse, if not it just reveals it.
  const check = () => setResult(typed.trim() ? { comparison: compareVerse(card.verseText, typed), painted: paintComparison(card.verseText, typed) } : { revealedOnly: true });

  return (
    <>
      <div className="flex flex-1 flex-col gap-5 pt-6">
        <CardPrompt prompt={card.reference} />
        <p lang={lang} className="text-center font-serif text-2xl font-medium tracking-tight">{card.reference}</p>
        {!result ? (
          <>
            <label className="sr-only" htmlFor="typed">{t('type.label')}</label>
            <GrowingTextarea
              id="typed"
              className="scripture"
              value={typed}
              placeholder={t('type.placeholder')}
              autoFocus
              aria-describedby={CARD_PROMPT_ID}
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) check(); }}
            />
          </>
        ) : 'comparison' in result && result.comparison.exact ? (
          // Everything right: just the verse, in green.
          <AnswerRegion labelOnly label={`${t('type.exact')} ${card.verseText}`}>
            <p lang={lang} className="scripture whitespace-pre-line text-lg"><PaintedText segments={result.painted.expected} side="expected" /></p>
          </AnswerRegion>
        ) : (
          // One spoken line, so it is heard straight away with no swiping: the summary, what you typed, and the verse.
          <AnswerRegion
            labelOnly
            className="space-y-6"
            label={
              'comparison' in result
                ? `${t('type.summary', { count: differences(result.comparison.ops).length })} ${t('type.yourAnswer')}: ${result.painted.typed.filter((s) => s.state !== 'gap').map((s) => s.text).join('').trim()}. ${t('type.correctVerse')}: ${card.verseText}`
                : `${t('type.correctVerse')}: ${card.verseText}`
            }
          >
            {'comparison' in result && <Words label={t('type.yourAnswer')} segments={result.painted.typed} side="typed" />}
            {'comparison' in result ? (
              <Words label={t('type.correctVerse')} segments={result.painted.expected} side="expected" />
            ) : (
              <div className="space-y-1">
                <h2 className="text-sm font-medium text-muted">{t('type.correctVerse')}</h2>
                <p lang={lang} className="scripture whitespace-pre-line text-lg">{card.verseText}</p>
              </div>
            )}
          </AnswerRegion>
        )}
        {/* after the result, outside the groups above (which are hidden from screen readers: their name already reads the verse) */}
        {result && <Attribution code={card.translationCode} compact />}
      </div>
      <ActionBar>
        {!result ? (
          <Button className="w-full" onClick={check}>{t('study.showAnswer')}</Button>
        ) : (
          <RatingBar suggested={'comparison' in result ? result.comparison.suggestedRating : 1} intervals={intervals} onRate={onRate} />
        )}
      </ActionBar>
    </>
  );
}

function Words({ label, segments, side }: { label: string; segments: Segment[]; side: 'typed' | 'expected' }) {
  const lang = useVerseLang();
  return (
    <div className="space-y-1">
      <h2 className="text-sm font-medium text-muted">{label}</h2>
      <p lang={lang} className="scripture whitespace-pre-line text-lg"><PaintedText segments={segments} side={side} /></p>
    </div>
  );
}
