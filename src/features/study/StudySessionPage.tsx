import { useCallback, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useRepositories } from '../../app/repositories';
import { useAsync } from '../../app/useAsync';
import { AppBar, BackButton, Button, ButtonLink, EmptyState, ErrorMessage, Page } from '../../components/ui';
import { DIFFICULTIES, type Difficulty } from '../../domain/study/cloze';
import type { Rating } from '../../domain/study/rating';
import { useI18n } from '../../i18n/I18nProvider';
import type { MessageKey } from '../../i18n';
import { CardState } from '../../domain/scheduling/scheduler';
import type { QueueEntry } from '../../data/repositories/reviewRepository';
import { FlashcardMode } from './FlashcardMode';
import { TypeMode } from './TypeMode';
import { BlanksMode } from './BlanksMode';
import { IdentifyChoice, IdentifyFlashcard, IdentifyType } from './IdentifyModes';
import { loadCardKinds } from './cardKinds';
import { VerseLangProvider, asLang } from './verseLang';
import { loadNewPerDay } from './newPerDay';

type Mode = 'flashcard' | 'type' | 'blanks';

/** A card rated Again/Hard in learning comes due within minutes: show it again later in this session. */
const REQUEUE_WITHIN_MS = 20 * 60_000;

const shuffle = <T,>(items: T[]): T[] => {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const k = Math.floor(Math.random() * (i + 1));
    [a[i], a[k]] = [a[k]!, a[i]!];
  }
  return a;
};

export function StudySessionPage() {
  const { t } = useI18n();
  const { id = '', mode = '' } = useParams();
  const extraPractice = useSearchParams()[0].get('practice') === '1';
  const { decks, cards, reviews, settings } = useRepositories();
  const { data, loading } = useAsync(
    async () => {
      const kinds = await loadCardKinds(settings);
      const deckCards = await cards.listByDeck(id);
      return {
        deck: await decks.get(id),
        queue: extraPractice
          ? shuffle(await reviews.listForExtraPractice(id, kinds))
          : await reviews.buildQueue(id, { newPerDay: await loadNewPerDay(settings), kinds }),
        references: deckCards.map((c) => c.reference), // options for "which verse is this?"
        passages: deckCards.map((c) => c.verseText), // decoy words for the word bank
        difficulty: (await settings.get<Difficulty>('blank_difficulty')) ?? 'medium',
        seed: crypto.randomUUID(),
      };
    },
    [id, extraPractice, decks, cards, reviews, settings],
  );
  const exit = <BackButton to={`/decks/${id}`} label={t('study.exit')} />;
  if (loading || !data) return null;
  // The screen's name, for people who cannot see it: "Studying Psalms: Flashcard".
  const heading = t('study.heading', { deck: data.deck?.title ?? '', mode: ['flashcard', 'type', 'blanks'].includes(mode) ? t(`mode.${mode}` as MessageKey) : '' });
  if (!data.deck) return <><AppBar back={exit} title={t('study.exit')} /><Page><ErrorMessage error={t('error.deckGone')} /></Page></>;
  if (!['flashcard', 'type', 'blanks'].includes(mode)) return <><AppBar back={exit} title={t('study.exit')} /><Page><ErrorMessage error={t('error.unknownMode')} /></Page></>;
  if (data.queue.length === 0) {
    return (
      <>
        <AppBar back={exit} title={<span className="sr-only">{heading}</span>} />
        <EmptyState title={t('study.nothingDue')} action={<ButtonLink to={`/decks/${id}`} variant="secondary">{t('common.backToDeck')}</ButtonLink>}>
          {t('study.caughtUp')}
        </EmptyState>
      </>
    );
  }
  return <Session verseLang={asLang(data.deck.bibleLanguage)} heading={heading} deckId={id} mode={mode as Mode} extraPractice={extraPractice} references={data.references} passages={data.passages} initialQueue={data.queue} initialDifficulty={data.difficulty} seed={data.seed} />;
}

