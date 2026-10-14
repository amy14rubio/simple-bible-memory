import { useEffect, useId, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronLeft } from 'lucide-react';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
const variants: Record<Variant, string> = {
  primary: 'bg-primary text-primary-foreground hover:opacity-90',
  secondary: 'border border-border bg-background hover:bg-surface',
  danger: 'border border-danger text-danger hover:bg-surface',
  ghost: 'hover:bg-surface',
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
export function BackButton({ to, label = 'Back' }: { to?: string; label?: string }) {
  const navigate = useNavigate();
  return to ? (
    <IconLink to={to} label={label}><ChevronLeft size={22} aria-hidden /></IconLink>
  ) : (
    <IconButton label={label} onClick={() => navigate(-1)}><ChevronLeft size={22} aria-hidden /></IconButton>
  );
}

/** Top bar with a hairline underneath, as in the wireframes. */
export function AppBar({ title, titleSlot, back, actions, serif = true }: { title?: ReactNode; titleSlot?: ReactNode; back?: ReactNode; actions?: ReactNode; serif?: boolean }) {
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-1 border-b border-border bg-background px-2">
      {back}
      {titleSlot ?? <h1 className={`min-w-0 flex-1 truncate px-2 text-lg ${serif ? 'font-serif font-medium tracking-tight' : 'font-semibold'}`}>{title}</h1>}
      <div className="flex items-center">{actions}</div>
    </header>
  );
}

export function Page({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`px-5 py-6 ${className}`}>{children}</div>;
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
export function FormRow({ label, children }: { label: string; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className="flex items-center gap-4 border-b border-border py-1.5">
      <label htmlFor={id} className="w-24 shrink-0 text-[0.9375rem] font-medium">{label}</label>
      <div className="min-w-0 flex-1">{children(id)}</div>
    </div>
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
          className={`min-h-9 rounded-md px-3 text-sm font-medium ${o.value === value ? 'bg-primary text-primary-foreground' : 'text-muted hover:text-foreground'}`}
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

export function ErrorMessage({ error }: { error: Error | string }) {
  return (
    <p role="alert" className="rounded-lg border border-danger p-3.5 text-danger">
      {typeof error === 'string' ? error : error.message}
    </p>
  );
}

/** Native <dialog>: focus trapping, Escape-to-close and a backdrop for free. */
export function Dialog({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
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
      className="m-auto w-[min(26rem,calc(100%-2rem))] rounded-lg border border-border bg-background p-6 text-foreground backdrop:bg-black/50"
    >
      <h2 className="mb-3 font-serif text-xl font-medium">{title}</h2>
      {children}
    </dialog>
  );
}

export function ConfirmDialog({ open, title, message, confirmLabel, onConfirm, onCancel }: {
  open: boolean; title: string; message: string; confirmLabel: string; onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <Dialog open={open} onClose={onCancel} title={title}>
      <p className="mb-6 text-muted">{message}</p>
      <div className="flex justify-end gap-3">
        <Button variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button variant="danger" onClick={onConfirm}>{confirmLabel}</Button>
      </div>
    </Dialog>
  );
}

/** A deck/scope picker that looks like a title: "[Deck name v]" in the wireframes. Pair it with an sr-only <h1>. */
export function TitleSelect({ label, value, options, onChange }: {
  label: string; value: string; options: { value: string; label: string }[]; onChange: (value: string) => void;
}) {
  return (
    <div className="relative min-w-0 flex-1">
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none truncate bg-transparent py-2 pl-2 pr-9 font-serif text-lg font-medium tracking-tight"
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronDown size={18} aria-hidden className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-muted" />
    </div>
  );
}
