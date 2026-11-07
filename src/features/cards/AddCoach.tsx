import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useRepositories } from '../../app/repositories';
import { X } from 'lucide-react';
import { Button, IconButton } from '../../components/ui';
import type { MessageKey } from '../../i18n';
import { useI18n } from '../../i18n/I18nProvider';
import { onboardingDisabledForTests } from '../onboarding/onboarding';

/** The setting that remembers the "add a verse" guide was seen (finished or skipped). */
export const COACH_ADD_DONE = 'coach_add_done';

interface Step { anchor: string; title: MessageKey; body: MessageKey }
/** In order down the screen. A step whose field is not on the screen (Autofill, when it is not offered) is left out. */
const STEPS: Step[] = [
  { anchor: 'deck', title: 'coach.add.deck.title', body: 'coach.add.deck.body' },
  { anchor: 'verse', title: 'coach.add.verse.title', body: 'coach.add.verse.body' },
  { anchor: 'autofill', title: 'coach.add.autofill.title', body: 'coach.add.autofill.body' },
  { anchor: 'passage', title: 'coach.add.passage.title', body: 'coach.add.passage.body' },
  { anchor: 'save', title: 'coach.add.save.title', body: 'coach.add.save.body' },
];

const find = (anchor: string) => document.querySelector<HTMLElement>(`#card-form [data-coach="${anchor}"], header [data-coach="${anchor}"]`);

/**
 * The first time someone opens "Add card", a short guide points at the real fields: the deck, the verse, Autofill, the passage and
 * Save. It is five short steps with no Skip button: the X (or Escape) closes it, the last button ends it, and it is remembered.
 * The "?" on the screen starts it again.
 */
export function useAddCoach(isNewCard: boolean) {
  const { settings } = useRepositories();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!isNewCard || onboardingDisabledForTests()) return;
    let cancelled = false;
    void settings.get<boolean>(COACH_ADD_DONE).then((done) => { if (!cancelled && !done) setOpen(true); });
    return () => { cancelled = true; };
  }, [isNewCard, settings]);
  const start = useCallback(() => setOpen(true), []);
  const close = useCallback(() => { setOpen(false); void settings.set(COACH_ADD_DONE, true); }, [settings]);
  return { open, start, close };
}

export function AddCoach({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const [steps] = useState(() => STEPS.filter((s) => find(s.anchor)));
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [tipHeight, setTipHeight] = useState(0);
  const tip = useRef<HTMLDivElement>(null);
  const step = steps[i];
  const last = i === steps.length - 1;

  const measure = useCallback(() => {
    const el = step && find(step.anchor);
    if (!el) return;
    const r = el.getBoundingClientRect();
    setRect(r);
    if (tip.current) setTipHeight(tip.current.offsetHeight);
  }, [step]);

  // Bring the field into view, then keep the highlight on it (the screen can scroll or resize, e.g. when a keyboard opens).
  useLayoutEffect(() => {
    const el = step && find(step.anchor);
    el?.scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior });
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    window.visualViewport?.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
      window.visualViewport?.removeEventListener('resize', measure);
    };
  }, [step, measure]);

  // After a step change the button takes focus (so a screen reader reads the new step, and a keyboard opened by the verse box closes).
  useEffect(() => { tip.current?.querySelector<HTMLButtonElement>('button:last-of-type')?.focus({ preventScroll: true }); }, [i, rect === null]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!step || !rect) return steps.length === 0 ? null : <div aria-hidden className="fixed inset-0 z-40 bg-black/50" />;

  const pad = 6;
  const viewport = window.visualViewport?.height ?? window.innerHeight;
  const below = rect.bottom + pad + 12 + tipHeight <= viewport - 8;
  const top = below ? rect.bottom + pad + 12 : Math.max(8, rect.top - pad - 12 - tipHeight);

  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none fixed z-40 rounded-xl transition-all duration-200"
        style={{ top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2, boxShadow: '0 0 0 100vmax rgba(0,0,0,0.55)' }}
      />
      <div
        ref={tip}
        role="dialog"
        aria-labelledby="coach-title"
        aria-describedby="coach-body"
        className="fixed left-1/2 z-50 w-[min(21rem,calc(100vw-2rem))] -translate-x-1/2 space-y-5 rounded-2xl border border-border bg-background px-5 pb-5 pt-6 shadow-lg"
        style={{ top }}
      >
        <IconButton label={t('common.close')} onClick={onClose} className="absolute right-2 top-2"><X size={20} aria-hidden /></IconButton>
        <div className="space-y-2 pr-8">
          <p className="sr-only">{t('onboarding.step', { n: i + 1, total: steps.length })}</p> {/* not shown: five short steps do not need a counter, but a screen reader still hears where it is */}
          <h2 id="coach-title" className="font-serif text-lg font-medium leading-tight">{t(step.title)}</h2>
          <p id="coach-body" className="text-[0.9375rem] leading-snug text-muted">{t(step.body)}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button className="flex-1" onClick={() => (last ? onClose() : setI(i + 1))}>{last ? t('coach.add.done') : t('onboarding.next')}</Button>
        </div>
      </div>
    </>
  );
}
