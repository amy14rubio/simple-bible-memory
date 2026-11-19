import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Check, ChevronLeft, X } from 'lucide-react';
import { useI18n } from '../i18n/I18nProvider';
import { usePopupHistory } from '../lib/usePopupHistory';
import { prefersReducedMotion } from '../app/motion';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'light';
const variants: Record<Variant, string> = {
  primary: 'bg-primary text-primary-foreground hover:opacity-90',
  secondary: 'border border-border bg-background hover:bg-surface',
  danger: 'border border-danger text-danger hover:bg-surface',
  ghost: 'hover:bg-surface',
  light: 'btn-light', // a white button (see tokens.css)
};

export function Button({ variant = 'primary', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button" // default: never submit a surrounding form by accident
      {...props}
      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-lg px-5 text-[0.9375rem] font-medium disabled:opacity-40 ${variants[variant]} ${className}`}
    />
  );
}

/** Same look as Button, for links that navigate. */
export function ButtonLink({ to, variant = 'primary', className = '', children }: { to: string; variant?: Variant; className?: string; children: ReactNode }) {
  return (
    <Link to={to} className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-lg px-5 text-[0.9375rem] font-medium ${variants[variant]} ${className}`}>
      {children}
    </Link>
  );
}

const iconButton = 'flex size-11 shrink-0 items-center justify-center rounded-full hover:bg-surface disabled:opacity-40';

export function IconButton({ label, children, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button type="button" aria-label={label} {...props} className={`${iconButton} ${className}`}>
      {children}
    </button>
  );
}

export function IconLink({ to, label, children }: { to: string; label: string; children: ReactNode }) {
  return <Link to={to} aria-label={label} className={iconButton}>{children}</Link>;
}

/** Back arrow. With no `to` it goes back one step in history. */
export function BackButton({ to, label }: { to?: string; label?: string }) {
  const navigate = useNavigate();
  const { t } = useI18n();
  const text = label ?? t('common.back');
  return to ? (
    <IconLink to={to} label={text}><ChevronLeft size={22} aria-hidden /></IconLink>
  ) : (
    <IconButton label={text} onClick={() => navigate(-1)}><ChevronLeft size={22} aria-hidden /></IconButton>
  );
}

/** Top bar with a hairline underneath, as in the wireframes. */
export function AppBar({ title, titleSlot, back, actions, serif = true, titleId }: { title?: ReactNode; titleSlot?: ReactNode; back?: ReactNode; actions?: ReactNode; serif?: boolean; titleId?: string }) {
  return (
    <header className="sticky top-0 z-20 box-content flex h-14 items-center gap-1 border-b border-border bg-background px-2 pt-[var(--safe-top)]">
      {back}
      {titleSlot ?? (title ? <h1 id={titleId} className={`min-w-0 flex-1 truncate px-2 text-lg ${serif ? 'font-serif font-medium tracking-tight' : 'font-semibold'}`}>{title}</h1> : <div className="flex-1" />)}
      <div className="flex items-center">{actions}</div>
    </header>
  );
}

/**
 * Search mode, like Anki: the top bar becomes the search field. A back arrow on the far left leaves search
 * (and clears the filter), the keyboard opens straight away, and an X clears the text once there is some.
 */
export function SearchBar({ label, placeholder, value, onChange, backLabel, onClose, actions }: {
  label: string; placeholder: string; value: string; onChange: (value: string) => void; backLabel: string; onClose: () => void;
  /** The screen's other icons stay where they were (only the search icon is replaced by the back arrow). */
  actions?: ReactNode;
}) {
  const { t } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  return (
    <header className="sticky top-0 z-20 box-content flex h-14 items-center gap-1 border-b border-border bg-background px-2 pt-[var(--safe-top)]">
      <IconButton label={backLabel} onClick={onClose}><ChevronLeft size={22} aria-hidden /></IconButton>
      <input
        ref={input}
        aria-label={label}
        type="search"
        autoFocus
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
        // the browser's own clear button is hidden so ours looks the same everywhere
        className="min-w-0 flex-1 bg-transparent px-2 text-base placeholder:text-muted [&::-webkit-search-cancel-button]:appearance-none"
      />
      {value && (
        <IconButton label={t('search.clear')} onClick={() => { onChange(''); input.current?.focus(); }}><X size={20} aria-hidden /></IconButton>
      )}
      <div className="flex items-center">{actions}</div>
    </header>
  );
}

