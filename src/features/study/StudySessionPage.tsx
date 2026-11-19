import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useRepositories } from '../../app/repositories';
import { useAsync } from '../../app/useAsync';
import { CircleHelp } from 'lucide-react';
import { AppBar, BackButton, Button, ButtonLink, ErrorMessage, IconButton, Page, Bar, useErrorState } from '../../components/ui';
import { FlashcardCoach, useFlashcardCoach } from '../../components/Coach';
import { DIFFICULTIES, type Difficulty } from '../../domain/study/cloze';
import type { Rating } from '../../domain/study/rating';
import { useI18n } from '../../i18n/I18nProvider';
import type { MessageKey } from '../../i18n';
import { CardState } from '../../domain/scheduling/scheduler';
import { LEARN_AHEAD_MS, type QueueEntry } from '../../data/repositories/reviewRepository';
import { FlashcardMode } from './FlashcardMode';
import { TypeMode } from './TypeMode';
import { BlanksMode } from './BlanksMode';
import { SpeakMode, SpeakStart } from './SpeakMode';
import { IdentifyChoice, IdentifyFlashcard, IdentifyType } from './IdentifyModes';
import { loadCardKinds } from './cardKinds';
import { VerseLangProvider, asLang } from './verseLang';
import { SpokenIntervalsProvider } from './spokenIntervals';
import { CardPositionProvider } from './cardPosition';
import { RatingBanner, BANNER_MS } from './RatingBanner';
import { encouragementDefault, pickEncouragement } from './encouragement';
import { loadNewPerDay } from './newPerDay';
import { orderForToday, promoteDue, shuffle, type SessionEntry } from './queueOrder';
import { DoneForToday } from './DoneForToday';
import { startOfLocalDay } from '../../domain/scheduling/format';

type Mode = 'flashcard' | 'type' | 'blanks' | 'speak';
const MODES = ['flashcard', 'type', 'blanks', 'speak'];

/** A card rated Again/Hard/Good in learning comes due within minutes: show it again later in this session. */
const REQUEUE_WITHIN_MS = LEARN_AHEAD_MS;


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
        // Random-looking, but the same for the whole day in every mode: switching from Flashcard to Type continues the same list where
        // it left off (see orderForToday). Extra practice is shuffled afresh each time.
        queue: extraPractice
          ? shuffle(await reviews.listForExtraPractice(id, kinds))
          : orderForToday(await reviews.buildQueue(id, { newPerDay: await loadNewPerDay(settings), kinds }), { deckId: id, day: startOfLocalDay(Date.now()), now: Date.now() }),
        nextDue: await reviews.nextDue(id, kinds),
        references: deckCards.map((c) => c.reference), // options for "which verse is this?"
        passages: deckCards.map((c) => c.verseText).filter(Boolean), // decoy words for the word bank
        difficulty: (await settings.get<Difficulty>('blank_difficulty')) ?? 'medium',
        encouragement: (await settings.get<boolean>('encouragement')) ?? encouragementDefault(),
        seed: crypto.randomUUID(),
      };
    },
    [id, extraPractice, decks, cards, reviews, settings],
  );
  const exit = <BackButton to={`/collections/${id}`} label={t('study.exit')} />;
  // While the cards load: the top bar with its back arrow at once, and the shapes of the verse area (a reference and a few lines), so the screen is never blank.
  if (loading || !data) {
    return (
      <>
        <AppBar back={exit} />
        <Page busy className="space-y-6 pt-10">
          <Bar className="mx-auto h-7 w-44" />
          <div className="space-y-3"><Bar className="h-5 w-full" /><Bar className="h-5 w-11/12" /><Bar className="h-5 w-3/4" /></div>
        </Page>
      </>
    );
  }
  // The screen's name, for people who cannot see it: "Studying Psalms: Flashcard".
  const heading = t('study.heading', { deck: data.deck?.title ?? '', mode: MODES.includes(mode) ? t(`mode.${mode}` as MessageKey) : '' });
  if (!data.deck) return <><AppBar back={exit} title={t('study.exit')} /><Page><ErrorMessage error={t('error.deckGone')} /></Page></>;
  if (!MODES.includes(mode)) return <><AppBar back={exit} title={t('study.exit')} /><Page><ErrorMessage error={t('error.unknownMode')} /></Page></>;
  if (data.queue.length === 0) {
    return (
      <>
        <AppBar back={exit} title={<span className="sr-only">{heading}</span>} />
        <div className="px-5 py-20"><DoneForToday deckId={id} nextDue={data.nextDue} /></div>
      </>
    );
  }
  return <Session verseLang={asLang(data.deck.bibleLanguage)} heading={heading} deckId={id} mode={mode as Mode} extraPractice={extraPractice} references={data.references} passages={data.passages} initialQueue={data.queue} initialDifficulty={data.difficulty} seed={data.seed} encouragement={data.encouragement} />;
}

