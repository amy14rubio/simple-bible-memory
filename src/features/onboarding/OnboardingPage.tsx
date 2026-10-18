import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui';
import { useRepositories } from '../../app/repositories';
import { useI18n } from '../../i18n/I18nProvider';
import { ONBOARDING_CARDS, ONBOARDING_DONE } from './onboarding';

const SWIPE_PX = 50;

/**
 * The welcome tour: a few cards, one at a time. Next, Back, Skip, or swipe; the arrow keys work too. It is one screen
 * with real headings, so a screen reader hears each card as its heading and "Step 2 of 4". Skipping counts as seeing it.
 * It is shown once to someone new, and can be opened again from Settings.
 */
export function OnboardingPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { settings } = useRepositories();
  const [step, setStep] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const swipeFrom = useRef<number | null>(null);
  const moved = useRef(false); // not the first card on screen: only then does a step change take focus

  const last = step === ONBOARDING_CARDS.length - 1;
  const card = ONBOARDING_CARDS[step]!;
  const Icon = card.icon;

  const finish = () => {
    void settings.set(ONBOARDING_DONE, true);
    navigate('/', { replace: true });
  };
  const go = (to: number) => setStep(Math.min(Math.max(to, 0), ONBOARDING_CARDS.length - 1));

  // After a step change the heading takes focus, so a screen reader reads the new card instead of staying on a button.
  useEffect(() => {
    if (moved.current) heading.current?.focus({ preventScroll: true });
    moved.current = true;
  }, [step]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'ArrowRight') go(step + 1);
      if (e.key === 'ArrowLeft') go(step - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step]);

  const down = (e: PointerEvent) => { swipeFrom.current = e.clientX; };
  const up = (e: PointerEvent) => {
    if (swipeFrom.current === null) return;
    const dx = e.clientX - swipeFrom.current;
    swipeFrom.current = null;
    if (dx <= -SWIPE_PX) go(step + 1);
    if (dx >= SWIPE_PX) go(step - 1);
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col px-8 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3">
      <div className="flex justify-end">
        <Button variant="ghost" onClick={finish} className="text-muted">{t('onboarding.skip')}</Button>
      </div>

      <section
        aria-label={t('onboarding.title')}
        onPointerDown={down}
        onPointerUp={up}
        onPointerCancel={() => { swipeFrom.current = null; }}
        className="flex flex-1 touch-pan-y select-none flex-col items-center justify-center gap-7 text-center"
      >
        <div key={card.key} className="onboarding-card flex flex-col items-center gap-7">
          <div aria-hidden className="grid size-36 place-items-center rounded-full bg-panel text-accent">
            <Icon size={60} strokeWidth={1.4} />
          </div>
          <div className="mx-auto max-w-[17rem] space-y-3">
            <h1 ref={heading} tabIndex={-1} aria-describedby="onboarding-step" className="font-serif text-3xl font-medium leading-tight tracking-tight">{t(card.title)}</h1>
            <p className="text-lg leading-snug text-muted">{t(card.body)}</p>
          </div>
        </div>
      </section>

      <div className="space-y-5">
        <p id="onboarding-step" className="sr-only">{t('onboarding.step', { n: step + 1, total: ONBOARDING_CARDS.length })}</p>
        <ol aria-hidden className="flex justify-center gap-2.5">
          {ONBOARDING_CARDS.map((c, i) => (
            <li key={c.key} className={`h-2 rounded-full transition-all ${i === step ? 'w-6 bg-accent' : 'w-2 bg-border'}`} />
          ))}
        </ol>
        <div className="flex gap-3">
          {step > 0 && <Button variant="secondary" onClick={() => go(step - 1)}>{t('onboarding.back')}</Button>}
          <Button className="flex-1" onClick={() => (last ? finish() : go(step + 1))}>{last ? t('onboarding.getStarted') : t('onboarding.next')}</Button>
        </div>
      </div>
    </div>
  );
}
