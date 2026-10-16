import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronLeft, Plus, Search, X } from 'lucide-react';
import { useI18n } from '../i18n/I18nProvider';
import { HiddenClose, IconButton } from './ui';
import { usePopupHistory } from '../lib/usePopupHistory';

/**
 * The deck name in the top bar, which opens a popup (like Anki's "Select a deck"): a title with search and + on the
 * right, then the deck list, and Cancel. Search turns the popup's header into a search field.
 */
export function DeckPicker({ label, value, options, onChange, variant = 'title', id }: {
  label: string; value: string; options: { value: string; label: string }[]; onChange: (value: string) => void;
  /** 'title': the big serif deck name in a top bar. 'field': a form row's value, with the chevron at the far right. */
  variant?: 'title' | 'field';
  id?: string;
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const close = () => { setOpen(false); setSearching(false); setQuery(''); };
  usePopupHistory(open, close);
  const q = query.trim().toLowerCase();
  const shown = options.filter((o) => o.label.toLowerCase().includes(q));
  const current = options.find((o) => o.value === value)?.label ?? '';

  return (
    <div className="min-w-0 flex-1">
      <button
        id={id}
        type="button"
        aria-label={`${label}: ${current}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className={
          variant === 'field'
            ? 'flex w-full min-w-0 items-center justify-between gap-2 py-2.5 text-left text-base font-medium'
            : 'relative flex w-full min-w-0 items-center gap-1.5 py-2 pl-2 pr-2 text-left font-serif text-lg font-medium tracking-tight'
        }
      >
        <span className="truncate">{current}</span>
        <ChevronDown size={18} aria-hidden className="shrink-0 text-muted" />
      </button>

      <dialog
        ref={ref}
        onClose={close}
        onClick={(e) => e.target === ref.current && close()}
        aria-label={t('picker.title')}
        className="m-auto max-h-[85dvh] w-[min(26rem,calc(100%-2rem))] overflow-hidden rounded-3xl border border-border bg-background p-0 text-foreground backdrop:bg-black/50"
      >
        <div className="flex max-h-[85dvh] flex-col">
          <div className="flex h-16 shrink-0 items-center gap-1 px-3">
            {searching ? (
              <>
                <IconButton label={t('decks.searchClose')} onClick={() => { setSearching(false); setQuery(''); }}><ChevronLeft size={22} aria-hidden /></IconButton>
                <input
                  aria-label={t('decks.search')}
                  type="search"
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t('decks.search')}
                  className="min-w-0 flex-1 bg-transparent px-2 text-base placeholder:text-muted [&::-webkit-search-cancel-button]:appearance-none"
                />
                {query && <IconButton label={t('search.clear')} onClick={() => setQuery('')}><X size={20} aria-hidden /></IconButton>}
              </>
            ) : (
              <>
                <h2 className="min-w-0 flex-1 truncate px-2 font-serif text-xl font-medium tracking-tight">{t('picker.title')}</h2>
                <IconButton label={t('decks.search')} onClick={() => setSearching(true)}><Search size={20} aria-hidden /></IconButton>
              </>
            )}
            <IconButton label={t('common.newDeck')} onClick={() => { close(); navigate('/decks/new', { replace: true }); }}><Plus size={22} aria-hidden /></IconButton>
          </div>

          <ul className="min-h-0 flex-1 overflow-y-auto border-t border-border">
            {shown.map((o) => (
              <li key={o.value} className="border-b border-border last:border-b-0">
                <button
                  type="button"
                  onClick={() => { close(); onChange(o.value); }}
                  className="flex min-h-14 w-full items-center px-5 py-2 text-left font-serif text-lg hover:bg-surface"
                >
                  {o.label}
                </button>
              </li>
            ))}
            {shown.length === 0 && <li className="px-5 py-6 text-center text-muted">{t('decks.noMatch', { query })}</li>}
          </ul>

          <HiddenClose label={t('common.cancel')} onClick={close} />
        </div>
      </dialog>
    </div>
  );
}