function Session({ encouragement, verseLang, heading, deckId, mode, extraPractice, references, passages, initialQueue, initialDifficulty, seed }: {
  encouragement: boolean; verseLang: string | undefined; heading: string; deckId: string; mode: Mode; extraPractice: boolean; references: string[]; passages: string[]; initialQueue: QueueEntry[]; initialDifficulty: Difficulty; seed: string;
}) {
  const { t, formatInterval, formatIntervalSpoken, describeError } = useI18n();
  const { reviews, scheduler, settings } = useRepositories();
  const navigate = useNavigate();
  const coach = useFlashcardCoach();
  const [started, setStarted] = useState(mode !== 'speak');
  const [queue, setQueue] = useState<SessionEntry[]>(initialQueue);
  const [index, setIndex] = useState(0);
  // Which cards were reviewed this session (a card seen twice in a learning step counts once).
  const [reviewedCards, setReviewedCards] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useErrorState();
  // The blanks difficulty is a setting (Settings page), not something you change mid-study.
  const difficulty: Difficulty = DIFFICULTIES.includes(initialDifficulty) ? initialDifficulty : 'medium';
  const busy = useRef(false);
  // The banner after each rating (a message for the rating chosen, never the same one twice in a row).
  const [banner, setBanner] = useState<{ id: number; rating: Rating; text: MessageKey } | null>(null);
  const lastMessage = useRef<MessageKey>(undefined);
  const bannerCount = useRef(0); // each banner is new, even one that follows another that has already gone
  useEffect(() => {
    if (!banner) return;
    const timer = setTimeout(() => setBanner(null), BANNER_MS);
    return () => clearTimeout(timer);
  }, [banner]);

  const entry = queue[index];
  // When the list is finished: when the next review is, for the "You're done for today!" screen.
  const [nextDue, setNextDue] = useState<number | null>(null);
  const finished = !entry;
  useEffect(() => {
    if (!finished || extraPractice) return;
    let live = true;
    void loadCardKinds(settings).then((kinds) => reviews.nextDue(deckId, kinds)).then((t) => { if (live) setNextDue(t); });
    return () => { live = false; };
  }, [finished, extraPractice, reviews, settings, deckId]);
  const intervals = useMemo(() => {
    if (!entry || extraPractice) return undefined;
    const now = Date.now();
    const due = scheduler.preview(entry.schedule, now);
    return { 1: formatInterval(due[1] - now), 2: formatInterval(due[2] - now), 3: formatInterval(due[3] - now), 4: formatInterval(due[4] - now) } as Record<Rating, string>;
  }, [entry, extraPractice, scheduler, formatInterval]);
  const spokenIntervals = useMemo(() => {
    if (!entry || extraPractice) return undefined;
    const now = Date.now();
    const due = scheduler.preview(entry.schedule, now);
    return { 1: formatIntervalSpoken(due[1] - now), 2: formatIntervalSpoken(due[2] - now), 3: formatIntervalSpoken(due[3] - now), 4: formatIntervalSpoken(due[4] - now) } as Record<Rating, string>;
  }, [entry, extraPractice, scheduler, formatIntervalSpoken]);

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

  // Moves to the next card; a card rated earlier whose time is up comes first.
  const goOn = useCallback(() => {
    setQueue((q) => promoteDue(q, index + 1, Date.now()));
    setIndex((i) => i + 1);
  }, [index]);

  const rate = useCallback(async (r: Rating) => {
    if (!entry || busy.current) return; // ignore double taps / key repeat while saving
    busy.current = true;
    try {
      if (!extraPractice) {
        // Every regular rating is saved before we move on: if saving fails the card stays on screen so nothing is lost.
        const schedule = await reviews.record({ cardId: entry.card.id, kind: entry.kind, rating: r, mode: mode === 'speak' ? 'flashcard' : mode }); // spoken reviews count as flashcards (the saved formats know only three modes)
        if (schedule.due - Date.now() < REQUEUE_WITHIN_MS) setQueue((q) => [...q, { card: entry.card, kind: entry.kind, schedule, again: true }]);
      }
      setError(undefined);
      setReviewedCards((seen) => new Set(seen).add(`${entry.card.id}:${entry.kind}`));
      if (encouragement) {
        const text = pickEncouragement(r, lastMessage.current);
        lastMessage.current = text;
        setBanner({ id: ++bannerCount.current, rating: r, text });
      }
      goOn();
    } catch (e) {
      console.error(e);
      setError(t('study.saveFailed'));
    } finally {
      busy.current = false;
    }
  }, [entry, extraPractice, reviews, mode, t, describeError, encouragement, goOn]);
  const skip = goOn;
  const stop = useCallback(() => navigate(`/collections/${deckId}`), [navigate, deckId]);
  const bannerEl = banner && <RatingBanner key={banner.id} id={banner.id} rating={banner.rating} text={t(banner.text)} />;

  const exit = <BackButton to={`/collections/${deckId}`} label={t('study.exit')} />;

  if (!entry) {
    const reviewed = reviewedCards.size;
    return (
      <div className="relative">
        {bannerEl}
        <AppBar back={exit} title={extraPractice ? t('study.extraTitle') : <span className="sr-only">{heading}</span>} />
        {extraPractice ? (
          <div className="space-y-8 px-5 py-20 text-center">
            <div className="space-y-2">
              <h1 className="font-serif text-3xl font-medium tracking-tight">{t('study.complete')}</h1>
              <p className="text-muted">{t('study.summary', { count: reviewed })}</p>
            </div>
            <div className="mx-auto flex max-w-xs flex-col gap-3">
              <Button variant="secondary" onClick={() => { setIndex(0); setReviewedCards(new Set()); setQueue(shuffle(initialQueue)); }}>{t('study.practiceAgain')}</Button>
              <ButtonLink to="/">{t('study.backHome')}</ButtonLink>
            </div>
          </div>
        ) : (
          <div className="px-5 py-20"><DoneForToday deckId={deckId} nextDue={nextDue} reviewed={reviewed} /></div>
        )}
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
      {bannerEl}
      {/* Not drawn, but screen readers can still read how far through the session you are. */}
      <progress className="sr-only" max={queue.length} value={index} aria-label={t('study.progress')} />
      <AppBar back={exit} title={extraPractice ? t('study.extraTitle') : <span className="sr-only">{heading}</span>} actions={mode === 'flashcard' ? <IconButton label={t('coach.flashcard.replay')} onClick={coach.start}><CircleHelp size={22} aria-hidden /></IconButton> : undefined} />
      {coach.open && <FlashcardCoach onClose={coach.close} />}
      <VerseLangProvider value={verseLang}>
      <SpokenIntervalsProvider value={spokenIntervals}>
      <CardPositionProvider value={{ n: index + 1, total: queue.length }}>
      <div className="flex flex-1 flex-col px-5">
        <ul aria-label={t('study.remaining')} className="flex gap-3 pt-3 text-sm font-normal">
          {counter('new', t('study.counterNew'))}
          {counter('learning', t('study.counterLearning'))}
          {counter('review', t('study.counterReview'))}
        </ul>
        {error && <div className="pt-3"><ErrorMessage error={error} /></div>}
        {mode === 'speak' ? (
          started ? <SpeakMode key={index} card={entry.card} kind={entry.kind} intervals={intervals} onRate={rate} onSkip={skip} onStop={stop} /> : <SpeakStart onStart={() => setStarted(true)} />
        ) : entry.kind === 'recall' ? (
          <>
            {mode === 'flashcard' && <FlashcardMode key={index} card={entry.card} intervals={intervals} onRate={rate} onReveal={coach.answerShown} />}
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
      </CardPositionProvider>
      </SpokenIntervalsProvider>
      </VerseLangProvider>
    </div>
  );
}
