import { useEffect, useMemo, useRef, useState } from 'react';
import { Mic, Volume2 } from 'lucide-react';
import type { Card } from '../../domain/types';
import type { Rating } from '../../domain/study/rating';
import { SpeakRunner, type Phase, type SpeakScript } from '../../domain/speak/runner';
import type { SpeakLanguage } from '../../domain/speak/reference';
import { Button, ErrorMessage } from '../../components/ui';
import { InfoLabel } from '../../components/InfoDrawer';
import { getVoice, keepScreenOn, liveWindowMs, speechCode } from '../../platform/voice';
import { useI18n } from '../../i18n/I18nProvider';
import type { MessageKey } from '../../i18n';
import { ActionBar, RatingBar } from './RatingBar';
import { useVerseLang } from './verseLang';
import { CardPrompt } from './cardPosition';
import { keepInView } from './keepInView';
import { Attribution } from '../bible/Attribution';

const COMMANDS = ['done', 'rate', 'repeat', 'skip', 'stop', 'speed'] as const;
const DEFAULT_RATE = 0.95;
const asSpeakLang = (code: string | undefined, fallback: SpeakLanguage): SpeakLanguage => (code?.toLowerCase().startsWith('es') ? 'es' : code?.toLowerCase().startsWith('en') ? 'en' : fallback);

