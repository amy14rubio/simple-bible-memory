import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ChevronDown, ChevronLeft, Plus, Search, X } from 'lucide-react';
import { useI18n } from '../i18n/I18nProvider';
import { HiddenClose, IconButton, showDialog } from './ui';
import { usePopupHistory } from '../lib/usePopupHistory';

export interface PickerOption {
  value: string;
  label: string;
  /** Applied to this option's text, e.g. a font family. */
  style?: CSSProperties;
  /** Which filter chip this option belongs to (when the picker has filters). */
  group?: string;
}

/**
 * A value in the page (the deck name in a top bar, or a form row) that opens a popup, like Anki's "Select a deck":
 * a title with search (and optionally a + button) on the right, then the list of options. Search turns the popup's
 * header into a search field. There is no visible Cancel: tap outside, swipe, press Escape or Back (a hidden Close
 * is there for screen readers and voice control).
 */
export function OptionPicker({ label, value, options, onChange, variant = 'title', id, popupTitle, searchLabel, noMatch, onCreate, renderOption, filters, filtersLabel, allLabel }: {
  label: string; value: string; options: PickerOption[]; onChange: (value: string) => void;
  /** 'title': the big serif name in a top bar. 'field': a form row's value, with the chevron at the far right. */
  variant?: 'title' | 'field';
  id?: string;
  popupTitle: string;
  searchLabel: string;
  noMatch: (query: string) => string;
  /** A + button in the popup's header (for example "New deck"). */
  onCreate?: { label: string; run: () => void };
  /** Replaces what a list row shows (for example to load a preview font only for rows on screen). */
  renderOption?: (option: PickerOption) => ReactNode;
  /** A row of chips under the header that narrows the list to one `group` ("All" is added in front). */
  filters?: { value: string; label: string }[];
  filtersLabel?: string;
  /** The label of the "All" chip. */
  allLabel?: string;
}) {
  const { t } = useI18n();
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState<string | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    showDialog(d, open);
  }, [open]);

  const close = () => { setOpen(false); setSearching(false); setQuery(''); setGroup(null); };
  usePopupHistory(open, close);
  const q = query.trim().toLowerCase();
  const shown = options.filter((o) => (group === null || o.group === group) && o.label.toLowerCase().includes(q));
  const currentOption = options.find((o) => o.value === value);
  const current = currentOption?.label ?? '';

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
        <span className="truncate" style={currentOption?.style}>{current}</span>
        <ChevronDown size={18} aria-hidden className="shrink-0 text-muted" />
      </button>

      <dialog
        ref={ref}
        onClose={close}
        onClick={(e) => e.target === ref.current && close()}
        aria-label={popupTitle}
        className="m-auto max-h-[85dvh] w-[min(26rem,calc(100%-2rem))] overflow-hidden rounded-3xl border border-border bg-background p-0 text-foreground backdrop:bg-black/50"
      >
        <div className="flex max-h-[85dvh] flex-col">
          <div className="flex h-16 shrink-0 items-center gap-1 px-3">
            {searching ? (
              <>
                <IconButton label={t('decks.searchClose')} onClick={() => { setSearching(false); setQuery(''); }}><ChevronLeft size={22} aria-hidden /></IconButton>
                <input
                  aria-label={searchLabel}
                  type="search"
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={searchLabel}
                  className="min-w-0 flex-1 bg-transparent px-2 text-base placeholder:text-muted [&::-webkit-search-cancel-button]:appearance-none"
                />
                {query && <IconButton label={t('search.clear')} onClick={() => setQuery('')}><X size={20} aria-hidden /></IconButton>}
              </>
            ) : (
              <>
                <h2 className="min-w-0 flex-1 truncate px-2 font-serif text-xl font-medium tracking-tight">{popupTitle}</h2>
                <IconButton label={searchLabel} onClick={() => setSearching(true)}><Search size={20} aria-hidden /></IconButton>
              </>
            )}
            {onCreate && <IconButton label={onCreate.label} onClick={() => { close(); onCreate.run(); }}><Plus size={22} aria-hidden /></IconButton>}
          </div>

          {filters && (
            <div role="group" aria-label={filtersLabel} className="flex shrink-0 gap-2 overflow-x-auto border-t border-border px-4 py-2.5 [scrollbar-width:none]">
              {[{ value: null, label: allLabel ?? '' }, ...filters].map((f) => (
                <button
                  key={f.value ?? 'all'}
                  type="button"
                  aria-pressed={group === f.value}
                  onClick={() => setGroup(f.value)}
                  className={`min-h-11 shrink-0 rounded-full border px-4 text-sm font-medium ${group === f.value ? 'border-foreground bg-primary text-primary-foreground' : 'border-border text-muted hover:text-foreground'}`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          )}

          <ul className="min-h-0 flex-1 overflow-y-auto border-t border-border">
            {shown.map((o) => (
              <li key={o.value} className="border-b border-border last:border-b-0">
                <button
                  type="button"
                  onClick={() => { close(); onChange(o.value); }}
                  className="flex min-h-14 w-full items-center px-5 py-2 text-left font-serif text-lg hover:bg-surface"
                >
                  {renderOption ? renderOption(o) : <span style={o.style}>{o.label}</span>}
                </button>
              </li>
            ))}
            {shown.length === 0 && <li className="px-5 py-6 text-center text-muted">{noMatch(query)}</li>}
          </ul>

          <HiddenClose label={t('common.cancel')} onClick={close} />
        </div>
      </dialog>
    </div>
  );
}