function Session({ verseLang, heading, deckId, mode, extraPractice, references, passages, initialQueue, initialDifficulty, seed }: {
  verseLang: string | undefined; heading: string; deckId: string; mode: Mode; extraPractice: boolean; references: string[]; passages: string[]; initialQueue: QueueEntry[]; initialDifficulty: Difficulty; seed: string;
}) {
  const { t, formatInterval, describeError } = useI18n();
  const { reviews, scheduler } = useRepositories();
  const [queue, setQueue] = useState(initialQueue);
  const [index, setIndex] = useState(0);
  // Which cards were reviewed this session (a card seen twice in a learning step counts once).
  const [reviewedCards, setReviewedCards] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string>();
  // The blanks difficulty is a setting (Settings page), not something you change mid-study.
  const difficulty: Difficulty = DIFFICULTIES.includes(initialDifficulty) ? initialDifficulty : 'medium';
  const busy = useRef(false);

  const entry = queue[index];
  const intervals = useMemo(() => {
    if (!entry || extraPractice) return undefined;
    const now = Date.now();
    const due = scheduler.preview(entry.schedule, now);
    return { 1: formatInterval(due[1] - now), 2: formatInterval(due[2] - now), 3: formatInterval(due[3] - now), 4: formatInterval(due[4] - now) } as Record<Rating, string>;
  }, [entry, extraPractice, scheduler, formatInterval]);

  // Anki-style counters: new / learning / to review, for the cards still ahead (the current one is underlined).
  const remaining = useMemo(() => {
    const c = { new: 0, learning: 0, review: 0 };
    for (const e of queue.slice(index)) {
      if (e.schedule === null) c.new++;
      else if (e.schedule.state === CardState.Review) c.review++;
      else c.learning++;
    }
    return c;
  }, [queue, index]);

  const rate = useCallback(async (r: Rating) => {
    if (!entry || busy.current) return; // ignore double taps / key repeat while saving
    busy.current = true;
    setError(undefined);
    try {
      if (!extraPractice) {
        // Every regular rating is saved before we move on: if saving fails the card stays on screen so nothing is lost.
        const schedule = await reviews.record({ cardId: entry.card.id, kind: entry.kind, rating: r, mode });
        if (schedule.due - Date.now() < REQUEUE_WITHIN_MS) setQueue((q) => [...q, { card: entry.card, kind: entry.kind, schedule }]);
      }
      setReviewedCards((seen) => new Set(seen).add(`${entry.card.id}:${entry.kind}`));
      setIndex((i) => i + 1);
    } catch (e) {
      setError(t('study.saveFailed', { message: describeError(e) }));
    } finally {
      busy.current = false;
    }
  }, [entry, extraPractice, reviews, mode, t, describeError]);

  const exit = <BackButton to={`/decks/${deckId}`} label={t('study.exit')} />;

  if (!entry) {
    const reviewed = reviewedCards.size;
    return (
      <div className="relative">
        <AppBar back={exit} title={extraPractice ? t('study.extraTitle') : <span className="sr-only">{heading}</span>} />
        <div className="space-y-8 px-5 py-20 text-center">
          <div className="space-y-2">
            <h1 className="font-serif text-3xl font-medium tracking-tight">{t('study.complete')}</h1>
            <p className="text-muted">{t('study.summary', { count: reviewed })}</p>
          </div>
          <div className="mx-auto flex max-w-xs flex-col gap-3">
            {extraPractice && <Button variant="secondary" onClick={() => { setIndex(0); setReviewedCards(new Set()); setQueue(shuffle(initialQueue)); }}>{t('study.practiceAgain')}</Button>}
            <ButtonLink to={`/decks/${deckId}`}>{t('common.backToDeck')}</ButtonLink>
          </div>
        </div>
      </div>
    );
  }

  // Same text colors as the rating labels: new = blue, learning = red, to review = green. The colors alone tell them apart.
  const counterText = { new: 'text-easy', learning: 'text-again', review: 'text-good' } as const;
  const counter = (kind: 'new' | 'learning' | 'review', label: string) => (
    <li className={counterText[kind]}>
      <span className="sr-only">{label}: </span>{remaining[kind]}
    </li>
  );

  return (
    <div className="relative flex min-h-dvh flex-col">
      {/* Not drawn, but screen readers can still read how far through the session you are. */}
      <progress className="sr-only" max={queue.length} value={index} aria-label={t('study.progress')} />
      <AppBar back={exit} title={extraPractice ? t('study.extraTitle') : <span className="sr-only">{heading}</span>} />
      <VerseLangProvider value={verseLang}>
      <div className="flex flex-1 flex-col px-5">
        <ul aria-label={t('study.remaining')} className="flex gap-3 pt-3 text-sm font-normal">
          {counter('new', t('study.counterNew'))}
          {counter('learning', t('study.counterLearning'))}
          {counter('review', t('study.counterReview'))}
        </ul>
        {error && <div className="pt-3"><ErrorMessage error={error} /></div>}
        {entry.kind === 'recall' ? (
          <>
            {mode === 'flashcard' && <FlashcardMode key={index} card={entry.card} intervals={intervals} onRate={rate} />}
            {mode === 'type' && <TypeMode key={index} card={entry.card} intervals={intervals} onRate={rate} />}
            {mode === 'blanks' && <BlanksMode key={index} card={entry.card} intervals={intervals} sessionSeed={seed} difficulty={difficulty} deckPassages={passages} onRate={rate} />}
          </>
        ) : (
          <>
            {mode === 'flashcard' && <IdentifyFlashcard key={index} card={entry.card} intervals={intervals} onRate={rate} />}
            {mode === 'type' && <IdentifyType key={index} card={entry.card} intervals={intervals} onRate={rate} />}
            {mode === 'blanks' && <IdentifyChoice key={index} card={entry.card} references={references} sessionSeed={seed} intervals={intervals} onRate={rate} />}
          </>
        )}
      </div>
      </VerseLangProvider>
    </div>
  );
}