/**
 * A close button that is not drawn but is still there for screen readers, voice control and switch devices
 * (sighted users close popups by tapping outside, swiping down, pressing Escape or Back). It covers a thin strip along the top of the screen,
 * above the popup, so Voice Control can put a name on it and "Tap Close" taps outside the popup (a 1 pixel button gets no name there).
 * The strip is short, so it never covers a popup's own content.
 */
export function HiddenClose({ label, ...props }: { label: string } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" className="fixed inset-x-0 top-0 z-10 h-10 cursor-default overflow-hidden bg-transparent text-[0px]" {...props}>{label}</button>;
}

/**
 * A soft grey bar that stands where text will be while a screen loads, in the same size and place, so the real content replaces it without
 * anything shifting. It is only a shape (no animation, hidden from screen readers).
 */
export function Bar({ className = '' }: { className?: string }) {
  return <div aria-hidden className={`later rounded-md bg-surface ${className}`} />;
}

/** An on/off switch. Give it the id of the text that labels it. */
export function Switch({ checked, onChange, labelledBy, disabled }: { checked: boolean; onChange: (checked: boolean) => void; labelledBy: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-8 w-14 shrink-0 rounded-full border border-border transition-colors disabled:opacity-40 ${checked ? 'bg-primary' : 'bg-surface'}`}
    >
      <span aria-hidden className={`absolute top-1 size-6 rounded-full transition-all ${checked ? 'left-7 bg-primary-foreground' : 'left-1 bg-muted'}`} />
    </button>
  );
}

/**
 * The padding around a screen's content. The bottom leaves room for the phone's gesture bar (like the header does for the status
 * bar), so the last item never sits against the edge. `flush` drops the top padding, for lists that start right under the header.
 */
export function Page({ children, className = '', flush = false, id, busy = false }: { children: ReactNode; className?: string; flush?: boolean; id?: string; /** The screen is still loading (a screen reader is told). */ busy?: boolean }) {
  return <div id={id} aria-busy={busy || undefined} className={`${busy ? 'later ' : ''}px-5 py-6 pb-[calc(2.5rem+var(--safe-bottom))] ${flush ? 'pt-0' : ''} ${className}`}>{children}</div>;
}

const fieldControl = 'w-full rounded-lg border border-border bg-surface px-3.5 py-3 text-base placeholder:text-muted';
export const inputProps = { className: fieldControl };

export function Field({ label, hint, children }: { label: string; hint?: string; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">{label}</label>
      {children(id)}
      {hint && <p className="text-sm text-muted">{hint}</p>}
    </div>
  );
}

/** Label on the left, control on the right, hairline below: the wireframe's form rows. */
export function FormRow({ label, labelNode, coach, children }: { label: string; /** Replaces the plain label (for example a label with an "i"). The field then needs its own aria-label, since this is not a <label>. */ labelNode?: ReactNode; /** Names the row for the "Add card" guide to point at (see AddCoach). */ coach?: string; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div data-coach={coach} className="flex items-center gap-4 border-b border-border py-1.5">
      {labelNode ?? <label htmlFor={id} className="w-24 shrink-0 text-[0.9375rem] font-medium">{label}</label>}
      <div className="min-w-0 flex-1">{children(id)}</div>
    </div>
  );
}
/**
 * A text field for longer text: it starts as one line and grows as you type (no box, no scrollbar, no resize handle),
 * with a thin line underneath that turns accent-coloured while you are typing, like Anki's fields.
 */
export function GrowingTextarea({ className = '', value, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { value: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  // Fit the height to the text after every change (works in every browser, unlike CSS field-sizing).
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Measuring needs the box collapsed for an instant, which shortens the page, and the browser then clamps the scroll position
    // (the screen "jumps back up" while you type a long verse). So remember where every scrolling ancestor was, and put it back.
    const saved: [Element, number][] = [];
    for (let p: Element | null = el.parentElement; p; p = p.parentElement) if (p.scrollTop > 0) saved.push([p, p.scrollTop]);
    const [pageX, pageY] = [window.scrollX, window.scrollY];
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
    for (const [p, top] of saved) p.scrollTop = top;
    if (window.scrollY !== pageY) window.scrollTo(pageX, pageY);
  }, [value]);
  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      {...props}
      className={`block w-full resize-none overflow-hidden border-0 border-b border-border bg-transparent px-0 py-2 text-lg placeholder:text-muted focus:border-accent focus:shadow-[0_1px_0_0_var(--accent)] ${className}`}
    />
  );
}

/**
 * A list of choices: full-width rows with dividers, tap a row to choose it, a check mark on the right of the chosen one.
 * Built on real radio buttons, invisible and stretched across each row, so a tap anywhere on the row is a tap on the
 * real control, and keyboards and screen readers get the proper radio-group behaviour.
 */
export function CheckList<T extends string>({ label, name, value, options, onChange, onSelect }: {
  label: string; name: string; value: T; onChange: (v: T) => void;
  /** Called whenever an option is pressed, even the one already chosen (onChange only fires for a different one). */
  onSelect?: (v: T) => void;
  options: { value: T; label: string; /** drawn before the label, e.g. a colour dot */ leading?: ReactNode }[];
}) {
  return (
    <fieldset aria-label={label}>
      {options.map((o) => (
        <label
          key={o.value}
          className="relative flex min-h-14 cursor-pointer items-center gap-3 border-b border-border px-1 hover:bg-surface has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-inset has-[:focus-visible]:ring-ring"
        >
          <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} onClick={() => onSelect?.(o.value)} className="peer absolute inset-0 size-full cursor-pointer opacity-0" />
          {o.leading}
          <span className="min-w-0 flex-1 text-[1.0625rem] font-medium">{o.label}</span>
          <Check size={20} aria-hidden className="shrink-0 opacity-0 peer-checked:opacity-100" />
        </label>
      ))}
    </fieldset>
  );
}

export const rowInput = 'w-full bg-transparent py-2.5 text-base placeholder:text-muted focus-visible:outline-offset-4';

export function Segmented<T extends string>({ label, value, options, onChange }: {
  label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-lg border border-border p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
          className={`min-h-11 rounded-md px-3 text-sm font-medium ${o.value === value ? 'bg-primary text-primary-foreground' : 'text-muted hover:text-foreground'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="space-y-3 px-4 py-20 text-center">
      <h2 className="font-serif text-xl font-medium">{title}</h2>
      {children && <p className="mx-auto max-w-xs text-muted">{children}</p>}
      {action && <div className="pt-3">{action}</div>}
    </div>
  );
}

/** An error message and how many times one has been set: the same words twice in a row are still two messages, so the second one can be shown again. */
export interface ErrorValue { text: string; n: number }
/** Where a screen keeps its error: `setError('…')` shows one (again, if it is the same), `setError()` clears it. */
export function useErrorState(): [ErrorValue | undefined, (text?: string) => void] {
  const [value, setValue] = useState<ErrorValue>();
  const count = useRef(0);
  return [value, useCallback((text?: string) => setValue(text === undefined ? undefined : { text, n: ++count.current }), [])];
}

/**
 * A message about something that went wrong. It comes in the way a screen does (slides in a little and fades in, same timing as AppShell) and
 * goes away when tapped (it fades out). The same mistake again does not remove and re-add it (that would blink): it stays and gives a small nudge,
 * or, if it was tapped away, comes back the same way it came the first time. People who ask their phone for reduced motion get no movement.
 */
export function ErrorMessage({ error, id, fixed = false }: { error: Error | string | ErrorValue; id?: string; /** A reason that must stay in view (it explains a disabled button), so tapping it does nothing. */ fixed?: boolean }) {
  const { describeError } = useI18n();
  const box = useRef<HTMLParagraphElement>(null);
  const [gone, setGone] = useState(false);
  const n = typeof error === 'object' && 'n' in error ? error.n : 0;
  const previous = useRef<number | null>(null); // the message shown last time (null: this is the first)
  const comeBack = useRef(false);
  useLayoutEffect(() => {
    const prior = previous.current;
    previous.current = n;
    if (prior !== null && prior !== n && gone) { comeBack.current = true; setGone(false); return; } // tapped away, and now again: back it comes
    const el = box.current;
    const entrance = prior === null || comeBack.current;
    comeBack.current = false;
    if (!el || prefersReducedMotion()) return;
    const ease = 'cubic-bezier(0.22, 0.61, 0.36, 1)';
    const a = entrance
      ? el.animate([{ opacity: 0.65, transform: 'translateX(24px)' }, { opacity: 1, transform: 'none' }], { duration: 300, easing: ease })
      : prior !== n ? el.animate({ transform: ['translateX(8px)', 'translateX(-5px)', 'translateX(3px)', 'none'] }, { duration: 300, easing: ease }) : undefined;
    return () => a?.cancel();
  }, [n, gone]);
  const dismiss = () => {
    const el = box.current;
    if (!el || prefersReducedMotion()) { setGone(true); return; }
    el.animate({ opacity: [1, 0] }, { duration: 200, easing: 'ease-out', fill: 'forwards' }).finished.then(() => setGone(true), () => setGone(true));
  };
  if (gone) return null;
  const text = typeof error === 'string' ? error : error instanceof Error ? describeError(error) : error.text;
  if (fixed) return <p ref={box} role="alert" id={id} className="rounded-lg border border-danger p-3.5 text-danger">{text}</p>;
  return (
    <p ref={box} role="alert" id={id} className="rounded-lg border border-danger text-danger">
      <button type="button" onClick={dismiss} className="block w-full cursor-pointer rounded-lg p-3.5 text-left">{text}</button>
    </p>
  );
}

/** Native <dialog>: focus trapping, Escape-to-close and a backdrop for free. */
export function Dialog({ open, onClose, title, children, closeOnBack = false, closeLabel }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode;
  /** Back (phone or browser) closes it, and an invisible Close button named `closeLabel` is added for assistive tech. */
  closeOnBack?: boolean; closeLabel?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  usePopupHistory(open && closeOnBack, onClose);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-label={title}
      className="m-auto w-[min(26rem,calc(100%-2rem))] overflow-hidden rounded-lg border border-border bg-background p-6 text-foreground backdrop:bg-black/50"
    >
      <h2 className="mb-3 font-serif text-xl font-medium">{title}</h2>
      {children}
      {closeLabel && <HiddenClose label={closeLabel} onClick={onClose} />}
    </dialog>
  );
}

export function ConfirmDialog({ open, title, message, warning, confirmLabel, onConfirm, onCancel }: {
  open: boolean; title: string; message: string; /** An extra, stronger paragraph under the message (what else happens). */ warning?: string; confirmLabel: string; onConfirm: () => void; onCancel: () => void;
}) {
  const { t } = useI18n();
  return (
    <Dialog open={open} onClose={onCancel} title={title}>
      <p className={warning ? 'mb-3 text-muted' : 'mb-6 text-muted'}>{message}</p>
      {warning && <p className="mb-6 font-medium">{warning}</p>}
      <div className="flex justify-end gap-3">
        <Button variant="secondary" onClick={onCancel}>{t('common.cancel')}</Button>
        <Button variant="danger" onClick={onConfirm}>{confirmLabel}</Button>
      </div>
    </Dialog>
  );
}

/** A deck/scope picker that looks like a title: "[Deck name v]" in the wireframes. Pair it with an sr-only <h1>. */