/** Before the first card: what Speak does, the microphone, and a reminder to set it up before driving. */
export function SpeakStart({ onStart }: { onStart: () => void }) {
  const { t } = useI18n();
  const [problem, setProblem] = useState<string>();
  const [busy, setBusy] = useState(false);
  const start = async () => {
    setBusy(true);
    setProblem(undefined);
    try {
      const voice = getVoice();
      const support = await voice.support();
      if (!support.speak) { setProblem(t('speak.unsupported')); return; }
      // Without the microphone the app can still read aloud and the buttons still work, so go on, but say so.
      const allowed = support.listen && (await voice.requestMicrophone());
      if (!allowed) setProblem(t('speak.micDenied'));
      onStart();
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 py-2 text-center">
      {/* The "i" says why Speak never grades what you say. */}
      <h1 className="flex justify-center font-serif text-3xl font-medium tracking-tight"><InfoLabel title={t('speak.title')} info={t('speak.info')} /></h1>
      {/* What to say, in the words the app listens for. */}
      <dl className="w-full max-w-sm divide-y divide-border rounded-lg border border-border text-left">
        {COMMANDS.map((c) => (
          <div key={c} className="flex flex-col px-4 py-2">
            <dt className="font-medium">{t(`speak.word.${c}` as MessageKey)}</dt>
            <dd className="text-sm text-muted">{t(`speak.cmd.${c}` as MessageKey)}</dd>
          </div>
        ))}
      </dl>
      {problem && <ErrorMessage error={problem} />}
      <Button className="w-full max-w-sm" onClick={start} disabled={busy} autoFocus>{t('speak.start')}</Button>
    </div>
  );
}

/**
 * One card, hands-free. Looks like the flashcard (big reference, the verse appears when it is read) with a large status line
 * underneath, so a glance from a mount says what the app is doing. The buttons stay, as a fallback.
 */
export function SpeakMode({ card, kind, intervals, onRate, onSkip, onStop }: {
  card: Card; kind: 'recall' | 'identify'; intervals?: Record<Rating, string>;
  onRate: (r: Rating) => void; onSkip: () => void; onStop: () => void;
}) {
  const { t, language } = useI18n();
  const verseLang = asSpeakLang(useVerseLang(), language);
  const [phase, setPhase] = useState<Phase>('prompt');
  const [failed, setFailed] = useState(false);
  const [heard, setHeard] = useState('');
  const runner = useRef<SpeakRunner | null>(null);
  const handlers = useRef({ onRate, onSkip, onStop });
  handlers.current = { onRate, onSkip, onStop };
  const tRef = useRef(t);
  tRef.current = t;

  const script = useMemo<SpeakScript>(() => ({
    askRating: () => tRef.current('speak.say.askRating'),
    rated: (label) => tRef.current('speak.say.rated', { label }),
    slower: () => tRef.current('speak.say.slower'),
    faster: () => tRef.current('speak.say.faster'),
  }), []);

  useEffect(() => {
    let live = true;
    let release: (() => void) | undefined;
    void keepScreenOn().then((r) => { if (live) release = r; else r(); });
    const r = new SpeakRunner({
      voice: getVoice(), script, uiLang: language, verseLang, code: speechCode, liveWindowMs: liveWindowMs(),
      labels: { 1: t('rating.again'), 2: t('rating.hard'), 3: t('rating.good'), 4: t('rating.easy') },
      rate: {
        get: () => { try { return Number(localStorage.getItem('speak_rate')) || DEFAULT_RATE; } catch { return DEFAULT_RATE; } },
        set: (v) => { try { localStorage.setItem('speak_rate', String(v)); } catch { /* the speed is just not remembered */ } },
      },
      onPhase: (p) => { if (live) { setPhase(p); if (p === 'reading' || p === 'asking') setHeard(''); } },
      onHeard: (text) => { if (live) setHeard(text); },
    });
    runner.current = r;
    r.run({ reference: card.reference, verseText: card.verseText, kind }).then((result) => {
      if (!live) return;
      if (result.kind === 'rated') handlers.current.onRate(result.rating);
      else if (result.kind === 'skip') handlers.current.onSkip();
      else handlers.current.onStop();
    }, () => { if (live) setFailed(true); });
    return () => { live = false; r.cancel(); release?.(); };
    // One run per card; the component is keyed by the card.
  }, []);

  const revealed = phase === 'reading' || phase === 'asking' || phase === 'rating' || phase === 'paused' || phase === 'confirming';
  const showRatings = phase === 'asking' || phase === 'rating' || phase === 'paused' || phase === 'confirming';
  const recall = kind === 'recall';
  const lang = useVerseLang();
  const listening = phase === 'listening' || phase === 'rating' || phase === 'paused';
  const statusKey = (`speak.status.${phase}`) as MessageKey;
  const heading = recall ? card.reference : card.verseText;
  const revealedEl = useRef<HTMLParagraphElement>(null);
  // When the answer appears below a long passage (or a long verse appears), bring it into view.
  useEffect(() => {
    if (!revealed) return;
    const frame = requestAnimationFrame(() => keepInView(revealedEl.current));
    return () => cancelAnimationFrame(frame);
  }, [revealed]);

  return (
    <>
      <CardPrompt prompt={recall ? card.reference : card.verseText} />
      <div className="flex flex-1 flex-col items-center justify-center gap-8 py-8 text-center">
        {recall ? <p lang={lang} className="font-serif text-4xl font-medium tracking-tight">{heading}</p>
          : <p lang={lang} className="scripture whitespace-pre-line text-xl">{heading}</p>}
        {revealed && (
          recall
            ? <><p ref={revealedEl} lang={lang} className="scripture whitespace-pre-line text-xl">{card.verseText}</p><Attribution code={card.translationCode} compact /></>
            : <p ref={revealedEl} lang={lang} className="font-serif text-4xl font-medium tracking-tight">{card.reference}</p>
        )}
      </div>
      <ActionBar>
        {/* What the app is doing, pinned here with the buttons so a long verse above can never push it off the screen. */}
        <div className="flex items-center justify-center gap-4">
          <span aria-hidden className={`flex size-14 shrink-0 items-center justify-center rounded-full border border-border ${listening ? 'bg-surface motion-safe:animate-pulse' : ''}`}>
            {listening ? <Mic size={26} /> : <Volume2 size={26} className="text-muted" />}
          </span>
          <div className="min-w-0 max-w-[16rem]">
            {/* One live region, so a screen reader announces "Listening… Say done when finished" together. */}
            <div role="status" aria-live="polite" className="flex flex-col gap-0.5">
              <p className="text-lg font-medium leading-snug">{failed ? t('speak.failed') : t(statusKey)}</p>
              {phase === 'listening' && !failed && <p className="text-base leading-snug text-muted">{t('speak.status.listeningHint')}</p>}
            </div>
            {heard && <p className="truncate text-sm text-muted">{t('speak.heard', { text: heard })}</p>}
          </div>
        </div>
        {/* Hidden (but keeping its space, so nothing jumps) until the verse has been read and the question asked. */}
        <div className={showRatings ? '' : 'invisible'}>
          <RatingBar intervals={intervals} onRate={(r) => runner.current?.tap({ kind: 'rate', rating: r })} />
        </div>
        <Button variant="secondary" className="w-full" onClick={() => runner.current?.tap({ kind: 'skip' })}>{t('speak.skip')}</Button>
      </ActionBar>
    </>
  );
}
