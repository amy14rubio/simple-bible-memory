import { useEffect, useMemo, useState } from 'react';
import type { Card } from '../../domain/types';
import { buildWordBank, checkCloze, generateCloze, hashSeed, isCorrectWord, wordsOf, type BankWord, type Difficulty } from '../../domain/study/cloze';
import type { Rating } from '../../domain/study/rating';
import { ActionBar, RatingBar } from './RatingBar';
import { AnswerRegion } from './AnswerRegion';
import { useVerseLang } from './verseLang';
import { useCardPosition } from './cardPosition';
import { useI18n } from '../../i18n/I18nProvider';

/**
 * Fill in the blanks with a word bank. Blanks are filled one at a time, in order: the current blank is highlighted
 * and you tap a word. A right word simply fills in. A wrong tap fills in the CORRECT word in red, and you move on.
 * The bank always shows 8 words and is reshuffled for every blank; earlier words may come back, nothing is used up.
 * The difficulty (how many words are hidden) is set in Settings, not here.
 */
/** How many words before the blank are read aloud (the whole verse could be long). */
const SPOKEN_WORDS = 14;

export function BlanksMode({ card, sessionSeed, difficulty, deckPassages, intervals, onRate }: {
  card: Card; sessionSeed: string; difficulty: Difficulty; deckPassages: string[]; intervals?: Record<Rating, string>; onRate: (r: Rating) => void;
}) {
  const { t } = useI18n();
  // Blanks and bank are generated on the fly: same card + difficulty + session => same exercise, nothing stored.
  const seed = `${sessionSeed}:${card.id}:${difficulty}`;
  const segments = useMemo(() => generateCloze(card.verseText, difficulty, hashSeed(seed)), [card.verseText, difficulty, seed]);
  const blanks = useMemo(() => segments.filter((s): s is Extract<typeof s, { type: 'blank' }> => s.type === 'blank'), [segments]);
  const deckWords = useMemo(() => wordsOf(deckPassages.filter((p) => p !== card.verseText)), [deckPassages, card.verseText]);

  const [picked, setPicked] = useState<string[]>([]); // the word tapped for each finished blank
  const [announcement, setAnnouncement] = useState('');
  const lang = useVerseLang();
  const position = useCardPosition();
  const step = picked.length;
  const done = step >= blanks.length;
  // A fresh, reshuffled bank for each blank.
  const bank = useMemo(() => buildWordBank({ segments, step, extraWords: deckWords, seed }), [segments, step, deckWords, seed]);

  // The verse up to the blank (what has been filled in so far, as it should read), for saying aloud.
  const textBefore = (blankId: number) => {
    let out = '';
    for (const s of segments) {
      if (s.type === 'blank') { if (s.id === blankId) break; out += s.answer; } else out += s.text;
    }
    const words = out.trim().split(/\s+/).filter(Boolean);
    return words.length > SPOKEN_WORDS ? `… ${words.slice(-SPOKEN_WORDS).join(' ')}` : words.join(' ');
  };

  // Said out loud for each blank: whether the last word was right, the verse up to the blank ("… is my, blank"), then the
  // word bank. A screen reader user hears the whole question without hunting for it. (A live region only speaks changes,
  // so it is filled in after the card is drawn; the first one waits a moment so the screen's own name is heard first.)
  const [verdict, setVerdict] = useState('');
  useEffect(() => {
    if (done) { setAnnouncement(verdict); return; }
    const intro = step === 0 && position ? `${t('study.cardPrompt', { n: position.n, total: position.total, prompt: card.reference })}. ` : '';
    const say = () => setAnnouncement(`${intro}${verdict ? `${verdict}. ` : ''}${textBefore(step)} ${t('blanks.blankWord')}. ${t('blanks.bank')}: ${bank.map((w) => w.text).join(', ')}.`.replace(/\s+/g, ' ').trim());
    const id = setTimeout(say, step === 0 ? 700 : 150);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const tap = (word: BankWord) => {
    const answer = blanks[step]!.answer;
    setPicked((p) => [...p, word.text]);
    setVerdict(isCorrectWord(word.text, answer) ? t('blanks.correct', { answer }) : t('blanks.wrong', { answer }));
  };

  const result = done ? checkCloze(segments, picked) : null;

  return (
    <>
      <div className="flex-1 space-y-6 pt-6">
        <p lang={lang} className="text-center font-serif text-2xl font-medium tracking-tight">{card.reference}</p>
        <p lang={lang} className="scripture whitespace-pre-line text-xl leading-[2.4]">
          {segments.map((s, i) => {
            if (s.type === 'text') return <span key={i}>{s.text}</span>;
            const width = { width: `${Math.max(4, s.answer.length)}ch` };
            if (s.id < step) {
              return isCorrectWord(picked[s.id]!, s.answer) ? (
                <span key={i}>{s.answer}</span>
              ) : (
                <span key={i} className="font-semibold text-again underline decoration-2 underline-offset-4">
                  {s.answer}<span className="sr-only">{t('blanks.youChose', { word: picked[s.id] ?? '' })}</span>
                </span>
              );
            }
            return s.id === step ? (
              <span key={i} aria-current="step" style={width} className="mx-0.5 inline-block rounded-md border-2 border-foreground bg-surface align-baseline">
                &nbsp;<span className="sr-only">{t('blanks.current', { n: s.id + 1 })}</span>
              </span>
            ) : (
              <span key={i} style={width} className="mx-0.5 inline-block border-b-2 border-dashed border-muted align-baseline">
                &nbsp;<span className="sr-only">{t('blanks.blank', { n: s.id + 1 })}</span>
              </span>
            );
          })}
        </p>
        <p role="status" className="sr-only">{announcement}</p>
        {result && <AnswerRegion label={t('blanks.done', { right: result.correctCount, total: result.total })} />}
      </div>

      <ActionBar>
        {result ? (
          <RatingBar suggested={result.suggestedRating} intervals={intervals} onRate={onRate} />
        ) : (
          <>
            <div role="group" aria-label={t('blanks.bank')} className="flex max-h-[40dvh] flex-wrap justify-center gap-2 overflow-y-auto">
              {bank.map((w) => (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => tap(w)}
                  className="min-h-11 rounded-lg border border-border bg-background px-3.5 font-serif text-lg hover:border-foreground"
                >
                  {w.text}
                </button>
              ))}
            </div>
          </>
        )}
      </ActionBar>
    </>
  );
}
